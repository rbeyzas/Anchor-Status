import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex, writeEvidence } from './evidence.js';

describe('canonicalJson', () => {
  it('serializes the same content to the same bytes whatever the key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(canonicalJson({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }));
  });
});

describe('writeEvidence', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('names the file by the sha256 of its exact bytes', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-'));
    const hash = writeEvidence(dir, { anchor_id: 'a', verdict: { success: true } });
    const bytes = fs.readFileSync(path.join(dir, `${hash}.json`));
    expect(sha256Hex(bytes)).toBe(hash);
    expect(JSON.parse(bytes.toString()).schema).toBe('anchor-status/evidence/v1');
  });

  it('is idempotent for the same document', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-'));
    expect(writeEvidence(dir, { x: 1, y: 2 })).toBe(writeEvidence(dir, { y: 2, x: 1 }));
    expect(fs.readdirSync(dir)).toHaveLength(1);
  });
});
