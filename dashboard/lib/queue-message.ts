/** The message an admin signer signs (SEP-53) to reject a queued
 * transaction: built the same way in the browser and on the server. */
export const rejectMessage = (id: string) => `Mona admin queue: reject ${id}`;

/** The message an admin signer signs (SEP-53) to decide a dispute. It names
 * the oracle and the card, so a signature decides nothing else. The
 * collector rebuilds it the same way (services/aggregator/src/disputes.ts). */
export const decisionMessage = (oracle: string, anchorId: string, windowEnd: number, decision: 'uphold' | 'reject') =>
  `Mona dispute decision: ${decision} ${anchorId} card ${windowEnd} oracle ${oracle}`;
