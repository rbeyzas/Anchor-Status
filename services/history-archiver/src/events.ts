import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import type { ScorePoint, SlashEvent } from './types.js';

const LEDGER_RANGE_ERROR = /ledger range:\s*(\d+)\s*-\s*(\d+)/i;

/** Same retry the dashboard does: if our startLedger is older than what the
 * RPC still serves, it answers with the valid range — retry just inside it. */
async function getEvents(
  server: rpc.Server,
  startLedger: number,
  filters: rpc.Api.EventFilter[],
): ReturnType<rpc.Server['getEvents']> {
  try {
    return await server.getEvents({ startLedger, filters, limit: 1000 });
  } catch (err) {
    const match = LEDGER_RANGE_ERROR.exec((err as Error).message ?? String(err));
    if (!match) throw err;
    return server.getEvents({ startLedger: Number(match[1]) + 1, filters, limit: 1000 });
  }
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

export async function fetchAnchorEvents(
  server: rpc.Server,
  startLedger: number,
  oracleContractId: string,
  registryContractId: string,
  anchorId: string,
): Promise<{ scoreHistory: ScorePoint[]; slashEvents: SlashEvent[] }> {
  const topicAnchorId = xdr.ScVal.scvSymbol(anchorId).toXDR('base64');

  const [scoreRes, slashRes] = await Promise.all([
    getEvents(server, startLedger, [
      {
        type: 'contract',
        contractIds: [oracleContractId],
        topics: [[xdr.ScVal.scvSymbol('report_submitted').toXDR('base64'), topicAnchorId]],
      },
    ]),
    getEvents(server, startLedger, [
      {
        type: 'contract',
        contractIds: [registryContractId],
        topics: [[xdr.ScVal.scvSymbol('slash').toXDR('base64'), topicAnchorId]],
      },
    ]),
  ]);

  return {
    scoreHistory: scoreRes.events.map((event) => {
      const data = scValToNative(event.value) as { new_score: number };
      return { timestamp: event.ledgerClosedAt, score: Number(data.new_score) };
    }),
    slashEvents: slashRes.events.flatMap((event) => {
      const amount = slashAmountStroops(scValToNative(event.value));
      // A shape we can't read must not enter the archive as the string
      // "undefined" — that is unparseable downstream, and the dashboard
      // fell back to demo data over it.
      if (amount === null) {
        console.warn(`[history-archiver] unreadable slash event at ${event.ledgerClosedAt}, skipped`);
        return [];
      }
      return [{ timestamp: event.ledgerClosedAt, amountStroops: amount }];
    }),
  };
}
