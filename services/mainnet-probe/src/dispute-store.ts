// Disputes, beside the admin queue: the evidence text operators attach
// (on-chain there is only its SHA-256) and the admin signers' decisions,
// which the reporters then cast as their votes. This file only keeps them;
// the dashboard's /api/disputes checks every signature before it writes,
// and the collector checks them again before it votes. The comparison of
// the two reporters' cards is the collector's, in a file of its own.
import { createHash } from 'node:crypto';
import fs from 'node:fs';

export interface Evidence {
  text: string;
  at: string;
}

export interface Decision {
  anchorId: string;
  /** The disputed card's window end, unix seconds. */
  windowEnd: number;
  decision: 'uphold' | 'reject';
  /** SEP-53 signatures of decisionMessage(), one per admin signer. */
  signatures: { signer: string; signature: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface DisputeStore {
  evidence: Record<string, Evidence>;
  decisions: Decision[];
}

export const MAX_EVIDENCE_CHARS = 2000;
/** Kept on file; older ones drop off. */
const KEEP_EVIDENCE = 500;
const KEEP_DECISIONS = 200;

export function loadDisputes(file: string): DisputeStore {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8')) as DisputeStore;
    return { evidence: s.evidence ?? {}, decisions: s.decisions ?? [] };
  } catch {
    return { evidence: {}, decisions: [] };
  }
}

function save(file: string, s: DisputeStore) {
  const evidence = Object.fromEntries(Object.entries(s.evidence).sort((a, b) => a[1].at.localeCompare(b[1].at)).slice(-KEEP_EVIDENCE));
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ evidence, decisions: s.decisions.slice(-KEEP_DECISIONS) }, null, 1));
  fs.renameSync(`${file}.tmp`, file);
}

export const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Stores `text` under its own SHA-256, the hash the operator puts on-chain.
 * Anyone may store text; it only shows beside a dispute whose hash matches. */
export function addEvidence(file: string, body: unknown, now: Date): { hash: string } | null {
  const text = (body as { text?: unknown } | null)?.text;
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_EVIDENCE_CHARS) return null;
  const s = loadDisputes(file);
  const hash = sha256(text);
  s.evidence[hash] ??= { text, at: now.toISOString() };
  save(file, s);
  return { hash };
}

const G_KEY = /^G[A-Z2-7]{55}$/;
const ANCHOR_ID = /^[A-Za-z0-9_]{1,32}$/;

/** Adds one signer's signature to a decision, creating it on the first.
 * The caller has checked the signature; this only checks the shape. */
export function addDecisionSignature(file: string, body: unknown, now: Date): Decision | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const { anchorId, windowEnd, decision, signer, signature } = b;
  if (
    typeof anchorId !== 'string' || !ANCHOR_ID.test(anchorId) ||
    typeof windowEnd !== 'number' || !Number.isSafeInteger(windowEnd) || windowEnd <= 0 ||
    (decision !== 'uphold' && decision !== 'reject') ||
    typeof signer !== 'string' || !G_KEY.test(signer) ||
    typeof signature !== 'string' || signature.length > 200 ||
    Object.keys(b).length !== 5
  ) {
    return null;
  }
  const s = loadDisputes(file);
  const at = now.toISOString();
  let d = s.decisions.find((x) => x.anchorId === anchorId && x.windowEnd === windowEnd && x.decision === decision);
  if (!d) {
    d = { anchorId, windowEnd, decision, signatures: [], createdAt: at, updatedAt: at };
    s.decisions.push(d);
  }
  if (!d.signatures.some((x) => x.signer === signer)) {
    d.signatures.push({ signer, signature });
    d.updatedAt = at;
  }
  save(file, s);
  return d;
}
