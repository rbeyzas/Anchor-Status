import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { issuedAssets } from './chain.js';
import { bucketize, classify, updateFlows, type FlowsFile, type ScanIssuer } from './flows.js';
import { loadFxTable, usdPerUnit, type FxSource, type FxTable } from './fx.js';
import { quoteAmm, quoteOrderBook, sample, USDC } from './market.js';
import type { PaymentRecord } from './types.js';

const ISSUER = 'GISSUER';
const ARST = { code: 'ARST', issuer: ISSUER };
const pay = (createdAt: string, extra: Partial<PaymentRecord>): PaymentRecord => ({
  createdAt,
  assetCode: 'ARST',
  assetIssuer: ISSUER,
  amount: 100,
  ...extra,
});

describe('classify', () => {
  it('reads a payment of the asset from its issuer as a mint, and to it as a burn', () => {
    expect(classify(pay('2026-09-19T01:00:00Z', { from: ISSUER, to: 'GUSER' }), ARST)).toBe('mint');
    expect(classify(pay('2026-09-19T01:00:00Z', { from: 'GUSER', to: ISSUER }), ARST)).toBe('burn');
  });

  it('ignores other assets, and the same code from another issuer', () => {
    expect(classify(pay('2026-09-19T01:00:00Z', { from: ISSUER, to: 'GUSER', assetCode: 'XLM', assetIssuer: undefined }), ARST)).toBeNull();
    expect(classify(pay('2026-09-19T01:00:00Z', { from: 'GUSER', to: ISSUER, assetIssuer: 'GFAKE' }), ARST)).toBeNull();
    expect(classify(pay('2026-09-19T01:00:00Z', { from: 'GA', to: 'GB' }), ARST)).toBeNull();
  });

  it('counts a path payment that spends the issued asset from the issuer as a mint', () => {
    const p = pay('2026-09-19T01:00:00Z', { from: ISSUER, to: 'GUSER', assetCode: 'USDC', assetIssuer: 'GC', sourceAssetCode: 'ARST', sourceAssetIssuer: ISSUER, sourceAmount: 50 });
    expect(classify(p, ARST)).toBe('mint');
  });
});

describe('bucketize', () => {
  it('fills every day in range, zero days included', () => {
    const days = bucketize([pay('2026-09-18T10:00:00Z', { from: ISSUER, to: 'GU' })], ARST, '2026-09-17', '2026-09-19', { truncated: false });
    expect(Object.keys(days)).toEqual(['2026-09-17', '2026-09-18', '2026-09-19']);
    expect(days['2026-09-18']).toEqual({ mint_amount: 100, mint_count: 1, burn_amount: 0, burn_count: 0 });
    expect(days['2026-09-17'].mint_count).toBe(0);
  });

  it('marks the days a truncated scan did not fully reach', () => {
    const days = bucketize([], ARST, '2026-09-15', '2026-09-19', { truncated: true, oldestScannedAt: '2026-09-17T08:00:00Z' });
    expect(Object.entries(days).filter(([, d]) => d.truncated).map(([k]) => k)).toEqual(['2026-09-15', '2026-09-16', '2026-09-17']);
  });
});

describe('updateFlows', () => {
  const now = Date.parse('2026-09-19T12:00:00Z');
  const history: PaymentRecord[] = [
    pay('2026-09-10T10:00:00Z', { from: ISSUER, to: 'GU' }),
    pay('2026-09-18T10:00:00Z', { from: ISSUER, to: 'GU' }),
    pay('2026-09-19T09:00:00Z', { from: 'GU', to: ISSUER }),
  ];
  /** A fake Horizon: everything since the cutoff, and the cutoffs asked for. */
  const horizon = (records: PaymentRecord[]) => {
    const cutoffs: string[] = [];
    const scan: ScanIssuer = async (_issuer, cutoff) => {
      cutoffs.push(cutoff.toISOString().slice(0, 10));
      return { records: records.filter((r) => Date.parse(r.createdAt) >= cutoff.getTime()), truncated: false };
    };
    return { scan, cutoffs };
  };
  const empty = (): FlowsFile => ({ updated_at: '', assets: {} });

  it('backfills 30 days the first time', async () => {
    const file = empty();
    const { scan, cutoffs } = horizon(history);
    await updateFlows(file, [{ anchor_id: 'a', ...ARST }], now, scan, 5);
    expect(cutoffs).toEqual(['2026-08-20']);
    const f = file.assets['ARST:GISSUER'];
    expect(f.covered_from).toBe('2026-08-20');
    expect(Object.values(f.days).reduce((s, d) => s + d.mint_count, 0)).toBe(2);
    expect(f.days['2026-09-19'].burn_count).toBe(1);
  });

  it('then recomputes only from its last update, without counting anything twice', async () => {
    const file = empty();
    await updateFlows(file, [{ anchor_id: 'a', ...ARST }], now, horizon(history).scan, 5);
    const later = now + 60 * 60 * 1000;
    const { scan, cutoffs } = horizon([...history, pay('2026-09-19T12:30:00Z', { from: ISSUER, to: 'GU' })]);
    await updateFlows(file, [{ anchor_id: 'a', ...ARST }], later, scan, 5);
    expect(cutoffs).toEqual(['2026-09-19']);
    const f = file.assets['ARST:GISSUER'];
    expect(f.days['2026-09-19']).toMatchObject({ mint_count: 1, burn_count: 1 });
    expect(Object.values(f.days).reduce((s, d) => s + d.mint_count, 0)).toBe(3);
  });

  it('closes the gap after missed runs', async () => {
    const file = empty();
    await updateFlows(file, [{ anchor_id: 'a', ...ARST }], Date.parse('2026-09-15T12:00:00Z'), horizon(history).scan, 5);
    const { scan, cutoffs } = horizon(history);
    await updateFlows(file, [{ anchor_id: 'a', ...ARST }], now, scan, 5);
    expect(cutoffs).toEqual(['2026-09-15']);
    expect(file.assets['ARST:GISSUER'].days['2026-09-18'].mint_count).toBe(1);
  });

  it('reads an issuer once for all of its assets', async () => {
    const file = empty();
    const { scan, cutoffs } = horizon(history);
    await updateFlows(file, [{ anchor_id: 'a', ...ARST }, { anchor_id: 'a', code: 'BRLT', issuer: ISSUER }], now, scan, 5);
    expect(cutoffs).toHaveLength(1);
    expect(Object.keys(file.assets)).toEqual(['ARST:GISSUER', 'BRLT:GISSUER']);
  });

  it('backfills at most the configured number of new issuers per run', async () => {
    const file = empty();
    const assets = ['G1', 'G2', 'G3'].map((issuer) => ({ anchor_id: 'a', code: 'X', issuer }));
    const result = await updateFlows(file, assets, now, horizon([]).scan, 2);
    expect(result).toEqual({ scanned: 2, waiting: 1, failures: [] });
    expect(Object.keys(file.assets)).toHaveLength(2);
  });

  it('keeps going when one issuer cannot be read, and reports it', async () => {
    const file = empty();
    const assets = ['G1', 'G2', 'G3'].map((issuer) => ({ anchor_id: 'a', code: 'ARST', issuer }));
    const scan: ScanIssuer = async (issuer) => {
      if (issuer === 'G2') throw new Error('Service Unavailable');
      return { records: [], truncated: false };
    };
    const result = await updateFlows(file, assets, now, scan, 5);
    expect(result.scanned).toBe(2);
    expect(result.failures).toEqual([{ issuer: 'G2', message: 'Service Unavailable' }]);
    // The two readable issuers are still written; the third is simply absent.
    expect(Object.keys(file.assets).sort()).toEqual(['ARST:G1', 'ARST:G3']);
  });

  it('leaves an unreadable issuer exactly where it was, so the next run redoes it', async () => {
    const file = empty();
    const asset = { anchor_id: 'a', ...ARST };
    await updateFlows(file, [asset], Date.parse('2026-09-17T12:00:00Z'), horizon(history).scan, 5);
    const before = structuredClone(file.assets[`ARST:${ISSUER}`]);
    const failing: ScanIssuer = async () => {
      throw new Error('Not Found');
    };
    await updateFlows(file, [asset], now, failing, 5);
    expect(file.assets[`ARST:${ISSUER}`]).toEqual(before);
  });

  it('does not spend a backfill slot on an issuer it could not read', async () => {
    const file = empty();
    const assets = ['G1', 'G2'].map((issuer) => ({ anchor_id: 'a', code: 'ARST', issuer }));
    const scan: ScanIssuer = async (issuer) => {
      if (issuer === 'G1') throw new Error('Not Found');
      return { records: [], truncated: false };
    };
    // One slot: the failed issuer must not consume it and starve G2.
    const result = await updateFlows(file, assets, now, scan, 1);
    expect(result.scanned).toBe(1);
    expect(Object.keys(file.assets)).toEqual(['ARST:G2']);
  });

  it('moves complete coverage past a truncated backfill', async () => {
    const file = empty();
    const scan: ScanIssuer = async () => ({ records: [], truncated: true, oldestScannedAt: '2026-09-12T05:00:00Z' });
    await updateFlows(file, [{ anchor_id: 'a', ...ARST }], now, scan, 5);
    const f = file.assets['ARST:GISSUER'];
    expect(f.covered_from).toBe('2026-09-13');
    expect(f.days['2026-09-12'].truncated).toBe(true);
    expect(f.days['2026-09-13'].truncated).toBeUndefined();
  });
});

describe('fx', () => {
  const table: FxTable = { source: 's', date: '2026-09-19', fetched_at: '2026-09-19T00:00:00Z', per_usd: { ARS: 1500, EUR: 0.87 } };

  it('converts units per USD into USD per unit', () => {
    expect(usdPerUnit(table, 'ars')?.rate).toBeCloseTo(1 / 1500);
    expect(usdPerUnit(table, 'USD')?.rate).toBe(1);
  });

  it('has no rate for an unknown currency or without a table, rather than a guess', () => {
    expect(usdPerUnit(table, 'KESC')).toBeUndefined();
    expect(usdPerUnit(null, 'ARS')).toBeUndefined();
  });

  it('falls back to the second source, and caches for a day', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-'));
    const cache = path.join(dir, 'fx.json');
    let calls = 0;
    const down: FxSource = { name: 'down', fetch: async () => { calls++; throw new Error('503'); } };
    const up: FxSource = { name: 'up', fetch: async () => { calls++; return { ...table, source: 'up', fetched_at: new Date(Date.parse('2026-09-19T01:00:00Z')).toISOString() }; } };
    const now = Date.parse('2026-09-19T02:00:00Z');
    expect((await loadFxTable(cache, now, [down, up]))?.source).toBe('up');
    expect((await loadFxTable(cache, now + 60_000, [down, up]))?.source).toBe('up');
    expect(calls).toBe(2);
  });

  it('gives up on a cache older than two days when every source is down', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-'));
    const cache = path.join(dir, 'fx.json');
    fs.writeFileSync(cache, JSON.stringify(table));
    const down: FxSource = { name: 'down', fetch: async () => { throw new Error('503'); } };
    expect(await loadFxTable(cache, Date.parse('2026-09-20T12:00:00Z'), [down])).not.toBeNull();
    expect(await loadFxTable(cache, Date.parse('2026-09-22T12:00:00Z'), [down])).toBeNull();
  });
});

describe('market samples', () => {
  const base = { timestamp: '2026-09-19T12:00:00Z', anchor_id: 'a', code: 'ARST', issuer: ISSUER, anchor_asset: 'ARS' };
  const reference = { rate: 1 / 1500, source: 's', date: '2026-09-19' };
  // Mid 1/1500 USDC per ARST, 0.2% spread, deep on both sides.
  const deepBook = quoteOrderBook(
    [{ price: 0.000666, amount: 2000 }],
    [{ price: 0.0006673, amount: 3_000_000 }],
  );

  it('measures the order book: mid, spread, and the weaker side\'s depth in USD', () => {
    expect(deepBook!.spread).toBeCloseTo(0.00195, 4);
    expect(deepBook!.depth_usd).toBeCloseTo(2000, 0);
    expect(quoteOrderBook([], [{ price: 1, amount: 1 }])).toBeNull();
  });

  it('measures a constant-product pool\'s depth for a 1% move', () => {
    const q = quoteAmm(150_000_000, 100_000)!;
    expect(q.spot).toBeCloseTo(1 / 1500);
    expect(q.depth_usd).toBeCloseTo(100_000 * (Math.sqrt(1.01) - 1), 2);
  });

  it('samples from the order book alone', () => {
    const s = sample(base, deepBook, null, reference);
    expect(s.dev_bps).toBeCloseTo(0.25, 1);
    expect(s.reason).toBeUndefined();
  });

  it('samples from the pool alone', () => {
    // 300M ARST against 200k USDC: exactly 1/1500, and ~$1k deep for a 1% move.
    const s = sample(base, null, quoteAmm(300_000_000, 200_000), reference);
    expect(s.dev_bps).toBe(0);
  });

  it('averages both when both qualify', () => {
    const s = sample(base, deepBook, quoteAmm(150_000_000, 204_000), reference);
    expect(s.price_usd).toBeCloseTo((deepBook!.mid + 204_000 / 150_000_000) / 2, 10);
  });

  it('records a thin or wide market as an attempt without a price', () => {
    const thinBook = quoteOrderBook([{ price: 0.000666, amount: 100 }], [{ price: 0.0006673, amount: 3_000_000 }]);
    const wideBook = quoteOrderBook([{ price: 0.0006, amount: 1e9 }], [{ price: 0.0007, amount: 1e9 }]);
    const shallowPool = quoteAmm(1_500_000, 1_000);
    expect(sample(base, thinBook, shallowPool, reference)).toMatchObject({ reason: 'no_liquidity' });
    expect(sample(base, wideBook, null, reference)).toMatchObject({ reason: 'no_liquidity' });
    expect(sample(base, thinBook, null, reference).dev_bps).toBeUndefined();
  });

  it('records a missing reference rate as such, never as a deviation', () => {
    expect(sample(base, deepBook, null, undefined)).toMatchObject({ reason: 'no_fx_rate' });
  });
});

describe('issuedAssets', () => {
  it('keeps only assets the anchor issues itself, and never the USD numeraire', () => {
    const { issued, fiat } = issuedAssets({
      anchors: {
        a: {
          assets: [
            { code: 'ARST', issuer: 'GA', anchor_asset_type: 'fiat', anchor_asset: 'ARS', issuer_home_domain_matches: true },
            { code: 'BTC', issuer: 'GB', anchor_asset_type: 'crypto', issuer_home_domain_matches: true },
            { code: 'USDC', issuer: 'GC', anchor_asset_type: 'fiat', anchor_asset: 'USD', issuer_home_domain_matches: false },
            { code: USDC.code, issuer: USDC.issuer, issuer_home_domain_matches: true },
          ],
        },
      },
    });
    expect(issued.map((a) => a.code)).toEqual(['ARST', 'BTC']);
    expect(fiat).toEqual([{ anchor_id: 'a', code: 'ARST', issuer: 'GA', anchor_asset: 'ARS' }]);
  });
});
