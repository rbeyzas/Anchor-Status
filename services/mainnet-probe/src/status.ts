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
    /** Each stage reached, in order, with its time: what a wallet waited. */
    stages?: Array<{ stage: StageName; ok: boolean; ms?: number; policy?: boolean }>;
    /** The stages its own toml says a full check reaches. */
    stages_expected?: StageName[];
    /** Total time on the anchor's API, in seconds. */
    settlement_seconds?: number;
  };
  /** The assets its stellar.toml lists, each with whether the anchor
   * issues it (the issuer's home_domain points back at it). */
  assets?: AssetStatus[];
  /** Its operator: transfer server and signing key (see aliases.ts). */
  operator?: string;
  /** Another tracked anchor with the same operator, which is measured and
   * scored in its place. */
  alias_of?: string;
}

export interface StatusFile {
  generated_at: string;
  anchors: Record<string, AnchorStatus>;
}

export function loadStatus(filePath: string): StatusFile | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StatusFile;
}

const STAGE_ORDER: StageName[] = ['toml', 'info', 'challenge', 'token', 'initiate'];

/** Builds the status for every tracked anchor. Anchors skipped this round
 * (dormant, not due) keep their previous probe verdict. */
export function buildStatus(
  anchors: MainnetAnchor[],
  results: MainnetProbeResult[],
  previous: StatusFile | null,
  now: Date,
  isDormant: (a: MainnetAnchor) => boolean,
  assets: Map<string, AssetStatus[]> = new Map(),
  operators: Map<string, string> = new Map(),
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
            stages: STAGE_ORDER.flatMap((stage) => {
              const s = r.stages[stage];
              return s
                ? [{ stage, ok: s.ok, ...(s.ms !== undefined ? { ms: s.ms } : {}), ...(s.policy ? { policy: true } : {}) }]
                : [];
            }),
            ...(r.stages_expected ? { stages_expected: r.stages_expected } : {}),
            settlement_seconds: r.settlement_seconds,
          }
        : previous?.anchors[a.anchor_id]?.last_probe,
    };
    const listed = assets.get(a.anchor_id) ?? previous?.anchors[a.anchor_id]?.assets;
    if (listed) out.anchors[a.anchor_id].assets = listed;
    const operator = operators.get(a.anchor_id) ?? previous?.anchors[a.anchor_id]?.operator;
    if (operator) out.anchors[a.anchor_id].operator = operator;
    const aliasOf = previous?.anchors[a.anchor_id]?.alias_of;
    if (aliasOf) out.anchors[a.anchor_id].alias_of = aliasOf;
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
