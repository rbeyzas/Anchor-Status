import { describe, expect, it } from 'vitest';
import { benignCardError, selectToPublish, windowEndFor } from './publisher.js';
import type { ScoreCard } from './types.js';

const HOUR = 60 * 60 * 1000;
const card = (score: number, window_end: number): ScoreCard => ({
  score,
  availability: 100,
  speed: 100,
  integrity: 100,
  market: null,
  confidence: 80,
  flags: 0,
  window_end,
  methodology_version: 2,
});

describe('windowEndFor', () => {
  const now = Date.parse('2026-10-18T17:42:10Z');

  it('ends on the last full hour without rounds', () => {
    expect(new Date(windowEndFor(now, 0)).toISOString()).toBe('2026-10-18T17:00:00.000Z');
  });

  it('ends on the last round boundary, the window every reporter scores', () => {
    expect(new Date(windowEndFor(now, 6 * 3600)).toISOString()).toBe('2026-10-18T12:00:00.000Z');
    expect(windowEndFor(now, 6 * 3600) / 1000 % (6 * 3600)).toBe(0);
  });
});

describe('selectToPublish with a quorum', () => {
  const now = Date.parse('2026-10-18T18:00:00Z');
  const last = (c: ScoreCard) => ({ published_at: new Date(now - HOUR).toISOString(), inputs_hash: 'h', card: c });

  it('sends every anchor once per round, changed or not', () => {
    const unchanged = { anchorId: 'a', card: card(80, 200) };
    expect(selectToPublish([unchanged], { a: last(card(80, 100)) }, now)).toEqual([]);
    expect(selectToPublish([unchanged], { a: last(card(80, 100)) }, now, true)).toEqual([unchanged]);
  });

  it('still never sends the same round twice', () => {
    expect(selectToPublish([{ anchorId: 'a', card: card(80, 100) }], { a: last(card(80, 100)) }, now, true)).toEqual([]);
  });
});

describe('benignCardError', () => {
  const sim = (code: number) => `Transaction simulation failed: "HostError: Error(Contract, #${code})"`;

  it('names the outcomes that are not failures', () => {
    expect(benignCardError(sim(8))).toBe('round already final');
    expect(benignCardError(sim(12))).toBe('already submitted');
    expect(benignCardError(sim(9))).toBe('not registered');
    expect(benignCardError(sim(10))).toBe('deactivated');
  });

  it('leaves real failures alone', () => {
    expect(benignCardError(sim(7))).toBeNull();
    expect(benignCardError(sim(11))).toBeNull();
    expect(benignCardError(sim(13))).toBeNull();
    expect(benignCardError('fetch failed')).toBeNull();
  });
});

describe('compareShadow', async () => {
  const { compareShadow } = await import('./shadow.js');
  const row = (anchor_id: string, window_end: number, score: number, confidence = 80) => ({
    anchor_id,
    window_end,
    score,
    confidence,
    flags: 0,
    methodology_version: 2,
    recorded_at: '',
  });

  it('pairs the same anchor and window and measures the gap', () => {
    const r = compareShadow(
      [row('a', 1, 80), row('b', 1, 50), row('c', 1, 70), row('only_a', 1, 10)],
      [row('a', 1, 84), row('b', 1, 70), row('c', 2, 70)],
    );
    expect(r.pairs).toBe(2);
    expect(r.shown_pairs).toBe(2);
    expect(r.max).toBe(20);
    expect(r.over['10']).toBe(0.5);
    expect(r.worst[0]).toEqual({ anchor_id: 'b', window_end: 1, a: 50, b: 70 });
  });

  it('leaves out cards either host would withhold', () => {
    const r = compareShadow([row('a', 1, 80, 30)], [row('a', 1, 20)]);
    expect(r.pairs).toBe(1);
    expect(r.shown_pairs).toBe(0);
    expect(r.max).toBe(0);
  });
});

describe('signingKeyFromToml', async () => {
  const { signingKeyFromToml } = await import('../d3.js');
  it('reads the top-level SIGNING_KEY', () => {
    const key = 'GBA7U6K6JNTVEATZNJOT66O6P2W6NLUYQI25JOA6MRM2GHTI26THJXAB';
    expect(signingKeyFromToml(`VERSION = "2.0.0"\nSIGNING_KEY = "${key}"\n`)).toBe(key);
    expect(signingKeyFromToml('VERSION = "2.0.0"\n')).toBeNull();
  });
});
