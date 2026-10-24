/** The message an admin signer signs (SEP-53) to reject a queued
 * transaction: built the same way in the browser and on the server. */
export const rejectMessage = (id: string) => `Mona admin queue: reject ${id}`;
