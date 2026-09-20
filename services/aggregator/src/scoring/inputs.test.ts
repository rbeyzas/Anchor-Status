import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeCard } from './engine.js';
import { buildInputs, floorToHour, integrityChecks, longestRunHours, type AnchorContext, type ProbeLine } from './inputs.js';
import { writeInputsBundle } from './load.js';
import { selectToPublish } from './publisher.js';
import { recompute } from './verify-score.js';
import type { ScoreCard } from './types.js';

const HOUR = 60 * 60 * 1000;
const END = Date.parse('2026-09-19T12:00:00Z');
const at = (hoursBefore: number) => new Date(END - hoursBefore * HOUR).toISOString();

const checks = {
  toml_valid: true,
  toml_cors: true,
  sep10_advertised: true,
  sep10_signature_valid: true,
  info_valid: true,
  tls_ok: true,
  signing_key: 'GKEY',
};

/** A fully reachable probe, 1s per stage. */
function probe(hoursBefore: number, overrides: Partial<ProbeLine> = {}): ProbeLine {
  return {
    anchor_id: 'a',
    timestamp: at(hoursBefore),
    success: true,
    stages: {
      toml: { ok: true, ms: 1000 },
      info: { ok: true, ms: 1000 },
      challenge: { ok: true, ms: 1000 },
      token: { ok: true, ms: 1000 },
      initiate: { ok: true, ms: 1000 },
    },
    stages_expected: ['toml', 'info', 'challenge', 'token', 'initiate'],
    checks: { ...checks },
    evidence_hash: 'e'.repeat(64),
    ...overrides,
  };
}
const failed = (hoursBefore: number, stage = 'toml'): ProbeLine =>
  probe(hoursBefore, { success: false, failed_stage: stage, stages: { toml: { ok: false, error: 'HTTP 503' } }, checks: { toml_valid: false } });

const empty: AnchorContext = { assets: [], marketSamples: [], supplySamples: [], flows: [] };

describe('buildInputs', () => {
  it('returns nothing for an anchor without a conclusive probe in 30 days', () => {
    expect(buildInputs('a', [probe(1, { inconclusive: true }), probe(24 * 31)], END, empty)).toBeNull();
    expect(buildInputs('b', [probe(1)], END, empty)).toBeNull();
  });

  it('counts only conclusive probes inside the window, and nothing after its end', () => {
    const i = buildInputs('a', [probe(1), failed(2), probe(24 * 8), probe(1, { inconclusive: true }), probe(-1)], END, empty)!;
    expect(i.uptime).toEqual({ n7: 2, ok7: 1, n30: 3, ok30: 2 });
    expect(i.recent).toEqual([
      { success: true, sep10_mismatch: false },
      { success: false, sep10_mismatch: false },
      { success: true, sep10_mismatch: false },
    ]);
    expect(i.monitored_days).toBe(8);
  });

  it('times a probe by the mean of its completed stages, and takes the p95', () => {
    const fast = Array.from({ length: 19 }, (_, k) => probe(k + 1));
    const slow = probe(30, { stages: { toml: { ok: true, ms: 4000 }, info: { ok: true, ms: 6000 }, challenge: { ok: false, policy: true } } });
    const i = buildInputs('a', [...fast, slow], END, empty)!;
    expect(i.speed).toEqual({ p95_seconds: 1, samples: 20 });
    const i2 = buildInputs('a', [...fast.slice(0, 9), slow], END, empty)!;
    expect(i2.speed.p95_seconds).toBe(5);
  });

  it('takes the median coverage of successful probes that recorded their expected stages', () => {
    const partial = (h: number) =>
      probe(h, { stages: { toml: { ok: true, ms: 800 }, info: { ok: true, ms: 900 }, challenge: { ok: false, policy: true } } });
    const i = buildInputs('a', [partial(1), partial(2), probe(3), probe(4, { stages_expected: undefined })], END, empty)!;
    expect(i.coverage).toBe(0.4);
    expect(buildInputs('a', [probe(1, { stages_expected: undefined })], END, empty)!.coverage).toBeNull();
  });

  it('tells Market it is n/a for an anchor that issues nothing', () => {
    const ctx: AnchorContext = { ...empty, assets: [{ code: 'USDC', issuer: 'GC', issuer_home_domain_matches: false, issuer_listed_by_home_domain: true }] };
    const i = buildInputs('a', [probe(1)], END, ctx)!;
    expect(i).toMatchObject({ market: [], market_na: 'not_issuer', fiat_issued_assets: 0, flows: [] });
  });

  it('aggregates the market samples of an issued fiat asset', () => {
    const ctx: AnchorContext = {
      ...empty,
      assets: [{ code: 'ARST', issuer: 'GA', anchor_asset_type: 'fiat', anchor_asset: 'ARS', is_asset_anchored: true, issuer_home_domain_matches: true }],
      marketSamples: [10, 60, 120, 130, 20].map((dev_bps, k) => ({
        timestamp: at(10 - k),
        anchor_id: 'a',
        code: 'ARST',
        issuer: 'GA',
        anchor_asset: 'ARS',
        dev_bps,
        reference: { source: 'test', date: '2026-09-19', rate: 0.001 },
      })),
    };
    const i = buildInputs('a', [probe(1)], END, ctx)!;
    expect(i.market).toEqual([
      expect.objectContaining({ samples: 5, median_bps: 60, share_outside_50: 0.6, longest_run_gt100_hours: 1, longest_run_gt300_hours: 0 }),
    ]);
    expect(i.market_na).toBeUndefined();
  });

  it('separates "no reference rate" from "no market"', () => {
    const asset = { code: 'ARST', issuer: 'GA', anchor_asset_type: 'fiat', anchor_asset: 'ARS', is_asset_anchored: true, issuer_home_domain_matches: true };
    const attempt = (reason: 'no_fx_rate' | 'no_liquidity') => ({ timestamp: at(1), anchor_id: 'a', code: 'ARST', issuer: 'GA', anchor_asset: 'ARS', reason });
    const noFx = buildInputs('a', [probe(1)], END, { ...empty, assets: [asset], marketSamples: [attempt('no_fx_rate')] })!;
    const thin = buildInputs('a', [probe(1)], END, { ...empty, assets: [asset], marketSamples: [attempt('no_liquidity')] })!;
    expect(noFx.market_na).toBe('no_fiat_reference');
    expect(thin.market_na).toBe('no_market');
  });

  it('does not judge the peg of an asset that never claimed one', () => {
    // SEP-1's is_asset_anchored is where an anchor says the token is worth
    // one unit of the thing it names. Without that claim there is no peg to
    // be off, however far the price sits from the currency's rate.
    const unpegged = { code: 'ARST', issuer: 'GA', anchor_asset_type: 'fiat', anchor_asset: 'ARS', issuer_home_domain_matches: true };
    const s = {
      timestamp: at(1), anchor_id: 'a', code: 'ARST', issuer: 'GA', anchor_asset: 'ARS',
      dev_bps: 900, dev_bps_signed: -900, reference: { source: 'test', date: '2026-09-19', rate: 0.001 },
    };
    const i = buildInputs('a', [probe(1)], END, { ...empty, assets: [unpegged], marketSamples: [s] })!;
    expect(i.market).toEqual([]);
    expect(i.market_na).toBe('not_pegged');
  });

  it('counts mint and burn over 14 and 30 days, and marks an incomplete history truncated', () => {
    const asset = { code: 'ARST', issuer: 'GA', issuer_home_domain_matches: true };
    const flows = [
      { code: 'ARST', issuer: 'GA', covered_from: '2026-09-01', days: { '2026-09-18': { mint_count: 3, burn_count: 1 }, '2026-08-15': { mint_count: 9, burn_count: 9 } } },
    ];
    const i = buildInputs('a', [probe(1)], END, { ...empty, assets: [asset], flows })!;
    expect(i.flows).toEqual([
      { code: 'ARST', issuer: 'GA', mint_count_14d: 3, burn_count_14d: 1, mint_count_30d: 3, burn_count_30d: 1, truncated_14d: false, truncated_30d: true },
    ]);
  });

  it('publishes one digest per day of the anchor\'s results', () => {
    const i = buildInputs('a', [probe(1), probe(2), failed(30)], END, empty)!;
    expect(i.days.map((d) => [d.date, d.n, d.ok])).toEqual([
      ['2026-09-18', 1, 0],
      ['2026-09-19', 2, 2],
    ]);
    expect(i.days[1].digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('integrityChecks', () => {
  it('fails a check that could not run because an earlier stage failed', () => {
    const c = integrityChecks(failed(1), [failed(1)], []);
    expect(c).toMatchObject({ toml_valid: 'fail', toml_cors: 'fail', sep10_signed: 'fail', info_valid: 'fail' });
  });

  it('counts a challenge declined by policy, or SEP-10 not advertised, as n/a', () => {
    const policy = probe(1, { stages: { toml: { ok: true, ms: 1 }, info: { ok: true, ms: 1 }, challenge: { ok: false, policy: true } }, checks: { ...checks, sep10_signature_valid: undefined } });
    const sep6 = probe(1, { checks: { ...checks, sep10_advertised: false, sep10_signature_valid: undefined } });
    expect(integrityChecks(policy, [policy], []).sep10_signed).toBe('na');
    expect(integrityChecks(sep6, [sep6], []).sep10_signed).toBe('na');
  });

  it('fails a challenge signed by the wrong key', () => {
    const wrong = probe(1, { success: false, failed_stage: 'challenge', checks: { ...checks, sep10_signature_valid: false } });
    expect(integrityChecks(wrong, [wrong], []).sep10_signed).toBe('fail');
  });

  it('does not assume a check passed when an older log never measured it', () => {
    const legacy = probe(1, { checks: undefined });
    expect(integrityChecks(legacy, [legacy], [])).toMatchObject({ toml_valid: 'pass', toml_cors: 'na', tls_ok: 'na', sep10_signed: 'pass' });
  });

  it('checks that the signing key never changed across the window', () => {
    const p1 = probe(2);
    const p2 = probe(1, { checks: { ...checks, signing_key: 'GOTHER' } });
    expect(integrityChecks(p2, [p1, p2], []).signing_key_stable).toBe('fail');
    expect(integrityChecks(p1, [p1, probe(3)], []).signing_key_stable).toBe('pass');
    expect(integrityChecks(p1, [p1], []).signing_key_stable).toBe('na');
    // Legacy lines contribute the key read back from their evidence.
    const legacy = probe(3, { checks: undefined, signing_key: 'GKEY' });
    expect(integrityChecks(p1, [legacy, p1], []).signing_key_stable).toBe('pass');
  });

  it('passes a distributed asset its own issuer vouches for, and fails one nobody does', () => {
    const own = { code: 'ARST', issuer: 'GA', issuer_home_domain_matches: true };
    const usdc = { code: 'USDC', issuer: 'GC', issuer_home_domain_matches: false, issuer_listed_by_home_domain: true };
    const fake = { code: 'USDC', issuer: 'GF', issuer_home_domain_matches: false, issuer_listed_by_home_domain: false };
    expect(integrityChecks(probe(1), [probe(1)], [own, usdc]).issuer_home_domain_matches).toBe('pass');
    expect(integrityChecks(probe(1), [probe(1)], [own, fake]).issuer_home_domain_matches).toBe('fail');
    expect(integrityChecks(probe(1), [probe(1)], [{ code: 'BTC' }]).issuer_home_domain_matches).toBe('na');
    // USDC while circle.com serves no toml: unverifiable, so it does not count.
    const unverifiable = { code: 'USDC', issuer: 'GC', issuer_home_domain_matches: false };
    expect(integrityChecks(probe(1), [probe(1)], [unverifiable]).issuer_home_domain_matches).toBe('na');
  });
});

describe('longestRunHours', () => {
  it('measures the longest run of consecutive samples over the threshold', () => {
    const s = (h: number, dev_bps: number) => ({ timestamp: at(h), dev_bps });
    expect(longestRunHours([s(10, 400), s(9, 400), s(8, 10), s(7, 400), s(4, 400), s(1, 400)], 300)).toBe(6);
    expect(longestRunHours([s(3, 10)], 300)).toBe(0);
  });
});

describe('floorToHour', () => {
  it('floors to the top of the hour', () => {
    expect(new Date(floorToHour(Date.parse('2026-09-19T12:47:13Z'))).toISOString()).toBe('2026-09-19T12:00:00.000Z');
  });
});

describe('verify-score roundtrip', () => {
  it('builds a bundle, hashes it, and recomputes exactly the published card', () => {
    const inputs = buildInputs('a', [probe(1), probe(2), failed(3)], END, empty)!;
    const card = computeCard(inputs);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-'));
    const hash = writeInputsBundle(dir, inputs);
    const bytes = fs.readFileSync(path.join(dir, `${hash}.json`), 'utf-8');
    const again = recompute(bytes, hash);
    expect(again.card).toEqual(card);
    expect(again.hash).toBe(hash);
    expect(() => recompute(bytes.replace('"ok7":2', '"ok7":3'), hash)).toThrow('altered');
  });
});

describe('selectToPublish', () => {
  const card = (score: number, window_end: number): ScoreCard => ({
    score,
    availability: 100,
    speed: 100,
    integrity: 100,
    market: null,
    confidence: 80,
    flags: 0,
    window_end,
    methodology_version: 1,
  });
  const now = Date.parse('2026-09-19T12:00:00Z');
  const last = (c: ScoreCard, hoursAgo: number) => ({ published_at: new Date(now - hoursAgo * HOUR).toISOString(), inputs_hash: 'h', card: c });

  it('publishes a first card, a changed card, and an unchanged one after a day', () => {
    const due = selectToPublish(
      [
        { anchorId: 'new', card: card(80, 200) },
        { anchorId: 'changed', card: card(70, 200) },
        { anchorId: 'stale', card: card(80, 200) },
        { anchorId: 'fresh', card: card(80, 200) },
      ],
      { changed: last(card(80, 100), 1), stale: last(card(80, 100), 25), fresh: last(card(80, 100), 1) },
      now,
    );
    expect(due.map((c) => c.anchorId)).toEqual(['new', 'stale', 'changed']);
  });

  it('never sends a window the contract would reject as not newer', () => {
    expect(selectToPublish([{ anchorId: 'a', card: card(10, 100) }], { a: last(card(80, 100), 30) }, now)).toEqual([]);
  });

  it('caps the number of cards per run', () => {
    const many = Array.from({ length: 60 }, (_, k) => ({ anchorId: `a${String(k).padStart(2, '0')}`, card: card(80, 200) }));
    expect(selectToPublish(many, {}, now)).toHaveLength(40);
  });
});

describe('readAliases', () => {
  it('maps each alias to the anchor it is measured under', async () => {
    const { readAliases } = await import('./load.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-'));
    const file = path.join(dir, 'status.json');
    fs.writeFileSync(file, JSON.stringify({ anchors: { anclap_com: { alias_of: 'api_anclap_com' }, api_anclap_com: {}, moneygram: {} } }));
    expect([...readAliases(file)]).toEqual([['anclap_com', 'api_anclap_com']]);
    expect(readAliases(path.join(dir, 'missing.json')).size).toBe(0);
  });
});
