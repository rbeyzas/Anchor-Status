import { describe, expect, it } from 'vitest';
import type { rpc } from '@stellar/stellar-sdk';
import { RpcPool, Semaphore } from './rpc';

const server = (name: string) => ({ name }) as unknown as rpc.Server;
const pool = () =>
  new RpcPool(
    [
      { name: 'primary', server: server('primary'), concurrency: 16 },
      { name: 'fallback', server: server('fallback'), concurrency: 8 },
    ],
    0,
  );
const nameOf = (s: rpc.Server) => (s as unknown as { name: string }).name;

describe('Semaphore', () => {
  it('never runs more than its limit at once', async () => {
    const gate = new Semaphore(8);
    let inFlight = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 50 }, () =>
        gate.run(async () => {
          peak = Math.max(peak, ++inFlight);
          await new Promise((r) => setTimeout(r, 1));
          inFlight--;
        }),
      ),
    );
    expect(peak).toBe(8);
  });

  it('frees its slot when the call throws', async () => {
    const gate = new Semaphore(1);
    await expect(gate.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(gate.run(async () => 'ok')).resolves.toBe('ok');
  });
});

describe('RpcPool', () => {
  it('stays on the public node while it answers', async () => {
    const p = pool();
    expect(await p.call(async (s) => nameOf(s))).toBe('primary');
    expect(p.activeProvider).toBe('primary');
  });

  it('retries the public node once before leaving it', async () => {
    const p = pool();
    let attempts = 0;
    const result = await p.call(async (s) => {
      if (nameOf(s) === 'primary' && ++attempts === 1) throw new Error('429');
      return nameOf(s);
    });
    expect(result).toBe('primary');
    expect(p.activeProvider).toBe('primary');
  });

  it('switches to the backup when the public node keeps failing, and stays there', async () => {
    const p = pool();
    const seen: string[] = [];
    const call = () =>
      p.call(async (s) => {
        seen.push(nameOf(s));
        if (nameOf(s) === 'primary') throw new Error('fetch failed');
        return nameOf(s);
      });
    expect(await call()).toBe('fallback');
    expect(await call()).toBe('fallback');
    expect(seen).toEqual(['primary', 'primary', 'fallback', 'fallback']);
  });

  it('reports the last error when every provider fails', async () => {
    const p = pool();
    await expect(
      p.call(async (s) => {
        throw new Error(`${nameOf(s)} down`);
      }),
    ).rejects.toThrow('fallback down');
  });
});
