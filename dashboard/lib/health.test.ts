import { describe, expect, it } from 'vitest';
import { describeHealth, RISK_LABEL } from './health';
import type { AnchorHealth } from './types';

const healthy: AnchorHealth = {
  trend: 'Stable',
  riskReason: 'None',
  consecutiveFailures: 0,
  recentSuccessPercent: 100,
  recentCount: 20,
  observations: 312,
};

describe('RISK_LABEL', () => {
  it('shows no badge for a healthy anchor', () => {
    expect(RISK_LABEL.None).toBeNull();
  });

  it('labels every risk reason the oracle can report', () => {
    for (const reason of ['ConsecutiveFailures', 'LowSuccessRate', 'ScoreBelowFloor'] as const) {
      expect(RISK_LABEL[reason]).toBeTruthy();
    }
  });
});

describe('describeHealth', () => {
  it('omits the failure streak when there is none', () => {
    expect(describeHealth(healthy)).toBe('100% of the last 20 checks succeeded · 312 checks in total');
  });

  it('mentions the failure streak when there is one', () => {
    expect(describeHealth({ ...healthy, consecutiveFailures: 3, recentSuccessPercent: 70 })).toContain(
      '3 failed in a row',
    );
  });
});
