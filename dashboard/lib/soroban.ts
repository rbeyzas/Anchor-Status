import { contract, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { stroopsToXlm } from './format';
import { fetchAnchorStatus, mergeStatusInto } from './anchor-status';
import { fetchArchive, mergeArchiveInto } from './history';
import type { AnchorHealth, AnchorViewModel, DashboardData, RiskReason, ScorePoint, SourceType, Trend, UnreadableAnchor } from './types';

const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015';
const REGISTRY_CONTRACT_ID = process.env.NEXT_PUBLIC_ANCHOR_REGISTRY_CONTRACT_ID ?? '';
const ORACLE_CONTRACT_ID = process.env.NEXT_PUBLIC_PERFORMANCE_ORACLE_CONTRACT_ID ?? '';
// Any funded testnet account works here — it's only used as the (unsigned)
// source account for read-only simulation, never to sign or submit anything.
const READER_PUBLIC_KEY = process.env.NEXT_PUBLIC_READER_PUBLIC_KEY ?? '';

// getEvents' own range-validation error ("startLedger must be within the
// ledger range: X - Y") advertises a long window — on the public
// soroban-testnet.stellar.org RPC this has been observed at ~7 days'
// worth of ledgers (~121,000). That number describes how long raw ledger
// metadata is retained, NOT how far back the event index actually serves
// queries: empirically (tested directly against this RPC), a startLedger
// more than ~10,000-12,000 ledgers behind the tip silently returns zero
// events — no error, it just never finds anything — while the same
// filters against a more recent startLedger return real results. So
// rather than aiming for the advertised retention window (which always
// undershoots into that dead zone and returns nothing), we deliberately
// ask for a much shorter, empirically-safe window instead.
const MAX_QUERYABLE_LEDGERS_BACK = 9_000; // ~12-13 hours (at ~5s/ledger); stays clear of the ~10-12k dead zone above

const LEDGER_RANGE_ERROR = /ledger range:\s*(\d+)\s*-\s*(\d+)/i;

/** Calls `getEvents` with an explicit `startLedger`, and if it fails
 * because our guessed `startLedger` is older than the RPC's actual
 * retention window, retries once with the real minimum valid ledger
 * parsed out of the error message. */
async function getEventsWithRetentionFallback(
  server: rpc.Server,
  startLedger: number,
  filters: rpc.Api.EventFilter[],
  limit: number,
): ReturnType<rpc.Server['getEvents']> {
  try {
    return await server.getEvents({ startLedger, filters, limit });
  } catch (err) {
    const match = LEDGER_RANGE_ERROR.exec((err as Error).message ?? String(err));
    if (!match) throw err;
    // The reported minimum is the oldest ledger already pruned (exclusive) —
    // retrying with it as-is gets the exact same "must be within the ledger
    // range" error back (confirmed against the live RPC), so use min + 1.
    const minStartLedger = Number(match[1]) + 1;
    return server.getEvents({ startLedger: minStartLedger, filters, limit });
  }
}

function assertLiveConfigPresent() {
  if (!REGISTRY_CONTRACT_ID || !ORACLE_CONTRACT_ID || !READER_PUBLIC_KEY) {
    throw new Error(
      'Missing NEXT_PUBLIC_ANCHOR_REGISTRY_CONTRACT_ID / NEXT_PUBLIC_PERFORMANCE_ORACLE_CONTRACT_ID / NEXT_PUBLIC_READER_PUBLIC_KEY',
    );
  }
}

async function getRegistryClient(): Promise<contract.Client> {
  return contract.Client.from({
    contractId: REGISTRY_CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: READER_PUBLIC_KEY,
  });
}

async function getOracleClient(): Promise<contract.Client> {
  return contract.Client.from({
    contractId: ORACLE_CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: READER_PUBLIC_KEY,
  });
}

interface RawAnchorInfo {
  name: string;
  domain: string;
  source_type: { tag: SourceType };
  operator: string;
  stake: bigint;
  score: number;
  registered_at: bigint;
  last_updated: bigint;
}

/** Every `report_submitted` event in the queryable window, grouped by
 * anchor — one paginated query for all anchors instead of one per anchor,
 * which with ~100 anchors meant ~100 extra RPC calls per page view. */
async function fetchAllScoreHistory(server: rpc.Server): Promise<Map<string, ScorePoint[]>> {
  const latest = await server.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - MAX_QUERYABLE_LEDGERS_BACK);
  const filters: rpc.Api.EventFilter[] = [
    {
      type: 'contract',
      contractIds: [ORACLE_CONTRACT_ID],
      topics: [[xdr.ScVal.scvSymbol('report_submitted').toXDR('base64'), '*']],
    },
  ];

  const byAnchor = new Map<string, ScorePoint[]>();
  let response = await getEventsWithRetentionFallback(server, startLedger, filters, 1000);
  for (let page = 0; page < 20; page++) {
    for (const event of response.events) {
      const anchorId = event.topic[1] ? String(scValToNative(event.topic[1])) : undefined;
      if (!anchorId) continue;
      const data = scValToNative(event.value) as { new_score: number; evidence?: Uint8Array | null };
      const points = byAnchor.get(anchorId) ?? [];
      const evidence = data.evidence ? Buffer.from(data.evidence).toString('hex') : undefined;
      points.push({ timestamp: event.ledgerClosedAt, score: Number(data.new_score), ...(evidence ? { evidence } : {}) });
      byAnchor.set(anchorId, points);
    }
    if (response.events.length < 1000 || !response.cursor) break;
    response = await server.getEvents({ cursor: response.cursor, filters, limit: 1000 });
  }
  for (const points of byAnchor.values()) points.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return byAnchor;
}

interface RawAnchorHealth {
  trend: { tag: Trend };
  risk_reason: { tag: RiskReason };
  consecutive_failures: number;
  recent_outcomes: number;
  recent_count: number;
  observations: bigint;
}

/** Reads the oracle's trend/risk record. Returns undefined against an
 * oracle deployed before health tracking existed (no get_health). */
async function fetchHealth(oracle: contract.Client, anchorId: string): Promise<AnchorHealth | undefined> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (oracle as any).get_health !== 'function') return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (await (oracle as any).get_health({ anchor_id: anchorId })).result as RawAnchorHealth;
    const count = Number(raw.recent_count);
    const mask = count >= 32 ? 0xffffffff : (1 << count) - 1;
    const successes = (Number(raw.recent_outcomes) & mask).toString(2).split('').filter((b) => b === '1').length;
    return {
      trend: raw.trend.tag,
      riskReason: raw.risk_reason.tag,
      consecutiveFailures: Number(raw.consecutive_failures),
      recentSuccessPercent: count === 0 ? 100 : Math.floor((successes * 100) / count),
      recentCount: count,
      observations: Number(raw.observations),
    };
  } catch (err) {
    console.warn(`[dashboard] failed to fetch health for ${anchorId}:`, err);
    return undefined;
  }
}

/** One retry after a short pause: public RPC nodes shed load with the
 * occasional 429/5xx, which is not a reason to call an anchor unreadable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withRetry<T = any>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 750));
    return fn();
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function fetchAnchor(
  registry: contract.Client,
  oracle: contract.Client,
  anchorId: string,
  history: ScorePoint[],
): Promise<AnchorViewModel> {
  // get_anchor_info returns Result<AnchorInfo, Error> on the contract side,
  // so the JS client wraps a success as `{ value: AnchorInfo }`. Its `score`
  // is the one the oracle pushes on every report, so no get_score call.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const info = (await withRetry(() => (registry as any).get_anchor_info({ anchor_id: anchorId }))).result
    .value as RawAnchorInfo;
  const health = await fetchHealth(oracle, anchorId);
  const score = Number(info.score);
  const lastUpdated = new Date(Number(info.last_updated) * 1000).toISOString();

  return {
    anchorId,
    name: info.name,
    domain: info.domain,
    sourceType: info.source_type.tag,
    stake: stroopsToXlm(info.stake),
    score,
    scoreHistory: history.length > 0 ? history : [{ timestamp: lastUpdated, score }],
    // Only the previous oracle slashed; its events come from the archive.
    slashEvents: [],
    lastUpdated,
    health,
  };
}

async function fetchLiveDashboardData(): Promise<{ anchors: AnchorViewModel[]; unreadable: UnreadableAnchor[] }> {
  assertLiveConfigPresent();
  const server = new rpc.Server(RPC_URL);
  const registry = await getRegistryClient();
  const oracle = await getOracleClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listTx = await withRetry(() => (registry as any).list_anchors());
  const anchorIds = listTx.result as string[];
  const history = await fetchAllScoreHistory(server).catch((err) => {
    console.warn('[dashboard] failed to fetch score history:', err);
    return new Map<string, ScorePoint[]>();
  });

  // A failure reading one anchor affects that anchor only.
  const results = await mapWithConcurrency(anchorIds, 8, async (id) => {
    try {
      return { ok: true as const, anchor: await fetchAnchor(registry, oracle, id, history.get(id) ?? []) };
    } catch (err) {
      return { ok: false as const, unreadable: { anchorId: id, error: (err as Error).message.split('\n')[0] } };
    }
  });
  return {
    anchors: results.flatMap((r) => (r.ok ? [r.anchor] : [])),
    unreadable: results.flatMap((r) => (r.ok ? [] : [r.unreadable])),
  };
}

/** Reads the contracts from Soroban RPC. There is no fallback data: if the
 * chain can't be read, the page says so and shows nothing, rather than
 * anything that looks like a real score but isn't. */
export async function getDashboardData(): Promise<DashboardData> {
  try {
    const [live, archive, status] = await Promise.all([fetchLiveDashboardData(), fetchArchive(), fetchAnchorStatus()]);
    if (live.anchors.length === 0 && live.unreadable.length > 0) {
      throw new Error(`could not read any of the ${live.unreadable.length} registered anchors`);
    }
    return {
      anchors: mergeStatusInto(mergeArchiveInto(live.anchors, archive), status),
      unreadable: live.unreadable,
      dataSource: 'live',
    };
  } catch (err) {
    return { anchors: [], unreadable: [], dataSource: 'unavailable', liveError: (err as Error).message.split('\n')[0] };
  }
}
