use anchor_registry::SourceType;

use crate::types::{AnchorHealth, RiskReason, Trend};

/// Default score assigned to an anchor that has never received a report
/// (matches AnchorRegistry.register_anchor's initial score of 100 — see
/// that contract's `AnchorInfo::score` default).
pub const DEFAULT_SCORE: u32 = 100;

/// Absolute floor: a headline score at/below this flags the anchor as at
/// risk. Matches the dashboard's "red" threshold (see dashboard/README.md).
/// The oracle only publishes this — it never moves anyone's stake.
pub const RISK_SCORE_FLOOR: u32 = 55;

/// EMA weights for the trend pair, in permille. Unlike the headline score
/// these are the same for every source: they describe one anchor's own
/// history against itself.
pub const FAST_WEIGHT_PERMILLE: u64 = 500;
pub const SLOW_WEIGHT_PERMILLE: u64 = 80;
/// How far the fast EMA must sit from the slow one before it counts as a
/// trend rather than noise.
pub const TREND_MARGIN: u32 = 10;

/// Number of most recent outcomes kept for the success-rate floor.
pub const OUTCOME_WINDOW: u32 = 20;
/// Reports in a row that must fail to flag an outage. At a 20-minute
/// collection cadence, 3 is an hour of failures.
pub const FLOOR_CONSECUTIVE_FAILURES: u32 = 3;
/// The success-rate floor only applies once the window holds this many
/// outcomes, so one early failure can't flag a brand-new anchor.
pub const FLOOR_MIN_SAMPLES: u32 = 10;
pub const FLOOR_MIN_SUCCESS_PERCENT: u32 = 50;

/// EMA smoothing weight per source type, in basis points of 1000 (i.e. a
/// "permille" alpha). Real mainnet/testnet observations move the score
/// faster (more trusted) than simulated mock data.
fn source_weight_permille(source_type: &SourceType) -> u64 {
    match source_type {
        SourceType::RealMainnet => 350,
        SourceType::RealTestnet => 350,
        SourceType::SimulatedMock => 150,
    }
}

/// Converts a single report into a 0-100 "observation score": a failure is
/// always 0; a success decays linearly from 100 (settled within 60s) down
/// to a floor of 40 (settled at/after 600s) — a slow success is still far
/// better than an outright failure, but speed matters.
pub fn observation_score(success: bool, settlement_seconds: u64) -> u32 {
    if !success {
        return 0;
    }
    const FAST_THRESHOLD: u64 = 60;
    const SLOW_THRESHOLD: u64 = 600;
    const FLOOR: u64 = 40;

    if settlement_seconds <= FAST_THRESHOLD {
        100
    } else if settlement_seconds >= SLOW_THRESHOLD {
        FLOOR as u32
    } else {
        let range = SLOW_THRESHOLD - FAST_THRESHOLD;
        let elapsed = settlement_seconds - FAST_THRESHOLD;
        let decay = (100 - FLOOR) * elapsed / range;
        (100 - decay) as u32
    }
}

/// new = old * (1000 - w) / 1000 + observation * w / 1000, computed in u64
/// to avoid intermediate overflow, clamped to [0, 100].
fn ema_with_weight(old_score: u32, observation: u32, weight_permille: u64) -> u32 {
    let old = old_score as u64;
    let obs = observation as u64;
    let new_score = (old * (1000 - weight_permille) + obs * weight_permille) / 1000;
    new_score.min(100) as u32
}

/// Weighted EMA update for the headline score, weighted by source type.
pub fn ema_update(old_score: u32, observation: u32, source_type: &SourceType) -> u32 {
    ema_with_weight(old_score, observation, source_weight_permille(source_type))
}

pub fn new_health() -> AnchorHealth {
    AnchorHealth {
        fast_score: DEFAULT_SCORE,
        slow_score: DEFAULT_SCORE,
        trend: Trend::Stable,
        consecutive_failures: 0,
        recent_outcomes: 0,
        recent_count: 0,
        observations: 0,
        risk_reason: RiskReason::None,
        last_report_at: 0,
    }
}

pub fn trend(fast_score: u32, slow_score: u32) -> Trend {
    if fast_score + TREND_MARGIN < slow_score {
        Trend::Degrading
    } else if fast_score > slow_score + TREND_MARGIN {
        Trend::Improving
    } else {
        Trend::Stable
    }
}

fn window_mask(count: u32) -> u32 {
    if count >= 32 {
        u32::MAX
    } else {
        (1u32 << count) - 1
    }
}

/// Success rate over the recent window, in whole percent. 100 when empty.
pub fn success_percent(recent_outcomes: u32, recent_count: u32) -> u32 {
    if recent_count == 0 {
        return 100;
    }
    let successes = (recent_outcomes & window_mask(recent_count)).count_ones();
    successes * 100 / recent_count
}

/// The first floor rule that trips, or `RiskReason::None`. These are checked
/// independently of the EMA on purpose: a short recovery can pull the EMA
/// back over the floor while most of the window is still failures.
pub fn risk_reason(score: u32, health: &AnchorHealth) -> RiskReason {
    if health.consecutive_failures >= FLOOR_CONSECUTIVE_FAILURES {
        RiskReason::ConsecutiveFailures
    } else if health.recent_count >= FLOOR_MIN_SAMPLES
        && success_percent(health.recent_outcomes, health.recent_count) < FLOOR_MIN_SUCCESS_PERCENT
    {
        RiskReason::LowSuccessRate
    } else if score <= RISK_SCORE_FLOOR {
        RiskReason::ScoreBelowFloor
    } else {
        RiskReason::None
    }
}

/// Folds one report into an anchor's health. `score` is the headline score
/// after this report.
pub fn update_health(
    mut health: AnchorHealth,
    success: bool,
    observation: u32,
    score: u32,
    timestamp: u64,
) -> AnchorHealth {
    health.fast_score = ema_with_weight(health.fast_score, observation, FAST_WEIGHT_PERMILLE);
    health.slow_score = ema_with_weight(health.slow_score, observation, SLOW_WEIGHT_PERMILLE);
    health.trend = trend(health.fast_score, health.slow_score);

    health.consecutive_failures = if success {
        0
    } else {
        health.consecutive_failures.saturating_add(1)
    };
    health.recent_outcomes =
        ((health.recent_outcomes << 1) | success as u32) & window_mask(OUTCOME_WINDOW);
    health.recent_count = (health.recent_count + 1).min(OUTCOME_WINDOW);

    health.observations = health.observations.saturating_add(1);
    health.last_report_at = timestamp;
    health.risk_reason = risk_reason(score, &health);
    health
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn observation_score_failure_is_zero() {
        assert_eq!(observation_score(false, 5), 0);
        assert_eq!(observation_score(false, 10_000), 0);
    }

    #[test]
    fn observation_score_fast_success_is_100() {
        assert_eq!(observation_score(true, 0), 100);
        assert_eq!(observation_score(true, 60), 100);
    }

    #[test]
    fn observation_score_slow_success_floors_at_40() {
        assert_eq!(observation_score(true, 600), 40);
        assert_eq!(observation_score(true, 10_000), 40);
    }

    #[test]
    fn observation_score_decays_monotonically() {
        let a = observation_score(true, 100);
        let b = observation_score(true, 300);
        let c = observation_score(true, 500);
        assert!(a > b);
        assert!(b > c);
        assert!(c >= 40);
    }

    #[test]
    fn ema_weights_real_sources_more_than_mock() {
        // Same bad observation (0) applied to a perfect score: a
        // RealMainnet report should move the score down further than a
        // SimulatedMock report, since real sources are weighted heavier.
        let real = ema_update(100, 0, &SourceType::RealMainnet);
        let mock = ema_update(100, 0, &SourceType::SimulatedMock);
        assert!(real < mock);
    }

    #[test]
    fn ema_converges_toward_observation() {
        let mut score = 100u32;
        for _ in 0..50 {
            score = ema_update(score, 0, &SourceType::RealMainnet);
        }
        assert!(score < 5);
    }

    fn feed(health: AnchorHealth, outcomes: &[bool]) -> AnchorHealth {
        let mut h = health;
        let mut score = DEFAULT_SCORE;
        for &ok in outcomes {
            let obs = observation_score(ok, 10);
            score = ema_update(score, obs, &SourceType::RealTestnet);
            h = update_health(h, ok, obs, score, 0);
        }
        h
    }

    #[test]
    fn success_percent_counts_only_the_filled_part_of_the_window() {
        assert_eq!(success_percent(0, 0), 100);
        assert_eq!(success_percent(0b1, 1), 100);
        assert_eq!(success_percent(0b10, 2), 50);
        // Bits beyond recent_count are ignored.
        assert_eq!(success_percent(0b1110, 1), 0);
    }

    #[test]
    fn window_keeps_only_the_latest_outcomes() {
        let h = feed(new_health(), &[false; 25]);
        assert_eq!(h.recent_count, OUTCOME_WINDOW);
        let h = feed(h, &[true; 20]);
        assert_eq!(success_percent(h.recent_outcomes, h.recent_count), 100);
    }

    #[test]
    fn consecutive_failures_reset_on_success() {
        let h = feed(new_health(), &[false, false]);
        assert_eq!(h.consecutive_failures, 2);
        let h = feed(h, &[true]);
        assert_eq!(h.consecutive_failures, 0);
    }

    #[test]
    fn slow_successes_after_a_good_baseline_read_as_degrading() {
        let mut h = feed(new_health(), &[true; 30]);
        assert_eq!(h.trend, Trend::Stable);
        // Still succeeding, just slowly: observation 40, not a failure.
        let score = ema_update(100, 40, &SourceType::RealTestnet);
        h = update_health(h, true, 40, score, 0);
        assert_eq!(h.trend, Trend::Degrading);
    }

    #[test]
    fn recovery_reads_as_improving() {
        let h = feed(new_health(), &[false; 10]);
        let h = feed(h, &[true; 2]);
        assert_eq!(h.trend, Trend::Improving);
    }

    #[test]
    fn new_anchor_is_not_flagged_by_one_early_failure() {
        let h = feed(new_health(), &[false]);
        assert_eq!(risk_reason(80, &h), RiskReason::None);
    }
}
