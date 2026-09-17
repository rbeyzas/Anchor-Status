import { describe, expect, it } from 'vitest';
import { mergeArchiveInto } from './history';
import type { AnchorViewModel } from './types';

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

  it('leaves anchors that the archive has never seen alone', () => {
    const merged = mergeArchiveInto([anchor({ anchorId: 'unknown' })], archive({ a: { scoreHistory: [], slashEvents: [] } }));
    expect(merged[0].scoreHistory).toHaveLength(1);
  });
});
