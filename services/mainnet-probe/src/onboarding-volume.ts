// How much an applicant's own assets are used, for the onboarding transfer
// threshold: StellarExpert's count of every payment of the asset on the
// network, ever. Counting only the issuer's mints and burns undercounts by
// orders of magnitude (anchors mint in batches to a distribution account and
// serve customers from there: CLPX showed 9 against 530,674 payments).
import type { Fetch } from './http.js';
import { STELLAR_EXPERT_API } from './issuers.js';

/** Payments of one asset on mainnet; 0 when StellarExpert has never seen it.
 * Throws when it gives no clear answer, so a hiccup is never a zero. */
export async function assetPaymentCount(
  fetchImpl: Fetch,
  code: string,
  issuer: string,
  timeoutMs: number,
  expertUrl = STELLAR_EXPERT_API,
): Promise<number> {
  const res = await fetchImpl(`${expertUrl}/asset/${encodeURIComponent(code)}-${issuer}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 404) return 0;
  if (!res.ok) throw new Error(`StellarExpert answered ${res.status} for ${code}`);
  const payments = ((await res.json()) as { payments?: unknown }).payments;
  if (typeof payments !== 'number' || !Number.isFinite(payments) || payments < 0) {
    throw new Error(`StellarExpert gave no payment count for ${code}`);
  }
  return payments;
}
