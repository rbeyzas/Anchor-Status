import { describe, expect, it } from 'vitest';
import { MAX_CHART_POINTS, mergeArchiveInto, thinHistory } from './history';
import type { AnchorViewModel, ScorePoint } from './types';

function anchor(overrides: Partial<AnchorViewModel> = {}): AnchorViewModel {
  return {
    anchorId: 'a',
    name: 'A',
    domain: 'a.example',
    sourceType: 'RealMainnet',
    stake: 0,
    score: 50,
    scoreHistory: [{ timestamp: '2026-09-17T12:00:00Z', score: 50 }],
    slashEvents: [],
    lastUpdated: '2026-09-17T12:00:00Z',
    ...overrides,
  };
}

const archive = (anchors: Record<string, unknown>) =>
  ({ version: 1, updatedAt: '2026-09-17T12:00:00Z', anchors }) as never;

describe('mergeArchiveInto', () => {
  it('returns anchors untouched when no archive is available', () => {
    const anchors = [anchor()];
    expect(mergeArchiveInto(anchors, null)).toEqual(anchors);
  });

  it('prepends archived points older than the RPC event window', () => {
    const merged = mergeArchiveInto(
      [anchor()],
      archive({ a: { scoreHistory: [{ timestamp: '2026-09-16T00:00:00Z', score: 20 }], slashEvents: [] } }),
    );
    expect(merged[0].scoreHistory.map((p) => p.score)).toEqual([20, 50]);
  });

  it('does not duplicate a point present in both sources', () => {
    const merged = mergeArchiveInto(
      [anchor()],
      archive({ a: { scoreHistory: [{ timestamp: '2026-09-17T12:00:00Z', score: 50 }], slashEvents: [] } }),
    );
    expect(merged[0].scoreHistory).toHaveLength(1);
  });

  it('converts archived slash amounts from stroops to XLM', () => {
    const merged = mergeArchiveInto(
      [anchor()],
      archive({
        a: { scoreHistory: [], slashEvents: [{ timestamp: '2026-09-17T11:00:00Z', amountStroops: '10000000' }] },
      }),
    );
    expect(merged[0].slashEvents).toEqual([{ timestamp: '2026-09-17T11:00:00Z', amount: 1 }]);
  });

  it('ignores archived slash entries in an unreadable shape instead of throwing', () => {
    const merged = mergeArchiveInto(
      [anchor()],
      archive({ a: { scoreHistory: [{ timestamp: '2026-09-16T00:00:00Z', score: 20 }], slashEvents: [{ timestamp: '2026-09-16T00:00:00Z', amountStroops: 'undefined' }] } }),
    );
    expect(merged[0].slashEvents).toEqual([]);
    expect(merged[0].scoreHistory).toHaveLength(2);
  });

  it('leaves anchors that the archive has never seen alone', () => {
    const merged = mergeArchiveInto([anchor({ anchorId: 'unknown' })], archive({ a: { scoreHistory: [], slashEvents: [] } }));
    expect(merged[0].scoreHistory).toHaveLength(1);
  });
});

describe('thinHistory', () => {
  const points = (n: number): ScorePoint[] =>
    Array.from({ length: n }, (_, i) => ({ timestamp: new Date(Date.UTC(2026, 8, 11) + i * 60_000).toISOString(), score: i % 101 }));

  it('leaves a short history untouched', () => {
    const p = points(200);
    expect(thinHistory(p)).toBe(p);
  });

  it('keeps at most the limit, only real points, in order, spanning the whole range', () => {
    const p = points(8336);
    const thinned = thinHistory(p);
    expect(thinned).toHaveLength(MAX_CHART_POINTS);
    expect(thinned[0]).toBe(p[0]);
    expect(thinned.at(-1)).toBe(p.at(-1));
    for (const point of thinned) expect(p).toContain(point);
    const times = thinned.map((x) => x.timestamp);
    expect([...times].sort()).toEqual(times);
  });

  it('keeps the latest report with evidence so the evidence link stays exact', () => {
    const p = points(5000);
    p[4321] = { ...p[4321], evidence: 'ab'.repeat(32) };
    expect(thinHistory(p)).toContain(p[4321]);
  });
});
