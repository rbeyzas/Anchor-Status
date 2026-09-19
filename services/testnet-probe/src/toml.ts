import { parse as parseToml } from 'smol-toml';
import type { StellarTomlInfo } from './types.js';

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\/$/, '') : undefined);

export function parseAnchorToml(domain: string, text: string): StellarTomlInfo {
  const parsed = parseToml(text) as Record<string, unknown>;
  const webAuthEndpoint = str(parsed.WEB_AUTH_ENDPOINT);
  const signingKey = str(parsed.SIGNING_KEY);
  const transferServerSep24 = str(parsed.TRANSFER_SERVER_SEP0024);
  const transferServerSep6 = str(parsed.TRANSFER_SERVER);
  if (!webAuthEndpoint || !signingKey) {
    throw new Error(`${domain}'s stellar.toml is missing WEB_AUTH_ENDPOINT or SIGNING_KEY (SEP-10 is required)`);
  }
  if (!transferServerSep24 && !transferServerSep6) {
    throw new Error(`${domain}'s stellar.toml advertises no TRANSFER_SERVER_SEP0024 or TRANSFER_SERVER`);
  }
  const currencies = ((parsed.CURRENCIES as Array<Record<string, unknown>> | undefined) ?? [])
    .filter((c) => typeof c.code === 'string' && typeof c.issuer === 'string')
    .map((c) => ({ code: c.code as string, issuer: c.issuer as string }));
  const accounts = Array.isArray(parsed.ACCOUNTS) ? parsed.ACCOUNTS.filter((a): a is string => typeof a === 'string') : [];
  const doc = parsed.DOCUMENTATION as Record<string, unknown> | undefined;
  return {
    webAuthEndpoint,
    signingKey,
    ...(transferServerSep24 ? { transferServerSep24 } : {}),
    ...(transferServerSep6 ? { transferServerSep6 } : {}),
    currencies,
    accounts,
    ...(str(parsed.NETWORK_PASSPHRASE) ? { networkPassphrase: str(parsed.NETWORK_PASSPHRASE) } : {}),
    ...(str(doc?.ORG_NAME) ? { orgName: str(doc?.ORG_NAME) } : {}),
  };
}

export async function fetchAnchorToml(domain: string, timeoutMs = 20_000): Promise<StellarTomlInfo> {
  const url = `https://${domain}/.well-known/stellar.toml`;
  // `Accept: text/plain` gets a 406 from testanchor.stellar.org (real, only
  // caught by actually running this against the network) — `*/*` is what
  // every stellar.toml server actually expects a plain GET to send.
  const res = await fetch(url, { headers: { Accept: '*/*' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`Failed to fetch stellar.toml from ${url}: HTTP ${res.status}`);
  }
  return parseAnchorToml(domain, await res.text());
}
