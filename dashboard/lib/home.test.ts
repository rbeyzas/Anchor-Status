import { describe, expect, it } from 'vitest';
import { counters, probeExample, proofChain, scoreJourney, shortHash, tickerItems } from './home';
import type { AnchorViewModel, LastProbeView, ScoreCardView } from './types';

const card = (extra: Partial<ScoreCardView> = {}): ScoreCardView => ({
  score: 74,
  availability: 100,
  speed: 100,
  integrity: 100,
  market: null,
  confidence: 48,
  flags: [],
  windowEnd: '2026-09-19T19:00:00Z',
  methodologyVersion: 1,
  inputsHash: 'a'.repeat(64),
  publishedAt: '2026-09-19T19:04:00Z',
  ...extra,
});

const probe = (extra: Partial<LastProbeView> = {}): LastProbeView => ({
  at: '2026-09-19T19:40:00Z',
  success: true,
  expected: ['toml', 'info', 'challenge', 'token', 'initiate'],
  seconds: 1.2,
  stages: [
    { stage: 'toml', ok: true, ms: 200 },
    { stage: 'info', ok: true, ms: 300 },
    { stage: 'challenge', ok: true, ms: 90 },
    { stage: 'token', ok: true, ms: 80 },
    { stage: 'initiate', ok: true, ms: 500 },
  ],
  ...extra,
});

const anchor = (id: string, extra: Partial<AnchorViewModel> = {}): AnchorViewModel => ({
  anchorId: id,
  name: id,
  domain: `${id}.com`,
  sourceType: 'RealMainnet',
  stake: 0,
  score: 0,
  scoreHistory: [{ timestamp: '2026-09-19T19:40:00Z', score: 74, evidence: 'e'.repeat(64) }],
  slashEvents: [],
  lastUpdated: '2026-09-19T19:40:00Z',
  ...extra,
});

describe('counters', () => {
  it('counts mainnet anchors and cards, and the oracle’s own report total', () => {
    const c = counters([
      anchor('a', { card: card({ publishedAt: '2026-09-19T10:00:00Z' }), health: { observations: 90 } as never }),
      anchor('b', { card: card({ publishedAt: '2026-09-19T12:00:00Z' }) }),
      anchor('t', { sourceType: 'RealTestnet', health: { observations: 10 } as never }),
    ]);
    expect(c).toEqual({ anchors: 2, reports: 100, cards: 2, lastPublishedAt: '2026-09-19T12:00:00Z' });
  });
});

describe('probeExample', () => {
  it('shows the passing check that reached the most steps, each in order', () => {
    const shallow = anchor('shallow', { status: { dormant: false, lastProbe: probe({ stages: probe().stages.slice(0, 2) }) } });
    const full = anchor('full', { status: { dormant: false, lastProbe: probe() } });
    const ex = probeExample([shallow, full])!;
    expect(ex.name).toBe('full');
    expect(ex.steps.map((s) => [s.stage, s.state, s.ms])).toEqual([
      ['toml', 'ok', 200],
      ['info', 'ok', 300],
      ['challenge', 'ok', 90],
      ['token', 'ok', 80],
      ['initiate', 'ok', 500],
    ]);
  });

  it('marks a policy decline, a step not reached, and one not advertised', () => {
    const p = probe({
      expected: ['toml', 'info', 'challenge', 'token'],
      stages: [
        { stage: 'toml', ok: true, ms: 200 },
        { stage: 'info', ok: true, ms: 300 },
        { stage: 'challenge', ok: true, ms: 90, policy: true },
      ],
    });
    const ex = probeExample([anchor('mg', { status: { dormant: false, lastProbe: p } })])!;
    expect(ex.steps.map((s) => s.state)).toEqual(['ok', 'ok', 'declined', 'not_run', 'not_advertised']);
  });

  it('shows nothing rather than a failed or missing check', () => {
    expect(probeExample([anchor('x', { status: { dormant: false, lastProbe: probe({ success: false }) } })])).toBeUndefined();
    expect(probeExample([anchor('y')])).toBeUndefined();
  });
});

describe('scoreJourney', () => {
  it('recomputes the top card step by step and lands on its score', () => {
    const j = scoreJourney([anchor('anclap', { card: card() })])!;
    expect(j.raw).toBe(100);
    expect(j.shrunk).toBe(74);
    expect(j.score).toBe(74);
    expect(j.pillars.find((p) => p.key === 'market')).toMatchObject({ value: null, share: 0 });
  });

  it('shows a gate that caps the score', () => {
    const j = scoreJourney([anchor('down', { card: card({ availability: 64, confidence: 100, score: 50, flags: ['OUTAGE'] }) })])!;
    expect(j.caps).toEqual([{ flag: 'OUTAGE', cap: 50 }]);
    expect(j.score).toBe(50);
  });

  it('skips a card whose arithmetic does not reproduce, and withheld cards', () => {
    expect(scoreJourney([anchor('odd', { card: card({ score: 90 }) })])).toBeUndefined();
    expect(scoreJourney([anchor('new', { card: card({ confidence: 30, score: 65 }) })])).toBeUndefined();
  });
});

describe('proofChain', () => {
  it('links the latest evidence, the bundle and the card', () => {
    const p = proofChain([anchor('anclap', { card: card() })])!;
    expect(p.evidence.hash).toBe('e'.repeat(64));
    expect(p.bundle.hash).toBe('a'.repeat(64));
    expect(p.bundle.url.endsWith(`${'a'.repeat(64)}.json`)).toBe(true);
    expect(p.card.score).toBe(74);
  });
});

describe('tickerItems', () => {
  it('lists each active anchor’s last check, newest first, skipping dormant ones', () => {
    const items = tickerItems([
      anchor('old', { status: { dormant: false, lastProbe: probe({ at: '2026-09-19T19:00:00Z' }) } }),
      anchor('new', { status: { dormant: false, lastProbe: probe({ at: '2026-09-19T19:40:00Z', success: false, stages: probe().stages.slice(0, 4) }) } }),
      anchor('dead', { status: { dormant: true, lastProbe: probe() } }),
    ]);
    expect(items.map((i) => [i.name, i.stage, i.ok, i.ms])).toEqual([
      ['new', 'sign-in', false, 1200],
      ['old', 'deposit', true, 1200],
    ]);
  });
});

it('shortHash keeps the first and last four', () => {
  expect(shortHash('3f9a0000000000c21e')).toBe('3f9a…c21e');
});
