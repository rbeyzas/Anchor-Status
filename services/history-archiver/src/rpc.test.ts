import { describe, expect, it } from 'vitest';
import type { rpc } from '@stellar/stellar-sdk';
import { RpcPool } from './rpc.js';

const fake = (name: string) => ({ name }) as unknown as rpc.Server;
const nameOf = (s: rpc.Server) => (s as unknown as { name: string }).name;
const pool = () =>
  new RpcPool(
    [
      { name: 'public', server: fake('public'), concurrency: 16 },
      { name: 'backup', server: fake('backup'), concurrency: 8 },
    ],
    4,
    0,
  );

describe('RpcPool', () => {
  it('waits out rate limits on the same provider instead of leaving it', async () => {
    const p = pool();
    let calls = 0;
    const result = await p.call(async (s) => {
      if (++calls < 4) throw new Error('Request failed with status code 429');
      return nameOf(s);
    });
    expect(result).toBe('public');
    expect(calls).toBe(4);
  });

  it('gives up on a provider after one retry for a non-transient error', async () => {
    const p = pool();
    const seen: string[] = [];
    const result = await p.call(async (s) => {
      seen.push(nameOf(s));
      if (nameOf(s) === 'public') throw new Error('invalid response');
      return nameOf(s);
    });
    expect(result).toBe('backup');
    expect(seen).toEqual(['public', 'public', 'backup']);
    expect(p.active.name).toBe('backup');
  });

  it('never runs more requests on a provider than its limit', async () => {
    const p = new RpcPool([{ name: 'backup', server: fake('backup'), concurrency: 8 }], 1, 0);
    let inFlight = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 40 }, () =>
        p.call(async () => {
          peak = Math.max(peak, ++inFlight);
          await new Promise((r) => setTimeout(r, 1));
          inFlight--;
        }),
      ),
    );
    expect(peak).toBe(8);
  });
});
