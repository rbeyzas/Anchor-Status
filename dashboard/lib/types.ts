export type SourceType = 'RealMainnet' | 'RealTestnet' | 'SimulatedMock';

export interface ScorePoint {
  /** ISO 8601 timestamp. */
  timestamp: string;
  score: number;
  /** SHA-256 (hex) of the evidence document published with the report. */
  evidence?: string;
}

export interface SlashEvent {
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Amount slashed, in XLM (already converted from stroops). */
  amount: number;
}

export type Trend = 'Stable' | 'Improving' | 'Degrading';
export type RiskReason = 'None' | 'ConsecutiveFailures' | 'LowSuccessRate' | 'ScoreBelowFloor';

/** PerformanceOracle's on-chain health record for one anchor. */
export interface AnchorHealth {
  trend: Trend;
  riskReason: RiskReason;
  consecutiveFailures: number;
  /** Success rate over the recent outcome window, whole percent. */
  recentSuccessPercent: number;
  recentCount: number;
  /** Total reports ever received — confidence in the score, not part of it. */
  observations: number;
}

/** Off-chain context from mainnet-probe: how the directory lists the anchor,
 * and what its latest check found. */
export interface AnchorStatusView {
  /** StellarExpert's directory flag. Shown next to what we measured. */
  listing?: 'abandoned' | 'unsafe';
  /** Not seen answering for a week; checked every few hours. */
  dormant: boolean;
  checkedAt?: string;
  /** undefined when the last check was inconclusive (our failure, not theirs). */
  reachable?: boolean;
  problem?: string;
  policyNote?: string;
}

export interface AnchorViewModel {
  anchorId: string;
  name: string;
  domain: string;
  sourceType: SourceType;
  /** Stake, in XLM (already converted from stroops). */
  stake: number;
  score: number;
  /** Ascending by timestamp, oldest first. Up to ~30 days, limited by
   * Soroban RPC's event retention window when backed by live data. */
  scoreHistory: ScorePoint[];
  slashEvents: SlashEvent[];
  lastUpdated: string;
  /** Absent when reading a contract deployed before health tracking. */
  health?: AnchorHealth;
  status?: AnchorStatusView;
}

/** 'unavailable': the chain could not be read, and nothing is shown. */
export type DataSource = 'live' | 'unavailable';

/** A registered anchor whose on-chain record could not be read this time. */
export interface UnreadableAnchor {
  anchorId: string;
  error: string;
}

export interface DashboardData {
  anchors: AnchorViewModel[];
  dataSource: DataSource;
  unreadable: UnreadableAnchor[];
  /** Why the chain could not be read, when dataSource === 'unavailable'. */
  liveError?: string;
}

export type ScoreTier = 'high' | 'medium' | 'low';

export function scoreTier(score: number): ScoreTier {
  if (score >= 80) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}
