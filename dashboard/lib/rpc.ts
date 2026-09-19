import { rpc } from '@stellar/stellar-sdk';

const PRIMARY_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
// Server-only on purpose (no NEXT_PUBLIC_ prefix): the URL carries the
// Alchemy API key, which must never be shipped to the browser.
const FALLBACK_URL = process.env.SOROBAN_RPC_FALLBACK_URL;

// The public RPC served 64 parallel requests without an error. Alchemy
// served 8 cleanly and at 32 started answering with 429s and false
// "Account not found" errors, so the backup is never asked for more than 8.
export const PRIMARY_CONCURRENCY = 16;
export const FALLBACK_CONCURRENCY = 8;

export interface Provider {
  name: 'primary' | 'fallback';
  server: rpc.Server;
  concurrency: number;
}

/** Caps in-flight requests; queued callers run in arrival order. */
export class Semaphore {
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

/** One page render's view of the RPC: the public node first, the backup
 * only when the public node fails. Once it has failed over, the render
 * stays on the backup rather than paying the public node's timeouts again
 * on every remaining call. */
export class RpcPool {
  private readonly providers: { provider: Provider; gate: Semaphore }[];
  private current = 0;

  constructor(providers: Provider[], private readonly retryDelayMs = 750) {
    this.providers = providers.map((provider) => ({ provider, gate: new Semaphore(provider.concurrency) }));
  }

  get activeProvider(): Provider['name'] {
    return this.providers[this.current].provider.name;
  }

  async call<T>(fn: (server: rpc.Server) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let i = this.current; i < this.providers.length; i++) {
      const { provider, gate } = this.providers[i];
      try {
        return await gate.run(() => fn(provider.server));
      } catch (err) {
        lastError = err;
      }
      // One retry after a short pause: public nodes shed load with the
      // occasional 429/5xx, which is not a reason to leave them yet.
      await new Promise((r) => setTimeout(r, this.retryDelayMs));
      try {
        return await gate.run(() => fn(provider.server));
      } catch (err) {
        lastError = err;
      }
      if (i + 1 < this.providers.length && this.current === i) {
        console.warn(`[dashboard] ${provider.name} RPC failed, switching to ${this.providers[i + 1].provider.name}:`, lastError);
        this.current = i + 1;
      }
    }
    throw lastError;
  }
}

// A request that never answers must fail over, not hold the render open.
const REQUEST_TIMEOUT_MS = 15_000;

export function createRpcPool(): RpcPool {
  const server = (url: string) => new rpc.Server(url, { timeout: REQUEST_TIMEOUT_MS });
  const providers: Provider[] = [{ name: 'primary', server: server(PRIMARY_URL), concurrency: PRIMARY_CONCURRENCY }];
  if (FALLBACK_URL) {
    providers.push({ name: 'fallback', server: server(FALLBACK_URL), concurrency: FALLBACK_CONCURRENCY });
  }
  return new RpcPool(providers);
}
