import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const EVIDENCE_SCHEMA = 'anchor-status/evidence/v1';

/** JSON with keys sorted at every level, so the same document always
 * serializes to the same bytes and hashes to the same value. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );
}

export const sha256Hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/**
 * Writes an evidence document as `<sha256>.json` and returns the hash. The
 * file's bytes are exactly what was hashed, so verifying is: download,
 * sha256, compare with the hash in the on-chain report event. Content-
 * addressed, so rewriting the same document is a no-op and nothing is ever
 * overwritten with different content.
 */
export function writeEvidence(dir: string, doc: Record<string, unknown>): string {
  const body = canonicalJson({ schema: EVIDENCE_SCHEMA, ...doc });
  const hash = sha256Hex(body);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${hash}.json`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, body);
  return hash;
}
