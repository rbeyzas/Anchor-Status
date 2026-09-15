#![cfg(test)]

use super::*;
use anchor_registry::{AnchorRegistry, AnchorRegistryClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Env,
};

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

#[test]
fn repeated_failures_drop_score_below_threshold_and_trigger_slash() {
    let env = Env::default();
    let h = setup(&env);
    let reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&reporter, &SourceType::RealMainnet);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 1_000_000);

    let stake_before = h.registry.get_anchor_info(&anchor_id).stake;
    assert_eq!(stake_before, 1_000_000);

    let mut last_score = 100u32;
    let now = env.ledger().timestamp();
    for _ in 0..10 {
        last_score = h.oracle.submit_report(&reporter, &anchor_id, &false, &0, &now, &SourceType::RealMainnet);
        if last_score <= scoring::SLASH_THRESHOLD {
            break;
        }
    }

    assert!(last_score <= scoring::SLASH_THRESHOLD);
    let info_after = h.registry.get_anchor_info(&anchor_id);
    assert!(
        info_after.stake < stake_before,
        "expected stake to be slashed once score crossed the threshold"
    );
    assert_eq!(info_after.score, last_score);
}

#[test]
fn direct_slash_call_without_being_the_oracle_contract_fails() {
    let env = Env::default();
    let h = setup(&env);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 1_000_000);

    // `setup()` calls mock_all_auths() for the registration/staking calls
    // above. Clear that before the call under test: a direct call to
    // registry.slash() from the test root (not from within the
    // PerformanceOracle contract's own execution) then has no valid
    // authorization — it is neither signed nor a genuine contract
    // invocation by the stored oracle address — and must fail. This is
    // the real enforcement of "only PerformanceOracle can call slash",
    // which anchor-registry's own unit tests (run with mock_all_auths)
    // cannot exercise on their own.
    env.set_auths(&[]);
    let result = h.registry.try_slash(
        &anchor_id,
        &100,
        &String::from_str(&env, "not really the oracle"),
    );
    assert!(result.is_err());
}
