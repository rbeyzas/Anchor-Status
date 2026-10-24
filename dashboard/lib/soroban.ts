import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { stroopsToXlm } from './format';
import { fetchAnchorStatus, mergeStatusInto } from './anchor-status';
import { fetchImportedAnchorIds, mergeImportedInto } from './onboarding-server';
import { fetchArchive, mergeArchiveInto } from './history';
import {
  anchorAtKey,
  anchorInfoKey,
  cardKey,
  decodeAnchorAt,
  decodeAnchorInfo,
  decodeCard,
  decodeDispute,
  decodeHealth,
  decodeLifecycle,
  decodeQuorum,
  decodeRound,
  disputeKey,
  healthKey,
  instanceKey,
  keyId,
  lifecycleKey,
  NEW_HEALTH,
  quorumKey,
  readQuorumThreshold,
  readRegistryIndex,
  roundKey,
} from './contract-state';
import { createRpcPool, type RpcPool } from './rpc';
import { fetchScoreSummary, mergeCardContext } from './score-summary';
import type { AnchorViewModel, DashboardData, ScorePoint, UnreadableAnchor } from './types';

const REGISTRY_CONTRACT_ID = process.env.NEXT_PUBLIC_ANCHOR_REGISTRY_CONTRACT_ID ?? '';
const ORACLE_CONTRACT_ID = process.env.NEXT_PUBLIC_PERFORMANCE_ORACLE_CONTRACT_ID ?? '';

// Score history covers the public RPC's full event retention: 7 days. A
// backup provider may keep more, but the page stays on the same window
// whichever node answers.
const HISTORY_LEDGERS = 120_960;
// getEvents scans roughly 10,000 ledgers per call. A range with no
// matching event comes back empty with a cursor to continue from, so the
// window is split into ranges of that size and read in parallel instead
// of walked one cursor at a time (7 days: ~4s instead of ~23s).
const EVENT_RANGE_LEDGERS = 10_000;
// getLedgerEntries accepts at most 200 keys per call.
const LEDGER_ENTRIES_BATCH = 200;

function assertLiveConfigPresent() {
  if (!REGISTRY_CONTRACT_ID || !ORACLE_CONTRACT_ID) {
    throw new Error('Missing NEXT_PUBLIC_ANCHOR_REGISTRY_CONTRACT_ID / NEXT_PUBLIC_PERFORMANCE_ORACLE_CONTRACT_ID');
  }
}

/** The ledger a getEvents cursor points at (its TOID's high 32 bits). */
export function cursorLedger(cursor: string): number {
  return Number(BigInt(cursor.split('-')[0]) >> 32n);
}

/** Splits [start, end) into consecutive ranges of at most `size` ledgers. */
export function ledgerRanges(start: number, end: number, size: number): [number, number][] {
  const ranges: [number, number][] = [];
  for (let from = start; from < end; from += size) ranges.push([from, Math.min(from + size, end)]);
  return ranges;
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

/** Every `report_submitted` event of the last 7 days, grouped by anchor. */
async function fetchAllScoreHistory(pool: RpcPool): Promise<Map<string, ScorePoint[]>> {
  const health = await pool.call((s) => s.getHealth());
  const end = health.latestLedger + 1;
  const start = Math.max(health.oldestLedger + 1, end - HISTORY_LEDGERS);
  const filters: rpc.Api.EventFilter[] = [
    {
      type: 'contract',
      contractIds: [ORACLE_CONTRACT_ID],
      topics: [[xdr.ScVal.scvSymbol('report_submitted').toXDR('base64'), '*']],
    },
  ];

  // Each range is read to its end, then cut at it: cursor pages cannot
  // carry an endLedger, so the last page may run into the next range.
  const ranges = await mapWithConcurrency(ledgerRanges(start, end, EVENT_RANGE_LEDGERS), 16, async ([from, to]) => {
    const events: rpc.Api.EventResponse[] = [];
    let page = await pool.call((s) => s.getEvents({ startLedger: from, endLedger: to, filters, limit: 1000 }));
    for (let calls = 1; ; calls++) {
      events.push(...page.events.filter((e) => e.ledger < to));
      const reachedEnd =
        !page.cursor || cursorLedger(page.cursor) >= to - 1 || page.events.some((e) => e.ledger >= to);
      if (reachedEnd || calls >= 50) break;
      const cursor = page.cursor;
      page = await pool.call((s) => s.getEvents({ cursor, filters, limit: 1000 }));
    }
    return events;
  });

  const byAnchor = new Map<string, ScorePoint[]>();
  const seen = new Set<string>();
  for (const event of ranges.flat()) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const anchorId = event.topic[1] ? String(scValToNative(event.topic[1])) : undefined;
    if (!anchorId) continue;
    const data = scValToNative(event.value) as { new_score: number; evidence?: Uint8Array | null };
    const points = byAnchor.get(anchorId) ?? [];
    const evidence = data.evidence ? Buffer.from(data.evidence).toString('hex') : undefined;
    points.push({ timestamp: event.ledgerClosedAt, score: Number(data.new_score), ...(evidence ? { evidence } : {}) });
    byAnchor.set(anchorId, points);
  }
  for (const points of byAnchor.values()) points.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return byAnchor;
}

type Entry = rpc.Api.LedgerEntryResult;

/** Reads the given keys in batches, keyed by their XDR. */
async function fetchEntries(pool: RpcPool, keys: xdr.LedgerKey[]) {
  const batches: xdr.LedgerKey[][] = [];
  for (let i = 0; i < keys.length; i += LEDGER_ENTRIES_BATCH) batches.push(keys.slice(i, i + LEDGER_ENTRIES_BATCH));
  const responses = await Promise.all(batches.map((batch) => pool.call((s) => s.getLedgerEntries(...batch))));
  const entries = new Map<string, Entry>();
  for (const response of responses) for (const entry of response.entries) entries.set(keyId(entry.key), entry);
  return { entries, latestLedger: Math.max(...responses.map((r) => r.latestLedger)) };
}

/** An entry whose TTL ran out is archived: a contract call would fail on it
 * until someone restores it, so it is not reported as current data. */
const isArchived = (entry: Entry, latestLedger: number) =>
  entry.liveUntilLedgerSeq !== undefined && entry.liveUntilLedgerSeq < latestLedger;

/** The registry's anchor ids in registration order, from either layout
 * (see `readRegistryIndex`). */
async function readAnchorIds(pool: RpcPool, instance: Entry): Promise<string[]> {
  const index = readRegistryIndex(instance.val);
  if (index.layout === 'ids') return index.ids;
  const keys = Array.from({ length: index.count }, (_, i) => anchorAtKey(REGISTRY_CONTRACT_ID, i));
  const { entries } = await fetchEntries(pool, keys);
  const ids: string[] = [];
  for (const [i, key] of keys.entries()) {
    const entry = entries.get(keyId(key));
    // One unreadable slot must not take the other anchors off the page.
    if (entry) ids.push(decodeAnchorAt(entry.val));
    else console.warn(`[dashboard] registry AnchorAt(${i}) of ${index.count} is missing`);
  }
  return ids;
}

async function fetchLiveDashboardData(pool: RpcPool): Promise<{ anchors: AnchorViewModel[]; unreadable: UnreadableAnchor[] }> {
  assertLiveConfigPresent();

  const instances = (await fetchEntries(pool, [instanceKey(REGISTRY_CONTRACT_ID), instanceKey(ORACLE_CONTRACT_ID)])).entries;
  const registryInstance = instances.get(keyId(instanceKey(REGISTRY_CONTRACT_ID)));
  if (!registryInstance) throw new Error('AnchorRegistry contract not found');
  const anchorIds = await readAnchorIds(pool, registryInstance);
  const oracleInstance = instances.get(keyId(instanceKey(ORACLE_CONTRACT_ID)));
  const threshold = oracleInstance ? readQuorumThreshold(oracleInstance.val) : 1;

  // Every anchor's record, health, card, quorum, open round, dispute and
  // lifecycle status in a few batched calls, instead of simulated contract
  // calls per anchor. Keys an older contract never wrote are just absent.
  const keys = anchorIds.flatMap((id) => [
    anchorInfoKey(REGISTRY_CONTRACT_ID, id),
    healthKey(ORACLE_CONTRACT_ID, id),
    cardKey(ORACLE_CONTRACT_ID, id),
    lifecycleKey(REGISTRY_CONTRACT_ID, id),
    quorumKey(ORACLE_CONTRACT_ID, id),
    roundKey(ORACLE_CONTRACT_ID, id),
    disputeKey(ORACLE_CONTRACT_ID, id),
  ]);
  const [{ entries, latestLedger }, history] = await Promise.all([
    fetchEntries(pool, keys),
    fetchAllScoreHistory(pool).catch((err) => {
      console.warn('[dashboard] failed to fetch score history:', err);
      return new Map<string, ScorePoint[]>();
    }),
  ]);

  // A problem with one anchor's record affects that anchor only.
  const anchors: AnchorViewModel[] = [];
  const unreadable: UnreadableAnchor[] = [];
  for (const anchorId of anchorIds) {
    const infoEntry = entries.get(keyId(anchorInfoKey(REGISTRY_CONTRACT_ID, anchorId)));
    if (!infoEntry) {
      unreadable.push({ anchorId, error: 'listed in the registry but its record is missing' });
      continue;
    }
    if (isArchived(infoEntry, latestLedger)) {
      unreadable.push({ anchorId, error: 'on-chain record archived (TTL expired)' });
      continue;
    }
    let info;
    try {
      info = decodeAnchorInfo(infoEntry.val);
    } catch (err) {
      unreadable.push({ anchorId, error: `could not decode record: ${(err as Error).message}` });
      continue;
    }
    const healthEntry = entries.get(keyId(healthKey(ORACLE_CONTRACT_ID, anchorId)));
    const health = !healthEntry ? NEW_HEALTH : isArchived(healthEntry, latestLedger) ? undefined : decodeHealth(healthEntry.val);
    // No entry: no card published yet, or an oracle from before cards.
    const cardEntry = entries.get(keyId(cardKey(ORACLE_CONTRACT_ID, anchorId)));
    let card;
    try {
      card = cardEntry && !isArchived(cardEntry, latestLedger) ? decodeCard(cardEntry.val) : undefined;
    } catch (err) {
      console.warn(`[dashboard] could not decode the score card of ${anchorId}:`, err);
    }
    // Context around the card: none of it may take the anchor off the page.
    const live = (key: xdr.LedgerKey) => {
      const entry = entries.get(keyId(key));
      return entry && !isArchived(entry, latestLedger) ? entry.val : undefined;
    };
    const optional = <T,>(what: string, decode: () => T | undefined): T | undefined => {
      try {
        return decode();
      } catch (err) {
        console.warn(`[dashboard] could not decode the ${what} of ${anchorId}:`, err);
        return undefined;
      }
    };
    const lifecycleVal = live(lifecycleKey(REGISTRY_CONTRACT_ID, anchorId));
    const quorumVal = live(quorumKey(ORACLE_CONTRACT_ID, anchorId));
    const roundVal = live(roundKey(ORACLE_CONTRACT_ID, anchorId));
    const disputeVal = live(disputeKey(ORACLE_CONTRACT_ID, anchorId));
    const deactivated = lifecycleVal && optional('status', () => decodeLifecycle(lifecycleVal));
    const quorum = quorumVal && optional('quorum', () => decodeQuorum(quorumVal, threshold));
    const pendingRound = roundVal && optional('pending round', () => decodeRound(roundVal, threshold));
    const dispute = disputeVal && optional('dispute', () => decodeDispute(disputeVal));
    const lastUpdated = new Date(Number(info.lastUpdated) * 1000).toISOString();
    const points = history.get(anchorId) ?? [];
    anchors.push({
      anchorId,
      name: info.name,
      domain: info.domain,
      sourceType: info.sourceType,
      stake: stroopsToXlm(info.stake),
      score: info.score,
      scoreHistory: points.length > 0 ? points : [{ timestamp: lastUpdated, score: info.score }],
      // Only the previous oracle slashed; its events come from the archive.
      slashEvents: [],
      lastUpdated,
      health,
      ...(card ? { card } : {}),
      ...(quorum ? { quorum } : {}),
      ...(pendingRound ? { pendingRound } : {}),
      ...(dispute ? { dispute } : {}),
      ...(deactivated ? { deactivated } : {}),
    });
  }
  if (pool.activeProvider !== 'primary') console.warn('[dashboard] this render was served by the backup RPC');
  return { anchors, unreadable };
}

/** Reads the contracts from Soroban RPC. There is no fallback data: if the
 * chain can't be read, the page says so and shows nothing, rather than
 * anything that looks like a real score but isn't. */
export async function getDashboardData(): Promise<DashboardData> {
  try {
    const [live, archive, status, summary, importedIds] = await Promise.all([
      fetchLiveDashboardData(createRpcPool()),
      fetchArchive(),
      fetchAnchorStatus(),
      fetchScoreSummary(),
      fetchImportedAnchorIds(),
    ]);
    if (live.anchors.length === 0 && live.unreadable.length > 0) {
      throw new Error(`could not read any of the ${live.unreadable.length} registered anchors`);
    }
    return {
      anchors: mergeCardContext(
        // Last of the enrichments: it only tags, so it can't be undone by
        // the merges that rebuild view models from the chain data.
        mergeImportedInto(
          mergeStatusInto(mergeArchiveInto(live.anchors, archive), status),
          importedIds,
        ),
        summary,
      ),
      unreadable: live.unreadable,
      dataSource: 'live',
    };
  } catch (err) {
    return { anchors: [], unreadable: [], dataSource: 'unavailable', liveError: (err as Error).message.split('\n')[0] };
  }
}
