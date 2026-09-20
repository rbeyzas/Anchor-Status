import { isWithheld } from './scorecard';
import type { AnchorViewModel } from './types';

/** Scores based on fewer checks than this are shown as "not enough data":
 * a per-report score starts from a default, so a new dead anchor would
 * otherwise look perfect until it has failed a few times. */
export const MIN_OBSERVATIONS_FOR_SCORE = 3;

/**
 * Whether the number is worth showing. A measured anchor, mainnet or
 * testnet, is scored by its card: without one, or with a confidence under
 * 40, there is no number to show yet. Only the reference mock anchors keep
 * the per-report score, because they exist to check the maths against
 * ground truth rather than to be judged.
 */
export function hasEnoughData(anchor: AnchorViewModel): boolean {
  // Measured, and shown, under the other domain of the same operator.
  if (anchor.status?.aliasOf) return false;
  if (anchor.card) return !isWithheld(anchor.card);
  if (anchor.sourceType !== 'SimulatedMock') return false;
  return !anchor.health || anchor.health.observations >= MIN_OBSERVATIONS_FOR_SCORE;
}

/** The headline to show: the card's when there is one. */
export const headlineScore = (anchor: AnchorViewModel) => anchor.card?.score ?? anchor.score;

/** A withheld card's confidence, 0 without one: how close it is to showing. */
const progressToScore = (anchor: AnchorViewModel) =>
  anchor.card && !anchor.status?.aliasOf ? anchor.card.confidence : -1;

/**
 * Order within one source: reachable, then failing, then not yet checked;
 * within those, shown scores highest first, then withheld cards closest to
 * being shown, then anchors with no card at all.
 */
export function compareAnchors(a: AnchorViewModel, b: AnchorViewModel): number {
  const statusDiff = statusRank(a) - statusRank(b);
  if (statusDiff !== 0) return statusDiff;
  const shownDiff = Number(hasEnoughData(b)) - Number(hasEnoughData(a));
  if (shownDiff !== 0) return shownDiff;
  if (hasEnoughData(a)) return headlineScore(b) - headlineScore(a);
  return progressToScore(b) - progressToScore(a) || a.name.localeCompare(b.name);
}

/** Sort rank within a source: reachable, then failing, then not yet checked. */
export function statusRank(anchor: AnchorViewModel): number {
  if (!anchor.status || anchor.status.reachable === undefined) return anchor.status ? 2 : 0;
  return anchor.status.reachable ? 0 : 1;
}

export const LISTING_LABEL: Record<'abandoned' | 'unsafe', string> = {
  abandoned: 'Listed as abandoned',
  unsafe: 'Flagged unsafe',
};

/** What the directory says, set against what we measured — they disagree
 * more often than you'd think (several "abandoned" anchors still answer). */
export function listingExplanation(anchor: AnchorViewModel): string | undefined {
  const listing = anchor.status?.listing;
  if (!listing) return undefined;
  const source = listing === 'abandoned' ? 'lists this anchor as abandoned' : 'flags this anchor as unsafe';
  const measured =
    anchor.status?.reachable === true
      ? 'our latest check still found its API answering'
      : anchor.status?.reachable === false
        ? 'our latest check found it failing too'
        : 'we have not been able to check it conclusively yet';
  return `StellarExpert's directory ${source}; ${measured}.`;
}

const EVIDENCE_BASE_URL = process.env.NEXT_PUBLIC_EVIDENCE_BASE_URL ?? 'http://37.221.76.23/evidence/';

/** Where a published document (probe evidence or score inputs) lives. */
export const evidenceUrl = (hash: string) => `${EVIDENCE_BASE_URL}${hash}.json`;

/** The newest score point that carries published evidence, if any. */
export function latestEvidence(anchor: AnchorViewModel): { hash: string; url: string; timestamp: string } | undefined {
  for (let i = anchor.scoreHistory.length - 1; i >= 0; i--) {
    const point = anchor.scoreHistory[i];
    if (point.evidence) {
      return { hash: point.evidence, url: `${EVIDENCE_BASE_URL}${point.evidence}.json`, timestamp: point.timestamp };
    }
  }
  return undefined;
}
