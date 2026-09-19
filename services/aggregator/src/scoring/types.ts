import type { IntegrityCheck } from './constants.js';

export type CheckResult = 'pass' | 'fail' | 'na';

/** The 7-day market aggregates of one asset the anchor issues. */
export interface MarketAggregate {
  code: string;
  issuer: string;
  anchor_asset: string;
  samples: number;
  median_bps: number;
  share_outside_50: number;
  longest_run_gt100_hours: number;
  longest_run_gt300_hours: number;
  /** Reference rate: 1 unit of anchor_asset = rate USD. */
  reference: { source: string; date: string; rate: number };
}

/** Mint and burn counts of one asset the anchor issues. */
export interface FlowAggregate {
  code: string;
  issuer: string;
  mint_count_14d: number;
  burn_count_14d: number;
  mint_count_30d: number;
  burn_count_30d: number;
  /** The payment history hit its page cap inside the window: counts are
   * lower bounds, so the flow gates do not apply. */
  truncated_14d: boolean;
  truncated_30d: boolean;
}

/** Why the Market pillar is n/a, when it is. */
export type MarketNa = 'not_issuer' | 'no_fiat_reference' | 'no_market';

/**
 * Everything a card is computed from. This is the published inputs bundle
 * (schema anchor-status/score-inputs/v1), so anyone can recompute the card
 * with `computeCard` and compare.
 */
export interface ScoreInputs {
  methodology_version: number;
  anchor_id: string;
  /** Unix seconds, floored to the hour. Nothing after it is counted. */
  window_end: number;
  uptime: { n7: number; ok7: number; n30: number; ok30: number };
  /** p95 of the per-probe mean stage time over successful probes in 7
   * days; null when there was no successful probe. */
  speed: { p95_seconds: number | null; samples: number };
  integrity: Record<IntegrityCheck, CheckResult>;
  /** Median ok/expected stages over successful probes in 7 days; null when
   * no probe recorded its expected stages. */
  coverage: number | null;
  /** Days since the anchor's first conclusive probe. */
  monitored_days: number;
  /** The most recent conclusive probes, newest first, at most 3. */
  recent: { success: boolean; sep10_mismatch: boolean }[];
  /** One entry per issued fiat asset with market samples in 7 days. */
  market: MarketAggregate[];
  /** Set when market is empty. */
  market_na?: MarketNa;
  /** Issued fiat assets we tried to sample, whatever came of it. */
  fiat_issued_assets: number;
  /** One entry per asset the anchor issues. */
  flows: FlowAggregate[];
  /** Conclusive probes per UTC day, with a digest of that day's results. */
  days: { date: string; n: number; ok: number; digest: string }[];
}

export interface ScoreCard {
  score: number;
  availability: number;
  speed: number;
  integrity: number;
  market: number | null;
  confidence: number;
  flags: number;
  window_end: number;
  methodology_version: number;
}
