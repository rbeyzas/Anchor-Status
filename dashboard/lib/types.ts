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
