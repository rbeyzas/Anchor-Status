import { parse as parseToml } from 'smol-toml';
import { sha256Hex } from './evidence.js';
import { timedFetch, type Fetch, type Timed } from './http.js';

/** One `[[CURRENCIES]]` entry, as the anchor declares it. */
export interface TomlCurrency {
  code: string;
  issuer?: string;
  /** SEP-1: fiat, crypto, nft, stock, bond, commodity, realestate, other. */
  anchor_asset_type?: string;
  /** What the token represents, e.g. an ISO 4217 code for a fiat asset. */
  anchor_asset?: string;
  is_asset_anchored?: boolean;
}

export interface AnchorToml {
  orgName?: string;
  webAuthEndpoint?: string;
  signingKey?: string;
  sep24?: string;
  sep6?: string;
  sep31?: string;
  currencies: TomlCurrency[];
}

function parseCurrencies(value: unknown): TomlCurrency[] {
  if (!Array.isArray(value)) return [];
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return value.flatMap((c: Record<string, unknown>) => {
    const code = text(c?.code);
    if (!code) return [];
    const issuer = text(c.issuer);
    const type = text(c.anchor_asset_type);
    const anchorAsset = text(c.anchor_asset);
    return [
      {
        code,
        ...(issuer ? { issuer } : {}),
        ...(type ? { anchor_asset_type: type.toLowerCase() } : {}),
        ...(anchorAsset ? { anchor_asset: anchorAsset } : {}),
        ...(typeof c.is_asset_anchored === 'boolean' ? { is_asset_anchored: c.is_asset_anchored } : {}),
      },
    ];
  });
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
    currencies: parseCurrencies(t.CURRENCIES),
  };
}

export async function fetchAnchorToml(
  fetchImpl: Fetch,
  domain: string,
  timeoutMs: number,
): Promise<Timed<AnchorToml> & { sha256: string; cors: boolean }> {
  // `Accept: text/plain` gets a 406 from some anchors; */* is what toml
  // servers actually expect (see testnet-probe/src/toml.ts).
  const { value: res, ms } = await timedFetch(
    fetchImpl,
    `https://${domain}/.well-known/stellar.toml`,
    { headers: { Accept: '*/*' } },
    timeoutMs,
  );
  const text = await res.text();
  // SEP-1 requires the header so that browser wallets can read the file.
  const cors = res.headers.has('access-control-allow-origin');
  return { value: parseAnchorToml(text), ms, sha256: sha256Hex(text), cors };
}

export const offersTransfer = (t: AnchorToml) => Boolean(t.sep24 || t.sep6);
