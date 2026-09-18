export type SourceType = 'RealMainnet' | 'RealTestnet' | 'SimulatedMock';

export interface ScorePoint {
  /** ISO 8601 timestamp. */
  timestamp: string;
  score: number;
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
}

export type DataSource = 'live' | 'mock';

export interface DashboardData {
  anchors: AnchorViewModel[];
  dataSource: DataSource;
  /** Set when dataSource === 'mock' because a live RPC read failed. */
  liveError?: string;
}

export type ScoreTier = 'high' | 'medium' | 'low';

export function scoreTier(score: number): ScoreTier {
  if (score >= 80) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}
