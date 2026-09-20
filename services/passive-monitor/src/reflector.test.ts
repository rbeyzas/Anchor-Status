import { describe, expect, it } from 'vitest';
import { FEEDS, Reflector, contractAsset, toMillis, type Invoke } from './reflector.js';

/** A feed that answers from a table, so the whole client but the network
 * can be exercised. */
function feed(prices: Record<string, { price: bigint; timestamp: number } | null>, decimals = 14): { r: Reflector; calls: string[] } {
  const calls: string[] = [];
  const invoke: Invoke = async (contractId, fn) => {
    calls.push(`${contractId.slice(0, 4)}:${fn}`);
    if (fn === 'decimals') return decimals;
    if (fn === 'lastprice') {
      // The asset is in the args; the table is keyed by call order instead,
      // which is enough for what these tests assert.
      const key = Object.keys(prices)[calls.filter((c) => c.endsWith('lastprice')).length - 1];
      return prices[key] ?? null;
    }
    return null;
  };
  return { r: new Reflector({ invoke }), calls };
}

describe('toMillis', () => {
  it('reads seconds as seconds and milliseconds as milliseconds', () => {
    // SEP-40 says milliseconds; Reflector answers in seconds. Both land on
    // the same instant rather than on 1970.
    expect(toMillis(1_790_000_000)).toBe(1_790_000_000_000);
    expect(toMillis(1_790_000_000_000)).toBe(1_790_000_000_000);
    expect(new Date(toMillis(1_758_358_200)).getUTCFullYear()).toBe(2025);
  });
});

describe('Reflector', () => {
  it('scales a price by the feed’s decimals', async () => {
    const { r } = feed({ clp: { price: 104_148_678_966n, timestamp: 1_790_000_000 } });
    const p = await r.usdPerUnit('CLP');
    expect(p?.price).toBeCloseTo(0.00104148678966, 12);
    expect(p?.at).toBe(new Date(1_790_000_000_000).toISOString());
  });

  it('returns null for a currency the feed does not carry', async () => {
    // Coverage is a fact, not an error: the caller falls back to the HTTP
    // table rather than losing the sample.
    const { r } = feed({ ghs: null });
    expect(await r.usdPerUnit('GHS')).toBeNull();
  });

  it('answers USD without asking the feed', async () => {
    const { r, calls } = feed({});
    expect(await r.usdPerUnit('USD')).toMatchObject({ price: 1, feed: 'usd' });
    expect(calls).toEqual([]);
  });

  it('asks for decimals once per feed, not once per price', async () => {
    const { r, calls } = feed({ a: { price: 1n, timestamp: 1 }, b: { price: 2n, timestamp: 2 } });
    await r.lastPrice(FEEDS.dex, contractAsset('CBDRPADR3KIBJNUBNRTTO4P7NO5RVPMYKRJB5YCZUZ6B66RKYK324UJY'));
    await r.lastPrice(FEEDS.dex, contractAsset('CBDRPADR3KIBJNUBNRTTO4P7NO5RVPMYKRJB5YCZUZ6B66RKYK324UJY'));
    expect(calls.filter((c) => c.endsWith('decimals'))).toHaveLength(1);
  });

  it('uses the fiat feed for currencies and the given feed for assets', async () => {
    const { r, calls } = feed({ x: { price: 1n, timestamp: 1 } });
    await r.usdPerUnit('TRY');
    expect(calls[0].startsWith(FEEDS.fiat.slice(0, 4))).toBe(true);
  });
});
