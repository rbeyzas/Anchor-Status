import { rpc } from '@stellar/stellar-sdk';

export interface Provider {
  name: string;
  server: rpc.Server;
  /** Most requests allowed in flight at once. */
  concurrency: number;
}

// The public RPC served 64 parallel requests without an error. Alchemy
// served 8 cleanly and started answering with 429s at 32, so it is never
// asked for more than 8.
export const PRIMARY_CONCURRENCY = 16;
export const FALLBACK_CONCURRENCY = 8;

class Semaphore {
  private active = 0;
  private waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

// Rate limits, timeouts and dropped connections pass; they are waited out.
const isTransient = (err: unknown) =>
  /429|too many requests|timeout|ECONNRESET|socket hang up|fetch failed/i.test(String((err as Error)?.message ?? err));

/** The providers in order of preference. A provider is tried again after a
 * pause (longer for a rate limit), and left for the next one only when it
 * keeps failing; a run that has failed over stays on the next provider. */
export class RpcPool {
  private readonly providers: { provider: Provider; gate: Semaphore }[];
  private current = 0;

  constructor(providers: Provider[], private readonly attempts = 4, private readonly baseDelayMs = 750) {
    if (providers.length === 0) throw new Error('RpcPool needs at least one provider');
    this.providers = providers.map((provider) => ({ provider, gate: new Semaphore(provider.concurrency) }));
  }

  get active(): Provider {
    return this.providers[this.current].provider;
  }

  async call<T>(fn: (server: rpc.Server) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let i = this.current; i < this.providers.length; i++) {
      const { provider, gate } = this.providers[i];
      for (let attempt = 0; attempt < this.attempts; attempt++) {
        try {
          return await gate.run(() => fn(provider.server));
        } catch (err) {
          lastError = err;
          // Transient failures are worth waiting out; anything else gets
          // one retry, then the next provider.
          if (!isTransient(err) && attempt >= 1) break;
          await new Promise((r) => setTimeout(r, this.baseDelayMs * 2 ** attempt));
        }
      }
      if (i + 1 < this.providers.length && this.current === i) {
        console.warn(`[history-archiver] ${provider.name} RPC failed, switching to ${this.providers[i + 1].provider.name}: ${String(lastError)}`);
        this.current = i + 1;
      }
    }
    throw lastError;
  }
}

export function provider(name: string, url: string, concurrency: number): Provider {
  // A request that never answers must fail, not hang the whole round.
  return { name, server: new rpc.Server(url, { timeout: 30_000 }), concurrency };
}
