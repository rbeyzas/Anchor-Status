import type { AnchorStatusView, AnchorViewModel } from './types';

/** Latest mainnet-probe verdict per anchor, published by the collector next
 * to the history archive. Fetched server-side for the same reason: it is
 * plain HTTP on the collector host. */
const STATUS_URL = process.env.ANCHOR_STATUS_URL ?? '';
const FETCH_TIMEOUT_MS = Number(process.env.HISTORY_FETCH_TIMEOUT_MS ?? '5000');

interface LastProbe {
  timestamp: string;
  success: boolean;
  inconclusive?: boolean;
  failed_stage?: string;
  error?: string;
  policy: string[];
}

interface StatusAsset {
  code: string;
  issuer?: string;
  issuer_home_domain_matches?: boolean;
  issuer_created_at?: string;
}

interface StatusFile {
  generated_at: string;
  anchors: Record<string, { listing?: 'abandoned' | 'unsafe'; dormant: boolean; last_probe?: LastProbe; assets?: StatusAsset[] }>;
}

/** The assets it issues itself, and when its oldest issuer account was
 * created. Age is context only: it never enters the score. */
export function issuedAssets(assets: StatusAsset[] | undefined): { issuedAssets?: string[]; onChainSince?: string } {
  const issued = (assets ?? []).filter((a) => a.issuer && a.issuer_home_domain_matches === true);
  if (issued.length === 0) return {};
  const created = issued.flatMap((a) => (a.issuer_created_at ? [a.issuer_created_at] : [])).sort();
  return { issuedAssets: [...new Set(issued.map((a) => a.code))], ...(created.length ? { onChainSince: created[0] } : {}) };
}

export async function fetchAnchorStatus(): Promise<StatusFile | null> {
  if (!STATUS_URL) return null;
  try {
    const res = await fetch(STATUS_URL, { // Cached with the page; `no-store` would force every request dynamic.
      next: { revalidate: 60 }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = (await res.json()) as StatusFile;
    if (typeof parsed?.anchors !== 'object' || parsed.anchors === null) throw new Error('unrecognized status format');
    return parsed;
  } catch (err) {
    // An enrichment, like the archive: the dashboard renders without it.
    console.warn(`[dashboard] anchor status unavailable (${STATUS_URL}):`, (err as Error).message);
    return null;
  }
}

/** Plain-language cause of a failed check, from the stage it failed at. */
export function describeProblem(probe: LastProbe | undefined): string | undefined {
  if (!probe || probe.success || probe.inconclusive) return undefined;
  const error = probe.error ?? '';
  const missing = /HTTP 40[4]|HTTP 410/.test(error);
  switch (probe.failed_stage) {
    case 'toml':
      return /no longer advertises/.test(error)
        ? 'No SEP-6/24 transfer service in its stellar.toml'
        : 'stellar.toml unreachable';
    case 'info':
      return 'Transfer server not answering';
    case 'challenge':
      return missing ? 'SEP-10 sign-in endpoint missing (404)' : 'SEP-10 sign-in failing';
    case 'token':
      return 'SEP-10 sign-in failing (server error)';
    case 'initiate':
      return missing ? 'Deposit endpoint missing (404)' : 'Deposit start failing';
    case 'timeout':
      return 'No answer within the time limit';
    default:
      return 'Last check failed';
  }
}

export function policyNote(probe: LastProbe | undefined): string | undefined {
  if (!probe?.success || probe.policy.length === 0) return undefined;
  return probe.policy.includes('challenge') || probe.policy.includes('token')
    ? 'Serves registered wallets only'
    : 'Requires a funded or verified account to start a deposit';
}

export function mergeStatusInto(anchors: AnchorViewModel[], status: StatusFile | null): AnchorViewModel[] {
  if (!status) return anchors;
  return anchors.map((anchor) => {
    const s = status.anchors[anchor.anchorId];
    if (!s) return anchor;
    const view: AnchorStatusView = {
      ...(s.listing ? { listing: s.listing } : {}),
      dormant: s.dormant,
      ...(s.last_probe
        ? {
            checkedAt: s.last_probe.timestamp,
            reachable: s.last_probe.inconclusive ? undefined : s.last_probe.success,
            problem: describeProblem(s.last_probe),
            policyNote: policyNote(s.last_probe),
          }
        : {}),
      ...issuedAssets(s.assets),
    };
    return { ...anchor, status: view };
  });
}
