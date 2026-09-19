import fs from 'node:fs';
import path from 'node:path';
import type { Fetch } from './http.js';
import { parseAnchorToml, type TomlCurrency } from './toml.js';

/** What Horizon says about one issuer account. */
export interface IssuerRecord {
  checked_at: string;
  /** false when Horizon has no such account (never created, or merged). */
  exists: boolean;
  home_domain?: string;
  /** When the account was created: "on-chain since". From StellarExpert,
   * because SDF's Horizon keeps only about a year of history, so its
   * "first operation" is wherever its history starts, not the account's. */
  created_at?: string;
}

/** Which assets a domain's stellar.toml lists, as `CODE:ISSUER`. */
export interface DomainListing {
  checked_at: string;
  /** false when the toml could not be fetched or parsed. */
  reachable: boolean;
  assets: string[];
}

/** Issuer accounts by address; `domains` holds other domains' listings. */
export type IssuerCache = Record<string, IssuerRecord> & { domains?: Record<string, DomainListing> };

/** One asset from the anchor's toml, with the SEP-1 two-way check applied. */
export interface AssetStatus extends TomlCurrency {
  /** The issuer's home_domain is this anchor's domain, and (since the asset
   * came from this anchor's toml) the toml lists it: the anchor issues it.
   * Absent when the toml gives no issuer, or Horizon could not be read. */
  issuer_home_domain_matches?: boolean;
  /** For an asset issued by someone else: whether the issuer's own
   * home_domain lists it, i.e. it is the genuine asset (SEP-1's link,
   * checked at the issuer's end). Absent when the anchor is the issuer, or
   * when the issuer's toml could not be read: that is the issuer's problem
   * (Circle's circle.com serves none), not evidence against this anchor. */
  issuer_listed_by_home_domain?: boolean;
  issuer_created_at?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const ISSUER_CACHE_MS = DAY_MS;

export function loadIssuerCache(filePath: string): IssuerCache {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as IssuerCache;
  } catch {
    return {};
  }
}

export function saveIssuerCache(filePath: string, cache: IssuerCache): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, filePath);
}

export const STELLAR_EXPERT_API = 'https://api.stellar.expert/explorer/public';

/** Reads an issuer account from Horizon, and its creation time from
 * StellarExpert. Throws unless Horizon gives a clear answer, so a hiccup is
 * never cached as "this account does not exist"; a missing creation time
 * is simply left out. */
export async function lookupIssuer(
  fetchImpl: Fetch,
  horizonUrl: string,
  issuer: string,
  now: Date,
  timeoutMs: number,
  expertUrl = STELLAR_EXPERT_API,
): Promise<IssuerRecord> {
  const get = (url: string) => fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  const account = await get(`${horizonUrl}/accounts/${issuer}`);
  if (account.status === 404) return { checked_at: now.toISOString(), exists: false };
  if (!account.ok) throw new Error(`Horizon answered ${account.status} for ${issuer}`);
  const body = (await account.json()) as { home_domain?: string };
  let created: string | undefined;
  try {
    const res = await get(`${expertUrl}/account/${issuer}`);
    const seconds = res.ok ? ((await res.json()) as { created?: number }).created : undefined;
    if (typeof seconds === 'number' && seconds > 0) created = new Date(seconds * 1000).toISOString();
  } catch {
    // Context only: no creation date is better than a wrong one.
  }
  return {
    checked_at: now.toISOString(),
    exists: true,
    ...(body.home_domain ? { home_domain: body.home_domain } : {}),
    ...(created ? { created_at: created } : {}),
  };
}

export const normalizeDomain = (d: string) => d.trim().toLowerCase().replace(/\.$/, '');

/** SEP-1's two-way link: the issuer points at the anchor's domain. */
export function issuerMatches(record: IssuerRecord, domain: string): boolean {
  return record.exists && !!record.home_domain && normalizeDomain(record.home_domain) === normalizeDomain(domain);
}

/** Reads another domain's toml and lists its assets. Never throws: an
 * unreachable toml is a listing with nothing in it. */
export async function listDomainAssets(fetchImpl: Fetch, domain: string, now: Date, timeoutMs: number): Promise<DomainListing> {
  try {
    const res = await fetchImpl(`https://${domain}/.well-known/stellar.toml`, {
      headers: { Accept: '*/*' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const assets = parseAnchorToml(await res.text()).currencies.flatMap((c) => (c.issuer ? [`${c.code}:${c.issuer}`] : []));
    return { checked_at: now.toISOString(), reachable: true, assets };
  } catch {
    return { checked_at: now.toISOString(), reachable: false, assets: [] };
  }
}

const fresh = (checkedAt: string, now: Date) => now.getTime() - Date.parse(checkedAt) < ISSUER_CACHE_MS;

/** Checks every listed asset's issuer, reading Horizon (and, for assets
 * issued by someone else, the issuer's own toml) only when not checked in
 * the last 24 hours. The cache is updated in place. */
export async function verifyAssets(
  assets: TomlCurrency[],
  domain: string,
  cache: IssuerCache,
  now: Date,
  lookup: (issuer: string) => Promise<IssuerRecord>,
  listDomain: (domain: string) => Promise<DomainListing> = async () => ({ checked_at: now.toISOString(), reachable: false, assets: [] }),
): Promise<AssetStatus[]> {
  const out: AssetStatus[] = [];
  const domains = (cache.domains ??= {});
  for (const asset of assets) {
    if (!asset.issuer) {
      out.push({ ...asset });
      continue;
    }
    let record: IssuerRecord | undefined = cache[asset.issuer];
    if (!record || !fresh(record.checked_at, now)) {
      try {
        record = await lookup(asset.issuer);
        cache[asset.issuer] = record;
      } catch (err) {
        console.warn(`[mainnet-probe] could not read issuer ${asset.issuer}: ${(err as Error).message}`);
      }
    }
    const matches = record ? issuerMatches(record, domain) : undefined;
    let listed: boolean | undefined;
    if (record && !matches && record.exists && record.home_domain) {
      const home = normalizeDomain(record.home_domain);
      let listing = domains[home];
      if (!listing || !fresh(listing.checked_at, now)) {
        listing = await listDomain(home);
        domains[home] = listing;
      }
      if (listing.reachable) listed = listing.assets.includes(`${asset.code}:${asset.issuer}`);
    } else if (record && !matches) {
      // No such account, or it names no home domain: nobody vouches for it.
      listed = false;
    }
    out.push({
      ...asset,
      ...(matches !== undefined ? { issuer_home_domain_matches: matches } : {}),
      ...(listed !== undefined ? { issuer_listed_by_home_domain: listed } : {}),
      ...(record?.created_at ? { issuer_created_at: record.created_at } : {}),
    });
  }
  return out;
}
