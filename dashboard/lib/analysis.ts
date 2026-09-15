import type { ScorePoint } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Finds the score history point closest to (but not after) `targetTime`. */
function scoreAt(history: ScorePoint[], targetTime: number): ScorePoint | undefined {
  let best: ScorePoint | undefined;
  for (const point of history) {
    const t = new Date(point.timestamp).getTime();
    if (t <= targetTime && (!best || t > new Date(best.timestamp).getTime())) {
      best = point;
    }
  }
  return best ?? history[0];
}

/** Points a "Recent slashing" style warning: true when the current score is
 * more than `thresholdDrop` points below where it was ~24h ago. */
export function hasRecentSignificantDrop(
  history: ScorePoint[],
  currentScore: number,
  now: Date = new Date(),
  thresholdDrop = 15,
): boolean {
  if (history.length === 0) return false;
  const dayAgo = scoreAt(history, now.getTime() - DAY_MS);
  if (!dayAgo) return false;
  return dayAgo.score - currentScore > thresholdDrop;
}
