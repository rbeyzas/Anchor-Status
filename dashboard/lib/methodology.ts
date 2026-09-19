// The scoring methodology's numbers, for the "How we measure" page and its
// calculator. They mirror services/aggregator/src/scoring/constants.ts
// (methodology version 1); the tests pin them to the worked examples of
// docs/SCORING.md, so the page cannot drift from what is published.

export const METHODOLOGY_VERSION = 1;

export const WEIGHTS = { availability: 450, speed: 200, integrity: 200, market: 150 } as const;
export type Pillar = keyof typeof WEIGHTS;

export const PRIOR = 50;

export const UPTIME_CURVE: [number, number][] = [
  [0, 0],
  [80, 10],
  [90, 35],
  [95, 60],
  [97, 75],
  [99, 90],
  [99.5, 100],
  [100, 100],
];

export const SPEED_CURVE: [number, number][] = [
  [0.75, 100],
  [5.0, 40],
];

export const MARKET_CURVE: [number, number][] = [
  [0, 100],
  [25, 100],
  [50, 90],
  [100, 70],
  [200, 45],
  [300, 25],
  [500, 0],
];

export const INTEGRITY_CHECKS = [
  { key: 'toml_valid', weight: 1, label: 'stellar.toml', passes: 'Fetched, parsed, and advertises a SEP-6 or SEP-24 transfer server.' },
  { key: 'toml_cors', weight: 1, label: 'CORS on the toml', passes: 'The toml is served with Access-Control-Allow-Origin, as SEP-1 requires, so browser wallets can read it.' },
  { key: 'sep10_signed', weight: 3, label: 'Signed sign-in', passes: 'The SEP-10 challenge is signed by the SIGNING_KEY the toml publishes.' },
  { key: 'info_valid', weight: 1, label: 'Transfer server /info', passes: 'Returns JSON listing at least one enabled asset.' },
  { key: 'tls_ok', weight: 1, label: 'TLS certificate', passes: 'Valid, and at least 14 days from expiry.' },
  { key: 'signing_key_stable', weight: 2, label: 'Stable signing key', passes: 'The same SIGNING_KEY in every check of the last 30 days.' },
  { key: 'issuer_home_domain_matches', weight: 3, label: 'Genuine assets', passes: 'Every listed asset is vouched for by its issuer: its home domain is this anchor, or lists the asset itself.' },
] as const;

export const GATES = [
  { flag: 'OUTAGE', when: 'The last 3 checks all failed.', cap: 50 },
  { flag: 'SEP10_MISMATCH', when: 'Any of the last 3 sign-in challenges was not signed by the published key.', cap: 40 },
  { flag: 'LOW_UPTIME', when: 'Under 90% uptime this week, over at least 20 checks.', cap: 60 },
  { flag: 'DEPEG', when: 'Its own fiat asset more than 3% off its peg for over 24 hours.', cap: 50 },
  { flag: 'ONE_WAY_FLOW', when: 'Its own asset issued 5 or more times in 14 days and never redeemed.', cap: 70 },
] as const;

export const INFO_FLAGS = [
  { flag: 'LOW_COVERAGE', when: 'We could test less than 60% of its steps, usually because it declines anonymous wallets.' },
  { flag: 'SILENT', when: 'None of its own assets was issued or redeemed in 30 days.' },
  { flag: 'NO_MARKET', when: 'It issues a fiat asset, but no market was liquid enough to measure the peg this week.' },
] as const;

export const CONFIDENCE_BANDS = [
  { from: 0, to: 39, label: 'Not enough data', note: 'The number is withheld; the flags are still shown.' },
  { from: 40, to: 69, label: 'Low' },
  { from: 70, to: 89, label: 'Medium' },
  { from: 90, to: 100, label: 'High' },
] as const;

/** Piecewise-linear through ascending points, clamped outside. */
export function interp(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

/** The headline, exactly as the aggregator computes it: weighted pillars
 * shrunk toward the prior by (1 - confidence), then the lowest gate cap. */
export function headline(
  pillars: { availability: number; speed: number; integrity: number; market: number | null },
  confidence: number,
  caps: number[] = [],
): { raw: number; shrunk: number; score: number } {
  let rawSum = WEIGHTS.availability * pillars.availability + WEIGHTS.speed * pillars.speed + WEIGHTS.integrity * pillars.integrity;
  let w = WEIGHTS.availability + WEIGHTS.speed + WEIGHTS.integrity;
  if (pillars.market !== null) {
    rawSum += WEIGHTS.market * pillars.market;
    w += WEIGHTS.market;
  }
  const numerator = confidence * rawSum + (100 - confidence) * PRIOR * w;
  const denominator = 100 * w;
  const shrunk = Math.floor((2 * numerator + denominator) / (2 * denominator));
  return { raw: rawSum / w, shrunk, score: Math.min(shrunk, ...caps) };
}

/** Each pillar's share of the score, with Market's weight spread over the
 * others when it does not apply. */
export function shares(marketApplies: boolean): Record<Pillar, number> {
  const total = WEIGHTS.availability + WEIGHTS.speed + WEIGHTS.integrity + (marketApplies ? WEIGHTS.market : 0);
  return {
    availability: WEIGHTS.availability / total,
    speed: WEIGHTS.speed / total,
    integrity: WEIGHTS.integrity / total,
    market: marketApplies ? WEIGHTS.market / total : 0,
  };
}
