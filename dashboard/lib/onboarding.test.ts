import { describe, expect, it } from 'vitest';
import { normalizeDomainInput } from './onboarding';
import { handleApplication } from './onboarding-proxy';

describe('normalizeDomainInput', () => {
  it('matches the collector: a pasted URL becomes its hostname, anything else is refused', () => {
    expect(normalizeDomainInput('https://Anchor.Example.com/.well-known/stellar.toml')).toBe('anchor.example.com');
    for (const bad of ['', 'localhost', '10.0.0.1', 'example.com:8080', 'a@b.com', 'bad domain.com', null]) {
      expect(normalizeDomainInput(bad), String(bad)).toBeNull();
    }
  });
});

const apply = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://dash.test/api/onboarding', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

function intake(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const opts = { intakeUrl: 'http://collector.test/api/onboarding', token: 'secret-token' };

describe('handleApplication', () => {
  it('forwards a normalised domain with the token and the caller’s address', async () => {
    const { fetchImpl, calls } = intake(202, { domain: 'anchor.example.com', status: 'received' });
    const res = await handleApplication(
      apply({ domain: 'https://Anchor.Example.com/' }, { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
      { ...opts, fetchImpl },
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ domain: 'anchor.example.com', status: 'received' });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(calls[0].url).toBe(opts.intakeUrl);
    expect(headers['x-onboarding-token']).toBe('secret-token');
    expect(headers['x-client-ip']).toBe('203.0.113.7');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ domain: 'anchor.example.com' });
  });

  it('refuses bad input without calling the collector', async () => {
    const { fetchImpl, calls } = intake(202, {});
    expect((await handleApplication(apply('not json'), { ...opts, fetchImpl })).status).toBe(400);
    expect((await handleApplication(apply({ domain: '127.0.0.1' }), { ...opts, fetchImpl })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('says applications are closed when it is not configured, or its token is refused', async () => {
    expect((await handleApplication(apply({ domain: 'a.com' }), { intakeUrl: '', token: '' })).status).toBe(503);
    const { fetchImpl } = intake(401, { error: 'unauthorized' });
    const res = await handleApplication(apply({ domain: 'a.com' }), { ...opts, fetchImpl });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Applications are not open yet.' });
  });

  it('passes the collector’s answer through, retry-after included', async () => {
    const { fetchImpl } = intake(429, { error: 'too many requests' }, { 'retry-after': '1800' });
    const res = await handleApplication(apply({ domain: 'a.com' }), { ...opts, fetchImpl });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('1800');
  });

  it('reports an unreachable collector as a 502', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    expect((await handleApplication(apply({ domain: 'a.com' }), { ...opts, fetchImpl })).status).toBe(502);
  });
});
