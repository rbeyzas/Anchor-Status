import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Same canonical-JSON scheme as services/mainnet-probe/src/evidence.ts, so a
// score-inputs bundle is verified exactly like a probe's evidence document.
// A copy rather than a shared package, as testnet-probe does.

export const SCORE_INPUTS_SCHEMA = 'anchor-status/score-inputs/v1';

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

/** Writes `doc` as `<sha256>.json` and returns the hash. Content-addressed:
 * rewriting the same document is a no-op. */
export function writeDocument(dir: string, doc: Record<string, unknown>): string {
  const body = canonicalJson(doc);
  const hash = sha256Hex(body);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${hash}.json`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, body);
  return hash;
}
