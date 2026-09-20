// The scoring engine (docs/SCORING.md): a pure function from a published
// inputs bundle to a score card. No I/O, no clock, no randomness, so anyone
// holding the bundle gets the same card.
import {
  AVAILABILITY_RECENT_SHARE,
  CONFIDENCE_FULL_DAYS,
  CONFIDENCE_FULL_SAMPLES,
  COVERAGE_UNKNOWN,
  DEPEG_HOURS,
  FLAGS,
  MARKET_BELOW_PEG_PENALTY,
  MARKET_BELOW_PEG_SHARE,
  GATE_CAPS,
  INTEGRITY_WEIGHTS,
  LOW_COVERAGE_BELOW,
  LOW_UPTIME_MIN_PROBES,
  LOW_UPTIME_PERCENT,
  MARKET_CURVE,
  MARKET_PENALTY,
  MARKET_PERSISTENT_HOURS,
  MARKET_WIDESPREAD_SHARE,
  ONE_WAY_MIN_MINTS,
  SUPPLY_MIN_SAMPLES,
  SUPPLY_MIN_SPAN_DAYS,
  VOLATILE_DRAWDOWN_PCT,
  OUTAGE_PROBES,
  PRIOR,
  SEP10_MISMATCH_PROBES,
  SPEED_CURVE,
  UPTIME_CURVE,
  WEIGHTS,
  type FlagName,
  type IntegrityCheck,
} from './constants.js';
import type { CheckResult, MarketAggregate, ScoreCard, ScoreInputs } from './types.js';

/** Rounds .5 up. Goes through a fixed decimal first so that a value like
 * 80.49999999999999 (80.5 after float error) still rounds to 81. */
export function roundHalfUp(x: number): number {
  return Math.round(Number(x.toFixed(9)));
}

/** Piecewise-linear through `points` (ascending x), clamped outside. */
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

export const uptimeScore = (percent: number) => interp(UPTIME_CURVE, percent);

const percent = (ok: number, n: number) => (ok / n) * 100;

/** 7- and 30-day uptime blended. With no probe in 7 days, the 30-day
 * uptime stands for both. */
export function availabilityScore(u: ScoreInputs['uptime']): number {
  const u30 = percent(u.ok30, u.n30);
  const u7 = u.n7 > 0 ? percent(u.ok7, u.n7) : u30;
  return roundHalfUp(AVAILABILITY_RECENT_SHARE * uptimeScore(u7) + (1 - AVAILABILITY_RECENT_SHARE) * uptimeScore(u30));
}

/** No successful probe in 7 days means nothing answered: 0, not n/a. */
export function speedScore(p95Seconds: number | null): number {
  return p95Seconds === null ? 0 : roundHalfUp(interp(SPEED_CURVE, p95Seconds));
}

export function integrityScore(checks: Record<IntegrityCheck, CheckResult>): number {
  let applicable = 0;
  let passed = 0;
  for (const [check, weight] of Object.entries(INTEGRITY_WEIGHTS) as [IntegrityCheck, number][]) {
    if (checks[check] === 'na') continue;
    applicable += weight;
    if (checks[check] === 'pass') passed += weight;
  }
  return applicable === 0 ? 0 : roundHalfUp((100 * passed) / applicable);
}

export function assetMarketScore(m: MarketAggregate): number {
  const base = interp(MARKET_CURVE, m.median_bps);
  const penalties =
    (m.share_outside_50 > MARKET_WIDESPREAD_SHARE ? MARKET_PENALTY : 0) +
    (m.longest_run_gt100_hours > MARKET_PERSISTENT_HOURS ? MARKET_PENALTY : 0) +
    // Below the peg is the side a holder cannot escape: above it they can
    // still sell at par, below it they cannot.
    (m.share_below_peg > MARKET_BELOW_PEG_SHARE ? MARKET_BELOW_PEG_PENALTY : 0);
  return roundHalfUp(Math.max(0, base - penalties));
}

/** Weakest link across the anchor's issued assets; null when none has a
 * measurable market. */
export function marketScore(markets: MarketAggregate[]): number | null {
  return markets.length === 0 ? null : Math.min(...markets.map(assetMarketScore));
}

/** How much we measured, 0-100: time and samples, times test depth. */
export function confidenceScore(inputs: Pick<ScoreInputs, 'monitored_days' | 'uptime' | 'coverage'>): number {
  const sufficiency =
    0.5 * Math.min(1, inputs.monitored_days / CONFIDENCE_FULL_DAYS) +
    0.5 * Math.min(1, inputs.uptime.n30 / CONFIDENCE_FULL_SAMPLES);
  const depth = 0.5 + 0.5 * (inputs.coverage ?? COVERAGE_UNKNOWN);
  return roundHalfUp(100 * sufficiency * depth);
}

export function activeFlags(inputs: ScoreInputs): FlagName[] {
  const flags: FlagName[] = [];
  const { uptime, recent } = inputs;
  if (recent.length >= OUTAGE_PROBES && recent.slice(0, OUTAGE_PROBES).every((p) => !p.success)) flags.push('OUTAGE');
  if (uptime.n7 >= LOW_UPTIME_MIN_PROBES && percent(uptime.ok7, uptime.n7) < LOW_UPTIME_PERCENT) flags.push('LOW_UPTIME');
  if (recent.slice(0, SEP10_MISMATCH_PROBES).some((p) => p.sep10_mismatch)) flags.push('SEP10_MISMATCH');
  if (inputs.market.some((m) => m.longest_run_gt300_hours > DEPEG_HOURS)) flags.push('DEPEG');
  if (inputs.flows.some((f) => !f.truncated_14d && f.mint_count_14d >= ONE_WAY_MIN_MINTS && f.burn_count_14d === 0)) {
    flags.push('ONE_WAY_FLOW');
  }
  if (
    inputs.flows.length > 0 &&
    inputs.flows.every((f) => !f.truncated_30d && f.mint_count_30d === 0 && f.burn_count_30d === 0)
  ) {
    flags.push('SILENT');
  }
  // Only a measured coverage: the 0.5 used for an unknown one is not a
  // finding about the anchor.
  if (inputs.coverage !== null && inputs.coverage < LOW_COVERAGE_BELOW) flags.push('LOW_COVERAGE');
  if (inputs.market_na === 'no_market') flags.push('NO_MARKET');
  // A supply that never moved means nothing was minted or burned: the total
  // changes to the seventh decimal on either. Only asked of an asset watched
  // long enough and often enough for that to be a statement about the
  // anchor rather than about how recently we started looking.
  if (
    inputs.supply.some(
      (s) => s.samples >= SUPPLY_MIN_SAMPLES && s.span_days >= SUPPLY_MIN_SPAN_DAYS && s.distinct_values === 1,
    )
  ) {
    flags.push('FROZEN_SUPPLY');
  }
  if (inputs.market.some((m) => m.max_drawdown_pct > VOLATILE_DRAWDOWN_PCT)) flags.push('VOLATILE');
  return flags;
}

export const flagsMask = (flags: FlagName[]) => flags.reduce((mask, f) => mask | (1 << FLAGS[f]), 0);

export function flagNames(mask: number): FlagName[] {
  return (Object.entries(FLAGS) as [FlagName, number][]).filter(([, bit]) => mask & (1 << bit)).map(([name]) => name);
}

/**
 * Weighted pillars, shrunk toward the prior by (1 - confidence), then
 * capped by the lowest active gate. Integer arithmetic on the card's own
 * fields, so it can be checked from the on-chain card alone.
 */
export function headline(
  pillars: { availability: number; speed: number; integrity: number; market: number | null },
  confidence: number,
  flags: FlagName[],
): number {
  let rawSum = WEIGHTS.availability * pillars.availability + WEIGHTS.speed * pillars.speed + WEIGHTS.integrity * pillars.integrity;
  let w = WEIGHTS.availability + WEIGHTS.speed + WEIGHTS.integrity;
  if (pillars.market !== null) {
    rawSum += WEIGHTS.market * pillars.market;
    w += WEIGHTS.market;
  }
  const numerator = confidence * rawSum + (100 - confidence) * PRIOR * w;
  const denominator = 100 * w;
  const shrunk = Math.floor((2 * numerator + denominator) / (2 * denominator));
  const caps = flags.flatMap((f) => (GATE_CAPS[f] !== undefined ? [GATE_CAPS[f]!] : []));
  return Math.min(shrunk, ...caps);
}

export function computeCard(inputs: ScoreInputs): ScoreCard {
  if (inputs.uptime.n30 === 0) throw new Error(`${inputs.anchor_id}: no conclusive probe in 30 days, nothing to score`);
  const pillars = {
    availability: availabilityScore(inputs.uptime),
    speed: speedScore(inputs.speed.p95_seconds),
    integrity: integrityScore(inputs.integrity),
    market: marketScore(inputs.market),
  };
  const confidence = confidenceScore(inputs);
  const flags = activeFlags(inputs);
  return {
    score: headline(pillars, confidence, flags),
    ...pillars,
    confidence,
    flags: flagsMask(flags),
    window_end: inputs.window_end,
    methodology_version: inputs.methodology_version,
  };
}
