import { contract, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { stroopsToXlm } from './format';
import { fetchAnchorStatus, mergeStatusInto } from './anchor-status';
import { fetchArchive, mergeArchiveInto } from './history';
import { MOCK_ANCHORS } from './mock-data';
import type { AnchorHealth, AnchorViewModel, DashboardData, RiskReason, ScorePoint, SlashEvent, SourceType, Trend } from './types';

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

async function fetchScoreHistory(server: rpc.Server, anchorId: string): Promise<ScorePoint[]> {
  const latest = await server.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - MAX_QUERYABLE_LEDGERS_BACK);

  const topicSymbol = xdr.ScVal.scvSymbol('report_submitted').toXDR('base64');
  const topicAnchorId = xdr.ScVal.scvSymbol(anchorId).toXDR('base64');

  try {
    const response = await getEventsWithRetentionFallback(
      server,
      startLedger,
      [
        {
          type: 'contract',
          contractIds: [ORACLE_CONTRACT_ID],
          topics: [[topicSymbol, topicAnchorId]],
        },
      ],
      1000,
    );

    return response.events
      .map((event) => {
        const data = scValToNative(event.value) as { new_score: number };
        return { timestamp: event.ledgerClosedAt, score: Number(data.new_score) };
      })
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch (err) {
    console.warn(`[dashboard] failed to fetch score history for ${anchorId}:`, err);
    return [];
  }
}

async function fetchSlashEvents(server: rpc.Server, anchorId: string): Promise<SlashEvent[]> {
  const latest = await server.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - MAX_QUERYABLE_LEDGERS_BACK);

  const topicSymbol = xdr.ScVal.scvSymbol('slash').toXDR('base64');
  const topicAnchorId = xdr.ScVal.scvSymbol(anchorId).toXDR('base64');

  try {
    const response = await getEventsWithRetentionFallback(
      server,
      startLedger,
      [
        {
          type: 'contract',
          contractIds: [REGISTRY_CONTRACT_ID],
          topics: [[topicSymbol, topicAnchorId]],
        },
      ],
      1000,
    );

    return response.events.flatMap((event) => {
      // SlashEvent has named fields (amount, reason), so this is an object,
      // not a [amount, reason] tuple — reading index 0 yielded undefined and
      // rendered the slash amount as NaN.
      const data = scValToNative(event.value) as { amount?: bigint } | [bigint, string];
      const amount = Array.isArray(data) ? data[0] : data?.amount;
      if (typeof amount !== 'bigint' && typeof amount !== 'number') return [];
      return [{ timestamp: event.ledgerClosedAt, amount: stroopsToXlm(amount) }];
    });
  } catch (err) {
    console.warn(`[dashboard] failed to fetch slash events for ${anchorId}:`, err);
    return [];
  }
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

async function fetchAnchor(
  server: rpc.Server,
  registry: contract.Client,
  oracle: contract.Client,
  anchorId: string,
): Promise<AnchorViewModel> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoTx = await (registry as any).get_anchor_info({ anchor_id: anchorId });
  // get_anchor_info returns Result<AnchorInfo, Error> on the contract side,
  // so the JS client wraps a success as `{ value: AnchorInfo }` rather than
  // unwrapping it the way it does for a plain (non-Result) return type.
  const info = infoTx.result.value as RawAnchorInfo;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoreTx = await (oracle as any).get_score({ anchor_id: anchorId });
  const currentScore = Number(scoreTx.result);

  const [scoreHistory, slashEvents, health] = await Promise.all([
    fetchScoreHistory(server, anchorId),
    fetchSlashEvents(server, anchorId),
    fetchHealth(oracle, anchorId),
  ]);

  return {
    anchorId,
    name: info.name,
    domain: info.domain,
    sourceType: info.source_type.tag,
    stake: stroopsToXlm(info.stake),
    score: currentScore,
    scoreHistory:
      scoreHistory.length > 0
        ? scoreHistory
        : [{ timestamp: new Date(Number(info.last_updated) * 1000).toISOString(), score: currentScore }],
    slashEvents,
    lastUpdated: new Date(Number(info.last_updated) * 1000).toISOString(),
    health,
  };
}

async function fetchLiveDashboardData(): Promise<AnchorViewModel[]> {
  assertLiveConfigPresent();
  const server = new rpc.Server(RPC_URL);
  const registry = await getRegistryClient();
  const oracle = await getOracleClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listTx = await (registry as any).list_anchors();
  // "testanc" is a leftover placeholder from initial contract deployment
  // (domain example.com, never reported on) — AnchorRegistry has no
  // unregister function, so it's filtered out here instead.
  const anchorIds = (listTx.result as string[]).filter((id) => id !== 'testanc');

  return Promise.all(anchorIds.map((id) => fetchAnchor(server, registry, oracle, id)));
}

/** Tries a live testnet read; falls back to a deterministic mock fixture
 * (with dataSource: 'mock') if config is missing or the RPC call fails —
 * e.g. before contracts are deployed, or in an environment without
 * network access to soroban-testnet.stellar.org. */
export async function getDashboardData(): Promise<DashboardData> {
  try {
    const [anchors, archive, status] = await Promise.all([
      fetchLiveDashboardData(),
      fetchArchive(),
      fetchAnchorStatus(),
    ]);
    if (anchors.length === 0) {
      throw new Error('AnchorRegistry.list_anchors() returned no anchors');
    }
    // The archive carries history older than the RPC's ~12h event window.
    return { anchors: mergeStatusInto(mergeArchiveInto(anchors, archive), status), dataSource: 'live' };
  } catch (err) {
    return {
      anchors: MOCK_ANCHORS,
      dataSource: 'mock',
      liveError: (err as Error).message,
    };
  }
}
