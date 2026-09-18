import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readMainnetProbeReports } from './sources.js';

describe('readMainnetProbeReports', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const line = (r: object) => `${JSON.stringify({ settlement_seconds: 1, ...r })}\n`;

  it('reads the last three days of JSON-lines files and skips inconclusive runs', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mainnet-'));
    fs.writeFileSync(
      path.join(dir, 'probe-2026-09-18.jsonl'),
      line({ anchor_id: 'moneygram', success: true, timestamp: '2026-09-18T10:00:00.000Z' }) +
        line({ anchor_id: 'mykobo', success: false, timestamp: '2026-09-18T10:00:00.000Z', inconclusive: true }),
    );
    fs.writeFileSync(
      path.join(dir, 'probe-2026-09-16.jsonl'),
      line({ anchor_id: 'zeam_money', success: false, timestamp: '2026-09-16T10:00:00.000Z' }),
    );
    // Outside the window: never read.
    fs.writeFileSync(
      path.join(dir, 'probe-2026-09-10.jsonl'),
      line({ anchor_id: 'old', success: true, timestamp: '2026-09-10T10:00:00.000Z' }),
    );

    const reports = readMainnetProbeReports(dir, new Date('2026-09-18T12:00:00Z'));
    expect(reports.map((r) => r.anchor_id).sort()).toEqual(['moneygram', 'zeam_money']);
    expect(reports.every((r) => r.source_type === 'RealMainnet')).toBe(true);
    expect(reports[0].dedup_id).toMatch(/^RealMainnet:probe:/);
  });

  it('tolerates a missing directory', () => {
    dir = path.join(os.tmpdir(), 'does-not-exist-mainnet');
    expect(readMainnetProbeReports(dir)).toEqual([]);
  });
});
