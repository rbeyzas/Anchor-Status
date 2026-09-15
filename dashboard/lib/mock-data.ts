import type { AnchorViewModel, ScorePoint, SlashEvent } from './types';

// Deterministic PRNG so the fixture looks the same on every render/build,
// which matters for the "start dev server, look at it in a browser" check.
function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daysAgo(n: number, hoursOffset = 0): string {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() - n * 24 - hoursOffset, 0, 0, 0);
  return d.toISOString();
}

function buildSteadyHistory(days: number, baseScore: number, noise: number, seed: number): ScorePoint[] {
  const rng = mulberry32(seed);
  const points: ScorePoint[] = [];
  for (let i = days; i >= 0; i--) {
    const wiggle = (rng() - 0.5) * noise * 2;
    const score = Math.max(0, Math.min(100, Math.round(baseScore + wiggle)));
    points.push({ timestamp: daysAgo(i), score });
  }
  return points;
}

function buildDegradingHistory(
  days: number,
  baseScore: number,
  degradedScore: number,
  degradeAtDaysAgo: number,
  noise: number,
  seed: number,
): ScorePoint[] {
  const rng = mulberry32(seed);
  const points: ScorePoint[] = [];
  for (let i = days; i >= 0; i--) {
    const isDegraded = i <= degradeAtDaysAgo;
    const target = isDegraded ? degradedScore : baseScore;
    const wiggle = (rng() - 0.5) * noise * 2;
    const score = Math.max(0, Math.min(100, Math.round(target + wiggle)));
    points.push({ timestamp: daysAgo(i), score });
  }
  return points;
}

const realMainnetAnchor: AnchorViewModel = {
  anchorId: 'anchor_live_mainnet_1',
  name: 'Mykobo (live example)',
  domain: 'mykobo.co',
  sourceType: 'RealMainnet',
  stake: 42_000,
  score: 91,
  scoreHistory: buildSteadyHistory(30, 91, 3, 1),
  slashEvents: [],
  lastUpdated: daysAgo(0, 1),
};

const realTestnetAnchor: AnchorViewModel = {
  anchorId: 'anchor_live_testnet_1',
  name: 'Stellar Test Anchor',
  domain: 'testanchor.stellar.org',
  sourceType: 'RealTestnet',
  stake: 15_000,
  score: 74,
  scoreHistory: buildSteadyHistory(30, 74, 8, 2),
  slashEvents: [],
  lastUpdated: daysAgo(0, 2),
};

const mockAnchor1: AnchorViewModel = {
  anchorId: 'mock_anchor_1',
  name: 'Mock Anchor 1',
  domain: 'localhost:8001',
  sourceType: 'SimulatedMock',
  stake: 8_000,
  score: 96,
  scoreHistory: buildSteadyHistory(30, 96, 2, 3),
  slashEvents: [],
  lastUpdated: daysAgo(0, 0.5),
};

// Degrades ~12h ago, so the score 24h-ago (still high) vs. now (low)
// comparison used for the "Recent slashing" badge shows a real drop.
const degradedHistory = buildDegradingHistory(30, 90, 32, 0.5, 4, 4);
const mockAnchor3: AnchorViewModel = {
  anchorId: 'mock_anchor_3',
  name: 'Mock Anchor 3 (degrading)',
  domain: 'localhost:8003',
  sourceType: 'SimulatedMock',
  stake: 6_500,
  score: degradedHistory[degradedHistory.length - 1].score,
  scoreHistory: degradedHistory,
  slashEvents: [{ timestamp: daysAgo(0, 10), amount: 650 }],
  lastUpdated: daysAgo(0, 0.2),
};

const mockAnchor4: AnchorViewModel = {
  anchorId: 'mock_anchor_4',
  name: 'Mock Anchor 4 (unreliable)',
  domain: 'localhost:8004',
  sourceType: 'SimulatedMock',
  stake: 3_200,
  score: 31,
  scoreHistory: buildSteadyHistory(30, 31, 6, 5),
  slashEvents: [
    { timestamp: daysAgo(18), amount: 400 },
    { timestamp: daysAgo(9), amount: 300 },
  ],
  lastUpdated: daysAgo(0, 3),
};

export const MOCK_ANCHORS: AnchorViewModel[] = [
  realMainnetAnchor,
  realTestnetAnchor,
  mockAnchor1,
  mockAnchor3,
  mockAnchor4,
];
