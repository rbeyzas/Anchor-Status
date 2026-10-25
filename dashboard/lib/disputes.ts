// /api/disputes: what the admin signers decide a dispute on, and their
// decisions. The intake stores the operator's evidence text, the decisions
// and the collector's comparison of the two reporters' cards; here every
// decision is checked before it is stored, and weighed against the oracle
// admin's signers when it is read. The collector checks them again before
// it casts the reporters' votes (services/aggregator/src/disputes.ts).
import { allowedSources, intake, json, loadAccount, verifyMessage, weightOf, type QueueOptions } from './admin-queue';
import { decodeDispute, disputeKey, keyId } from './contract-state';
import { decisionMessage } from './queue-message';
import { createRpcPool } from './rpc';
import { fetchEntries, ORACLE_CONTRACT_ID } from './soroban';

export type DecisionValue = 'uphold' | 'reject';

/** As the intake stores it (services/mainnet-probe/src/dispute-store.ts). */
export interface Decision {
  anchorId: string;
  windowEnd: number;
  decision: DecisionValue;
  signatures: { signer: string; signature: string }[];
  createdAt: string;
  updatedAt: string;
}

/** The raw signatures stay in: the collector checks them itself. */
export interface DecisionView extends Decision {
  /** The signers whose signatures verify, against the admin as it is now. */
  signers: string[];
  weight: number;
  threshold: number;
}

/** One reporter host's card for the disputed window (its shadow card). */
export interface HostCard {
  host: string;
  score?: number;
  flags?: number;
}

/** Written by the collector, keyed `${anchorId}@${windowEnd}`. */
export interface Comparison {
  anchorId: string;
  windowEnd: number;
  hosts: HostCard[];
  recommendation: DecisionValue | 'unclear';
  reason: string;
  computedAt: string;
}

export interface DisputesData {
  evidence: Record<string, { text: string; at: string }>;
  decisions: DecisionView[];
  comparisons: Record<string, Comparison>;
}

/** Weighs each decision's signatures against `account`; a signature that
 * does not verify, or from a key that is no longer a signer, counts 0. */
export function weighDecisions(decisions: Decision[], account: { signers: { key: string; weight: number }[]; threshold: number }, oracle = ORACLE_CONTRACT_ID): DecisionView[] {
  const keys = account.signers.map((s) => s.key);
  return decisions.map((d) => {
    const message = decisionMessage(oracle, d.anchorId, d.windowEnd, d.decision);
    const signers = d.signatures.filter((s) => keys.includes(s.signer) && verifyMessage(s.signer, message, s.signature)).map((s) => s.signer);
    return { ...d, signers, weight: weightOf(signers, account), threshold: account.threshold };
  });
}

async function oracleAdmin() {
  const admin = (await allowedSources())[ORACLE_CONTRACT_ID]?.[0];
  if (!admin) throw new Error('Could not read the oracle admin.');
  return loadAccount(admin);
}

/** Public: the panel reads it, and so does the second reporter's collector. */
export async function listDisputes(opts: QueueOptions): Promise<Response> {
  if (!opts.url || !opts.token) return json(503, { error: 'Disputes are not configured.' });
  const { status, data } = await intake(opts, '/disputes');
  if (status !== 200) return json(502, { error: 'The intake did not answer.' });
  const decisions = (data.decisions as Decision[]) ?? [];
  const account = decisions.length ? await oracleAdmin() : { signers: [], threshold: 1 };
  return json(200, {
    evidence: (data.evidence ?? {}) as DisputesData['evidence'],
    decisions: weighDecisions(decisions, account),
    comparisons: (data.comparisons ?? {}) as DisputesData['comparisons'],
  } satisfies DisputesData);
}

type Action =
  | { action: 'evidence'; text: string }
  | { action: 'decide'; anchorId: string; windowEnd: number; decision: DecisionValue; signer: string; signature: string };

export async function handleDisputeAction(request: Request, opts: QueueOptions): Promise<Response> {
  if (!opts.url || !opts.token) return json(503, { error: 'Disputes are not configured.' });
  let body: Action;
  try {
    body = (await request.json()) as Action;
  } catch {
    return json(400, { error: 'Expected a JSON body.' });
  }
  try {
    if (body.action === 'evidence') {
      // The intake rate-limits evidence per client, like applications.
      const client = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '';
      const r = await intake(opts, '/disputes/evidence', { text: String(body.text ?? '').trim() }, client ? { 'x-client-ip': client } : {});
      return json(r.status, r.data);
    }
    if (body.action === 'decide') {
      const { anchorId, windowEnd, decision, signer, signature } = body;
      if (decision !== 'uphold' && decision !== 'reject') return json(400, { error: 'Decide uphold or reject.' });
      const key = disputeKey(ORACLE_CONTRACT_ID, String(anchorId));
      const { entries } = await fetchEntries(createRpcPool(), [key]);
      const entry = entries.get(keyId(key))?.val;
      const dispute = entry ? decodeDispute(entry) : undefined;
      if (!dispute || dispute.status !== 'Open' || Date.parse(dispute.windowEnd) !== Number(windowEnd) * 1000) {
        return json(409, { error: 'There is no open dispute on that card.' });
      }
      const account = await oracleAdmin();
      if (!account.signers.some((s) => s.key === signer) || !verifyMessage(signer, decisionMessage(ORACLE_CONTRACT_ID, anchorId, Number(windowEnd), decision), signature)) {
        return json(403, { error: "Deciding needs a signed message from one of the oracle admin's signers." });
      }
      const r = await intake(opts, '/disputes/decision', { anchorId, windowEnd: Number(windowEnd), decision, signer, signature });
      return json(r.status, r.data);
    }
    return json(400, { error: 'Unknown action.' });
  } catch (err) {
    return json(400, { error: (err as Error).message.split('\n')[0].slice(0, 300) });
  }
}
