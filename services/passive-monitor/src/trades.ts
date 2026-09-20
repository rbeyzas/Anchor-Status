// What the asset actually traded at, from Horizon's trade aggregations.
//
// The order book says what someone is willing to do; a trade says what
// someone did. That difference is why this exists. The book-and-pool
// sampler rejects almost every anchor asset for want of $500 of depth, and
// then reports "no liquid market" for assets that trade twenty to ninety
// times a day. CLPX is the case that made the point: it fell 24% in nine
// days while its card said there was no market to measure.
//
// Daily candles also come with history, so a week of price is available the
// first time this runs rather than a week after it.
import { USDC } from './market.js';

/** One UTC day of trading, as Horizon reports it. */
export interface Candle {
  /** Start of the day, ISO. */
  day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  trades: number;
  /** Volume in the base asset. */
  volume: number;
}

export interface TradeHistory {
  /** Newest last. Days with no trade are absent, not zero. */
  candles: Candle[];
  /** The most recent close, the price to compare with a peg. */
  last?: number;
  /** Deepest peak-to-trough fall within the window, as a percent of the
   * peak. Zero when the price only rose. */
  max_drawdown_pct: number;
  /** Trades across the window: how much the price above is worth trusting. */
  trades: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const assetParams = (prefix: string, a: { code: string; issuer: string }) =>
  `${prefix}_asset_type=${a.code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12'}` +
  `&${prefix}_asset_code=${encodeURIComponent(a.code)}&${prefix}_asset_issuer=${encodeURIComponent(a.issuer)}`;

/**
 * The worst fall from any peak to a later trough, as a percent of that peak.
 * Measured on daily lows against running highs, so an intraday spike and
 * crash counts: that is what a holder trying to get out would have met.
 */
export function maxDrawdownPct(candles: Candle[]): number {
  let peak = 0;
  let worst = 0;
  for (const c of candles) {
    peak = Math.max(peak, c.high);
    if (peak > 0) worst = Math.max(worst, ((peak - c.low) / peak) * 100);
  }
  return Number(worst.toFixed(2));
}

/**
 * Daily candles of asset/USDC for the `days` before `now`. An asset that has
 * never traded returns an empty history rather than an error: no trades is a
 * fact about the market, not a failure to read it.
 */
export async function fetchTradeHistory(
  fetchImpl: typeof fetch,
  horizonUrl: string,
  asset: { code: string; issuer: string },
  days: number,
  timeoutMs: number,
  now: Date = new Date(),
): Promise<TradeHistory> {
  const end = now.getTime();
  const url =
    `${horizonUrl}/trade_aggregations?${assetParams('base', asset)}&${assetParams('counter', USDC)}` +
    `&resolution=${DAY_MS}&start_time=${end - days * DAY_MS}&end_time=${end}&order=asc&limit=200`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const body = (await res.json()) as {
    _embedded?: { records?: { timestamp: string; trade_count: string | number; base_volume: string; open: string; high: string; low: string; close: string }[] };
  };
  const candles: Candle[] = (body._embedded?.records ?? []).map((r) => ({
    day: new Date(Number(r.timestamp)).toISOString(),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    trades: Number(r.trade_count),
    volume: Number(r.base_volume),
  }));
  return {
    candles,
    ...(candles.length ? { last: candles[candles.length - 1].close } : {}),
    max_drawdown_pct: maxDrawdownPct(candles),
    trades: candles.reduce((n, c) => n + c.trades, 0),
  };
}
