import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { onboardingPaths, readSubmissions, saveOnboardingFile } from './candidates.js';
import { createIntakeHandler, type IntakeOptions } from './intake.js';

const TOKEN = 't'.repeat(40);
const servers: http.Server[] = [];

afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function start(over: Partial<IntakeOptions> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intake-'));
  const paths = onboardingPaths(dir);
  const handler = createIntakeHandler({
    paths,
    token: TOKEN,
    cooldownHours: 24,
    maxPending: 50,
    perClient: { max: 10, windowMs: 3_600_000 },
    now: () => new Date('2026-09-19T12:00:00Z'),
    ...over,
  });
  const server = http.createServer((req, res) => void handler(req, res));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-onboarding-token': TOKEN, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  return { base, paths, post };
}

describe('intake server', () => {
  it('queues a new domain once, and reports it as pending after that', async () => {
    const { post, paths } = await start();
    const first = await post({ domain: 'https://New-Anchor.com/.well-known/stellar.toml' });
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ domain: 'new-anchor.com', status: 'received' });
    const again = await post({ domain: 'new-anchor.com' });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ domain: 'new-anchor.com', status: 'pending' });
    expect(readSubmissions(paths.submissions)).toHaveLength(1);
  });

  it('refuses requests without the dashboard token', async () => {
    const { post, paths } = await start();
    expect((await post({ domain: 'a.com' }, { 'x-onboarding-token': 'wrong' })).status).toBe(401);
    expect(readSubmissions(paths.submissions)).toHaveLength(0);
  });

  it('refuses bad input: not JSON, not a hostname, too large', async () => {
    const { post } = await start();
    expect((await post('not json')).status).toBe(400);
    expect((await post({ domain: '127.0.0.1' })).status).toBe(400);
    expect((await post({ domain: 'localhost' })).status).toBe(400);
    expect((await post({ domain: 'a.com', pad: 'x'.repeat(5000) })).status).toBe(413);
  });

  it('limits each client, by the address the proxy reports', async () => {
    const { post } = await start({ perClient: { max: 2, windowMs: 3_600_000 } });
    const as = (ip: string, d: string) => post({ domain: d }, { 'x-client-ip': ip });
    expect((await as('1.1.1.1', 'a.com')).status).toBe(202);
    expect((await as('1.1.1.1', 'b.com')).status).toBe(202);
    const limited = await as('1.1.1.1', 'c.com');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('3600');
    expect((await as('2.2.2.2', 'c.com')).status).toBe(202);
  });

  it('refuses new domains once the queue is full', async () => {
    const { post } = await start({ maxPending: 1 });
    expect((await post({ domain: 'a.com' })).status).toBe(202);
    expect((await post({ domain: 'b.com' })).status).toBe(503);
  });

  it('holds a rejected domain back until its cooldown ends', async () => {
    const { post, paths } = await start();
    saveOnboardingFile(paths.candidates, {
      updated_at: '2026-09-19T11:00:00Z',
      thresholds: { min_age_days: 7, min_transfers: 100 },
      candidates: [
        { domain: 'a.com', status: 'rejected', submitted_at: '2026-09-19T10:00:00Z', checked_at: '2026-09-19T10:20:00Z', attempts: 0, checks: [] },
      ],
    });
    const res = await post({ domain: 'a.com' });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ status: 'rejected', retry_after: '2026-09-20T10:20:00.000Z' });
  });

  it('answers health checks and nothing else', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect((await fetch(`${base}/onboarding.json`)).status).toBe(404);
  });
});
