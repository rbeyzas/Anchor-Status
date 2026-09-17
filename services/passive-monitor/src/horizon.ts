import { Horizon } from '@stellar/stellar-sdk';
import type { PaymentRecord } from './types.js';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const HORIZON_CALL_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Horizon call timed out after ${HORIZON_CALL_TIMEOUT_MS}ms: ${label}`)),
        HORIZON_CALL_TIMEOUT_MS,
      ),
    ),
  ]);
}

const PAYMENT_TYPES = new Set([
  'payment',
  'path_payment_strict_receive',
  'path_payment_strict_send',
]);

/**
 * Fetches every payment/path_payment operation touching `accountId` whose
 * `created_at` is at or after `cutoff`, paginating backwards from most
 * recent. READ ONLY — never submits a transaction. Pages are separated by
 * `delayMs` to stay well under Horizon's public rate limits.
 */
export async function fetchRecentPayments(
  server: Horizon.Server,
  accountId: string,
  cutoff: Date,
  delayMs: number,
  maxPages: number,
): Promise<PaymentRecord[]> {
  const results: PaymentRecord[] = [];
  let page = await withTimeout(
    server.payments().forAccount(accountId).order('desc').limit(200).call(),
    `payments().forAccount(${accountId})`,
  );

  let reachedCutoff = false;
  let pageCount = 0;
  let hitPageCap = false;
  while (!reachedCutoff) {
    pageCount += 1;
    for (const record of page.records) {
      const createdAt = new Date(record.created_at);
      if (createdAt < cutoff) {
        reachedCutoff = true;
        break;
      }
      if (!PAYMENT_TYPES.has(record.type)) {
        continue;
      }
      const op = record as unknown as {
        asset_type: string;
        asset_code?: string;
        amount?: string;
        source_amount?: string;
      };
      const amountStr = op.amount ?? op.source_amount;
      if (!amountStr) continue;
      results.push({
        createdAt: record.created_at,
        assetCode: op.asset_type === 'native' ? 'XLM' : (op.asset_code ?? 'UNKNOWN'),
        amount: Number(amountStr),
      });
    }

    if (reachedCutoff || page.records.length === 0) {
      break;
    }
    if (pageCount >= maxPages) {
      hitPageCap = true;
      break;
    }

    await sleep(delayMs);
    page = await withTimeout(page.next(), `page.next() for ${accountId}`);
  }

  if (hitPageCap) {
    console.warn(
      `[passive-monitor] ${accountId}: hit ${maxPages}-page cap before reaching the lookback cutoff ` +
        `(very high-traffic account) — stats below are a sample of the most recent activity, not exhaustive.`,
    );
  }

  return results;
}
