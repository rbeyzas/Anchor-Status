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
  probeAnchor({ anchor_id: 'a', domain: DOMAIN }, { fetchImpl, requestTimeoutMs: 5000, networkPassphrase: Networks.PUBLIC });

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

describe('firstDepositAsset', () => {
  it('skips disabled assets', () => {
    expect(firstDepositAsset({ deposit: { ETH: { enabled: false }, USDC: { enabled: true } } })).toBe('USDC');
    expect(firstDepositAsset({})).toBeUndefined();
  });
});
