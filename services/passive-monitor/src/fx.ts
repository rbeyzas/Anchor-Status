// Reference rates for the Market pillar: what one unit of a fiat currency
// is worth in USD, from a free daily source. No rate means the peg cannot be
// judged, and Market is n/a: a rate is never guessed.
import fs from 'node:fs';
import path from 'node:path';

export interface FxTable {
  source: string;
  /** The day the source says its rates are for. */
  date: string;
  fetched_at: string;
  /** Units of each currency per 1 USD, keyed by upper-case ISO 4217 code. */
  per_usd: Record<string, number>;
}

export interface FxSource {
  name: string;
  fetch: (fetchImpl: typeof fetch, timeoutMs: number) => Promise<FxTable>;
}

const upper = (rates: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(rates).flatMap(([k, v]) => (typeof v === 'number' && v > 0 ? [[k.toUpperCase(), v]] : [])),
  );

/** fawazahmed0/exchange-api: no key, no rate limit, ~300 currencies, daily.
 * Primary because its terms let us republish the rate in an inputs bundle. */
export const CURRENCY_API: FxSource = {
  name: 'fawazahmed0/currency-api',
  async fetch(fetchImpl, timeoutMs) {
    const res = await fetchImpl('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { date?: string; usd?: Record<string, unknown> };
    if (!body.usd || !body.date) throw new Error('unexpected response shape');
    return { source: this.name, date: body.date, fetched_at: new Date().toISOString(), per_usd: upper(body.usd) };
  },
};

/** ExchangeRate-API's open endpoint: no key, ~160 currencies, daily, asks
 * for one request a day at most and for attribution. The fallback. */
export const EXCHANGERATE_API: FxSource = {
  name: 'open.er-api.com (Rates By Exchange Rate API)',
  async fetch(fetchImpl, timeoutMs) {
    const res = await fetchImpl('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { result?: string; time_last_update_unix?: number; rates?: Record<string, unknown> };
    if (body.result !== 'success' || !body.rates || !body.time_last_update_unix) throw new Error('unexpected response shape');
    return {
      source: this.name,
      date: new Date(body.time_last_update_unix * 1000).toISOString().slice(0, 10),
      fetched_at: new Date().toISOString(),
      per_usd: upper(body.rates),
    };
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's table, from the cache when it is under a day old, else from the
 * first source that answers. Null when none does and the cache is older
 * than two days: a stale rate would judge today's market by last week's. */
export async function loadFxTable(
  cachePath: string,
  now: number,
  sources: FxSource[] = [CURRENCY_API, EXCHANGERATE_API],
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 20_000,
): Promise<FxTable | null> {
  const cached = fs.existsSync(cachePath) ? (JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as FxTable) : null;
  if (cached && now - Date.parse(cached.fetched_at) < DAY_MS) return cached;
  for (const source of sources) {
    try {
      const table = await source.fetch(fetchImpl, timeoutMs);
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(table));
      return table;
    } catch (err) {
      console.warn(`[passive-monitor] FX source ${source.name} failed: ${(err as Error).message}`);
    }
  }
  return cached && now - Date.parse(cached.fetched_at) < 2 * DAY_MS ? cached : null;
}

/** USD value of one unit of `currency`, or undefined when unknown. */
export function usdPerUnit(table: FxTable | null, currency: string): { rate: number; source: string; date: string } | undefined {
  if (!table) return undefined;
  const code = currency.trim().toUpperCase();
  if (code === 'USD') return { rate: 1, source: table.source, date: table.date };
  const perUsd = table.per_usd[code];
  return perUsd ? { rate: 1 / perUsd, source: table.source, date: table.date } : undefined;
}
