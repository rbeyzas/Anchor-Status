// How much of an issued asset exists, sampled once a round.
//
// An anchor that takes a deposit mints; one that pays a redemption burns.
// Either way the total outstanding changes, to the seventh decimal. So a
// supply that is *byte for byte identical* across two samples twenty minutes
// apart means no mint and no burn settled in between, unless the two
// cancelled each other to the stroop, which does not happen twice in a row,
// let alone two thousand times.
//
// That is the point of sampling supply rather than counting payments: it
// measures the thing itself. It also sees what `flows.ts` cannot. Horizon
// reports a Stellar Asset Contract balance under `contracts_amount`, so an
// issuer whose asset only ever moves through Soroban -- invisible to a scan
// of the issuer account's payments -- still shows up here.
import fs from 'node:fs';
import path from 'node:path';
import type { IssuedAsset } from './flows.js';

/** One reading of an asset's total outstanding amount. */
export interface SupplySample {
  timestamp: string;
  anchor_id: string;
  code: string;
  issuer: string;
  /** Every unit that exists: trustlines, claimable balances, pools, and
   * Stellar Asset Contract balances. */
  supply: number;
  /** Where those units sit, so a change can be explained. */
  parts: {
    trustlines: number;
    claimable: number;
    liquidity_pools: number;
    contracts: number;
  };
  /** Accounts holding it, authorized ones only. Context, never scored. */
  holders: number;
  /** Horizon knows the asset but reports nothing for it. */
  reason?: 'not_found';
}

/** Horizon's `/assets` record, as far as this reads it. */
interface AssetRecord {
  balances?: { authorized?: string; authorized_to_maintain_liabilities?: string };
  claimable_balances_amount?: string;
  liquidity_pools_amount?: string;
  contracts_amount?: string;
  accounts?: { authorized?: number };
}

const num = (v: string | number | undefined) => (v === undefined ? 0 : Number(v)) || 0;

/** Total outstanding, and the buckets it is made of. Kept to 7 decimals,
 * the precision Stellar itself uses, so float addition cannot invent a
 * change that did not happen. */
export function totalSupply(r: AssetRecord): { supply: number; parts: SupplySample['parts']; holders: number } {
  const parts = {
    trustlines: num(r.balances?.authorized) + num(r.balances?.authorized_to_maintain_liabilities),
    claimable: num(r.claimable_balances_amount),
    liquidity_pools: num(r.liquidity_pools_amount),
    contracts: num(r.contracts_amount),
  };
  const supply = Number((parts.trustlines + parts.claimable + parts.liquidity_pools + parts.contracts).toFixed(7));
  return { supply, parts, holders: num(r.accounts?.authorized) };
}

/**
 * Samples one asset. A missing asset is recorded as `not_found` rather than
 * as a zero supply: "Horizon has never heard of this" and "nobody holds any"
 * are different claims, and only the second one is about the anchor.
 */
export async function sampleSupply(
  fetchImpl: typeof fetch,
  horizonUrl: string,
  asset: IssuedAsset,
  timeoutMs: number,
  now: Date = new Date(),
): Promise<SupplySample> {
  const url =
    `${horizonUrl}/assets?asset_code=${encodeURIComponent(asset.code)}` +
    `&asset_issuer=${encodeURIComponent(asset.issuer)}&limit=1`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const body = (await res.json()) as { _embedded?: { records?: AssetRecord[] } };
  const base = { timestamp: now.toISOString(), anchor_id: asset.anchor_id, code: asset.code, issuer: asset.issuer };
  const record = body._embedded?.records?.[0];
  if (!record) {
    return { ...base, supply: 0, parts: { trustlines: 0, claimable: 0, liquidity_pools: 0, contracts: 0 }, holders: 0, reason: 'not_found' };
  }
  return { ...base, ...totalSupply(record) };
}

/** One JSON-lines file a day, beside the market samples. */
export function appendSupplySamples(dir: string, samples: SupplySample[]): void {
  if (samples.length === 0) return;
  fs.mkdirSync(dir, { recursive: true });
  for (const s of samples) {
    fs.appendFileSync(path.join(dir, `supply-${s.timestamp.slice(0, 10)}.jsonl`), `${JSON.stringify(s)}\n`);
  }
}
