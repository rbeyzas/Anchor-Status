import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadArchive, mergeAnchor, saveArchive } from './archive.js';
import { emptyArchive } from './types.js';

describe('mergeAnchor', () => {
  it('keeps existing entries when a run returns nothing', () => {
    const existing = {
      scoreHistory: [{ timestamp: '2026-09-17T10:00:00Z', score: 80 }],
      slashEvents: [{ timestamp: '2026-09-17T10:00:00Z', amountStroops: '100' }],
    };
    // Every existing entry survives; the merge may add an empty riskEvents list.
    expect(mergeAnchor(existing, { scoreHistory: [], slashEvents: [] })).toMatchObject(existing);
  });

  it('does not duplicate an entry seen in two overlapping runs', () => {
    const point = { timestamp: '2026-09-17T10:00:00Z', score: 80 };
    const once = mergeAnchor(undefined, { scoreHistory: [point], slashEvents: [] });
    const twice = mergeAnchor(once, { scoreHistory: [point], slashEvents: [] });
    expect(twice.scoreHistory).toHaveLength(1);
  });

  it('keeps two different scores that share a ledger close time', () => {
    const merged = mergeAnchor(undefined, {
      scoreHistory: [
        { timestamp: '2026-09-17T10:00:00Z', score: 80 },
        { timestamp: '2026-09-17T10:00:00Z', score: 75 },
      ],
      slashEvents: [],
    });
    expect(merged.scoreHistory).toHaveLength(2);
  });

  it('sorts merged history oldest first', () => {
    const merged = mergeAnchor(
      { scoreHistory: [{ timestamp: '2026-09-17T12:00:00Z', score: 60 }], slashEvents: [] },
      { scoreHistory: [{ timestamp: '2026-09-17T09:00:00Z', score: 90 }], slashEvents: [] },
    );
    expect(merged.scoreHistory.map((p) => p.score)).toEqual([90, 60]);
  });
});

describe('mergeAnchor risk events', () => {
  it('reads an archive written before risk tracking, and adds risk events to it', () => {
    const old = { scoreHistory: [{ timestamp: '2026-09-17T10:00:00Z', score: 80 }], slashEvents: [] };
    const merged = mergeAnchor(old, {
      scoreHistory: [],
      slashEvents: [],
      riskEvents: [{ timestamp: '2026-09-18T10:00:00Z', riskReason: 'ConsecutiveFailures', score: 61, trend: 'Degrading' }],
    });
    expect(merged.scoreHistory).toHaveLength(1);
    expect(merged.riskEvents).toHaveLength(1);
  });

  it('does not duplicate a risk event seen in overlapping runs', () => {
    const event = { timestamp: '2026-09-18T10:00:00Z', riskReason: 'LowSuccessRate', score: 58, trend: 'Improving' };
    const once = mergeAnchor(undefined, { scoreHistory: [], slashEvents: [], riskEvents: [event] });
    const twice = mergeAnchor(once, { scoreHistory: [], slashEvents: [], riskEvents: [event] });
    expect(twice.riskEvents).toHaveLength(1);
  });
});

describe('loadArchive / saveArchive', () => {
  it('round-trips and keeps a .bak of the previous contents', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-'));
    const file = path.join(dir, 'history.json');

    const first = emptyArchive();
    first.anchors.a = { scoreHistory: [{ timestamp: '2026-09-17T10:00:00Z', score: 1 }], slashEvents: [] };
    saveArchive(file, first);

    const second = loadArchive(file);
    second.anchors.a.scoreHistory.push({ timestamp: '2026-09-17T11:00:00Z', score: 2 });
    saveArchive(file, second);

    expect(loadArchive(file).anchors.a.scoreHistory).toHaveLength(2);
    expect(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf-8')).anchors.a.scoreHistory).toHaveLength(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty archive when the file does not exist', () => {
    expect(loadArchive('/nonexistent/history.json').anchors).toEqual({});
  });

  it('refuses to load an unrecognized format rather than dropping history', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-'));
    const file = path.join(dir, 'history.json');
    fs.writeFileSync(file, JSON.stringify({ version: 99, anchors: {} }));
    expect(() => loadArchive(file)).toThrow(/Unrecognized archive format/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
