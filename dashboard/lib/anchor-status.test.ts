import { describe, expect, it } from 'vitest';
import { describeProblem, mergeStatusInto, policyNote } from './anchor-status';
import { hasEnoughData, listingExplanation, statusRank } from './status-labels';
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
  it('hides the score until the anchor has been checked a few times', () => {
    const health = { trend: 'Stable', riskReason: 'None', consecutiveFailures: 0, recentSuccessPercent: 100, recentCount: 1 } as const;
    expect(hasEnoughData(anchor({ health: { ...health, observations: 1 } }))).toBe(false);
    expect(hasEnoughData(anchor({ health: { ...health, observations: 3 } }))).toBe(true);
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
