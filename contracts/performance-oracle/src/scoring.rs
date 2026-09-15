use anchor_registry::SourceType;

/// Default score assigned to an anchor that has never received a report
/// (matches AnchorRegistry.register_anchor's initial score of 100 — see
/// that contract's `AnchorInfo::score` default).
pub const DEFAULT_SCORE: u32 = 100;

/// Score at/below which PerformanceOracle triggers a slash on AnchorRegistry.
/// Matches the dashboard's "red" threshold (see dashboard/README.md).
pub const SLASH_THRESHOLD: u32 = 55;

/// Fraction of an anchor's current stake slashed each time its score drops
/// to/below SLASH_THRESHOLD, expressed in basis points (1000 = 10%).
pub const SLASH_BPS: i128 = 1000;
const BPS_DENOMINATOR: i128 = 10_000;

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

/// Weighted EMA update: new = old * (1000 - w) / 1000 + observation * w / 1000,
/// computed in u64 to avoid intermediate overflow, clamped to [0, 100].
pub fn ema_update(old_score: u32, observation: u32, source_type: &SourceType) -> u32 {
    let w = source_weight_permille(source_type);
    let old = old_score as u64;
    let obs = observation as u64;
    let new_score = (old * (1000 - w) + obs * w) / 1000;
    new_score.min(100) as u32
}

/// 10% (SLASH_BPS) of `current_stake`, floored, capped so it never exceeds
/// the stake itself (defensive; callers should already guarantee this).
pub fn slash_amount(current_stake: i128) -> i128 {
    let amount = current_stake * SLASH_BPS / BPS_DENOMINATOR;
    amount.min(current_stake).max(0)
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

    #[test]
    fn slash_amount_is_ten_percent() {
        assert_eq!(slash_amount(1_000_000), 100_000);
        assert_eq!(slash_amount(0), 0);
        assert_eq!(slash_amount(5), 0); // rounds down
    }
}
