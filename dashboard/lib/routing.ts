import type { AnchorViewModel } from './types';

/** Must match `SLASH_THRESHOLD` in contracts/performance-oracle/src/scoring.rs:
 * an anchor the oracle would slash is never offered to a user. */
export const MIN_ROUTABLE_SCORE = 55;

/** An anchor that can actually move money on testnet for the user: where its
 * SEP-1 stellar.toml lives and which asset it deposits/withdraws. */
export interface RampAnchorConfig {
  anchorId: string;
  /** Domain serving /.well-known/stellar.toml (SEP-1). */
  domain: string;
  /** Asset code the anchor delivers on-chain (e.g. a TRY stablecoin). */
  assetCode: string;
  /** Fiat currency the user pays in / receives. */
  fiat: string;
}

const DEFAULT_RAMP_ANCHORS: RampAnchorConfig[] = [
  { anchorId: 'stellar_test_anchor', domain: 'testanchor.stellar.org', assetCode: 'SRT', fiat: 'TRY' },
];

/** `NEXT_PUBLIC_RAMP_ANCHORS` (JSON array of RampAnchorConfig) lets a new
 * TRY anchor be plugged in without a code change. */
export function loadRampAnchors(raw: string | undefined = process.env.NEXT_PUBLIC_RAMP_ANCHORS): RampAnchorConfig[] {
  if (!raw) return DEFAULT_RAMP_ANCHORS;
  try {
    const parsed = JSON.parse(raw) as RampAnchorConfig[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_RAMP_ANCHORS;
  } catch {
    return DEFAULT_RAMP_ANCHORS;
  }
}

export interface RouteCandidate {
  anchor: AnchorViewModel;
  config: RampAnchorConfig;
  eligible: boolean;
  /** Human-readable reason, shown to the user when not eligible. */
  reason?: string;
}

/** Joins on-chain scores with the ramp-capable anchors and ranks them:
 * eligible anchors first, by score (then stake) descending. Anchors that
 * have no on-chain record are not offered at all — an unscored anchor is
 * exactly what this product exists to avoid. */
export function rankRoutes(anchors: AnchorViewModel[], configs: RampAnchorConfig[]): RouteCandidate[] {
  const byId = new Map(anchors.map((a) => [a.anchorId, a]));
  const candidates: RouteCandidate[] = [];
  for (const config of configs) {
    const anchor = byId.get(config.anchorId);
    if (!anchor) continue;
    const eligible = anchor.score >= MIN_ROUTABLE_SCORE;
    candidates.push({
      anchor,
      config,
      eligible,
      reason: eligible
        ? undefined
        : `Reliability score ${anchor.score}/100 is below the safe minimum of ${MIN_ROUTABLE_SCORE}`,
    });
  }
  return candidates.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (b.anchor.score !== a.anchor.score) return b.anchor.score - a.anchor.score;
    return b.anchor.stake - a.anchor.stake;
  });
}
