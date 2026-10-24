// The multisig admin's transaction queue for the dashboard's /panel: a
// transaction one signer proposed, waiting for the others' signatures. This
// file only keeps the list; the dashboard's /api/admin-queue checks every
// signature against the admin's signers on Horizon and sends the
// transaction. Stored beside the applications, the one directory the intake
// may write.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

export type QueueStatus = 'open' | 'executed' | 'failed' | 'rejected';

export interface QueueItem {
  id: string;
  /** What it does, in the proposer's words. */
  label: string;
  contract: string;
  method: string;
  /** The account the transaction is from: the contract's admin. */
  source: string;
  /** The transaction envelope with every signature collected so far. */
  xdr: string;
  /** Who signed it so far, in order. */
  signers: string[];
  status: QueueStatus;
  createdAt: string;
  updatedAt: string;
  txHash?: string;
  error?: string;
  rejectedBy?: string;
}

const LIMITS: Record<string, number> = { label: 200, contract: 56, method: 40, source: 56, xdr: 30_000, txHash: 64, error: 500, rejectedBy: 56 };
const STATUSES: QueueStatus[] = ['open', 'executed', 'failed', 'rejected'];
/** Kept on file; older ones drop off. */
const KEEP = 200;
/** Open items at once: a guard against a flood, far above real use. */
export const MAX_OPEN = 20;

export function loadQueue(file: string): QueueItem[] {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as QueueItem[];
  } catch {
    return [];
  }
}

function saveQueue(file: string, items: QueueItem[]) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(items.slice(-KEEP), null, 1));
  fs.renameSync(`${file}.tmp`, file);
}

/** The fields a request may set, checked for type and size; null if any is wrong. */
export function pickFields(body: unknown, allowed: string[]): Partial<QueueItem> | null {
  if (!body || typeof body !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!allowed.includes(k)) return null;
    if (k === 'signers') {
      if (!Array.isArray(v) || v.length > 20 || v.some((s) => typeof s !== 'string' || s.length > 56)) return null;
    } else if (k === 'status') {
      if (!STATUSES.includes(v as QueueStatus)) return null;
    } else if (typeof v !== 'string' || v.length > (LIMITS[k] ?? 0)) {
      return null;
    }
    out[k] = v;
  }
  return out as Partial<QueueItem>;
}

const CREATE_FIELDS = ['label', 'contract', 'method', 'source', 'xdr', 'signers'];
const UPDATE_FIELDS = ['xdr', 'signers', 'status', 'txHash', 'error', 'rejectedBy'];

/** Adds an open item; null when the body is wrong, 'full' at MAX_OPEN. */
export function createItem(file: string, body: unknown, now: Date): QueueItem | null | 'full' {
  const fields = pickFields(body, CREATE_FIELDS);
  if (!fields || CREATE_FIELDS.some((k) => !(k in fields))) return null;
  const items = loadQueue(file);
  if (items.filter((i) => i.status === 'open').length >= MAX_OPEN) return 'full';
  const at = now.toISOString();
  const item = { ...(fields as Omit<QueueItem, 'id'>), id: randomUUID(), status: 'open' as const, createdAt: at, updatedAt: at };
  saveQueue(file, [...items, item]);
  return item;
}

/** Updates an open item; null when the body is wrong, 'missing' if there is no such open item. */
export function updateItem(file: string, id: string, body: unknown, now: Date): QueueItem | null | 'missing' {
  const fields = pickFields(body, UPDATE_FIELDS);
  if (!fields) return null;
  const items = loadQueue(file);
  const i = items.findIndex((x) => x.id === id);
  // A decided item stays as it was decided.
  if (i < 0 || items[i].status !== 'open') return 'missing';
  items[i] = { ...items[i], ...fields, updatedAt: now.toISOString() };
  saveQueue(file, items);
  return items[i];
}
