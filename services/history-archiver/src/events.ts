import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import type { RpcPool } from './rpc.js';
import type { RiskEvent, ScorePoint, SlashEvent } from './types.js';

/** One deployment of the two contracts. Events are read from every pair
 * given, so history from an earlier deployment can still be recovered. */
export interface ContractPair {
  oracle: string;
  registry: string;
}

export interface AnchorEvents {
  scoreHistory: ScorePoint[];
  slashEvents: SlashEvent[];
  riskEvents: RiskEvent[];
}

// getEvents scans roughly 10,000 ledgers per call. A range with no matching
// event comes back empty, with a cursor to continue from — stopping there,
// as this service used to, is what made the RPC look like it only kept
// ~12 hours. The window is split into ranges of that size and read in
// parallel instead.
const RANGE_LEDGERS = 10_000;
// getEvents takes at most 5 contract ids per filter.
const MAX_CONTRACTS_PER_FILTER = 5;

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

const symbol = (s: string) => xdr.ScVal.scvSymbol(s).toXDR('base64');

export function eventFilters(pairs: ContractPair[]): rpc.Api.EventFilter[] {
  const contracts = [...new Set(pairs.flatMap((p) => [p.oracle, p.registry]))];
  const filters: rpc.Api.EventFilter[] = [];
  for (let i = 0; i < contracts.length; i += MAX_CONTRACTS_PER_FILTER) {
    filters.push({
      type: 'contract',
      contractIds: contracts.slice(i, i + MAX_CONTRACTS_PER_FILTER),
      topics: [
        [symbol('report_submitted'), '*'],
        [symbol('risk_status_changed'), '*'],
        [symbol('slash'), '*'],
      ],
    });
  }
  return filters;
}

/** Every event matching `filters` in [start, end), each exactly once. */
export async function scanEvents(
  pool: RpcPool,
  filters: rpc.Api.EventFilter[],
  start: number,
  end: number,
): Promise<rpc.Api.EventResponse[]> {
  const ranges = ledgerRanges(start, end, RANGE_LEDGERS);
  const perRange: rpc.Api.EventResponse[][] = new Array(ranges.length);
  let next = 0;
  // The pool caps what actually reaches each provider.
  await Promise.all(
    Array.from({ length: Math.min(16, ranges.length) }, async () => {
      while (next < ranges.length) {
        const i = next++;
        const [from, to] = ranges[i];
        const events: rpc.Api.EventResponse[] = [];
        let page = await pool.call((s) => s.getEvents({ startLedger: from, endLedger: to, filters, limit: 1000 }));
        // Cursor pages can't carry an endLedger, so a range is read to its
        // end and then cut at it.
        for (let calls = 1; ; calls++) {
          events.push(...page.events.filter((e) => e.ledger < to));
          const done = !page.cursor || cursorLedger(page.cursor) >= to - 1 || page.events.some((e) => e.ledger >= to);
          if (done || calls >= 100) break;
          const cursor = page.cursor;
          page = await pool.call((s) => s.getEvents({ cursor, filters, limit: 1000 }));
        }
        perRange[i] = events;
      }
    }),
  );
  const seen = new Set<string>();
  return perRange.flat().filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

/** AnchorRegistry's SlashEvent has named fields (amount, reason), so
 * scValToNative yields an object — older code read it as a [amount, reason]
 * tuple, which silently produced undefined. Both shapes are accepted. */
export function slashAmountStroops(data: unknown): string | null {
  const raw = Array.isArray(data)
    ? (data as unknown[])[0]
    : (data as { amount?: unknown } | null)?.amount;
  if (typeof raw === 'bigint' || typeof raw === 'number') return String(raw);
  if (typeof raw === 'string' && /^-?\d+$/.test(raw)) return raw;
  return null;
}

/** A unit enum variant from scValToNative: ["Degrading"] or {tag: "Degrading"}. */
function enumTag(value: unknown): string | null {
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  const tag = (value as { tag?: unknown } | null)?.tag;
  return typeof tag === 'string' ? tag : null;
}

/** Groups raw events by anchor, in the archive's shape. Events whose
 * payload can't be read are skipped and logged, never archived as junk. */
export function groupByAnchor(events: rpc.Api.EventResponse[]): Map<string, AnchorEvents> {
  const byAnchor = new Map<string, AnchorEvents>();
  const bucket = (anchorId: string) => {
    let b = byAnchor.get(anchorId);
    if (!b) byAnchor.set(anchorId, (b = { scoreHistory: [], slashEvents: [], riskEvents: [] }));
    return b;
  };
  for (const event of events) {
    const kind = event.topic[0] ? String(scValToNative(event.topic[0])) : '';
    const anchorId = event.topic[1] ? String(scValToNative(event.topic[1])) : '';
    if (!anchorId) continue;
    const value = scValToNative(event.value);
    if (kind === 'report_submitted') {
      const data = value as { new_score: number; evidence?: Uint8Array | null };
      const evidence = data.evidence ? Buffer.from(data.evidence).toString('hex') : undefined;
      bucket(anchorId).scoreHistory.push({
        timestamp: event.ledgerClosedAt,
        score: Number(data.new_score),
        ...(evidence ? { evidence } : {}),
      });
    } else if (kind === 'slash') {
      const amount = slashAmountStroops(value);
      // A shape we can't read must not enter the archive as the string
      // "undefined" — that is unparseable downstream, and the dashboard
      // fell back to demo data over it.
      if (amount === null) {
        console.warn(`[history-archiver] unreadable slash event at ${event.ledgerClosedAt}, skipped`);
        continue;
      }
      bucket(anchorId).slashEvents.push({ timestamp: event.ledgerClosedAt, amountStroops: amount });
    } else if (kind === 'risk_status_changed') {
      const data = value as { risk_reason?: unknown; score?: unknown; trend?: unknown };
      const riskReason = enumTag(data?.risk_reason);
      if (riskReason === null) {
        console.warn(`[history-archiver] unreadable risk event at ${event.ledgerClosedAt}, skipped`);
        continue;
      }
      bucket(anchorId).riskEvents.push({
        timestamp: event.ledgerClosedAt,
        riskReason,
        score: Number(data.score),
        trend: enumTag(data.trend) ?? 'Stable',
      });
    }
  }
  return byAnchor;
}
