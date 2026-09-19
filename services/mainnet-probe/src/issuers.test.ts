import { describe, expect, it } from 'vitest';
import { lookupIssuer, verifyAssets, type IssuerCache, type IssuerRecord } from './issuers.js';
import type { Fetch } from './http.js';

const now = new Date('2026-09-19T12:00:00Z');
const record = (home_domain?: string, checked_at = now.toISOString()): IssuerRecord => ({
  checked_at,
  exists: true,
  ...(home_domain ? { home_domain } : {}),
  created_at: '2021-03-01T00:00:00Z',
});

describe('verifyAssets', () => {
  it('matches an issuer whose home_domain is the anchor, case-insensitively', async () => {
    const [a] = await verifyAssets([{ code: 'ARST', issuer: 'GA' }], 'anclap.com', {}, now, async () => record('Anclap.com'));
    expect(a).toMatchObject({ code: 'ARST', issuer_home_domain_matches: true, issuer_created_at: '2021-03-01T00:00:00Z' });
  });

  it('does not match a third party asset the anchor only distributes, but finds it listed by its issuer', async () => {
    const [a] = await verifyAssets([{ code: 'USDC', issuer: 'GC' }], 'moneygram.com', {}, now, async () => record('centre.io'), async () => ({
      checked_at: now.toISOString(),
      reachable: true,
      assets: ['USDC:GC'],
    }));
    expect(a).toMatchObject({ issuer_home_domain_matches: false, issuer_listed_by_home_domain: true });
  });

  it('flags a listed asset whose issuer does not vouch for it', async () => {
    const [a] = await verifyAssets([{ code: 'USDC', issuer: 'GFAKE' }], 'a.example', {}, now, async () => record('centre.io'), async () => ({
      checked_at: now.toISOString(),
      reachable: true,
      assets: ['USDC:GC'],
    }));
    expect(a).toMatchObject({ issuer_home_domain_matches: false, issuer_listed_by_home_domain: false });
    const [b] = await verifyAssets([{ code: 'X', issuer: 'GNOHOME' }], 'a.example', {}, now, async () => record(undefined));
    expect(b).toMatchObject({ issuer_home_domain_matches: false, issuer_listed_by_home_domain: false });
  });

  it('leaves the verdict open when the issuer\'s own toml cannot be read', async () => {
    // Circle's USDC issuer names circle.com, which serves no stellar.toml.
    const [a] = await verifyAssets([{ code: 'USDC', issuer: 'GC' }], 'moneygram.com', {}, now, async () => record('circle.com'), async () => ({
      checked_at: now.toISOString(),
      reachable: false,
      assets: [],
    }));
    expect(a.issuer_home_domain_matches).toBe(false);
    expect(a.issuer_listed_by_home_domain).toBeUndefined();
  });

  it('reads another domain\'s toml once a day', async () => {
    const cache: IssuerCache = {};
    let reads = 0;
    const listDomain = async () => {
      reads++;
      return { checked_at: now.toISOString(), reachable: true, assets: ['USDC:GC'] };
    };
    await verifyAssets([{ code: 'USDC', issuer: 'GC' }], 'x.example', cache, now, async () => record('centre.io'), listDomain);
    await verifyAssets([{ code: 'USDC', issuer: 'GC' }], 'y.example', cache, now, async () => record('centre.io'), listDomain);
    expect(reads).toBe(1);
  });

  it('does not match an issuer that no longer exists', async () => {
    const [a] = await verifyAssets([{ code: 'X', issuer: 'GD' }], 'a.example', {}, now, async () => ({
      checked_at: now.toISOString(),
      exists: false,
    }));
    expect(a.issuer_home_domain_matches).toBe(false);
  });

  it('leaves the check out for an asset listed without an issuer', async () => {
    const [a] = await verifyAssets([{ code: 'BTC' }], 'a.example', {}, now, async () => {
      throw new Error('must not be called');
    });
    expect(a).toEqual({ code: 'BTC' });
  });

  it('uses a cache entry younger than a day without calling Horizon', async () => {
    const cache: IssuerCache = { GA: record('a.example', '2026-09-19T01:00:00Z') };
    let calls = 0;
    const [a] = await verifyAssets([{ code: 'A', issuer: 'GA' }], 'a.example', cache, now, async () => {
      calls++;
      return record('other.example');
    });
    expect(calls).toBe(0);
    expect(a.issuer_home_domain_matches).toBe(true);
  });

  it('refreshes a cache entry older than a day', async () => {
    const cache: IssuerCache = { GA: record('a.example', '2026-09-18T11:00:00Z') };
    const [a] = await verifyAssets([{ code: 'A', issuer: 'GA' }], 'a.example', cache, now, async () => record('other.example'));
    expect(a.issuer_home_domain_matches).toBe(false);
    expect(cache.GA.home_domain).toBe('other.example');
  });

  it('keeps the old answer when Horizon cannot be read, rather than guessing', async () => {
    const cache: IssuerCache = { GA: record('a.example', '2026-09-10T00:00:00Z') };
    const [a] = await verifyAssets([{ code: 'A', issuer: 'GA' }], 'a.example', cache, now, async () => {
      throw new Error('503');
    });
    expect(a.issuer_home_domain_matches).toBe(true);
    const [b] = await verifyAssets([{ code: 'B', issuer: 'GB' }], 'a.example', {}, now, async () => {
      throw new Error('503');
    });
    expect(b.issuer_home_domain_matches).toBeUndefined();
  });
});

describe('lookupIssuer', () => {
  const horizon = (routes: Record<string, () => Response>): Fetch =>
    (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return routes[url.pathname]?.() ?? new Response('', { status: 404 });
    }) as Fetch;

  it('reads home_domain from Horizon and the creation time from StellarExpert', async () => {
    const r = await lookupIssuer(
      horizon({
        '/accounts/GA': () => Response.json({ home_domain: 'a.example' }),
        '/account/GA': () => Response.json({ created: 1611089138 }),
      }),
      'https://horizon.example',
      'GA',
      now,
      1000,
      'https://expert.example',
    );
    expect(r).toEqual({ checked_at: now.toISOString(), exists: true, home_domain: 'a.example', created_at: '2021-01-19T20:45:38.000Z' });
  });

  it('leaves the creation time out when StellarExpert does not know it', async () => {
    const r = await lookupIssuer(horizon({ '/accounts/GA': () => Response.json({}) }), 'https://horizon.example', 'GA', now, 1000, 'https://expert.example');
    expect(r).toEqual({ checked_at: now.toISOString(), exists: true });
  });

  it('reports a missing account as not existing', async () => {
    const r = await lookupIssuer(horizon({}), 'https://horizon.example', 'GZ', now, 1000);
    expect(r).toEqual({ checked_at: now.toISOString(), exists: false });
  });

  it('throws on a Horizon error instead of calling the account missing', async () => {
    await expect(
      lookupIssuer(horizon({ '/accounts/GA': () => new Response('', { status: 503 }) }), 'https://horizon.example', 'GA', now, 1000),
    ).rejects.toThrow('503');
  });
});
