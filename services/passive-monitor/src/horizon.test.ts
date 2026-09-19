import type { Horizon } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { fetchRecentPayments, isHistoryMissing } from './horizon.js';

/** Horizon's 404 body, as the SDK hands it to us. */
const notFound = () => Object.assign(new Error('Not Found'), { response: { status: 404, title: 'Resource Missing' } });

interface FakePage {
  records: Record<string, unknown>[];
  next: () => Promise<FakePage>;
}

/** A Horizon whose first page either answers or throws. */
function fakeServer(first: () => Promise<FakePage>): Horizon.Server {
  return {
    payments: () => ({
      forAccount: () => ({ order: () => ({ limit: () => ({ call: first }) }) }),
    }),
  } as unknown as Horizon.Server;
}

const payment = (createdAt: string) => ({
  type: 'payment',
  created_at: createdAt,
  asset_type: 'credit_alphanum4',
  asset_code: 'ARST',
  asset_issuer: 'GISSUER',
  amount: '10',
  from: 'GISSUER',
  to: 'GUSER',
});

const CUTOFF = new Date('2026-09-01T00:00:00Z');

describe('isHistoryMissing', () => {
  it('is a 404 from Horizon and nothing else', () => {
    expect(isHistoryMissing(notFound())).toBe(true);
    expect(isHistoryMissing(Object.assign(new Error('boom'), { response: { status: 503 } }))).toBe(false);
    expect(isHistoryMissing(new Error('fetch failed'))).toBe(false);
    expect(isHistoryMissing(undefined)).toBe(false);
  });
});

describe('fetchRecentPayments', () => {
  it('reads an account with no history at all as zero payments, not an error', async () => {
    // Horizon 404s the whole collection for an account that has never been
    // a participant in a classic operation; that is a real zero.
    const server = fakeServer(() => Promise.reject(notFound()));
    const result = await fetchRecentPayments(server, 'GISSUER', CUTOFF, 0);
    expect(result).toEqual({ records: [], truncated: false, historyMissing: true });
  });

  it('still throws anything that is not a 404', async () => {
    const server = fakeServer(() => Promise.reject(Object.assign(new Error('Service Unavailable'), { response: { status: 503 } })));
    await expect(fetchRecentPayments(server, 'GISSUER', CUTOFF, 0)).rejects.toThrow('Service Unavailable');
  });

  it('marks a 404 part-way through paging as truncated, keeping what it read', async () => {
    // We have already read rows, so history exists: what we could not read
    // is missing history, which is what `truncated` means.
    const server = fakeServer(() =>
      Promise.resolve({ records: [payment('2026-09-19T10:00:00Z')], next: () => Promise.reject(notFound()) }),
    );
    const result = await fetchRecentPayments(server, 'GISSUER', CUTOFF, 0);
    expect(result.truncated).toBe(true);
    expect(result.historyMissing).toBeUndefined();
    expect(result.records).toHaveLength(1);
  });

  it('reads a normal page and stops at the cutoff', async () => {
    const server = fakeServer(() =>
      Promise.resolve({
        records: [payment('2026-09-19T10:00:00Z'), payment('2026-08-01T10:00:00Z')],
        next: () => Promise.reject(new Error('should not page past the cutoff')),
      }),
    );
    const result = await fetchRecentPayments(server, 'GISSUER', CUTOFF, 0);
    expect(result).toMatchObject({ truncated: false });
    expect(result.records).toHaveLength(1);
  });
});
