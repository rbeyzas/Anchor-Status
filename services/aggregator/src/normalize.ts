import type {
  MainnetProbeResult,
  MockAnchorLogEntry,
  NormalizedReport,
  PassiveMonitorProfile,
  TestnetProbeResult,
} from './types.js';

/**
 * passive-monitor produces an AGGREGATE activity profile (payment volume
 * and frequency over the lookback window), not individual deposit
 * success/failure events — Horizon's payment history has no notion of
 * "settlement latency" the way a SEP-24 flow does. We derive one synthetic
 * report per profile:
 *   - success: the anchor showed at least one real payment in the window
 *     (i.e. it's actually alive and processing on mainnet).
 *   - settlement_seconds: a proxy for typical time-between-payments,
 *     computed as (lookback window / tx count) — NOT a real deposit
 *     latency measurement. When there's no activity at all, we report the
 *     full lookback window in seconds, the worst-case signal we have.
 * This is a deliberate, documented approximation — see
 * services/aggregator/README.md.
 */
export function normalizePassiveMonitorProfile(profile: PassiveMonitorProfile): NormalizedReport {
  const lookbackSeconds = profile.lookback_days * 24 * 60 * 60;
  const success = profile.overall.txCount > 0;
  const settlementSeconds =
    profile.overall.txCount > 0 ? lookbackSeconds / profile.overall.txCount : lookbackSeconds;

  return {
    anchor_id: profile.anchor_id,
    success,
    settlement_seconds: settlementSeconds,
    timestamp: profile.generated_at,
    source_type: 'RealMainnet',
    dedup_id: `RealMainnet:${profile.anchor_id}:${profile.generated_at}`,
  };
}

/** A mainnet-probe run: whether the anchor's public SEP-1/6/10/24 surface
 * answered, and how long its API took. Volume plays no part. */
export function normalizeMainnetProbeResult(result: MainnetProbeResult): NormalizedReport {
  return {
    anchor_id: result.anchor_id,
    success: result.success,
    settlement_seconds: result.settlement_seconds,
    timestamp: result.timestamp,
    source_type: 'RealMainnet',
    dedup_id: `RealMainnet:probe:${result.anchor_id}:${result.timestamp}`,
    ...(result.evidence_hash ? { evidence_hash: result.evidence_hash } : {}),
  };
}

export function normalizeTestnetProbeResult(result: TestnetProbeResult): NormalizedReport {
  return {
    anchor_id: result.anchor_id,
    success: result.success,
    settlement_seconds: result.settlement_seconds,
    timestamp: result.timestamp,
    source_type: 'RealTestnet',
    dedup_id: `RealTestnet:${result.anchor_id}:${result.timestamp}`,
    ...(result.evidence_hash ? { evidence_hash: result.evidence_hash } : {}),
  };
}

export function normalizeMockAnchorLogEntry(entry: MockAnchorLogEntry): NormalizedReport {
  return {
    anchor_id: entry.anchor_id,
    success: entry.success,
    settlement_seconds: entry.settlement_seconds,
    timestamp: entry.timestamp,
    source_type: 'SimulatedMock',
    dedup_id: entry.transaction_id
      ? `SimulatedMock:${entry.transaction_id}`
      : `SimulatedMock:${entry.anchor_id}:${entry.timestamp}`,
  };
}

export function dedupKey(report: NormalizedReport): string {
  return report.dedup_id ?? `${report.source_type}:${report.anchor_id}:${report.timestamp}`;
}
