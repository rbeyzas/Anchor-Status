import { Horizon } from '@stellar/stellar-sdk';
import type { PaymentRecord } from './types.js';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PAYMENT_TYPES = new Set([
  'payment',
  'path_payment_strict_receive',
  'path_payment_strict_send',
]);

export interface RecentPayments {
  records: PaymentRecord[];
  /** True when `maxPages` ran out before reaching `cutoff`. */
  truncated: boolean;
  /** created_at of the oldest operation actually scanned (payment or not). */
  oldestScannedAt?: string;
}

/**
 * Fetches every payment/path_payment operation touching `accountId` whose
 * `created_at` is at or after `cutoff`, paginating backwards from most
 * recent. READ ONLY — never submits a transaction. Pages are separated by
 * `delayMs` to stay well under Horizon's public rate limits.
 *
 * High-volume accounts (hundreds of thousands of payments a week) would take
 * hours to page through, so scanning stops after `maxPages` and reports
 * `truncated` — callers should then measure over the window actually covered.
 */
export async function fetchRecentPayments(
  server: Horizon.Server,
  accountId: string,
  cutoff: Date,
  delayMs: number,
  maxPages = Infinity,
): Promise<RecentPayments> {
  const results: PaymentRecord[] = [];
  let oldestScannedAt: string | undefined;
  let pagesFetched = 1;
  let page = await server
    .payments()
    .forAccount(accountId)
    .order('desc')
    .limit(200)
    .call();

  let reachedCutoff = false;
  while (!reachedCutoff) {
    for (const record of page.records) {
      const createdAt = new Date(record.created_at);
      if (createdAt < cutoff) {
        reachedCutoff = true;
        break;
      }
      oldestScannedAt = record.created_at;
      if (!PAYMENT_TYPES.has(record.type)) {
        continue;
      }
      const op = record as unknown as {
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
        amount?: string;
        source_amount?: string;
        source_asset_type?: string;
        source_asset_code?: string;
        source_asset_issuer?: string;
        from?: string;
        to?: string;
      };
      const amountStr = op.amount ?? op.source_amount;
      if (!amountStr) continue;
      results.push({
        createdAt: record.created_at,
        assetCode: op.asset_type === 'native' ? 'XLM' : (op.asset_code ?? 'UNKNOWN'),
        amount: Number(amountStr),
        ...(op.from ? { from: op.from } : {}),
        ...(op.to ? { to: op.to } : {}),
        ...(op.asset_issuer ? { assetIssuer: op.asset_issuer } : {}),
        ...(op.source_asset_type
          ? {
              sourceAssetCode: op.source_asset_type === 'native' ? 'XLM' : op.source_asset_code,
              ...(op.source_asset_issuer ? { sourceAssetIssuer: op.source_asset_issuer } : {}),
              ...(op.source_amount ? { sourceAmount: Number(op.source_amount) } : {}),
            }
          : {}),
      });
    }

    if (reachedCutoff || page.records.length === 0) {
      break;
    }
    if (pagesFetched >= maxPages) {
      return { records: results, truncated: true, oldestScannedAt };
    }

    await sleep(delayMs);
    page = await page.next();
    pagesFetched++;
  }

  return { records: results, truncated: false, oldestScannedAt };
}
