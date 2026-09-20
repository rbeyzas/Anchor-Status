import { describe, expect, it, vi } from 'vitest';
import { ReferenceRates } from './reference.js';
import type { Reflector } from './reflector.js';
import type { FxTable } from './fx.js';

const TABLE: FxTable = {
  source: 'currency-api',
  date: '2026-09-19',
  fetched_at: '2026-09-19T00:00:00.000Z',
  per_usd: { CLP: 959.3626, GHS: 12.5 },
};

const reflectorWith = (rates: Record<string, number>, fail = false) =>
  ({
    usdPerUnit: vi.fn(async (code: string) => {
      if (fail) throw new Error('rpc down');
      const price = rates[code.toUpperCase()];
      return price === undefined ? null : { price, at: '2026-09-20T08:50:00.000Z', feed: 'CBKG…' };
    }),
  }) as unknown as Reflector;

describe('ReferenceRates', () => {
  it('prefers Reflector, and says so in the source', async () => {
    const r = new ReferenceRates(TABLE, reflectorWith({ CLP: 0.00104148 }));
    const ref = await r.forCurrency('CLP');
    expect(ref).toMatchObject({ rate: 0.00104148, source: 'reflector:CBKG…', date: '2026-09-20T08:50:00.000Z' });
  });

  it('falls back to the currency table for a currency Reflector does not carry', async () => {
    const r = new ReferenceRates(TABLE, reflectorWith({ CLP: 0.001 }));
    const ref = await r.forCurrency('GHS');
    expect(ref).toMatchObject({ source: 'currency-api', date: '2026-09-19' });
    expect(ref?.rate).toBeCloseTo(1 / 12.5, 10);
  });

  it('falls back for every currency once Reflector fails, and complains only once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reflector = reflectorWith({}, true);
    const r = new ReferenceRates(TABLE, reflector);
    expect((await r.forCurrency('CLP'))?.source).toBe('currency-api');
    expect((await r.forCurrency('GHS'))?.source).toBe('currency-api');
    expect(reflector.usdPerUnit).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('asks once per currency, however many anchors peg to it', async () => {
    // Several anchors share a peg and the feed only moves every five minutes.
    const reflector = reflectorWith({ CLP: 0.00104148 });
    const r = new ReferenceRates(TABLE, reflector);
    await r.forCurrency('CLP');
    await r.forCurrency('clp');
    await r.forCurrency(' CLP ');
    expect(reflector.usdPerUnit).toHaveBeenCalledTimes(1);
  });

  it('works with no Reflector at all', async () => {
    const r = new ReferenceRates(TABLE);
    expect((await r.forCurrency('CLP'))?.source).toBe('currency-api');
  });

  it('reports a currency neither source covers as missing, not as a rate', async () => {
    const r = new ReferenceRates(TABLE, reflectorWith({}));
    expect(await r.forCurrency('XYZ')).toBeUndefined();
    expect(r.summary()).toEqual({ reflector: 0, table: 0, missing: 1 });
  });

  it('summarises what the round leaned on', async () => {
    const r = new ReferenceRates(TABLE, reflectorWith({ CLP: 0.001 }));
    await r.forCurrency('CLP');
    await r.forCurrency('GHS');
    await r.forCurrency('XYZ');
    expect(r.summary()).toEqual({ reflector: 1, table: 1, missing: 1 });
  });
});
