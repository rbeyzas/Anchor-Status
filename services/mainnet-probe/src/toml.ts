import { parse as parseToml } from 'smol-toml';
import { sha256Hex } from './evidence.js';
import { timedFetch, type Fetch, type Timed } from './http.js';

export interface AnchorToml {
  orgName?: string;
  webAuthEndpoint?: string;
  signingKey?: string;
  sep24?: string;
  sep6?: string;
  sep31?: string;
}

export function parseAnchorToml(text: string): AnchorToml {
  const t = parseToml(text) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\/$/, '') : undefined);
  const doc = t.DOCUMENTATION as Record<string, unknown> | undefined;
  return {
    orgName: str(doc?.ORG_NAME),
    webAuthEndpoint: str(t.WEB_AUTH_ENDPOINT),
    signingKey: str(t.SIGNING_KEY),
    sep24: str(t.TRANSFER_SERVER_SEP0024),
    sep6: str(t.TRANSFER_SERVER),
    sep31: str(t.DIRECT_PAYMENT_SERVER),
  };
}

export async function fetchAnchorToml(
  fetchImpl: Fetch,
  domain: string,
  timeoutMs: number,
): Promise<Timed<AnchorToml> & { sha256: string }> {
  // `Accept: text/plain` gets a 406 from some anchors; */* is what toml
  // servers actually expect (see testnet-probe/src/toml.ts).
  const { value: res, ms } = await timedFetch(
    fetchImpl,
    `https://${domain}/.well-known/stellar.toml`,
    { headers: { Accept: '*/*' } },
    timeoutMs,
  );
  const text = await res.text();
  return { value: parseAnchorToml(text), ms, sha256: sha256Hex(text) };
}

export const offersTransfer = (t: AnchorToml) => Boolean(t.sep24 || t.sep6);
