export type SourceType = 'RealMainnet' | 'RealTestnet' | 'SimulatedMock';

/** The shape every source gets normalized into before being submitted to
 * PerformanceOracle.submit_report(). Matches the contract's parameters
 * 1:1 (see contracts/performance-oracle/src/lib.rs). */
export interface NormalizedReport {
  anchor_id: string;
  success: boolean;
  settlement_seconds: number;
  timestamp: string; // ISO 8601
  source_type: SourceType;
  /** Best-effort unique id for dedup; falls back to `${anchor_id}:${timestamp}` if absent. */
  dedup_id?: string;
}

// --- Raw shapes read from each source's own output file ---

export interface PassiveMonitorProfile {
  anchor_id: string;
  domain: string;
  source_type: 'RealMainnet';
  lookback_days: number;
  overall: {
    txCount: number;
    avgFrequencyPerDay: number;
  };
  generated_at: string;
}

export interface TestnetProbeResult {
  anchor_id: string;
  domain: string;
  source_type: 'RealTestnet';
  success: boolean;
  settlement_seconds: number;
  timestamp: string;
  final_transaction_status: string | null;
  /** True when the probe itself failed (e.g. headless UI never rendered)
   * before the anchor could succeed or fail. Never submitted on-chain. */
  inconclusive?: boolean;
  error?: string;
}

export interface MockAnchorLogEntry {
  anchor_id: string;
  success: boolean;
  settlement_seconds: number;
  timestamp: string;
  source_type: 'SimulatedMock';
  transaction_id?: string;
}
