// /api/admin-queue: the multisig admin's queue of transactions waiting for
// signatures. The collector's intake only stores the list; everything that
// decides what goes in is here, server-side:
//   * a transaction must be one call to AnchorRegistry or PerformanceOracle,
//     from a contract's admin (or its proposed admin, for accept_admin);
//   * every signature it carries is checked against that account's signers
//     on Horizon, and only a signer may add or sign one;
//   * rejecting needs a fresh signed message (SEP-53), since the signatures
//     already stored are public;
//   * once the signatures reach the account's medium threshold, it is sent.
import { createHash } from 'node:crypto';
import { Address, Keypair, rpc, scValToNative, Transaction, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { instanceKey, keyId } from './contract-state';
import { instanceStorage } from './governance';
import { createRpcPool } from './rpc';
import { fetchEntries, ORACLE_CONTRACT_ID, REGISTRY_CONTRACT_ID } from './soroban';

const NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015';
const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';

export type QueueStatus = 'open' | 'executed' | 'failed' | 'rejected';

/** As the intake stores it (services/mainnet-probe/src/admin-queue.ts). */
export interface QueueItem {
  id: string;
  label: string;
  contract: string;
  method: string;
  source: string;
  xdr: string;
  signers: string[];
  status: QueueStatus;
  createdAt: string;
  updatedAt: string;
  txHash?: string;
  error?: string;
  rejectedBy?: string;
}

/** What the panel shows: the stored item, weighed against the source
 * account as it is now. */
export interface QueueView extends QueueItem {
  /** Read from the envelope, not from what was stored beside it. */
  args: string;
  weight: number;
  threshold: number;
  /** Its sequence number was used by another transaction, or its time ran
   * out: it can never be sent and has to be proposed again. */
  stale: boolean;
}

export interface Account {
  signers: { key: string; weight: number }[];
  /** Weight needed for a contract call: the medium threshold, at least 1. */
  threshold: number;
  sequence: bigint;
}

/** A call's arguments as text, from the envelope itself: what a signer is
 * really asked to sign, whatever the stored label says. */
export function describeArgs(args: xdr.ScVal[]): string {
  const text = (v: unknown): string =>
    v instanceof Uint8Array
      ? Buffer.from(v).toString('hex')
      : typeof v === 'bigint'
        ? v.toString()
        : Array.isArray(v)
          ? `[${v.map(text).join(', ')}]`
          : v && typeof v === 'object'
            ? `{ ${Object.entries(v).map(([k, x]) => `${k}: ${text(x)}`).join(', ')} }`
            : String(v);
  return args.map((a) => text(scValToNative(a))).join(', ');
}

/** The one contract call a queued transaction may make. */
export function inspect(envelope: string, passphrase = NETWORK_PASSPHRASE) {
  const tx = TransactionBuilder.fromXDR(envelope, passphrase);
  if (!(tx instanceof Transaction)) throw new Error('fee-bump transactions are not queued');
  if (tx.operations.length !== 1 || tx.operations[0].type !== 'invokeHostFunction') {
    throw new Error('expected exactly one contract call');
  }
  const fn = (tx.operations[0] as unknown as { func: { type: string; invokeContract?: { contractAddress: never; functionName: unknown; args: xdr.ScVal[] } } }).func;
  if (fn.type !== 'hostFunctionTypeInvokeContract' || !fn.invokeContract) throw new Error('expected a contract call');
  const call = fn.invokeContract;
  return {
    tx,
    source: tx.source,
    contract: Address.fromScAddress(call.contractAddress).toString(),
    method: String(call.functionName),
    args: describeArgs(call.args),
    hash: Buffer.from(tx.hash()).toString('hex'),
    sequence: BigInt(tx.sequence),
    maxTime: Number(tx.timeBounds?.maxTime ?? 0),
  };
}

/** The signers whose signatures on `tx` are valid. */
export function validSigners(tx: Transaction, signers: string[]): string[] {
  const hash = tx.hash();
  const out = new Set<string>();
  for (const sig of tx.signatures) {
    for (const key of signers) {
      const kp = Keypair.fromPublicKey(key);
      const hint = Buffer.from(sig.hint.value);
      if (hint.equals(Buffer.from(kp.signatureHint())) && kp.verify(Buffer.from(hash), Buffer.from(sig.signature.value))) out.add(key);
    }
  }
  return [...out];
}

/** `stored` with the signatures of `incoming` it lacks; both must be the
 * same transaction. */
export function mergeSignatures(stored: Transaction, incoming: Transaction): Transaction {
  if (!Buffer.from(stored.hash()).equals(Buffer.from(incoming.hash()))) throw new Error('not the same transaction');
  const id = (s: (typeof stored.signatures)[number]) => Buffer.from(s.signature.value).toString('base64');
  const have = new Set(stored.signatures.map(id));
  for (const s of incoming.signatures) if (!have.has(id(s))) stored.signatures.push(s);
  return stored;
}

export const weightOf = (keys: string[], account: Account) =>
  keys.reduce((w, k) => w + (account.signers.find((s) => s.key === k)?.weight ?? 0), 0);

export { rejectMessage } from './queue-message';
import { rejectMessage } from './queue-message';

/** A SEP-53 signed message: ed25519 over sha256("Stellar Signed Message:\n" + message). */
export function verifyMessage(signer: string, message: string, signatureBase64: string): boolean {
  const digest = createHash('sha256').update(`Stellar Signed Message:\n${message}`).digest();
  try {
    return Keypair.fromPublicKey(signer).verify(digest, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}

export function viewOf(item: QueueItem, account: Account | undefined, now = Date.now()): QueueView {
  let info: ReturnType<typeof inspect> | undefined;
  try {
    info = inspect(item.xdr);
  } catch {
    // An envelope that does not parse can never be sent.
    return { ...item, args: '(unreadable transaction)', weight: 0, threshold: account?.threshold ?? 0, stale: item.status === 'open' };
  }
  const fromEnvelope = { contract: info.contract, method: info.method, source: info.source, args: info.args };
  if (!account) return { ...item, ...fromEnvelope, weight: 0, threshold: 0, stale: false };
  const signed = validSigners(info.tx, account.signers.map((s) => s.key));
  const stale = item.status === 'open' && (account.sequence >= info.sequence || (info.maxTime > 0 && info.maxTime * 1000 < now));
  return { ...item, ...fromEnvelope, signers: signed, weight: weightOf(signed, account), threshold: account.threshold, stale };
}

async function loadAccount(address: string): Promise<Account> {
  const res = await fetch(`${HORIZON_URL}/accounts/${address}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Horizon: account ${address} HTTP ${res.status}`);
  const a = (await res.json()) as { signers: { key: string; weight: number }[]; thresholds: { med_threshold: number }; sequence: string };
  return {
    signers: a.signers.filter((s) => s.weight > 0).map((s) => ({ key: s.key, weight: s.weight })),
    threshold: Math.max(1, a.thresholds.med_threshold),
    sequence: BigInt(a.sequence),
  };
}

/** Who may be the source of a queued call to each contract: its admin, and
 * its proposed admin (which signs accept_admin). */
async function allowedSources(): Promise<Record<string, string[]>> {
  const keys = [instanceKey(REGISTRY_CONTRACT_ID), instanceKey(ORACLE_CONTRACT_ID)];
  const { entries } = await fetchEntries(createRpcPool(), keys);
  const out: Record<string, string[]> = {};
  for (const [i, id] of [REGISTRY_CONTRACT_ID, ORACLE_CONTRACT_ID].entries()) {
    const val = entries.get(keyId(keys[i]))?.val;
    if (!val) continue;
    const s = instanceStorage(val);
    out[id] = [s.Admin, s.PendingAdmin].filter(Boolean).map(String);
  }
  return out;
}

/** Sends a fully signed transaction and waits for its result. */
async function submit(tx: Transaction): Promise<{ status: 'executed' | 'failed'; txHash: string; error?: string }> {
  const server = new rpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith('http://') });
  const sent = await server.sendTransaction(tx);
  if (sent.status === 'ERROR') {
    return { status: 'failed', txHash: sent.hash, error: `rejected: ${sent.errorResult?.result.type ?? 'unknown'}` };
  }
  if (sent.status === 'TRY_AGAIN_LATER') throw new Error('the network is busy; try again');
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const got = await server.getTransaction(sent.hash);
    if (got.status === 'SUCCESS') return { status: 'executed', txHash: sent.hash };
    if (got.status === 'FAILED') return { status: 'failed', txHash: sent.hash, error: `failed: ${got.resultXdr?.result.type ?? 'unknown'}` };
  }
  throw new Error(`sent as ${sent.hash}, no result after 60 s; it may still land`);
}

export interface QueueOptions {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
}

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

async function intake(opts: QueueOptions, path: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await (opts.fetchImpl ?? fetch)(`${opts.url}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-onboarding-token': opts.token },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export async function listQueue(opts: QueueOptions): Promise<Response> {
  if (!opts.url || !opts.token) return json(503, { error: 'The queue is not configured.' });
  const { status, data } = await intake(opts, '');
  if (status !== 200) return json(502, { error: 'The queue did not answer.' });
  const items = (data.items as QueueItem[]) ?? [];
  const accounts = new Map<string, Account | undefined>();
  for (const source of new Set(items.filter((i) => i.status === 'open').map((i) => i.source))) {
    accounts.set(source, await loadAccount(source).catch(() => undefined));
  }
  return json(200, { items: items.map((i) => viewOf(i, accounts.get(i.source))).reverse() });
}

type Action =
  | { action: 'create'; label: string; xdr: string }
  | { action: 'sign'; id: string; xdr: string }
  | { action: 'reject'; id: string; signer: string; signature: string }
  | { action: 'submit'; id: string };

export async function handleQueueAction(request: Request, opts: QueueOptions): Promise<Response> {
  if (!opts.url || !opts.token) return json(503, { error: 'The queue is not configured.' });
  let body: Action;
  try {
    body = (await request.json()) as Action;
  } catch {
    return json(400, { error: 'Expected a JSON body.' });
  }
  try {
    if (body.action === 'create') {
      const info = inspect(String(body.xdr));
      const sources = await allowedSources();
      if (!sources[info.contract]) return json(400, { error: 'Only calls to the registry or the oracle are queued.' });
      if (!sources[info.contract].includes(info.source)) return json(400, { error: "The transaction must come from the contract's admin." });
      const account = await loadAccount(info.source);
      const signed = validSigners(info.tx, account.signers.map((s) => s.key));
      if (signed.length === 0) return json(403, { error: "It must carry a signature from one of the admin's signers." });
      const label = String(body.label ?? '').slice(0, 200) || `${info.method}`;
      const r = await intake(opts, '', { label, contract: info.contract, method: info.method, source: info.source, xdr: info.tx.toXDR(), signers: signed });
      return json(r.status, r.data);
    }

    const { data } = await intake(opts, '');
    const item = ((data.items as QueueItem[]) ?? []).find((i) => i.id === body.id);
    if (!item || item.status !== 'open') return json(404, { error: 'No such open item.' });
    const account = await loadAccount(item.source);
    const keys = account.signers.map((s) => s.key);

    if (body.action === 'sign') {
      const stored = inspect(item.xdr).tx;
      const incoming = inspect(String(body.xdr)).tx;
      const fresh = validSigners(incoming, keys).filter((k) => !item.signers.includes(k));
      if (fresh.length === 0) return json(403, { error: 'No new signature from one of the admin signers.' });
      const merged = mergeSignatures(stored, incoming);
      const signers = validSigners(merged, keys);
      const r = await intake(opts, `/${item.id}`, { xdr: merged.toXDR(), signers });
      return json(r.status, r.data);
    }

    if (body.action === 'reject') {
      if (!keys.includes(body.signer) || !verifyMessage(body.signer, rejectMessage(item.id), body.signature)) {
        return json(403, { error: 'Rejecting needs a signed message from one of the admin signers.' });
      }
      const r = await intake(opts, `/${item.id}`, { status: 'rejected', rejectedBy: body.signer });
      return json(r.status, r.data);
    }

    if (body.action === 'submit') {
      const view = viewOf(item, account);
      if (view.stale) return json(409, { error: 'This transaction can no longer be sent; propose it again.' });
      if (view.weight < view.threshold) return json(409, { error: `Signatures worth ${view.weight} of the ${view.threshold} needed.` });
      const result = await submit(inspect(item.xdr).tx);
      const r = await intake(opts, `/${item.id}`, result.error ? result : { status: result.status, txHash: result.txHash });
      return json(r.status, r.data);
    }
    return json(400, { error: 'Unknown action.' });
  } catch (err) {
    return json(400, { error: (err as Error).message.split('\n')[0].slice(0, 300) });
  }
}
