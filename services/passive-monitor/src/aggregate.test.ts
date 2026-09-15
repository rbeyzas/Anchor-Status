import { describe, expect, it } from 'vitest';
import { aggregatePayments } from './aggregate.js';
import type { PaymentRecord } from './types.js';

function record(assetCode: string, amount: number): PaymentRecord {
  return { createdAt: new Date().toISOString(), assetCode, amount };
}

describe('aggregatePayments', () => {
  it('returns zeroed stats for an empty record list', () => {
    const { overall, byAsset } = aggregatePayments([], 7);
    expect(overall).toEqual({ txCount: 0, avgAmount: 0, totalAmount: 0, avgFrequencyPerDay: 0 });
    expect(byAsset).toEqual([]);
  });

  it('computes overall totals, averages and daily frequency', () => {
    const records = [record('XLM', 100), record('XLM', 300), record('USDC', 50)];
    const { overall } = aggregatePayments(records, 7);
    expect(overall.txCount).toBe(3);
    expect(overall.totalAmount).toBe(450);
    expect(overall.avgAmount).toBeCloseTo(150);
    expect(overall.avgFrequencyPerDay).toBeCloseTo(3 / 7);
  });

  it('buckets stats per asset and sorts by total volume descending', () => {
    const records = [record('XLM', 10), record('USDC', 1000), record('XLM', 20)];
    const { byAsset } = aggregatePayments(records, 1);
    expect(byAsset.map((a) => a.assetCode)).toEqual(['USDC', 'XLM']);
    const xlm = byAsset.find((a) => a.assetCode === 'XLM')!;
    expect(xlm.txCount).toBe(2);
    expect(xlm.totalAmount).toBe(30);
  });

  it('handles a zero lookback window without dividing by zero', () => {
    const { overall } = aggregatePayments([record('XLM', 10)], 0);
    expect(overall.avgFrequencyPerDay).toBe(0);
  });
});
