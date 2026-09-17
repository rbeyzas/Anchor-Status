import { parse as parseToml } from 'smol-toml';
import type { AnchorInfo, Sep24Currency } from './types.js';

interface StellarToml {
  TRANSFER_SERVER_SEP0024?: string;
  [key: string]: unknown;
}

const FETCH_TIMEOUT_MS = 10_000;

/** Fetches and parses SEP-1 stellar.toml from an anchor's domain. */
export async function fetchStellarToml(domain: string): Promise<StellarToml> {
  const url = `https://${domain}/.well-known/stellar.toml`;
  const res = await fetch(url, {
    headers: { Accept: 'text/plain' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch stellar.toml from ${url}: HTTP ${res.status}`);
  }
  const text = await res.text();
  return parseToml(text) as StellarToml;
}

/** Fetches SEP-24 /info from an anchor's TRANSFER_SERVER_SEP0024 URL. */
export async function fetchSep24Info(transferServerUrl: string): Promise<AnchorInfo> {
  const url = `${transferServerUrl.replace(/\/$/, '')}/info`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Failed to fetch SEP-24 /info from ${url}: HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    deposit?: Record<string, { enabled?: boolean; min_amount?: number; max_amount?: number }>;
    withdraw?: Record<string, { enabled?: boolean; min_amount?: number; max_amount?: number }>;
  };

  const codes = new Set([
    ...Object.keys(body.deposit ?? {}),
    ...Object.keys(body.withdraw ?? {}),
  ]);

  const currencies: Sep24Currency[] = Array.from(codes).map((code) => {
    const dep = body.deposit?.[code];
    const wd = body.withdraw?.[code];
    return {
      code,
      minAmount: dep?.min_amount ?? wd?.min_amount,
      maxAmount: dep?.max_amount ?? wd?.max_amount,
      depositEnabled: dep?.enabled,
      withdrawEnabled: wd?.enabled,
    };
  });

  return { transferServerSep24: transferServerUrl, currencies };
}

/** Convenience wrapper: stellar.toml -> SEP-24 /info in one call. Returns an
 * empty currency list (rather than throwing) if the anchor doesn't publish
 * TRANSFER_SERVER_SEP0024, since not every domain in anchors.json is
 * guaranteed to support SEP-24. */
export async function fetchAnchorInfo(domain: string): Promise<AnchorInfo> {
  const toml = await fetchStellarToml(domain);
  if (!toml.TRANSFER_SERVER_SEP0024) {
    return { currencies: [] };
  }
  return fetchSep24Info(toml.TRANSFER_SERVER_SEP0024);
}
