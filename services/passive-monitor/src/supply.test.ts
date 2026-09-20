import { describe, expect, it } from 'vitest';
import { sampleSupply, totalSupply } from './supply.js';

const ASSET = { anchor_id: 'a', code: 'CLPX', issuer: 'GISSUER' };

/** A record shaped like Horizon's, with only the fields supply reads. */
const record = (over: Record<string, unknown> = {}) => ({
  balances: { authorized: '100.0000000', authorized_to_maintain_liabilities: '0.0000000' },
  claimable_balances_amount: '1.0000000',
  liquidity_pools_amount: '2.0000000',
  contracts_amount: '3.0000000',
  accounts: { authorized: 42 },
  ...over,
});

const horizon = (body: unknown, ok = true) =>
  (async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch;

describe('totalSupply', () => {
  it('adds every bucket a unit can sit in', () => {
    expect(totalSupply(record())).toEqual({
      supply: 106,
      parts: { trustlines: 100, claimable: 1, liquidity_pools: 2, contracts: 3 },
      holders: 42,
    });
  });

  it('counts Stellar Asset Contract balances, which the payment scan cannot see', () => {
    // An issuer whose asset only moves through Soroban has no issuer
    // payments at all; without this term its supply would read as zero.
    const sac = totalSupply(record({ balances: { authorized: '0' }, claimable_balances_amount: '0', liquidity_pools_amount: '0', contracts_amount: '5000.5' }));
    expect(sac.supply).toBe(5000.5);
    expect(sac.parts.contracts).toBe(5000.5);
  });

  it('keeps seven decimals, so float addition cannot invent a change', () => {
    const r = totalSupply(record({
      balances: { authorized: '0.1000000' },
      claimable_balances_amount: '0.2000000',
      liquidity_pools_amount: '0',
      contracts_amount: '0',
    }));
    expect(r.supply).toBe(0.3);
  });

  it('treats missing fields as zero rather than NaN', () => {
    expect(totalSupply({}).supply).toBe(0);
    expect(totalSupply({ contracts_amount: 'not a number' }).supply).toBe(0);
  });
});

describe('sampleSupply', () => {
  const at = new Date('2026-09-20T10:00:00.000Z');

  it('reads the asset and stamps it', async () => {
    const s = await sampleSupply(horizon({ _embedded: { records: [record()] } }), 'https://h', ASSET, 100, at);
    expect(s).toMatchObject({ anchor_id: 'a', code: 'CLPX', issuer: 'GISSUER', supply: 106, holders: 42 });
    expect(s.timestamp).toBe('2026-09-20T10:00:00.000Z');
    expect(s.reason).toBeUndefined();
  });

  it('marks an asset Horizon does not know, rather than calling it zero', async () => {
    // "Never heard of it" and "nobody holds any" are different claims, and
    // only the second one is about the anchor.
    const s = await sampleSupply(horizon({ _embedded: { records: [] } }), 'https://h', ASSET, 100, at);
    expect(s.reason).toBe('not_found');
    expect(s.supply).toBe(0);
  });

  it('throws on a Horizon error so the round records nothing rather than a wrong zero', async () => {
    await expect(sampleSupply(horizon({}, false), 'https://h', ASSET, 100, at)).rejects.toThrow('HTTP 500');
  });
});
