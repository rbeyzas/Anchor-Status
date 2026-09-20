import { describe, expect, it } from 'vitest';
import { fetchTradeHistory, maxDrawdownPct, type Candle } from './trades.js';

const candle = (day: string, o: number, h: number, l: number, c: number, trades = 1): Candle => ({
  day,
  open: o,
  high: h,
  low: l,
  close: c,
  trades,
  volume: 1,
});

describe('maxDrawdownPct', () => {
  it('is zero for a price that only rises and never dips within a day', () => {
    // Each day's high is its low here. A day with any range at all has a
    // fall inside it, and that counts: see the intraday case below.
    expect(maxDrawdownPct([candle('d1', 1, 1, 1, 1), candle('d2', 1.3, 1.3, 1.3, 1.3)])).toBe(0);
  });

  it('counts the dip inside a day even while the trend is up', () => {
    expect(maxDrawdownPct([candle('d1', 1, 1.1, 1, 1.1), candle('d2', 1.1, 1.3, 1.1, 1.3)])).toBe(15.38);
  });

  it('measures the deepest fall from a peak to a later trough', () => {
    const c = [candle('d1', 100, 100, 100, 100), candle('d2', 100, 100, 80, 80), candle('d3', 80, 90, 80, 90)];
    expect(maxDrawdownPct(c)).toBe(20);
  });

  it('measures from the running peak, not from the first price', () => {
    // A price that climbs then falls has its drawdown measured from the top.
    const c = [candle('d1', 100, 100, 100, 100), candle('d2', 100, 200, 100, 200), candle('d3', 200, 200, 100, 100)];
    expect(maxDrawdownPct(c)).toBe(50);
  });

  it('counts an intraday crash, which is what a holder getting out would meet', () => {
    const c = [candle('d1', 100, 100, 50, 99)];
    expect(maxDrawdownPct(c)).toBe(50);
  });

  it('is zero with nothing to measure', () => {
    expect(maxDrawdownPct([])).toBe(0);
  });
});

describe('fetchTradeHistory', () => {
  const at = new Date('2026-09-20T00:00:00.000Z');
  const asset = { code: 'CLPX', issuer: 'GISSUER' };
  const horizon = (records: unknown[], ok = true) =>
    (async () => ({ ok, status: ok ? 200 : 503, json: async () => ({ _embedded: { records } }) })) as unknown as typeof fetch;

  it('reads candles and derives the last close, the trade count and the drawdown', async () => {
    const h = await fetchTradeHistory(
      horizon([
        { timestamp: '1789948800000', open: '1', high: '1', low: '1', close: '1', trades: 0, trade_count: 10, base_volume: '5' },
        { timestamp: '1790035200000', open: '1', high: '1', low: '0.8', close: '0.9', trade_count: 5, base_volume: '3' },
      ]),
      'https://h',
      asset,
      7,
      100,
      at,
    );
    expect(h.candles).toHaveLength(2);
    expect(h.last).toBe(0.9);
    expect(h.trades).toBe(15);
    expect(h.max_drawdown_pct).toBe(20);
  });

  it('reports an asset that has never traded as an empty history, not an error', async () => {
    // No trades is a fact about the market, not a failure to read it.
    const h = await fetchTradeHistory(horizon([]), 'https://h', asset, 7, 100, at);
    expect(h).toEqual({ candles: [], max_drawdown_pct: 0, trades: 0 });
    expect(h.last).toBeUndefined();
  });

  it('throws when Horizon itself fails, so nothing is recorded', async () => {
    await expect(fetchTradeHistory(horizon([], false), 'https://h', asset, 7, 100, at)).rejects.toThrow('HTTP 503');
  });
});
