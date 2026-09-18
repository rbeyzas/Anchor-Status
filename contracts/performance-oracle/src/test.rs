#![cfg(test)]

use super::*;
use anchor_registry::{AnchorRegistry, AnchorRegistryClient};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    token, xdr, BytesN, Env, String,
};
use types::{RiskReason, Trend};

struct Harness<'a> {
    env: Env,
    oracle: PerformanceOracleClient<'a>,
    registry: AnchorRegistryClient<'a>,
    token_address: Address,
}

fn setup<'a>(env: &'a Env) -> Harness<'a> {
    env.mock_all_auths();
    let admin = Address::generate(env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token_address = sac.address();

    let registry_id = env.register(AnchorRegistry, ());
    let registry = AnchorRegistryClient::new(env, &registry_id);

    let oracle_id = env.register(PerformanceOracle, ());
    let oracle = PerformanceOracleClient::new(env, &oracle_id);

    registry.init(&admin, &oracle_id, &token_address);
    oracle.init(&admin, &registry_id);

    Harness {
        env: env.clone(),
        oracle,
        registry,
        token_address,
    }
}

fn register_and_stake(h: &Harness, anchor_id: &Symbol, stake_amount: i128) -> Address {
    let operator = Address::generate(&h.env);
    h.registry.register_anchor(
        &operator,
        anchor_id,
        &String::from_str(&h.env, "Test Anchor"),
        &String::from_str(&h.env, "anchor.example.com"),
        &SourceType::RealMainnet,
    );
    if stake_amount > 0 {
        let token_admin = token::StellarAssetClient::new(&h.env, &h.token_address);
        token_admin.mint(&operator, &stake_amount);
        h.registry.stake(anchor_id, &stake_amount);
    }
    operator
}

#[test]
fn authorize_reporter_success() {
    let env = Env::default();
    let h = setup(&env);
    let reporter = Address::generate(&env);

    h.oracle.authorize_reporter(&reporter, &SourceType::RealMainnet);

    assert_eq!(
        h.oracle.get_reporter_source_type(&reporter),
        Some(SourceType::RealMainnet)
    );
}

#[test]
fn submit_report_unauthorized_reporter_fails() {
    let env = Env::default();
    let h = setup(&env);
    let reporter = Address::generate(&env);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 0);

    let result = h.oracle.try_submit_report(
        &reporter,
        &anchor_id,
        &true,
        &30,
        &env.ledger().timestamp(),
        &SourceType::RealMainnet,
    );
    assert_eq!(result, Err(Ok(Error::NotAuthorizedReporter)));
}

#[test]
fn submit_report_wrong_source_type_fails() {
    let env = Env::default();
    let h = setup(&env);
    let reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&reporter, &SourceType::SimulatedMock);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 0);

    let result = h.oracle.try_submit_report(
        &reporter,
        &anchor_id,
        &true,
        &30,
        &env.ledger().timestamp(),
        &SourceType::RealMainnet,
    );
    assert_eq!(result, Err(Ok(Error::ReporterWrongSourceType)));
}

#[test]
fn submit_report_future_timestamp_fails() {
    let env = Env::default();
    let h = setup(&env);
    let reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&reporter, &SourceType::RealMainnet);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 0);

    let future_ts = env.ledger().timestamp() + MAX_FUTURE_SKEW_SECONDS + 1000;
    let result = h.oracle.try_submit_report(
        &reporter,
        &anchor_id,
        &true,
        &30,
        &future_ts,
        &SourceType::RealMainnet,
    );
    assert_eq!(result, Err(Ok(Error::ReportTimestampInFuture)));
}

#[test]
fn submit_report_stale_timestamp_fails() {
    let env = Env::default();
    env.ledger().with_mut(|l| {
        l.timestamp = MAX_REPORT_AGE_SECONDS * 3;
    });
    let h = setup(&env);
    let reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&reporter, &SourceType::RealMainnet);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 0);

    let stale_ts = 0u64;
    let result = h.oracle.try_submit_report(
        &reporter,
        &anchor_id,
        &true,
        &30,
        &stale_ts,
        &SourceType::RealMainnet,
    );
    assert_eq!(result, Err(Ok(Error::ReportTimestampTooOld)));
}

#[test]
fn submit_report_success_updates_score_and_pushes_to_registry() {
    let env = Env::default();
    let h = setup(&env);
    let reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&reporter, &SourceType::RealMainnet);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 0);

    let new_score = h.oracle.submit_report(
        &reporter,
        &anchor_id,
        &true,
        &10,
        &env.ledger().timestamp(),
        &SourceType::RealMainnet,
    );

    // Started at DEFAULT_SCORE (100), a fast success observation (100) keeps it at 100.
    assert_eq!(new_score, 100);
    assert_eq!(h.oracle.get_score(&anchor_id), 100);
    assert_eq!(h.registry.get_anchor_info(&anchor_id).score, 100);
}

#[test]
fn real_mainnet_report_moves_score_more_than_mock_report() {
    let env = Env::default();
    let h = setup(&env);

    let real_reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&real_reporter, &SourceType::RealMainnet);
    let mock_reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&mock_reporter, &SourceType::SimulatedMock);

    let anchor_a = Symbol::new(&env, "anchor_real");
    let anchor_b = Symbol::new(&env, "anchor_mock");
    register_and_stake(&h, &anchor_a, 0);
    register_and_stake(&h, &anchor_b, 0);

    let now = env.ledger().timestamp();
    let score_after_real = h.oracle.submit_report(&real_reporter, &anchor_a, &false, &0, &now, &SourceType::RealMainnet);
    let score_after_mock = h.oracle.submit_report(&mock_reporter, &anchor_b, &false, &0, &now, &SourceType::SimulatedMock);

    assert!(score_after_real < score_after_mock);
}

/// Counts `risk_status_changed` events emitted by the most recent invocation.
fn risk_events(env: &Env) -> u32 {
    let wanted = xdr::ScVal::Symbol(xdr::ScSymbol("risk_status_changed".try_into().unwrap()));
    env.events()
        .all()
        .events()
        .iter()
        .filter(|event| match &event.body {
            xdr::ContractEventBody::V0(body) => body.topics.first() == Some(&wanted),
        })
        .count() as u32
}

#[test]
fn repeated_failures_flag_risk_without_touching_stake() {
    let env = Env::default();
    let h = setup(&env);
    let reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&reporter, &SourceType::RealMainnet);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 1_000_000);

    let now = env.ledger().timestamp();
    let mut last_score = 100u32;
    for _ in 0..10 {
        last_score = h.oracle.submit_report(&reporter, &anchor_id, &false, &0, &now, &SourceType::RealMainnet);
    }

    assert!(last_score <= scoring::RISK_SCORE_FLOOR);
    assert_ne!(h.oracle.get_health(&anchor_id).risk_reason, RiskReason::None);
    // The oracle is a neutral measurement: a collapsing score is published,
    // never turned into a penalty.
    let info_after = h.registry.get_anchor_info(&anchor_id);
    assert_eq!(info_after.stake, 1_000_000, "stake must never move on a bad score");
    assert_eq!(info_after.score, last_score);
}

#[test]
fn three_failures_in_a_row_flag_an_outage_before_the_score_crosses_the_floor() {
    let env = Env::default();
    let h = setup(&env);
    // A mock source moves the headline score slowly (15% weight), so after
    // three failures it is still above the floor — only the consecutive-
    // failure rule can catch the outage this early.
    let reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&reporter, &SourceType::SimulatedMock);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 0);

    let now = env.ledger().timestamp();
    let mut score = 0;
    for _ in 0..3 {
        score = h.oracle.submit_report(&reporter, &anchor_id, &false, &0, &now, &SourceType::SimulatedMock);
    }

    assert!(score > scoring::RISK_SCORE_FLOOR, "score {score} should still be above the floor");
    assert_eq!(h.oracle.get_health(&anchor_id).risk_reason, RiskReason::ConsecutiveFailures);
}

#[test]
fn a_short_recovery_does_not_clear_a_mostly_failing_window() {
    let env = Env::default();
    let h = setup(&env);
    let reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&reporter, &SourceType::RealTestnet);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 0);

    let now = env.ledger().timestamp();
    for _ in 0..8 {
        h.oracle.submit_report(&reporter, &anchor_id, &false, &0, &now, &SourceType::RealTestnet);
    }
    let mut score = 0;
    for _ in 0..3 {
        score = h.oracle.submit_report(&reporter, &anchor_id, &true, &10, &now, &SourceType::RealTestnet);
    }

    // Three fast successes pull the EMA back over the floor...
    assert!(score > scoring::RISK_SCORE_FLOOR, "score {score} should have recovered past the floor");
    // ...but 3 of the last 11 reports is still a failing anchor.
    let health = h.oracle.get_health(&anchor_id);
    assert_eq!(health.risk_reason, RiskReason::LowSuccessRate);
    assert_eq!(health.trend, Trend::Improving);
}

#[test]
fn risk_event_is_published_on_transitions_only() {
    let env = Env::default();
    let h = setup(&env);
    let reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&reporter, &SourceType::RealTestnet);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 0);
    let now = env.ledger().timestamp();

    // env.events().all() only reports the most recent invocation's events,
    // so count after each call.
    let mut transitions = 0;
    for _ in 0..6 {
        h.oracle.submit_report(&reporter, &anchor_id, &false, &0, &now, &SourceType::RealTestnet);
        transitions += risk_events(&env);
    }
    // Healthy -> ScoreBelowFloor -> ConsecutiveFailures: two changes, not six.
    assert_eq!(transitions, 2);
}

#[test]
fn health_of_an_unreported_anchor_is_the_initial_state() {
    let env = Env::default();
    let h = setup(&env);
    let health = h.oracle.get_health(&Symbol::new(&env, "never_seen"));
    assert_eq!(health.observations, 0);
    assert_eq!(health.risk_reason, RiskReason::None);
    assert_eq!(health.trend, Trend::Stable);
}

#[test]
fn direct_update_score_call_without_being_the_oracle_contract_fails() {
    let env = Env::default();
    let h = setup(&env);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 0);

    // `setup()` calls mock_all_auths() for the registration call above.
    // Clear that before the call under test: a direct call to
    // registry.update_score() from the test root (not from within the
    // PerformanceOracle contract's own execution) then has no valid
    // authorization and must fail. This is the real enforcement of "only
    // PerformanceOracle can write a score", which anchor-registry's own
    // unit tests (run with mock_all_auths) cannot exercise on their own.
    env.set_auths(&[]);
    let result = h.registry.try_update_score(&anchor_id, &1);
    assert!(result.is_err());
}

#[test]
fn upgrade_requires_the_admin() {
    let env = Env::default();
    let h = setup(&env);
    env.set_auths(&[]);
    let result = h.oracle.try_upgrade(&BytesN::from_array(&env, &[0u8; 32]));
    assert!(result.is_err());
}
