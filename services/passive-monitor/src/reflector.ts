// Reference prices from Reflector, read straight off the ledger.
//
// The reference rate a peg is measured against used to come from a free
// HTTP currency API. That is a number we ask someone for and then ask you to
// believe; nobody checking a score card can see what it was at the time.
// Reflector publishes the same rates through a Soroban contract, signed by a
// quorum of its nodes, so the rate behind a card is something a reader can
// fetch for themselves at the ledger it was taken from.
//
// Read-only: every call here is a simulation. Nothing is signed and nothing
// is submitted. The feeds live on pubnet while this project writes to
// testnet, which is why the RPC is configured separately.
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';

/** Reflector's public feeds on pubnet (developers.stellar.org, oracle providers). */
export const FEEDS = {
  /** Fiat exchange rates: 24 currencies, the ones anchors peg to. */
  fiat: 'CBKGPWGKSKZF52CFHMTRR23TBWTPMRDIYZ4O2P5VS65BMHYH4DXMCJZC',
  /** Stellar classic DEX, keyed by each asset's contract id. */
  dex: 'CALI2BYU2JE6WVRUFYTS6MSBNEHGJ35P4AVCZYF3B6QOE3QKOB2PLE6M',
} as const;

/** A SEP-40 price: the value scaled by 10^decimals, and its timestamp. */
export interface ReflectorPrice {
  /** Already divided by 10^decimals. */
  price: number;
  /** When the feed says this price is from. */
  at: string;
  feed: string;
}

/** `Asset::Other(symbol)` for a ticker, `Asset::Stellar(address)` for an
 * asset's contract id. Reflector keys its fiat feed by ticker and its DEX
 * feed by contract id, which is why both shapes are needed. */
type AssetKey = { kind: 'other'; symbol: string } | { kind: 'stellar'; contractId: string };

export const ticker = (symbol: string): AssetKey => ({ kind: 'other', symbol });
export const contractAsset = (contractId: string): AssetKey => ({ kind: 'stellar', contractId });

/** How a contract function is called. Real use simulates it against the
 * ledger; a test hands in the answer, so everything but the network can be
 * exercised without one. */
export type Invoke = (contractId: string, fn: string, args: xdr.ScVal[]) => Promise<unknown>;

export interface ReflectorOptions {
  rpcUrl?: string;
  invoke?: Invoke;
}

/**
 * Reads one feed. Every method returns `null` rather than throwing when the
 * feed has nothing for an asset: a missing price is a fact about coverage,
 * not an error, and the caller falls back to the HTTP table.
 */
export class Reflector {
  private readonly invoke: Invoke;
  private decimalsCache = new Map<string, number>();

  constructor(options: ReflectorOptions) {
    this.invoke = options.invoke ?? simulate(options.rpcUrl ?? '');
  }

  private call(contractId: string, fn: string, ...args: xdr.ScVal[]): Promise<unknown> {
    return this.invoke(contractId, fn, args);
  }

  private async decimals(contractId: string): Promise<number> {
    const cached = this.decimalsCache.get(contractId);
    if (cached !== undefined) return cached;
    const d = Number(await this.call(contractId, 'decimals'));
    this.decimalsCache.set(contractId, d);
    return d;
  }

  /** The tickers or contract ids a feed carries. */
  async assets(contractId: string): Promise<string[]> {
    const raw = (await this.call(contractId, 'assets')) as unknown[];
    return (raw ?? []).map(assetName).filter((s): s is string => s !== undefined);
  }

  /** The latest price of one asset, or null when the feed has none. */
  async lastPrice(contractId: string, asset: AssetKey): Promise<ReflectorPrice | null> {
    const raw = (await this.call(contractId, 'lastprice', assetScVal(asset))) as
      | { price: bigint | number; timestamp: bigint | number }
      | null
      | undefined;
    if (!raw || raw.price === undefined) return null;
    const decimals = await this.decimals(contractId);
    return {
      price: Number(raw.price) / 10 ** decimals,
      at: new Date(toMillis(raw.timestamp)).toISOString(),
      feed: contractId,
    };
  }

  /** 1 unit of `code` in USD, from the fiat feed. Null when uncovered. */
  async usdPerUnit(code: string): Promise<ReflectorPrice | null> {
    if (code.toUpperCase() === 'USD') return { price: 1, at: new Date().toISOString(), feed: 'usd' };
    return this.lastPrice(FEEDS.fiat, ticker(code.toUpperCase()));
  }
}

/** The real caller: a simulation, never a signed or submitted transaction. */
function simulate(rpcUrl: string): Invoke {
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  // Simulation needs a source account but never a real one: it is not
  // signed, submitted, or charged.
  const source = new Account(Keypair.random().publicKey(), '0');
  return async (contractId, fn, args) => {
    const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: Networks.PUBLIC })
      .addOperation(new Contract(contractId).call(fn, ...args))
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new Error(`${fn} on ${contractId.slice(0, 8)}: ${sim.error.slice(0, 160)}`);
    const result = (sim as rpc.Api.SimulateTransactionSuccessResponse).result;
    return result ? scValToNative(result.retval) : null;
  };
}

/** Reflector declares `Asset` as an enum, so a call argument is the variant
 * name followed by its payload. */
function assetScVal(asset: AssetKey): xdr.ScVal {
  return asset.kind === 'other'
    ? xdr.ScVal.scvVec([nativeToScVal('Other', { type: 'symbol' }), nativeToScVal(asset.symbol, { type: 'symbol' })])
    : xdr.ScVal.scvVec([nativeToScVal('Stellar', { type: 'symbol' }), new Address(asset.contractId).toScVal()]);
}

/** SEP-40 says milliseconds, and Reflector answers in seconds. Rather than
 * pick a side, read the magnitude: anything that would land before 2001 as
 * milliseconds is seconds. */
export function toMillis(timestamp: bigint | number): number {
  const n = Number(timestamp);
  return n < 1e12 ? n * 1000 : n;
}

/** Reflector returns its asset list as the same enum; take the readable half. */
function assetName(a: unknown): string | undefined {
  if (typeof a === 'string') return a;
  if (Array.isArray(a)) return String(a[a.length - 1]);
  if (a && typeof a === 'object' && 'value' in a) return String((a as { value: unknown }).value);
  return undefined;
}
