// Every tunable number of the scoring methodology (docs/SCORING.md section
// 17). Changing any of them changes what a card means, so it must come with
// a new METHODOLOGY_VERSION.

export const METHODOLOGY_VERSION = 2;

/** Pillar weights in permille. Availability dominates because an anchor
 * that is down cannot be used at all; Market is often n/a and its weight is
 * then redistributed over the others. */
export const WEIGHTS = { availability: 450, speed: 200, integrity: 200, market: 150 } as const;

/** Where the headline is pulled for an anchor we know little about: the
 * middle, not 100, because "unknown" is not "perfect". */
export const PRIOR = 50;

/** Uptime percent → score, shaped by "nines": 95% uptime is a poor anchor,
 * not a "95". */
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
/** Availability = this share of the 7-day score plus the rest of the
 * 30-day one: recent outages count, without forgetting the month. */
export const AVAILABILITY_RECENT_SHARE = 0.5;

/** p95 of the per-probe mean stage time, in seconds: full marks at or
 * under the first, 40 at or over the second. Healthy anchors answer a
 * stage in well under a second. Initial values, to calibrate. */
export const SPEED_CURVE: [number, number][] = [
  [0.75, 100],
  [5.0, 40],
];

/** Integrity checklist weights (section 6.3). A signing problem and an
 * asset its issuer does not vouch for are what a user is hurt by, so they
 * weigh most. */
export const INTEGRITY_WEIGHTS = {
  toml_valid: 1,
  toml_cors: 1,
  sep10_signed: 3,
  info_valid: 1,
  tls_ok: 1,
  signing_key_stable: 2,
  issuer_home_domain_matches: 3,
} as const;
export type IntegrityCheck = keyof typeof INTEGRITY_WEIGHTS;

/** Confidence: full after this many days of monitoring and this many
 * conclusive probes in 30 days. */
export const CONFIDENCE_FULL_DAYS = 14;
export const CONFIDENCE_FULL_SAMPLES = 100;
/** Coverage used when no probe says how deep it could test. */
export const COVERAGE_UNKNOWN = 0.5;
/** Confidence bands. Below the first the number is withheld. */
export const CONFIDENCE_INSUFFICIENT = 40;
export const CONFIDENCE_LOW = 70;
export const CONFIDENCE_MEDIUM = 90;

/** Flag bits, as stored on-chain in `ScoreCard.flags`. */
export const FLAGS = {
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
} as const;
export type FlagName = keyof typeof FLAGS;

/** Hard caps on the headline. Flags without a cap are information only. */
export const GATE_CAPS: Partial<Record<FlagName, number>> = {
  OUTAGE: 50,
  LOW_UPTIME: 60,
  SEP10_MISMATCH: 40,
  DEPEG: 50,
  ONE_WAY_FLOW: 70,
  FROZEN_SUPPLY: 70,
  VOLATILE: 60,
};

/** OUTAGE: this many most recent conclusive probes all failed. */
export const OUTAGE_PROBES = 3;
/** SEP10_MISMATCH looks at this many most recent conclusive probes. */
export const SEP10_MISMATCH_PROBES = 3;
/** LOW_UPTIME needs this many probes in 7 days, so a few failures on a
 * rarely probed anchor do not cap it. */
export const LOW_UPTIME_MIN_PROBES = 20;
export const LOW_UPTIME_PERCENT = 90;
export const LOW_COVERAGE_BELOW = 0.6;

/** Deviation from the reference rate, in basis points → Market score. */
export const MARKET_CURVE: [number, number][] = [
  [0, 100],
  [25, 100],
  [50, 90],
  [100, 70],
  [200, 45],
  [300, 25],
  [500, 0],
];
/** A gap arbitrage cannot close is what matters, not its size: persistent
 * or widespread deviation costs more than the curve alone. */
export const MARKET_PENALTY = 20;
export const MARKET_WIDESPREAD_SHARE = 0.25; // share of samples over 50 bps
export const MARKET_PERSISTENT_HOURS = 6; // run over 100 bps
/** DEPEG: a run over 300 bps longer than this. A day, so that a currency
 * with a parallel-market rate is not flagged for a brief gap. */
export const DEPEG_HOURS = 24;

/** ONE_WAY_FLOW: issued at least this often in 14 days, never redeemed. */
export const ONE_WAY_MIN_MINTS = 5;

/**
 * FROZEN_SUPPLY: the total outstanding amount never changed. A mint or a
 * burn moves it to the seventh decimal, so identical readings mean nothing
 * settled. It is only asked of an asset with enough readings over enough
 * days to mean anything: on the first day of sampling every asset looks
 * frozen, and that says something about us, not about the anchor.
 */
export const SUPPLY_MIN_SAMPLES = 200;
export const SUPPLY_MIN_SPAN_DAYS = 7;

/**
 * VOLATILE: worst peak-to-trough fall, in percent, over the 7-day trade
 * window. A token meant to hold a peg should not move like this; a holder
 * who needed to sell into that fall did not get what they were promised.
 *
 * Set from the first week of real data rather than from taste. At 7% it
 * caught eight of the nine assets with a measurable market, which ranks
 * nothing; the observed falls ran from 7% to 81%, and 15% separates them.
 */
export const VOLATILE_DRAWDOWN_PCT = 15;

/** Trading below the declared peg is worse than trading above it: a holder
 * above the peg can still sell at par, one below it cannot. Applied when
 * over this share of samples sat more than 50 bps under. */
export const MARKET_BELOW_PEG_PENALTY = 20;
export const MARKET_BELOW_PEG_SHARE = 0.25;

/** Most cards published per aggregator run, so a first run or a backlog
 * cannot hold up the 20-minute round. */
export const MAX_CARDS_PER_RUN = 40;
/** Republish an unchanged card after this long, so its window stays fresh. */
export const REPUBLISH_AFTER_MS = 24 * 60 * 60 * 1000;
