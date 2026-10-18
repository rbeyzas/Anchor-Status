import { describe, expect, it } from 'vitest';
import { USER_AGENT, withUserAgent } from './user-agent.js';

describe('withUserAgent', () => {
  const capture = () => {
    const seen: Headers[] = [];
    const f = withUserAgent((async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      return new Response('');
    }) as typeof fetch);
    return { f, seen };
  };

  it('names the probe and a contact address on a plain request', async () => {
    const { f, seen } = capture();
    await f('https://anchor.example/.well-known/stellar.toml');
    expect(seen[0].get('user-agent')).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/^MonaRank-probe\/\d+\.\d+ \(\+https:\/\/monarank\.xyz; [^@\s]+@[^@\s]+\)$/);
  });

  it('keeps the headers a call sets, and a User-Agent it chose itself', async () => {
    const { f, seen } = capture();
    await f('https://anchor.example/info', { headers: { Authorization: 'Bearer t' } });
    await f('https://anchor.example/info', { headers: { 'User-Agent': 'custom' } });
    expect(seen[0].get('authorization')).toBe('Bearer t');
    expect(seen[0].get('user-agent')).toBe(USER_AGENT);
    expect(seen[1].get('user-agent')).toBe('custom');
  });

  it('is on the global fetch once config is loaded', async () => {
    await import('./config.js');
    expect(globalThis.fetch.name).not.toBe('fetch');
  });
});
