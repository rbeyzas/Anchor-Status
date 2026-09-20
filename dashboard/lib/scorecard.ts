// Everything the dashboard says about a score card (docs/SCORING.md
// section 15): flag copy, pillar labels, confidence bands. One place, so
// the card and the detail view never word the same thing differently.

export type FlagName =
  | 'OUTAGE'
  | 'LOW_UPTIME'
  | 'SEP10_MISMATCH'
  | 'DEPEG'
  | 'ONE_WAY_FLOW'
  | 'SILENT'
  | 'LOW_COVERAGE'
  | 'NO_MARKET'
  | 'FROZEN_SUPPLY'
  | 'VOLATILE';

/** Bit positions, as stored on-chain in `ScoreCard.flags`. */
const FLAG_BITS: Record<FlagName, number> = {
  OUTAGE: 0,
  LOW_UPTIME: 1,
  SEP10_MISMATCH: 2,
  DEPEG: 3,
  ONE_WAY_FLOW: 4,
  SILENT: 5,
  LOW_COVERAGE: 6,
  NO_MARKET: 7,
  FROZEN_SUPPLY: 8,
  VOLATILE: 9,
};

export function flagsFromMask(mask: number): FlagName[] {
  return (Object.entries(FLAG_BITS) as [FlagName, number][]).filter(([, bit]) => mask & (1 << bit)).map(([name]) => name);
}

export const FLAG_COPY: Record<FlagName, string> = {
  OUTAGE: 'Outage: last 3 checks failed',
  LOW_UPTIME: 'Uptime under 90% this week',
  SEP10_MISMATCH: 'Sign-in challenge not signed by the published key',
  DEPEG: 'Asset more than 3% off its peg for over 24 hours',
  ONE_WAY_FLOW: 'Assets issued but none redeemed in 14 days',
  SILENT: 'No issuance or redemption in 30 days',
  LOW_COVERAGE: 'Only partly testable: declines anonymous wallets',
  NO_MARKET: 'No liquid market to measure a peg',
  FROZEN_SUPPLY: 'Token supply has not moved in 30 days',
  VOLATILE: 'Asset fell more than 15% on the DEX in a week',
};

/** Flags that cap the score; the rest are information. */
export const GATE_FLAGS: ReadonlySet<FlagName> = new Set(['OUTAGE', 'LOW_UPTIME', 'SEP10_MISMATCH', 'DEPEG', 'ONE_WAY_FLOW', 'FROZEN_SUPPLY', 'VOLATILE']);

export const PILLARS = [
  { key: 'availability', label: 'Availability', hint: 'Share of checks that got an answer, this week and this month' },
  { key: 'speed', label: 'Speed', hint: 'How fast each step answers (95th percentile, this week)' },
  { key: 'integrity', label: 'Integrity', hint: 'stellar.toml, signed sign-in, TLS, stable keys, genuine assets' },
  { key: 'market', label: 'Market', hint: 'How close its own asset trades to its peg' },
] as const;

export type ConfidenceBand = 'insufficient' | 'low' | 'medium' | 'high';

/** Below this confidence the number says too little to show. */
export const CONFIDENCE_TO_SHOW = 40;

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence < CONFIDENCE_TO_SHOW) return 'insufficient';
  if (confidence < 70) return 'low';
  if (confidence < 90) return 'medium';
  return 'high';
}

export const CONFIDENCE_LABEL: Record<ConfidenceBand, string> = {
  insufficient: 'Not enough data',
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
};

/** Below 40 the number says too little to show; the flags still do. */
export const isWithheld = (card: { confidence: number }) => confidenceBand(card.confidence) === 'insufficient';

export type MarketNa = 'not_issuer' | 'no_fiat_reference' | 'not_pegged' | 'no_market';

export const MARKET_NA_REASON: Record<MarketNa, string> = {
  not_issuer: 'this anchor does not issue the assets it lists',
  no_fiat_reference: 'no fiat reference rate for its asset',
  not_pegged: 'its asset does not claim to be worth one unit of anything',
  no_market: 'no liquid market for its asset',
};
