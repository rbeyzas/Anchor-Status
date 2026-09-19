import fs from 'node:fs';
import path from 'node:path';
import type { Listing, MainnetAnchor } from './anchors.js';
import type { AssetStatus } from './issuers.js';
import type { MainnetProbeResult, StageName } from './probe.js';

export interface AnchorStatus {
  domain: string;
  listing?: Listing;
  /** Not seen answering for a week; probed every few hours instead of every round. */
  dormant: boolean;
  last_probe?: {
    timestamp: string;
    success: boolean;
    inconclusive?: boolean;
    failed_stage?: string;
    error?: string;
    /** Stages the anchor declined by policy (e.g. registered wallets only). */
    policy: StageName[];
  };
  /** The assets its stellar.toml lists, each with whether the anchor
   * issues it (the issuer's home_domain points back at it). */
  assets?: AssetStatus[];
}

export interface StatusFile {
  generated_at: string;
  anchors: Record<string, AnchorStatus>;
}

export function loadStatus(filePath: string): StatusFile | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StatusFile;
}

/** Builds the status for every tracked anchor. Anchors skipped this round
 * (dormant, not due) keep their previous probe verdict. */
export function buildStatus(
  anchors: MainnetAnchor[],
  results: MainnetProbeResult[],
  previous: StatusFile | null,
  now: Date,
  isDormant: (a: MainnetAnchor) => boolean,
  assets: Map<string, AssetStatus[]> = new Map(),
): StatusFile {
  const byId = new Map(results.map((r) => [r.anchor_id, r]));
  const out: StatusFile = { generated_at: now.toISOString(), anchors: {} };
  for (const a of anchors) {
    const r = byId.get(a.anchor_id);
    out.anchors[a.anchor_id] = {
      domain: a.domain,
      ...(a.listing ? { listing: a.listing } : {}),
      dormant: isDormant(a),
      last_probe: r
        ? {
            timestamp: r.timestamp,
            success: r.success,
            ...(r.inconclusive ? { inconclusive: true } : {}),
            ...(r.failed_stage ? { failed_stage: r.failed_stage } : {}),
            ...(r.error ? { error: r.error.slice(0, 300) } : {}),
            policy: (Object.entries(r.stages) as [StageName, { policy?: boolean }][])
              .filter(([, s]) => s?.policy)
              .map(([k]) => k),
          }
        : previous?.anchors[a.anchor_id]?.last_probe,
    };
    const listed = assets.get(a.anchor_id) ?? previous?.anchors[a.anchor_id]?.assets;
    if (listed) out.anchors[a.anchor_id].assets = listed;
  }
  return out;
}

export function saveStatus(filePath: string, status: StatusFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(status, null, 2));
  fs.renameSync(tmp, filePath);
}

/** Last probe time per anchor, from the status file. */
export function lastProbedAt(status: StatusFile | null, anchorId: string): number {
  const ts = status?.anchors[anchorId]?.last_probe?.timestamp;
  return ts ? Date.parse(ts) : 0;
}
