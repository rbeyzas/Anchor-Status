import type { AnchorHealth, RiskReason, Trend } from './types';

/** Short badge text for why an anchor is flagged, or null when it isn't. */
export const RISK_LABEL: Record<RiskReason, string | null> = {
  None: null,
  ConsecutiveFailures: 'Outage: failing in a row',
  LowSuccessRate: 'Mostly failing recently',
  ScoreBelowFloor: 'Score below floor',
};

export const TREND_LABEL: Record<Trend, string> = {
  Stable: 'Stable',
  Improving: 'Improving',
  Degrading: 'Degrading',
};

/** One-line plain-language summary of an anchor's recent record. */
export function describeHealth(health: AnchorHealth): string {
  const parts = [
    `${health.recentSuccessPercent}% of the last ${health.recentCount} checks succeeded`,
  ];
  if (health.consecutiveFailures > 0) {
    parts.push(`${health.consecutiveFailures} failed in a row`);
  }
  parts.push(`${health.observations} checks in total`);
  return parts.join(' · ');
}
