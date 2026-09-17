import { parse as parseToml } from 'smol-toml';
import type { StellarTomlInfo } from './types.js';

export async function fetchAnchorToml(domain: string): Promise<StellarTomlInfo> {
  const url = `https://${domain}/.well-known/stellar.toml`;
  // `Accept: text/plain` gets a 406 from testanchor.stellar.org (real, only
  // caught by actually running this against the network) — `*/*` is what
  // every stellar.toml server actually expects a plain GET to send.
  const res = await fetch(url, { headers: { Accept: '*/*' } });
  if (!res.ok) {
    throw new Error(`Failed to fetch stellar.toml from ${url}: HTTP ${res.status}`);
  }
  const parsed = parseToml(await res.text()) as Record<string, unknown>;

  const webAuthEndpoint = parsed.WEB_AUTH_ENDPOINT as string | undefined;
  const signingKey = parsed.SIGNING_KEY as string | undefined;
  const transferServerSep24 = parsed.TRANSFER_SERVER_SEP0024 as string | undefined;

  if (!webAuthEndpoint || !signingKey || !transferServerSep24) {
    throw new Error(
      `${domain}'s stellar.toml is missing WEB_AUTH_ENDPOINT, SIGNING_KEY, or TRANSFER_SERVER_SEP0024 (required for a SEP-10 + SEP-24 probe)`,
    );
  }

  const currencies = ((parsed.CURRENCIES as Array<Record<string, unknown>> | undefined) ?? [])
    .filter((c) => typeof c.code === 'string' && typeof c.issuer === 'string')
    .map((c) => ({ code: c.code as string, issuer: c.issuer as string }));

  return { webAuthEndpoint, signingKey, transferServerSep24, currencies };
}
