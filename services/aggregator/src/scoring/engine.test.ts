import { describe, expect, it } from 'vitest';
import {
  activeFlags,
  assetMarketScore,
  availabilityScore,
  computeCard,
  confidenceScore,
  flagNames,
  headline,
  integrityScore,
  interp,
  marketScore,
  roundHalfUp,
  speedScore,
  uptimeScore,
} from './engine.js';
import { UPTIME_CURVE } from './constants.js';
import type { MarketAggregate, ScoreInputs } from './types.js';

const allPass = {
  toml_valid: 'pass',
  toml_cors: 'pass',
  sep10_signed: 'pass',
  info_valid: 'pass',
  tls_ok: 'pass',
  signing_key_stable: 'pass',
  issuer_home_domain_matches: 'pass',
} as const;

const up = { success: true, sep10_mismatch: false };
const down = { success: false, sep10_mismatch: false };

/** An established, flawless anchor; each example changes what it needs. */
function inputs(overrides: Partial<ScoreInputs> = {}): ScoreInputs {
  return {
    methodology_version: 1,
    anchor_id: 'a',
    window_end: 1_789_808_400,
    uptime: { n7: 504, ok7: 504, n30: 2160, ok30: 2158 },
    speed: { p95_seconds: 0.6, samples: 504 },
    integrity: { ...allPass },
    coverage: 1,
    monitored_days: 30,
    recent: [up, up, up],
    market: [],
    market_na: 'not_issuer',
    fiat_issued_assets: 0,
    flows: [],
    supply: [],
    days: [],
    ...overrides,
  };
}

const market = (m: Partial<MarketAggregate>): MarketAggregate => ({
  code: 'ARST',
  issuer: 'G',
  anchor_asset: 'ARS',
  samples: 504,
  median_bps: 10,
  share_outside_50: 0,
  median_bps_signed: 10,
  share_below_peg: 0,
  max_drawdown_pct: 0,
  longest_run_gt100_hours: 0,
  longest_run_gt300_hours: 0,
  reference: { source: 'test', date: '2026-09-19', rate: 0.001 },
  ...m,
});

describe('golden examples (docs/SCORING.md section 10)', () => {
  it('1: established and flawless → 100', () => {
    const card = computeCard(inputs());
    expect(card).toMatchObject({ availability: 100, speed: 100, integrity: 100, market: null, confidence: 100, score: 100, flags: 0 });
  });

  it('2: established but flaky → 73', () => {
    const card = computeCard(
      inputs({
        uptime: { n7: 504, ok7: 484, n30: 2000, ok30: 1940 },
        speed: { p95_seconds: 3.0, samples: 484 },
        integrity: { ...allPass, toml_cors: 'fail', info_valid: 'fail' },
      }),
    );
    expect(card).toMatchObject({ availability: 71, speed: 68, integrity: 83, market: null, confidence: 100, score: 73, flags: 0 });
  });

  it('3: currently down → capped at 50 by OUTAGE', () => {
    const card = computeCard(
      inputs({ uptime: { n7: 500, ok7: 460, n30: 2000, ok30: 1960 }, recent: [down, down, down] }),
    );
    expect(card).toMatchObject({ availability: 64, speed: 100, integrity: 100, confidence: 100, score: 50 });
    expect(flagNames(card.flags)).toEqual(['OUTAGE']);
  });

  it('4: new but clean → 81', () => {
    const card = computeCard(inputs({ uptime: { n7: 216, ok7: 216, n30: 216, ok30: 216 }, monitored_days: 3 }));
    expect(card).toMatchObject({ availability: 100, speed: 100, integrity: 100, confidence: 61, score: 81, flags: 0 });
  });

  it('5: partly testable (MoneyGram-like) → 85, LOW_COVERAGE as information', () => {
    const card = computeCard(inputs({ uptime: { n7: 504, ok7: 504, n30: 2160, ok30: 2160 }, coverage: 0.4 }));
    expect(card).toMatchObject({ availability: 100, speed: 100, integrity: 100, confidence: 70, score: 85 });
    expect(flagNames(card.flags)).toEqual(['LOW_COVERAGE']);
  });

  it('6: issuer, depegged → Market 0, capped at 50 by DEPEG', () => {
    const card = computeCard(
      inputs({
        uptime: { n7: 504, ok7: 504, n30: 2160, ok30: 2160 },
        market: [market({ median_bps: 350, share_outside_50: 0.8, longest_run_gt100_hours: 30, longest_run_gt300_hours: 30 })],
        market_na: undefined,
        fiat_issued_assets: 1,
      }),
    );
    expect(card).toMatchObject({ availability: 100, speed: 100, integrity: 100, market: 0, confidence: 100, score: 50 });
    expect(flagNames(card.flags)).toEqual(['DEPEG']);
  });
});

describe('the derivations the examples rely on', () => {
  it('uptime curve', () => {
    expect(uptimeScore((484 / 504) * 100)).toBeCloseTo(67.74, 2);
    expect(uptimeScore(92)).toBe(45);
    expect(uptimeScore(98)).toBe(82.5);
    expect(uptimeScore(99.91)).toBe(100);
  });

  it('speed and market curves', () => {
    expect(interp([[0.75, 100], [5.0, 40]], 3.0)).toBeCloseTo(68.24, 2);
    expect(marketScore([market({ median_bps: 350 })])).toBe(19); // 18.75, no penalties
  });

  it('confidence of a 3-day-old anchor', () => {
    expect(confidenceScore({ monitored_days: 3, uptime: { n7: 216, ok7: 216, n30: 216, ok30: 216 }, coverage: 1 })).toBe(61);
  });
});

describe('edge cases', () => {
  it('refuses to score an anchor with no conclusive probe', () => {
    expect(() => computeCard(inputs({ uptime: { n7: 0, ok7: 0, n30: 0, ok30: 0 } }))).toThrow('nothing to score');
  });

  it('scores an anchor that never succeeded: availability 0, speed 0, outage', () => {
    const card = computeCard(
      inputs({
        uptime: { n7: 30, ok7: 0, n30: 30, ok30: 0 },
        speed: { p95_seconds: null, samples: 0 },
        integrity: { ...allPass, toml_valid: 'fail', toml_cors: 'fail', sep10_signed: 'fail', info_valid: 'fail', signing_key_stable: 'na', issuer_home_domain_matches: 'na' },
        coverage: null,
        monitored_days: 2,
        recent: [down, down, down],
      }),
    );
    expect(card).toMatchObject({ availability: 0, speed: 0 });
    expect(flagNames(card.flags)).toEqual(['OUTAGE', 'LOW_UPTIME']);
    expect(card.score).toBeLessThanOrEqual(50);
  });

  it('uses the 30-day uptime alone when nothing was probed in 7 days', () => {
    expect(availabilityScore({ n7: 0, ok7: 0, n30: 100, ok30: 98 })).toBe(83);
  });

  it('gives Speed 0 without a successful probe, not n/a', () => {
    expect(speedScore(null)).toBe(0);
  });

  it('clamps outside the curve ranges', () => {
    expect(speedScore(0.1)).toBe(100);
    expect(speedScore(60)).toBe(40);
    expect(uptimeScore(-5)).toBe(0);
    expect(interp(UPTIME_CURVE, 150)).toBe(100);
  });

  it('drops n/a integrity checks from both sides of the ratio', () => {
    expect(integrityScore({ ...allPass, sep10_signed: 'na', signing_key_stable: 'na', issuer_home_domain_matches: 'na', toml_cors: 'fail' })).toBe(75); // 3 of 4
  });

  it('redistributes the Market weight when it is n/a', () => {
    // Without Market, W = 850 and the three pillars carry the whole score.
    expect(headline({ availability: 100, speed: 0, integrity: 100, market: null }, 100, [])).toBe(roundHalfUp((650 * 100) / 850));
    expect(headline({ availability: 100, speed: 0, integrity: 100, market: 100 }, 100, [])).toBe(80);
  });

  it('applies the lowest cap when several gates are active', () => {
    expect(headline({ availability: 100, speed: 100, integrity: 100, market: null }, 100, ['ONE_WAY_FLOW', 'SEP10_MISMATCH', 'LOW_UPTIME'])).toBe(40);
  });

  it('does not cap on information flags', () => {
    expect(headline({ availability: 100, speed: 100, integrity: 100, market: null }, 100, ['SILENT', 'LOW_COVERAGE', 'NO_MARKET'])).toBe(100);
  });

  it('rounds half up at the boundary', () => {
    expect(roundHalfUp(80.5)).toBe(81);
    expect(roundHalfUp(80.49999999999999)).toBe(81);
    expect(roundHalfUp(80.4999)).toBe(80);
    // Example 4's shrinkage lands exactly on 80.5.
    expect(headline({ availability: 100, speed: 100, integrity: 100, market: null }, 61, [])).toBe(81);
  });

  it('falls back to a coverage of 0.5 when none was measured, without flagging it', () => {
    const i = inputs({ coverage: null });
    expect(confidenceScore(i)).toBe(75);
    expect(activeFlags(i)).not.toContain('LOW_COVERAGE');
  });

  it('pulls an unknown anchor toward 50, not 100', () => {
    expect(headline({ availability: 100, speed: 100, integrity: 100, market: null }, 0, [])).toBe(50);
  });

  it('needs three failures in a row for an outage', () => {
    expect(activeFlags(inputs({ recent: [down, down] }))).not.toContain('OUTAGE');
    expect(activeFlags(inputs({ recent: [down, down, up] }))).not.toContain('OUTAGE');
  });

  it('flags a SEP-10 mismatch in any of the last three probes', () => {
    expect(activeFlags(inputs({ recent: [up, { success: false, sep10_mismatch: true }, up] }))).toContain('SEP10_MISMATCH');
  });

  it('needs 20 probes in 7 days before LOW_UPTIME applies', () => {
    expect(activeFlags(inputs({ uptime: { n7: 19, ok7: 10, n30: 100, ok30: 90 } }))).not.toContain('LOW_UPTIME');
    expect(activeFlags(inputs({ uptime: { n7: 20, ok7: 17, n30: 100, ok30: 90 } }))).toContain('LOW_UPTIME');
  });
});

describe('market and flow gates', () => {
  const flow = (f: Partial<ScoreInputs['flows'][number]>) => ({
    code: 'ARST',
    issuer: 'G',
    mint_count_14d: 0,
    burn_count_14d: 0,
    mint_count_30d: 0,
    burn_count_30d: 0,
    truncated_14d: false,
    truncated_30d: false,
    ...f,
  });

  it('penalises a widespread and a persistent deviation separately', () => {
    expect(marketScore([market({ median_bps: 40, share_outside_50: 0.3 })])).toBe(74);
    expect(marketScore([market({ median_bps: 40, longest_run_gt100_hours: 7 })])).toBe(74);
    expect(marketScore([market({ median_bps: 40, share_outside_50: 0.3, longest_run_gt100_hours: 7 })])).toBe(54);
  });

  it('takes the weakest of several issued assets', () => {
    expect(marketScore([market({ median_bps: 10 }), market({ median_bps: 200 })])).toBe(45);
  });

  it('needs more than 24 hours over 300 bps for DEPEG', () => {
    expect(activeFlags(inputs({ market: [market({ longest_run_gt300_hours: 24 })] }))).not.toContain('DEPEG');
    expect(activeFlags(inputs({ market: [market({ longest_run_gt300_hours: 25 })] }))).toContain('DEPEG');
  });

  it('flags issuance with no redemption, unless the history was truncated', () => {
    expect(activeFlags(inputs({ flows: [flow({ mint_count_14d: 5 })] }))).toContain('ONE_WAY_FLOW');
    expect(activeFlags(inputs({ flows: [flow({ mint_count_14d: 5, burn_count_14d: 1 })] }))).not.toContain('ONE_WAY_FLOW');
    expect(activeFlags(inputs({ flows: [flow({ mint_count_14d: 4 })] }))).not.toContain('ONE_WAY_FLOW');
    expect(activeFlags(inputs({ flows: [flow({ mint_count_14d: 9, truncated_14d: true })] }))).not.toContain('ONE_WAY_FLOW');
  });

  it('marks an issuer silent only when none of its assets moved in 30 days', () => {
    expect(activeFlags(inputs({ flows: [flow({})] }))).toContain('SILENT');
    expect(activeFlags(inputs({ flows: [flow({}), flow({ burn_count_30d: 1 })] }))).not.toContain('SILENT');
    expect(activeFlags(inputs({ flows: [] }))).not.toContain('SILENT');
  });

  it('sets NO_MARKET only for an issued fiat asset without a usable market', () => {
    expect(activeFlags(inputs({ market_na: 'no_market', fiat_issued_assets: 1 }))).toContain('NO_MARKET');
    expect(activeFlags(inputs({ market_na: 'no_fiat_reference', fiat_issued_assets: 1 }))).not.toContain('NO_MARKET');
    expect(activeFlags(inputs({ market_na: 'not_issuer' }))).not.toContain('NO_MARKET');
  });
});

describe('supply and volatility gates', () => {
  const supply = (s: Partial<import('./types.js').SupplyAggregate> = {}) => ({
    code: 'CLPX',
    issuer: 'G',
    samples: 2000,
    span_days: 30,
    first: 100,
    last: 100,
    distinct_values: 1,
    net_change_pct: 0,
    holders_first: 10,
    holders_last: 10,
    ...s,
  });

  it('flags a supply that never moved, and caps the score at 70', () => {
    const card = computeCard(inputs({ supply: [supply()] }));
    expect(flagNames(card.flags)).toContain('FROZEN_SUPPLY');
    expect(card.score).toBeLessThanOrEqual(70);
  });

  it('does not flag a supply that moved even once', () => {
    // Two different totals means a mint or a burn settled between readings.
    expect(flagNames(computeCard(inputs({ supply: [supply({ distinct_values: 2 })] })).flags)).not.toContain('FROZEN_SUPPLY');
  });

  it('says nothing about an asset watched for too few days', () => {
    // On day one every supply looks frozen. That is a fact about us.
    const young = supply({ span_days: 3, samples: 300 });
    expect(flagNames(computeCard(inputs({ supply: [young] })).flags)).not.toContain('FROZEN_SUPPLY');
  });

  it('says nothing about an asset with too few readings', () => {
    const sparse = supply({ samples: 12, span_days: 30 });
    expect(flagNames(computeCard(inputs({ supply: [sparse] })).flags)).not.toContain('FROZEN_SUPPLY');
  });

  it('flags a week with a fall past the threshold, and caps the score at 60', () => {
    const card = computeCard(inputs({ market: [market({ max_drawdown_pct: 23.68 })], market_na: undefined }));
    expect(flagNames(card.flags)).toContain('VOLATILE');
    expect(card.score).toBeLessThanOrEqual(60);
  });

  it('leaves a steady week alone', () => {
    const card = computeCard(inputs({ market: [market({ max_drawdown_pct: 12 })], market_na: undefined }));
    expect(flagNames(card.flags)).not.toContain('VOLATILE');
  });

  it('costs an asset that mostly trades below its peg', () => {
    // Above the peg a holder can still sell at par; below it they cannot.
    const above = assetMarketScore(market({ share_below_peg: 0 }));
    const below = assetMarketScore(market({ share_below_peg: 0.8 }));
    expect(below).toBe(Math.max(0, above - 20));
  });
});
