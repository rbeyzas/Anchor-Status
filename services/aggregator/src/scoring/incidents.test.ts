import { describe, expect, it } from 'vitest';
import { applyIncidents, COLLECTOR_INCIDENTS, type CollectorIncident } from './incidents.js';
import type { ProbeLine } from './inputs.js';

const INCIDENT: CollectorIncident = {
  id: 'test-incident',
  reason: 'our own host could not look up names',
  windows: [{ from: '2026-01-10T00:00:00Z', to: '2026-01-10T01:00:00Z' }],
  proof: { from: '2026-01-10T06:00:00Z', to: '2026-01-10T07:00:00Z' },
};

function probe(anchor: string, timestamp: string, stage?: { ok: boolean; error?: string }): ProbeLine {
  return {
    anchor_id: anchor,
    timestamp,
    success: stage === undefined,
    stages: stage === undefined ? { toml: { ok: true } } : { toml: stage },
  };
}

const unreachable = { ok: false, error: 'fetch failed' };
/** Proof that this anchor answered us after the incident. */
const proof = (anchor: string) => probe(anchor, '2026-01-10T06:30:00Z');

describe('applyIncidents', () => {
  it('drops a connection failure inside the window for a host proven reachable', () => {
    const lines = [probe('a', '2026-01-10T00:30:00Z', unreachable), proof('a')];
    expect(applyIncidents(lines, [INCIDENT])).toEqual([{ incident: 'test-incident', anchor_id: 'a', probes: 1 }]);
    expect(lines[0].inconclusive).toBe(true);
    expect(lines[0].excluded_by).toBe('test-incident');
  });

  it('keeps the failure of a host that never answered us: it is the anchor that is gone', () => {
    const lines = [probe('gone', '2026-01-10T00:30:00Z', unreachable)];
    expect(applyIncidents(lines, [INCIDENT])).toEqual([]);
    expect(lines[0].inconclusive).toBeUndefined();
  });

  it('keeps a failure the anchor answered with, even mid-incident', () => {
    // An HTTP status means our name lookup and connection both worked.
    const lines = [probe('a', '2026-01-10T00:30:00Z', { ok: false, error: 'HTTP 404 from https://a/x' }), proof('a')];
    expect(applyIncidents(lines, [INCIDENT])).toEqual([]);
    expect(lines[0].inconclusive).toBeUndefined();
  });

  it('leaves the rounds between two windows alone', () => {
    const two: CollectorIncident = {
      ...INCIDENT,
      windows: [
        { from: '2026-01-10T00:00:00Z', to: '2026-01-10T00:10:00Z' },
        { from: '2026-01-10T02:00:00Z', to: '2026-01-10T02:10:00Z' },
      ],
    };
    // The anchor's own timeout, in a round that ran normally: not ours.
    const between = probe('a', '2026-01-10T01:00:00Z', unreachable);
    const lines = [probe('a', '2026-01-10T00:05:00Z', unreachable), between, probe('a', '2026-01-10T02:05:00Z', unreachable), proof('a')];
    expect(applyIncidents(lines, [two])).toEqual([{ incident: 'test-incident', anchor_id: 'a', probes: 2 }]);
    expect(between.inconclusive).toBeUndefined();
  });

  it('leaves everything outside the window alone', () => {
    const before = probe('a', '2026-01-09T23:59:59Z', unreachable);
    const after = probe('a', '2026-01-10T01:00:00Z', unreachable); // `to` is exclusive
    const lines = [before, after, proof('a')];
    expect(applyIncidents(lines, [INCIDENT])).toEqual([]);
    expect([before.inconclusive, after.inconclusive]).toEqual([undefined, undefined]);
  });

  it('never turns a success into an exclusion, and counts each anchor once', () => {
    const lines = [
      probe('a', '2026-01-10T00:10:00Z', unreachable),
      probe('a', '2026-01-10T00:40:00Z', unreachable),
      probe('a', '2026-01-10T00:50:00Z'),
      proof('a'),
    ];
    expect(applyIncidents(lines, [INCIDENT])).toEqual([{ incident: 'test-incident', anchor_id: 'a', probes: 2 }]);
    expect(lines[2].inconclusive).toBeUndefined();
  });

  it('will not accept a success from inside the incident as proof', () => {
    // Otherwise a flaky round could forgive its own failures.
    const lines = [probe('a', '2026-01-10T00:30:00Z', unreachable), probe('a', '2026-01-10T00:45:00Z')];
    expect(applyIncidents(lines, [INCIDENT])).toEqual([]);
  });

  it('is idempotent: running it twice drops the same probes once', () => {
    const lines = [probe('a', '2026-01-10T00:30:00Z', unreachable), proof('a')];
    applyIncidents(lines, [INCIDENT]);
    expect(applyIncidents(lines, [INCIDENT])).toEqual([]);
    expect(lines.filter((l) => l.inconclusive)).toHaveLength(1);
  });
});

describe('the declared incidents', () => {
  it('are each a closed window with a proof window that comes after it', () => {
    for (const i of COLLECTOR_INCIDENTS) {
      expect(i.id, 'an id is what the published bundles cite').toMatch(/^[a-z0-9-]+$/);
      expect(i.reason.length, 'the reason is published as written').toBeGreaterThan(20);
      expect(i.windows.length, 'an incident names the rounds it covers').toBeGreaterThan(0);
      for (const w of i.windows) expect(Date.parse(w.from)).toBeLessThan(Date.parse(w.to));
      const last = Math.max(...i.windows.map((w) => Date.parse(w.to)));
      expect(Date.parse(i.proof.from), 'the collector must be proven good after the incident, not during it').toBeGreaterThanOrEqual(last);
      expect(Date.parse(i.proof.from)).toBeLessThan(Date.parse(i.proof.to));
    }
  });
});
