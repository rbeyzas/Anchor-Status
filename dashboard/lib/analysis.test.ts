import { describe, expect, it } from 'vitest';
import { hasRecentSignificantDrop } from './analysis';
import type { ScorePoint } from './types';

function pointsAgo(entries: Array<[hoursAgo: number, score: number]>, now: Date): ScorePoint[] {
  return entries.map(([hoursAgo, score]) => ({
    timestamp: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString(),
    score,
  }));
}

describe('hasRecentSignificantDrop', () => {
  const now = new Date('2026-01-15T12:00:00.000Z');

  it('returns false for an empty history', () => {
    expect(hasRecentSignificantDrop([], 50, now)).toBe(false);
  });

  it('returns false when the score has been stable', () => {
    const history = pointsAgo(
      [
        [48, 90],
        [24, 89],
        [1, 88],
      ],
      now,
    );
    expect(hasRecentSignificantDrop(history, 88, now)).toBe(false);
  });

  it('returns true when score dropped more than the threshold in the last 24h', () => {
    const history = pointsAgo(
      [
        [48, 90],
        [25, 90],
        [1, 90],
      ],
      now,
    );
    expect(hasRecentSignificantDrop(history, 40, now)).toBe(true);
  });

  it('returns false for a drop right at the threshold (strictly greater required)', () => {
    const history = pointsAgo([[25, 90]], now);
    expect(hasRecentSignificantDrop(history, 75, now, 15)).toBe(false);
  });

  it('respects a custom threshold', () => {
    const history = pointsAgo([[25, 90]], now);
    expect(hasRecentSignificantDrop(history, 85, now, 3)).toBe(true);
    expect(hasRecentSignificantDrop(history, 85, now, 10)).toBe(false);
  });
});
