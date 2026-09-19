import { describe, expect, it } from 'vitest';
import { describeProblem, issuedAssets, mergeStatusInto, policyNote } from './anchor-status';
import { compareAnchors, hasEnoughData, headlineScore, listingExplanation, statusRank } from './status-labels';
import type { AnchorViewModel } from './types';

const probe = (extra: object = {}) => ({ timestamp: '2026-09-18T12:00:00Z', success: false, policy: [], ...extra });

describe('describeProblem', () => {
  it('names the broken piece, not just "failed"', () => {
    expect(describeProblem(probe({ failed_stage: 'initiate', error: 'HTTP 404 from https://x' }))).toBe(
      'Deposit endpoint missing (404)',
    );
    expect(describeProblem(probe({ failed_stage: 'toml', error: 'stellar.toml no longer advertises a SEP-6/24 transfer server' }))).toBe(
      'No SEP-6/24 transfer service in its stellar.toml',
    );
    expect(describeProblem(probe({ failed_stage: 'info', error: 'fetch failed' }))).toBe('Transfer server not answering');
  });

  it('reports nothing for a success or an inconclusive check', () => {
    expect(describeProblem(probe({ success: true }))).toBeUndefined();
    expect(describeProblem(probe({ inconclusive: true, failed_stage: 'toml' }))).toBeUndefined();
  });
});

describe('policyNote', () => {
  it('explains an anchor that only serves registered wallets', () => {
    expect(policyNote(probe({ success: true, policy: ['challenge'] }))).toBe('Serves registered wallets only');
  });
});

const anchor = (extra: Partial<AnchorViewModel> = {}): AnchorViewModel => ({
  anchorId: 'a',
  name: 'A',
  domain: 'a.example',
  sourceType: 'RealMainnet',
  stake: 0,
  score: 100,
  scoreHistory: [],
  slashEvents: [],
  lastUpdated: '2026-09-18T12:00:00Z',
  ...extra,
});

describe('status labels', () => {
  it('hides a per-report score until the anchor has been checked a few times', () => {
    const health = { trend: 'Stable', riskReason: 'None', consecutiveFailures: 0, recentSuccessPercent: 100, recentCount: 1 } as const;
    expect(hasEnoughData(anchor({ sourceType: 'RealTestnet', health: { ...health, observations: 1 } }))).toBe(false);
    expect(hasEnoughData(anchor({ sourceType: 'RealTestnet', health: { ...health, observations: 3 } }))).toBe(true);
  });

  it('scores a mainnet anchor by its card, and shows nothing without one', () => {
    const card = {
      score: 81,
      availability: 100,
      speed: 100,
      integrity: 100,
      market: null,
      confidence: 61,
      flags: [],
      windowEnd: '2026-09-19T12:00:00.000Z',
      methodologyVersion: 1,
      inputsHash: 'ab'.repeat(32),
      publishedAt: '2026-09-19T12:05:00.000Z',
    };
    expect(hasEnoughData(anchor({ sourceType: 'RealMainnet' }))).toBe(false);
    expect(hasEnoughData(anchor({ sourceType: 'RealMainnet', card }))).toBe(true);
    expect(hasEnoughData(anchor({ sourceType: 'RealMainnet', card: { ...card, confidence: 39 } }))).toBe(false);
    expect(headlineScore(anchor({ score: 40, card }))).toBe(81);
    expect(headlineScore(anchor({ score: 40 }))).toBe(40);
  });

  it('reads the assets an anchor issues and its oldest issuer account', () => {
    expect(
      issuedAssets([
        { code: 'ARST', issuer: 'GA', issuer_home_domain_matches: true, issuer_created_at: '2021-05-01T00:00:00Z' },
        { code: 'BRLT', issuer: 'GB', issuer_home_domain_matches: true, issuer_created_at: '2020-02-01T00:00:00Z' },
        { code: 'USDC', issuer: 'GC', issuer_home_domain_matches: false, issuer_created_at: '2019-01-01T00:00:00Z' },
      ]),
    ).toEqual({ issuedAssets: ['ARST', 'BRLT'], onChainSince: '2020-02-01T00:00:00Z' });
    expect(issuedAssets([{ code: 'USDC', issuer: 'GC', issuer_home_domain_matches: false }])).toEqual({});
  });

  it('sorts reachable anchors before failing ones', () => {
    const ok = anchor({ status: { dormant: false, reachable: true } });
    const failing = anchor({ status: { dormant: false, reachable: false } });
    expect(statusRank(ok)).toBeLessThan(statusRank(failing));
  });

  it('sets the directory label against what was measured', () => {
    const text = listingExplanation(anchor({ status: { dormant: false, reachable: true, listing: 'abandoned' } }));
    expect(text).toBe("StellarExpert's directory lists this anchor as abandoned; our latest check still found its API answering.");
  });

  it('merges status into the matching anchor only', () => {
    const merged = mergeStatusInto([anchor(), anchor({ anchorId: 'b' })], {
      generated_at: 'now',
      anchors: { a: { dormant: true, listing: 'unsafe', last_probe: probe({ failed_stage: 'info' }) } },
    });
    expect(merged[0].status).toMatchObject({ dormant: true, listing: 'unsafe', reachable: false });
    expect(merged[1].status).toBeUndefined();
  });
});

describe('latestEvidence', () => {
  it('links the newest report that carries evidence', async () => {
    const { latestEvidence } = await import('./status-labels');
    const a = anchor({
      scoreHistory: [
        { timestamp: '2026-09-18T10:00:00Z', score: 90, evidence: 'aa'.repeat(32) },
        { timestamp: '2026-09-18T11:00:00Z', score: 95, evidence: 'bb'.repeat(32) },
        { timestamp: '2026-09-18T12:00:00Z', score: 96 },
      ],
    });
    expect(latestEvidence(a)?.hash).toBe('bb'.repeat(32));
    expect(latestEvidence(a)?.url).toMatch(/\/evidence\/b{64}\.json$/);
  });

  it('has nothing to link for reports made without evidence', async () => {
    const { latestEvidence } = await import('./status-labels');
    expect(latestEvidence(anchor({ scoreHistory: [{ timestamp: 't', score: 1 }] }))).toBeUndefined();
  });
});

describe('aliases', () => {
  it('names the entry an alias is measured under, and shows no score of its own', () => {
    const [alias, canonical] = mergeStatusInto([anchor({ anchorId: 'anclap_com' }), anchor({ anchorId: 'api_anclap_com' })], {
      generated_at: '',
      anchors: {
        anclap_com: { domain: 'anclap.com', dormant: true, alias_of: 'api_anclap_com' },
        api_anclap_com: { domain: 'api.anclap.com', dormant: false },
      },
    });
    expect(alias.status?.aliasOf).toEqual({ anchorId: 'api_anclap_com', domain: 'api.anclap.com' });
    expect(hasEnoughData(alias)).toBe(false);
    expect(canonical.status?.aliasOf).toBeUndefined();
  });
});

describe('compareAnchors', () => {
  const card = (score: number, confidence: number) => ({
    score,
    availability: 100,
    speed: 100,
    integrity: 100,
    market: null,
    confidence,
    flags: [],
    windowEnd: '',
    methodologyVersion: 1,
    inputsHash: '',
    publishedAt: '',
  });
  const up = { dormant: false, reachable: true } as const;
  const down = { dormant: false, reachable: false } as const;

  it('puts shown scores first, then withheld cards closest to being shown, then anchors without a card', () => {
    const list = [
      anchor({ anchorId: 'none', name: 'none', status: up }),
      anchor({ anchorId: 'far', name: 'far', card: card(60, 20), status: up }),
      anchor({ anchorId: 'shown_low', name: 'shown_low', card: card(70, 80), status: up }),
      anchor({ anchorId: 'near', name: 'near', card: card(60, 38), status: up }),
      anchor({ anchorId: 'shown_high', name: 'shown_high', card: card(90, 80), status: up }),
    ];
    expect([...list].sort(compareAnchors).map((a) => a.anchorId)).toEqual(['shown_high', 'shown_low', 'near', 'far', 'none']);
  });

  it('still keeps reachable anchors above failing ones', () => {
    const failingShown = anchor({ anchorId: 'failing', card: card(45, 90), status: down });
    const reachableWithheld = anchor({ anchorId: 'reachable', card: card(80, 10), status: up });
    expect([failingShown, reachableWithheld].sort(compareAnchors).map((a) => a.anchorId)).toEqual(['reachable', 'failing']);
  });
});
