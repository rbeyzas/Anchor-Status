// Market samples for the Market pillar (docs/SCORING.md section 6.4): the
// price of an issued fiat asset in USD, from the Stellar DEX, against its
// reference rate. Only liquid markets count: a thin book can be pushed
// anywhere by one small order.
import fs from 'node:fs';
import path from 'node:path';

/** The USD numeraire: Circle's USDC on Stellar mainnet. Checked against
 * Circle's published contract addresses, StellarExpert (2.4M trustlines)
 * and the Centre stellar.toml. Assumed to hold its own peg. */
export const USDC = { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' } as const;

/** A sample needs this much USD on each side within 1% of the price. */
export const MIN_DEPTH_USD = 500;
export const DEPTH_BAND = 0.01;
/** Wider than this, the order book's mid is not a price anyone trades at. */
export const MAX_SPREAD = 0.05;

export interface Level {
  price: number;
  amount: number;
}

export interface OrderBookQuote {
  mid: number;
  spread: number;
  /** USD within 1% of mid on the weaker side. */
  depth_usd: number;
}

export interface AmmQuote {
  spot: number;
  depth_usd: number;
}

/**
 * Order book of asset/USDC. Horizon gives prices in USDC per unit of the
 * asset; a bid's amount is in USDC (what it sells), an ask's in the asset.
 * Null when a side is empty.
 */
export function quoteOrderBook(bids: Level[], asks: Level[]): OrderBookQuote | null {
  if (bids.length === 0 || asks.length === 0) return null;
  const bestBid = Math.max(...bids.map((b) => b.price));
  const bestAsk = Math.min(...asks.map((a) => a.price));
  const mid = (bestBid + bestAsk) / 2;
  const bidDepth = bids.filter((b) => b.price >= mid * (1 - DEPTH_BAND)).reduce((s, b) => s + b.amount, 0);
  const askDepth = asks.filter((a) => a.price <= mid * (1 + DEPTH_BAND)).reduce((s, a) => s + a.amount * a.price, 0);
  return { mid, spread: (bestAsk - bestBid) / mid, depth_usd: Math.min(bidDepth, askDepth) };
}

/** Constant-product pool: the USDC it takes to move the price 1% either
 * way is reserve·(√1.01 − 1) going up and reserve·(1 − √0.99) going down. */
export function quoteAmm(reserveAsset: number, reserveUsdc: number): AmmQuote | null {
  if (!(reserveAsset > 0) || !(reserveUsdc > 0)) return null;
  const up = reserveUsdc * (Math.sqrt(1 + DEPTH_BAND) - 1);
  const down = reserveUsdc * (1 - Math.sqrt(1 - DEPTH_BAND));
  return { spot: reserveUsdc / reserveAsset, depth_usd: Math.min(up, down) };
}

/** The last price the asset actually traded at, and how far it fell. */
export interface TradeQuote {
  last: number;
  trades: number;
  max_drawdown_pct: number;
}

export interface MarketSample {
  timestamp: string;
  anchor_id: string;
  code: string;
  issuer: string;
  anchor_asset: string;
  price_usd?: number;
  /** Distance from the reference rate, unsigned, in basis points. */
  dev_bps?: number;
  /** The same distance, signed: negative means the asset trades below the
   * peg it declares, which is the direction a holder cannot escape. */
  dev_bps_signed?: number;
  /** Worst peak-to-trough fall in the trade window, percent. */
  drawdown_pct?: number;
  reference?: { source: string; date: string; rate: number };
  sources?: { order_book?: OrderBookQuote; amm?: AmmQuote; trades?: TradeQuote };
  reason?: 'no_fx_rate' | 'no_liquidity';
}

/** A traded price counts when anyone actually traded. Depth thresholds
 * belong to resting orders, which can be withdrawn; a settled trade cannot. */
export const MIN_TRADES = 1;

/**
 * One sample from whatever quotes qualify: the order book when it is tight
 * and deep enough, the AMM pool when it holds enough, and the last traded
 * price whenever the asset traded at all. The price is the mean of those.
 *
 * A traded price is what rescues the thin markets. The book-and-pool rule
 * alone rejected every issued fiat asset we track, including ones trading
 * twenty to ninety times a day.
 */
export function sample(
  base: Pick<MarketSample, 'timestamp' | 'anchor_id' | 'code' | 'issuer' | 'anchor_asset'>,
  book: OrderBookQuote | null,
  amm: AmmQuote | null,
  reference: { rate: number; source: string; date: string } | undefined,
  trades?: TradeQuote | null,
): MarketSample {
  const sources = {
    ...(book ? { order_book: book } : {}),
    ...(amm ? { amm } : {}),
    ...(trades ? { trades } : {}),
  };
  if (!reference) return { ...base, sources, reason: 'no_fx_rate' };
  const prices: number[] = [];
  if (book && book.spread < MAX_SPREAD && book.depth_usd >= MIN_DEPTH_USD) prices.push(book.mid);
  if (amm && amm.depth_usd >= MIN_DEPTH_USD) prices.push(amm.spot);
  if (trades && trades.trades >= MIN_TRADES && trades.last > 0) prices.push(trades.last);
  if (prices.length === 0) return { ...base, sources, reference, reason: 'no_liquidity' };
  const price = prices.reduce((a, b) => a + b, 0) / prices.length;
  const signed = (price / reference.rate - 1) * 10000;
  return {
    ...base,
    price_usd: Number(price.toPrecision(10)),
    dev_bps: Number(Math.abs(signed).toFixed(2)),
    dev_bps_signed: Number(signed.toFixed(2)),
    ...(trades ? { drawdown_pct: trades.max_drawdown_pct } : {}),
    reference,
    sources,
  };
}

const assetParams = (prefix: string, a: { code: string; issuer: string }) =>
  `${prefix}_asset_type=${a.code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12'}` +
  `&${prefix}_asset_code=${a.code}&${prefix}_asset_issuer=${a.issuer}`;

/** Reads the order book and the AMM pool of asset/USDC from Horizon. */
export async function fetchQuotes(
  fetchImpl: typeof fetch,
  horizonUrl: string,
  asset: { code: string; issuer: string },
  timeoutMs: number,
): Promise<{ book: OrderBookQuote | null; amm: AmmQuote | null }> {
  const get = async (url: string) => {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.json();
  };
  const ob = (await get(
    `${horizonUrl}/order_book?${assetParams('selling', asset)}&${assetParams('buying', USDC)}&limit=200`,
  )) as { bids: { price: string; amount: string }[]; asks: { price: string; amount: string }[] };
  const level = (l: { price: string; amount: string }) => ({ price: Number(l.price), amount: Number(l.amount) });
  const book = quoteOrderBook(ob.bids.map(level), ob.asks.map(level));

  const pools = (await get(
    `${horizonUrl}/liquidity_pools?reserves=${asset.code}:${asset.issuer},${USDC.code}:${USDC.issuer}`,
  )) as { _embedded?: { records?: { reserves: { asset: string; amount: string }[] }[] } };
  const pool = pools._embedded?.records?.[0];
  let amm: AmmQuote | null = null;
  if (pool) {
    const reserve = (id: string) => Number(pool.reserves.find((r) => r.asset === id)?.amount ?? 0);
    amm = quoteAmm(reserve(`${asset.code}:${asset.issuer}`), reserve(`${USDC.code}:${USDC.issuer}`));
  }
  return { book, amm };
}

export function appendSamples(dir: string, samples: MarketSample[]): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const s of samples) fs.appendFileSync(path.join(dir, `market-${s.timestamp.slice(0, 10)}.jsonl`), `${JSON.stringify(s)}\n`);
}
