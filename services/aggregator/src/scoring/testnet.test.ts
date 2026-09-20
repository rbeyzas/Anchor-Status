import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeCard } from './engine.js';
import { buildInputs } from './inputs.js';
import { readTestnetProbeLines } from './load.js';
import { checkDays } from './verify-score.js';

const stages = { toml: { ok: true, ms: 500 }, info: { ok: true, ms: 150 }, challenge: { ok: true, ms: 160 }, token: { ok: true, ms: 240 }, initiate: { ok: true, ms: 1200 } };
const checks = { toml_valid: true, toml_cors: true, sep10_advertised: true, sep10_signature_valid: true, info_valid: true, tls_ok: true, signing_key: 'GKEY' };
const run = (i: number, over: Record<string, unknown> = {}) => ({
  anchor_id: 'x_testnet',
  domain: 'x.example',
  source_type: 'RealTestnet',
  success: true,
  settlement_seconds: 20,
  timestamp: new Date(Date.UTC(2026, 8, 10) + i * 3_600_000).toISOString(),
  final_transaction_status: 'completed',
  public_checks: { success: true, stages, stages_expected: Object.keys(stages), checks },
  ...over,
});

describe('testnet anchors are scored like mainnet ones', () => {
  const windowEnd = Date.UTC(2026, 8, 20);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-'));
  const log = path.join(dir, 'probe-log.json');
  // 120 hourly runs; a run from before the public check existed has no stages and is ignored.
  const runs = [...Array.from({ length: 120 }, (_, i) => run(i)), { anchor_id: 'x_testnet', timestamp: '2026-09-01T00:00:00Z', success: true, settlement_seconds: 3 }];
  fs.writeFileSync(log, JSON.stringify(runs));

  it('reads runs with the public check, skips older ones', () => {
    expect(readTestnetProbeLines(log)).toHaveLength(120);
  });

  it('builds the same inputs and a card with every pillar', () => {
    const inputs = buildInputs('x_testnet', readTestnetProbeLines(log), windowEnd, { assets: [], marketSamples: [], supplySamples: [], flows: [] })!;
    expect(inputs.uptime.n30).toBe(120);
    expect(inputs.integrity.sep10_signed).toBe('pass');
    expect(inputs.integrity.tls_ok).toBe('pass');
    const card = computeCard(inputs);
    expect(card.availability).toBeGreaterThan(90);
    expect(card.integrity).toBeGreaterThan(0);
    expect(card.confidence).toBeGreaterThan(0);
  });

  it('a failed money flow counts against availability', () => {
    const bad = [...Array.from({ length: 10 }, (_, i) => run(i, { success: false }))];
    fs.writeFileSync(log, JSON.stringify(bad));
    const inputs = buildInputs('x_testnet', readTestnetProbeLines(log), windowEnd, { assets: [], marketSamples: [], supplySamples: [], flows: [] })!;
    expect(inputs.uptime.ok30).toBe(0);
  });

  it('verify-score recomputes the daily digests from the testnet log', () => {
    fs.writeFileSync(log, JSON.stringify(runs));
    const inputs = buildInputs('x_testnet', readTestnetProbeLines(log), windowEnd, { assets: [], marketSamples: [], supplySamples: [], flows: [] })!;
    expect(checkDays(inputs, dir, log)).toEqual([]);
    expect(checkDays(inputs, dir)).not.toEqual([]);
  });
});
