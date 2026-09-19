import { Keypair, Networks, WebAuth } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { firstDepositAsset, probeAnchor } from './probe.js';
import type { Fetch } from './http.js';

const anchorKey = Keypair.random();
const DOMAIN = 'anchor.example';
const toml = (extra = '') => `
WEB_AUTH_ENDPOINT = "https://${DOMAIN}/auth"
SIGNING_KEY = "${anchorKey.publicKey()}"
TRANSFER_SERVER_SEP0024 = "https://${DOMAIN}/sep24"
${extra}`;

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;

/** A fake anchor: routes by path, and issues real SEP-10 challenges. */
function fakeAnchor(overrides: Record<string, Route> = {}): Fetch {
  const routes: Record<string, Route> = {
    '/.well-known/stellar.toml': () => new Response(toml()),
    '/sep24/info': () => Response.json({ deposit: { USDC: { enabled: true } } }),
    'GET /auth': (url) =>
      Response.json({
        transaction: WebAuth.buildChallengeTx(anchorKey, url.searchParams.get('account')!, DOMAIN, 300, Networks.PUBLIC, DOMAIN),
        network_passphrase: Networks.PUBLIC,
      }),
    'POST /auth': () => Response.json({ token: 'jwt' }),
    '/sep24/transactions/deposit/interactive': () => Response.json({ url: 'https://anchor.example/kyc', id: 'tx1' }),
    ...overrides,
  };
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const route = routes[`${method} ${url.pathname}`] ?? routes[url.pathname];
    if (!route) return new Response('not found', { status: 404 });
    return route(url, init);
  }) as Fetch;
}

const probe = (fetchImpl: Fetch) =>
  probeAnchor(
    { anchor_id: 'a', domain: DOMAIN },
    {
      fetchImpl,
      requestTimeoutMs: 5000,
      networkPassphrase: Networks.PUBLIC,
      tlsCheck: async () => ({ ok: true, daysLeft: 60 }),
    },
  );

describe('probeAnchor', () => {
  it('passes every stage against a healthy anchor, without completing a deposit', async () => {
    const r = await probe(fakeAnchor());
    expect(r.success).toBe(true);
    expect(Object.keys(r.stages)).toEqual(['toml', 'info', 'challenge', 'token', 'initiate']);
  });

  it('keeps the anchor-signed SEP-10 challenge as evidence', async () => {
    const r = await probe(fakeAnchor());
    const { Transaction } = await import('@stellar/stellar-sdk');
    const tx = new Transaction(r.transcript!.sep10_challenge!.xdr, r.transcript!.sep10_challenge!.network_passphrase);
    const signed = tx.signatures.some((sig) => anchorKey.verify(tx.hash(), sig.signature));
    expect(signed).toBe(true);
    expect(r.transcript!.stellar_toml!.signing_key).toBe(anchorKey.publicKey());
    expect(r.transcript!.probe_account).toMatch(/^G/);
  });

  it('fails at toml when stellar.toml is unreachable', async () => {
    const r = await probe(fakeAnchor({ '/.well-known/stellar.toml': () => new Response('', { status: 503 }) }));
    expect(r).toMatchObject({ success: false, failed_stage: 'toml' });
  });

  it('fails at toml when the anchor stops advertising a transfer server', async () => {
    const r = await probe(fakeAnchor({ '/.well-known/stellar.toml': () => new Response(`SIGNING_KEY = "${anchorKey.publicKey()}"`) }));
    expect(r).toMatchObject({ success: false, failed_stage: 'toml' });
  });

  it('fails at info when /info returns a web page instead of JSON', async () => {
    const r = await probe(fakeAnchor({ '/sep24/info': () => new Response('<!doctype html><html></html>') }));
    expect(r).toMatchObject({ success: false, failed_stage: 'info' });
  });

  it('fails at info when /info is down', async () => {
    const r = await probe(fakeAnchor({ '/sep24/info': () => new Response('', { status: 500 }) }));
    expect(r).toMatchObject({ success: false, failed_stage: 'info' });
  });

  it('fails at challenge when it is not signed by the published SIGNING_KEY', async () => {
    const impostor = Keypair.random();
    const r = await probe(
      fakeAnchor({
        'GET /auth': (url) =>
          Response.json({
            transaction: WebAuth.buildChallengeTx(impostor, url.searchParams.get('account')!, DOMAIN, 300, Networks.PUBLIC, DOMAIN),
            network_passphrase: Networks.PUBLIC,
          }),
      }),
    );
    expect(r).toMatchObject({ success: false, failed_stage: 'challenge' });
  });

  it('treats a declined SEP-10 challenge as policy — MoneyGram requires client_domain', async () => {
    const r = await probe(
      fakeAnchor({ 'GET /auth': () => Response.json({ error: 'client_domain is required' }, { status: 400 }) }),
    );
    expect(r.success).toBe(true);
    expect(r.stages.challenge).toMatchObject({ ok: false, policy: true });
  });

  it('treats a missing SEP-10 endpoint (404) as broken, not policy', async () => {
    const r = await probe(fakeAnchor({ 'GET /auth': () => new Response('<h1>Not Found</h1>', { status: 404 }) }));
    expect(r).toMatchObject({ success: false, failed_stage: 'challenge' });
  });

  it('treats a missing deposit endpoint (404) as broken', async () => {
    const r = await probe(
      fakeAnchor({ '/sep24/transactions/deposit/interactive': () => new Response('', { status: 404 }) }),
    );
    expect(r).toMatchObject({ success: false, failed_stage: 'initiate' });
  });

  it('treats a 4xx token exchange as policy, not an outage', async () => {
    const r = await probe(fakeAnchor({ 'POST /auth': () => new Response('client_domain required', { status: 400 }) }));
    expect(r.success).toBe(true);
    expect(r.stages.token).toMatchObject({ ok: false, policy: true });
    expect(r.stages.initiate).toBeUndefined();
  });

  it('treats a 5xx token exchange as an outage', async () => {
    const r = await probe(fakeAnchor({ 'POST /auth': () => new Response('', { status: 502 }) }));
    expect(r).toMatchObject({ success: false, failed_stage: 'token' });
  });

  it('fails when SEP-24 is advertised without SEP-10', async () => {
    const r = await probe(
      fakeAnchor({ '/.well-known/stellar.toml': () => new Response(`TRANSFER_SERVER_SEP0024 = "https://${DOMAIN}/sep24"`) }),
    );
    expect(r).toMatchObject({ success: false, failed_stage: 'challenge' });
  });

  it('accepts a SEP-6-only anchor with no SEP-10 on its public surface', async () => {
    const r = await probe(
      fakeAnchor({
        '/.well-known/stellar.toml': () => new Response(`TRANSFER_SERVER = "https://${DOMAIN}/sep6"`),
        '/sep6/info': () => Response.json({ deposit: { BTC: { enabled: true } } }),
      }),
    );
    expect(r.success).toBe(true);
  });
});

describe('stages_expected', () => {
  it('is all five stages for a SEP-24 anchor with SEP-10 and a deposit asset', async () => {
    const r = await probe(fakeAnchor());
    expect(r.stages_expected).toEqual(['toml', 'info', 'challenge', 'token', 'initiate']);
  });

  it('is toml, info and the SEP-10 pair for a SEP-6-only anchor with SEP-10', async () => {
    const r = await probe(
      fakeAnchor({
        '/.well-known/stellar.toml': () =>
          new Response(`WEB_AUTH_ENDPOINT = "https://${DOMAIN}/auth"\nSIGNING_KEY = "${anchorKey.publicKey()}"\nTRANSFER_SERVER = "https://${DOMAIN}/sep6"`),
        '/sep6/info': () => Response.json({ deposit: { BTC: { enabled: true } } }),
      }),
    );
    expect(r.stages_expected).toEqual(['toml', 'info', 'challenge', 'token']);
  });

  it('is only toml and info without SEP-10', async () => {
    const r = await probe(
      fakeAnchor({
        '/.well-known/stellar.toml': () => new Response(`TRANSFER_SERVER = "https://${DOMAIN}/sep6"`),
        '/sep6/info': () => Response.json({ deposit: { BTC: { enabled: true } } }),
      }),
    );
    expect(r.stages_expected).toEqual(['toml', 'info']);
  });

  it('leaves out the deposit start when no deposit asset is enabled', async () => {
    const r = await probe(fakeAnchor({ '/sep24/info': () => Response.json({ withdraw: { USDC: { enabled: true } } }) }));
    expect(r.stages_expected).toEqual(['toml', 'info', 'challenge', 'token']);
  });
});

describe('checks', () => {
  it('records a healthy anchor as passing every check', async () => {
    const r = await probe(
      fakeAnchor({ '/.well-known/stellar.toml': () => new Response(toml(), { headers: { 'Access-Control-Allow-Origin': '*' } }) }),
    );
    expect(r.checks).toEqual({
      toml_valid: true,
      toml_cors: true,
      sep10_advertised: true,
      sep10_signature_valid: true,
      info_valid: true,
      tls_ok: true,
      tls_days_left: 60,
      signing_key: anchorKey.publicKey(),
    });
  });

  it('notices a missing CORS header', async () => {
    const r = await probe(fakeAnchor());
    expect(r.checks!.toml_cors).toBe(false);
  });

  it('tells a challenge signed by someone else apart from an HTTP failure', async () => {
    const impostor = Keypair.random();
    const wrongKey = await probe(
      fakeAnchor({
        'GET /auth': (url) =>
          Response.json({
            transaction: WebAuth.buildChallengeTx(impostor, url.searchParams.get('account')!, DOMAIN, 300, Networks.PUBLIC, DOMAIN),
            network_passphrase: Networks.PUBLIC,
          }),
      }),
    );
    expect(wrongKey.checks!.sep10_signature_valid).toBe(false);

    const down = await probe(fakeAnchor({ 'GET /auth': () => new Response('', { status: 502 }) }));
    expect(down.checks!.sep10_signature_valid).toBeUndefined();
    expect(down.failed_stage).toBe('challenge');
  });

  it('marks /info without an enabled asset as invalid, without failing the probe', async () => {
    const r = await probe(fakeAnchor({ '/sep24/info': () => Response.json({ deposit: { USDC: { enabled: false } } }) }));
    expect(r.checks!.info_valid).toBe(false);
  });

  it('records the toml currencies', async () => {
    const r = await probe(
      fakeAnchor({
        '/.well-known/stellar.toml': () =>
          new Response(`${toml()}\n[[CURRENCIES]]\ncode = "ARST"\nissuer = "GISSUER"\nanchor_asset_type = "fiat"\nanchor_asset = "ARS"\nis_asset_anchored = true`),
      }),
    );
    expect(r.assets).toEqual([{ code: 'ARST', issuer: 'GISSUER', anchor_asset_type: 'fiat', anchor_asset: 'ARS', is_asset_anchored: true }]);
  });

  it('keeps the TLS result out of the measured API time', async () => {
    const r = await probeAnchor(
      { anchor_id: 'a', domain: DOMAIN },
      {
        fetchImpl: fakeAnchor(),
        requestTimeoutMs: 5000,
        networkPassphrase: Networks.PUBLIC,
        tlsCheck: () => new Promise((resolve) => setTimeout(() => resolve({ ok: false, daysLeft: 3, error: 'expires soon' }), 50)),
      },
    );
    expect(r.checks).toMatchObject({ tls_ok: false, tls_days_left: 3, tls_error: 'expires soon' });
    expect(r.settlement_seconds).toBeLessThan(0.05);
  });
});

describe('firstDepositAsset', () => {
  it('skips disabled assets', () => {
    expect(firstDepositAsset({ deposit: { ETH: { enabled: false }, USDC: { enabled: true } } })).toBe('USDC');
    expect(firstDepositAsset({})).toBeUndefined();
  });
});
