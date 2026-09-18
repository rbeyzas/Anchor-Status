import type { AnchorViewModel } from './types';

/** Scores based on fewer checks than this are shown as "not enough data":
 * the contract starts every anchor at 100, so a new dead anchor would
 * otherwise look perfect until it has failed a few times. */
export const MIN_OBSERVATIONS_FOR_SCORE = 3;

export function hasEnoughData(anchor: AnchorViewModel): boolean {
  return !anchor.health || anchor.health.observations >= MIN_OBSERVATIONS_FOR_SCORE;
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
