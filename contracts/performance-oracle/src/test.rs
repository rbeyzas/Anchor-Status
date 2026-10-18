#![cfg(test)]
extern crate std;

use super::*;
use anchor_registry::{AnchorRegistry, AnchorRegistryClient};
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Events, Ledger},
    token, xdr, BytesN, Env, String,
};
use types::{RiskReason, Trend};

struct Harness<'a> {
    env: Env,
    admin: Address,
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
        admin,
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

    // 1 second: a fast answer on the mainnet API curve (full marks within 2s).
    let new_score = h.oracle.submit_report(
        &reporter,
        &anchor_id,
        &true,
        &1,
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
fn governance_calls_require_the_admin() {
    let env = Env::default();
    let h = setup(&env);
    env.set_auths(&[]);
    let hash = BytesN::from_array(&env, &[7u8; 32]);
    assert!(h.oracle.try_propose_upgrade(&hash).is_err());
    assert!(h.oracle.try_execute_upgrade().is_err());
    assert!(h.oracle.try_cancel_upgrade().is_err());
    assert!(h.oracle.try_set_upgrade_delay(&60).is_err());
    assert!(h.oracle.try_propose_admin(&Address::generate(&env)).is_err());
    assert!(h.oracle.try_authorize_reporter(&Address::generate(&env), &SourceType::RealMainnet).is_err());
}

#[test]
fn hands_the_admin_role_over_only_when_accepted() {
    let env = Env::default();
    let h = setup(&env);
    assert_eq!(h.oracle.try_accept_admin(), Err(Ok(Error::NoPendingAdmin)));

    let next = Address::generate(&env);
    h.oracle.propose_admin(&next);
    assert_eq!(h.oracle.get_admin(), h.admin, "a proposal alone changes nothing");

    h.oracle.accept_admin();
    // The acceptance was signed by the proposed admin, not the old one.
    assert_eq!(env.auths()[0].0, next);
    assert_eq!(h.oracle.get_admin(), next);
    assert_eq!(h.oracle.try_accept_admin(), Err(Ok(Error::NoPendingAdmin)));
}

#[test]
fn an_upgrade_waits_out_the_delay_and_can_be_cancelled() {
    let env = Env::default();
    let h = setup(&env);
    let hash = BytesN::from_array(&env, &[7u8; 32]);
    assert_eq!(h.oracle.try_execute_upgrade(), Err(Ok(Error::NoPendingUpgrade)));
    assert_eq!(h.oracle.try_cancel_upgrade(), Err(Ok(Error::NoPendingUpgrade)));

    env.ledger().with_mut(|l| l.timestamp = 1_000);
    h.oracle.set_upgrade_delay(&3_600);
    let pending = h.oracle.propose_upgrade(&hash);
    assert_eq!(pending.executable_at, 4_600);
    assert_eq!(h.oracle.get_pending_upgrade(), Some(pending));
    assert_eq!(h.oracle.try_propose_upgrade(&hash), Err(Ok(Error::UpgradePending)));

    env.ledger().with_mut(|l| l.timestamp = 4_599);
    assert_eq!(h.oracle.try_execute_upgrade(), Err(Ok(Error::TimelockActive)));

    h.oracle.cancel_upgrade();
    assert_eq!(h.oracle.get_pending_upgrade(), None);
    assert_eq!(h.oracle.try_execute_upgrade(), Err(Ok(Error::NoPendingUpgrade)));
}

#[test]
fn the_delay_grows_at_once_but_shrinks_only_after_waiting_it_out() {
    let env = Env::default();
    let h = setup(&env);
    assert_eq!(h.oracle.get_upgrade_delay(), 0);
    env.ledger().with_mut(|l| l.timestamp = 1_000);

    h.oracle.set_upgrade_delay(&3_600);
    assert_eq!(h.oracle.get_upgrade_delay(), 3_600);

    // Dropping the lock to push an upgrade through at once does not work:
    // the shorter delay waits out the longer one.
    h.oracle.set_upgrade_delay(&0);
    assert_eq!(h.oracle.get_upgrade_delay(), 3_600);
    assert_eq!(h.oracle.propose_upgrade(&BytesN::from_array(&env, &[7u8; 32])).executable_at, 4_600);
    h.oracle.cancel_upgrade();

    env.ledger().with_mut(|l| l.timestamp = 4_600);
    assert_eq!(h.oracle.get_upgrade_delay(), 0);

    assert_eq!(h.oracle.try_set_upgrade_delay(&(MAX_UPGRADE_DELAY_SECONDS + 1)), Err(Ok(Error::DelayTooLong)));
}

#[test]
fn the_time_lock_error_has_the_registrys_code() {
    // Evidence quotes "Error(Contract, #21)" for both contracts.
    assert_eq!(Error::TimelockActive as u32, anchor_registry::Error::TimelockActive as u32);
    assert_eq!(Error::TimelockActive as u32, 21);
}

/// Topic names of every event the oracle published in the last call.
fn event_topics(env: &Env) -> std::vec::Vec<std::string::String> {
    env.events()
        .all()
        .events()
        .iter()
        .filter_map(|event| {
            let xdr::ContractEventBody::V0(body) = &event.body;
            match body.topics.first() {
                Some(xdr::ScVal::Symbol(s)) => Some(s.to_utf8_string_lossy()),
                _ => None,
            }
        })
        .collect()
}

#[test]
fn configuration_and_governance_changes_publish_events() {
    let env = Env::default();
    let h = setup(&env);
    h.oracle.authorize_reporter(&Address::generate(&env), &SourceType::RealMainnet);
    assert_eq!(event_topics(&env), ["reporter_authorized"]);
    h.oracle.set_upgrade_delay(&60);
    assert_eq!(event_topics(&env), ["upgrade_delay_set"]);
    h.oracle.propose_upgrade(&BytesN::from_array(&env, &[7u8; 32]));
    assert_eq!(event_topics(&env), ["upgrade_proposed"]);
    h.oracle.cancel_upgrade();
    assert_eq!(event_topics(&env), ["upgrade_cancelled"]);
    h.oracle.propose_admin(&Address::generate(&env));
    assert_eq!(event_topics(&env), ["admin_proposed"]);
    h.oracle.accept_admin();
    assert_eq!(event_topics(&env), ["admin_changed"]);
}

/// The `evidence` field of the last `report_submitted` event, as raw XDR.
fn last_report_evidence(env: &Env) -> Option<xdr::ScVal> {
    let wanted = xdr::ScVal::Symbol(xdr::ScSymbol("report_submitted".try_into().unwrap()));
    let key = xdr::ScVal::Symbol(xdr::ScSymbol("evidence".try_into().unwrap()));
    env.events().all().events().iter().rev().find_map(|event| {
        let xdr::ContractEventBody::V0(body) = &event.body;
        if body.topics.first() != Some(&wanted) {
            return None;
        }
        match &body.data {
            xdr::ScVal::Map(Some(map)) => map.iter().find(|e| e.key == key).map(|e| e.val.clone()),
            _ => None,
        }
    })
}

#[test]
fn report_with_evidence_publishes_the_hash_and_scores_like_a_plain_report() {
    let env = Env::default();
    let h = setup(&env);
    let reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&reporter, &SourceType::RealTestnet);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 0);
    let now = env.ledger().timestamp();

    let hash = BytesN::from_array(&env, &[7u8; 32]);
    let score = h.oracle.submit_report_with_evidence(&reporter, &anchor_id, &false, &0, &now, &SourceType::RealTestnet, &hash);

    assert_eq!(score, 65, "same EMA as submit_report: 100 * 0.65 after one failure");
    assert_eq!(
        last_report_evidence(&env),
        Some(xdr::ScVal::Bytes(xdr::ScBytes([7u8; 32].to_vec().try_into().unwrap())))
    );
}

#[test]
fn plain_report_publishes_no_evidence() {
    let env = Env::default();
    let h = setup(&env);
    let reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&reporter, &SourceType::RealTestnet);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 0);
    let now = env.ledger().timestamp();

    h.oracle.submit_report(&reporter, &anchor_id, &true, &10, &now, &SourceType::RealTestnet);
    assert_eq!(last_report_evidence(&env), Some(xdr::ScVal::Void));
}

#[test]
fn evidence_does_not_bypass_reporter_authorization() {
    let env = Env::default();
    let h = setup(&env);
    let stranger = Address::generate(&env);
    let anchor_id = Symbol::new(&env, "anchor_1");
    register_and_stake(&h, &anchor_id, 0);
    let result = h.oracle.try_submit_report_with_evidence(
        &stranger,
        &anchor_id,
        &true,
        &10,
        &env.ledger().timestamp(),
        &SourceType::RealTestnet,
        &BytesN::from_array(&env, &[1u8; 32]),
    );
    assert_eq!(result, Err(Ok(Error::NotAuthorizedReporter)));
}

// --- Score cards (docs/SCORING.md section 12) ---

fn card(env: &Env, score: u32, confidence: u32, window_end: u64) -> ScoreCardInput {
    ScoreCardInput {
        score,
        availability: 100,
        speed: 90,
        integrity: 83,
        market: None,
        confidence,
        flags: 0,
        window_end,
        methodology_version: 1,
        inputs_hash: BytesN::from_array(env, &[9u8; 32]),
    }
}

/// A registered mainnet anchor and a reporter authorized for mainnet.
fn mainnet_anchor(h: &Harness) -> (Address, Symbol) {
    let reporter = Address::generate(&h.env);
    h.oracle.authorize_reporter(&reporter, &SourceType::RealMainnet);
    let anchor_id = Symbol::new(&h.env, "anchor_1");
    register_and_stake(h, &anchor_id, 0);
    (reporter, anchor_id)
}

fn at(env: &Env, timestamp: u64) {
    env.ledger().with_mut(|l| l.timestamp = timestamp);
}

fn events_named(env: &Env, name: &str) -> u32 {
    let wanted = xdr::ScVal::Symbol(xdr::ScSymbol(name.try_into().unwrap()));
    env.events()
        .all()
        .events()
        .iter()
        .filter(|event| {
            let xdr::ContractEventBody::V0(body) = &event.body;
            body.topics.first() == Some(&wanted)
        })
        .count() as u32
}

#[test]
fn publishing_a_card_stores_it_and_pushes_the_score_to_the_registry() {
    let env = Env::default();
    let h = setup(&env);
    at(&env, 10_000);
    let (reporter, anchor_id) = mainnet_anchor(&h);

    let score = h.oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 81, 61, 7_200));

    assert_eq!(score, 81);
    assert_eq!(events_named(&env, "score_card_published"), 1);
    let stored = h.oracle.get_score_card(&anchor_id).unwrap();
    assert_eq!((stored.score, stored.confidence, stored.window_end, stored.published_at), (81, 61, 7_200, 10_000));
    assert_eq!(h.oracle.get_score(&anchor_id), 81);
    assert_eq!(h.registry.get_anchor_info(&anchor_id).score, 81);
}

#[test]
fn a_card_from_an_unauthorized_reporter_is_rejected() {
    let env = Env::default();
    let h = setup(&env);
    let (_, anchor_id) = mainnet_anchor(&h);
    let stranger = Address::generate(&env);
    let result = h.oracle.try_publish_score_card(&stranger, &anchor_id, &card(&env, 81, 61, 0));
    assert_eq!(result, Err(Ok(Error::NotAuthorizedReporter)));
}

#[test]
fn a_card_must_come_from_a_reporter_for_the_anchors_own_source_type() {
    let env = Env::default();
    let h = setup(&env);
    let (_, anchor_id) = mainnet_anchor(&h);
    let testnet_reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&testnet_reporter, &SourceType::RealTestnet);
    let result = h.oracle.try_publish_score_card(&testnet_reporter, &anchor_id, &card(&env, 81, 61, 0));
    assert_eq!(result, Err(Ok(Error::ReporterWrongSourceType)));
}

#[test]
fn a_card_for_an_unregistered_anchor_is_rejected() {
    let env = Env::default();
    let h = setup(&env);
    let (reporter, _) = mainnet_anchor(&h);
    let result = h.oracle.try_publish_score_card(&reporter, &Symbol::new(&env, "nobody"), &card(&env, 81, 61, 0));
    assert_eq!(result, Err(Ok(Error::AnchorNotFound)));
}

#[test]
fn out_of_range_card_values_are_rejected() {
    let env = Env::default();
    let h = setup(&env);
    let (reporter, anchor_id) = mainnet_anchor(&h);
    let base = card(&env, 81, 61, 0);
    let bad = [
        ScoreCardInput { score: 101, ..base.clone() },
        ScoreCardInput { availability: 101, ..base.clone() },
        ScoreCardInput { speed: 101, ..base.clone() },
        ScoreCardInput { integrity: 101, ..base.clone() },
        ScoreCardInput { confidence: 101, ..base.clone() },
        ScoreCardInput { market: Some(101), ..base.clone() },
        ScoreCardInput { methodology_version: 0, ..base.clone() },
    ];
    for c in bad.iter() {
        assert_eq!(h.oracle.try_publish_score_card(&reporter, &anchor_id, c), Err(Ok(Error::InvalidScoreCard)));
    }
    assert!(h.oracle.get_score_card(&anchor_id).is_none());
}

#[test]
fn a_replayed_or_older_card_is_rejected() {
    let env = Env::default();
    let h = setup(&env);
    at(&env, 10_000);
    let (reporter, anchor_id) = mainnet_anchor(&h);
    h.oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 81, 61, 7_200));

    let replay = h.oracle.try_publish_score_card(&reporter, &anchor_id, &card(&env, 90, 61, 7_200));
    let older = h.oracle.try_publish_score_card(&reporter, &anchor_id, &card(&env, 90, 61, 3_600));
    assert_eq!(replay, Err(Ok(Error::StaleScoreCard)));
    assert_eq!(older, Err(Ok(Error::StaleScoreCard)));
    assert_eq!(h.oracle.get_score(&anchor_id), 81);

    h.oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 90, 61, 10_000));
    assert_eq!(h.oracle.get_score(&anchor_id), 90);
}

#[test]
fn a_card_whose_window_ends_in_the_future_is_rejected() {
    let env = Env::default();
    let h = setup(&env);
    at(&env, 10_000);
    let (reporter, anchor_id) = mainnet_anchor(&h);
    let result = h.oracle.try_publish_score_card(&reporter, &anchor_id, &card(&env, 81, 61, 10_000 + MAX_FUTURE_SKEW_SECONDS + 1));
    assert_eq!(result, Err(Ok(Error::ReportTimestampInFuture)));
}

#[test]
fn after_a_card_reports_no_longer_overwrite_the_headline() {
    let env = Env::default();
    let h = setup(&env);
    at(&env, 10_000);
    let (reporter, anchor_id) = mainnet_anchor(&h);
    h.oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 73, 100, 7_200));

    let emitted = h.oracle.submit_report(&reporter, &anchor_id, &false, &0, &10_000, &SourceType::RealMainnet);

    assert_eq!(emitted, 73, "the report event and return value carry the headline");
    assert_eq!(h.registry.get_anchor_info(&anchor_id).score, 73);
    assert_eq!(h.oracle.get_score(&anchor_id), 73);
    // The report still feeds the health record.
    assert_eq!(h.oracle.get_health(&anchor_id).observations, 1);
}

#[test]
fn without_a_card_reports_keep_driving_the_registry() {
    let env = Env::default();
    let h = setup(&env);
    let reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&reporter, &SourceType::RealTestnet);
    let anchor_id = Symbol::new(&env, "testnet_anchor");
    register_and_stake(&h, &anchor_id, 0);
    let score = h.oracle.submit_report(&reporter, &anchor_id, &false, &0, &env.ledger().timestamp(), &SourceType::RealTestnet);
    assert_eq!(score, 65);
    assert_eq!(h.registry.get_anchor_info(&anchor_id).score, 65);
}

#[test]
fn the_risk_floor_judges_the_card_score() {
    let env = Env::default();
    let h = setup(&env);
    at(&env, 10_000);
    let (reporter, anchor_id) = mainnet_anchor(&h);

    h.oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 50, 90, 3_600));
    // events() only holds the latest invocation's events: check before reading.
    assert_eq!(events_named(&env, "risk_status_changed"), 1);
    assert_eq!(h.oracle.get_health(&anchor_id).risk_reason, RiskReason::ScoreBelowFloor);

    h.oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 85, 90, 7_200));
    assert_eq!(h.oracle.get_health(&anchor_id).risk_reason, RiskReason::None);

    // A fast successful report would put the EMA at 100; the floor still
    // judges the card.
    h.oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 40, 90, 10_000));
    h.oracle.submit_report(&reporter, &anchor_id, &true, &1, &10_000, &SourceType::RealMainnet);
    assert_eq!(h.oracle.get_health(&anchor_id).risk_reason, RiskReason::ScoreBelowFloor);
}

#[test]
fn an_insufficient_confidence_card_is_not_judged_by_its_score() {
    let env = Env::default();
    let h = setup(&env);
    at(&env, 10_000);
    let (reporter, anchor_id) = mainnet_anchor(&h);
    // A new anchor we know little about lands near the neutral prior; that
    // is not evidence that it is failing.
    h.oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 52, 20, 3_600));
    assert_eq!(events_named(&env, "risk_status_changed"), 0);
    assert_eq!(h.oracle.get_health(&anchor_id).risk_reason, RiskReason::None);
}

#[test]
fn an_anchor_never_scored_reads_as_zero() {
    let env = Env::default();
    let h = setup(&env);
    let (_, anchor_id) = mainnet_anchor(&h);
    assert_eq!(h.oracle.get_score(&anchor_id), 0);
    assert_eq!(h.oracle.get_score(&Symbol::new(&env, "never_seen")), 0);
    assert_eq!(h.registry.get_anchor_info(&anchor_id).score, 0);
    assert!(h.oracle.get_score_card(&anchor_id).is_none());
}

#[test]
fn a_published_card_has_its_ttl_extended() {
    let env = Env::default();
    let h = setup(&env);
    at(&env, 10_000);
    let (reporter, anchor_id) = mainnet_anchor(&h);
    h.oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 81, 61, 7_200));
    let ttl = env.as_contract(&h.oracle.address, || {
        env.storage().persistent().get_ttl(&DataKey::Card(anchor_id.clone()))
    });
    assert!(ttl >= PERSISTENT_LIFETIME_THRESHOLD, "card TTL {ttl} should have been extended");
}

#[test]
fn a_withheld_card_leaves_zero_as_the_score_of_record() {
    let env = Env::default();
    let h = setup(&env);
    at(&env, 10_000);
    let (reporter, anchor_id) = mainnet_anchor(&h);

    h.oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 49, 3, 3_600));
    assert_eq!(h.registry.get_anchor_info(&anchor_id).score, 0, "the registry must not hold a number the card withholds");
    assert_eq!(h.oracle.get_score(&anchor_id), 0);
    let verdict = h.oracle.get_verdict(&anchor_id);
    assert_eq!(verdict.score, 0);
    assert_eq!(verdict.withheld, true);
    assert_eq!(verdict.confidence, Some(3));
    assert_eq!(verdict.card_score, Some(49));

    // Once the card is confident enough, its score becomes the score of record.
    h.oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 81, 61, 7_200));
    assert_eq!(h.registry.get_anchor_info(&anchor_id).score, 81);
    let verdict = h.oracle.get_verdict(&anchor_id);
    assert_eq!((verdict.score, verdict.withheld, verdict.confidence), (81, false, Some(61)));
}

#[test]
fn a_report_does_not_put_a_withheld_cards_score_into_the_registry() {
    let env = Env::default();
    let h = setup(&env);
    at(&env, 10_000);
    let (reporter, anchor_id) = mainnet_anchor(&h);
    h.oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 49, 3, 3_600));
    h.oracle.submit_report(&reporter, &anchor_id, &true, &1, &10_000, &SourceType::RealMainnet);
    assert_eq!(h.registry.get_anchor_info(&anchor_id).score, 0);
}

#[test]
fn the_verdict_of_an_anchor_scored_by_reports_only_carries_no_card() {
    let env = Env::default();
    let h = setup(&env);
    let reporter = Address::generate(&env);
    h.oracle.authorize_reporter(&reporter, &SourceType::RealTestnet);
    let anchor_id = Symbol::new(&env, "testnet_anchor");
    register_and_stake(&h, &anchor_id, 0);
    h.oracle.submit_report(&reporter, &anchor_id, &false, &0, &env.ledger().timestamp(), &SourceType::RealTestnet);
    let verdict = h.oracle.get_verdict(&anchor_id);
    assert_eq!((verdict.score, verdict.confidence, verdict.flags, verdict.withheld, verdict.card_score), (65, None, 0, false, None));
}

#[test]
fn a_deactivated_anchor_gets_no_report_or_card_until_reactivated() {
    let env = Env::default();
    let h = setup(&env);
    let (reporter, anchor_id) = mainnet_anchor(&h);
    at(&env, 10_000);
    h.oracle.submit_report(&reporter, &anchor_id, &true, &5, &10_000, &SourceType::RealMainnet);
    let before = h.oracle.get_health(&anchor_id);

    h.registry.deactivate_anchor(&anchor_id, &String::from_str(&env, "stopped operating"));
    assert_eq!(
        h.oracle.try_submit_report(&reporter, &anchor_id, &false, &0, &10_000, &SourceType::RealMainnet),
        Err(Ok(Error::AnchorDeactivated))
    );
    assert_eq!(
        h.oracle.try_publish_score_card(&reporter, &anchor_id, &card(&env, 81, 61, 7_200)),
        Err(Ok(Error::AnchorDeactivated))
    );
    assert_eq!(h.oracle.get_health(&anchor_id), before, "nothing about it changed");
    assert!(h.oracle.get_score_card(&anchor_id).is_none());

    h.registry.reactivate_anchor(&anchor_id);
    h.oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 81, 61, 7_200));
    assert_eq!(h.registry.get_anchor_info(&anchor_id).score, 81);
}

mod live_registry {
    soroban_sdk::contractimport!(file = "../fixtures/anchor_registry_live.wasm");
}

#[test]
fn works_with_the_live_registry_that_has_no_status_yet() {
    // The registry testnet runs today has no get_anchor_status; until it is
    // upgraded, every anchor must count as active, not be refused.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let token_address = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let registry_id = env.register(live_registry::WASM, ());
    let registry = live_registry::Client::new(&env, &registry_id);
    let oracle_id = env.register(PerformanceOracle, ());
    let oracle = PerformanceOracleClient::new(&env, &oracle_id);
    registry.init(&admin, &oracle_id, &token_address);
    oracle.init(&admin, &registry_id);

    let reporter = Address::generate(&env);
    oracle.authorize_reporter(&reporter, &SourceType::RealMainnet);
    let anchor_id = Symbol::new(&env, "anchor_1");
    registry.register_anchor(
        &Address::generate(&env),
        &anchor_id,
        &String::from_str(&env, "Test Anchor"),
        &String::from_str(&env, "anchor.example.com"),
        &live_registry::SourceType::RealMainnet,
    );
    at(&env, 10_000);
    oracle.submit_report(&reporter, &anchor_id, &true, &5, &10_000, &SourceType::RealMainnet);
    oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 81, 61, 7_200));
    assert_eq!(registry.get_anchor_info(&anchor_id).score, 81);
}

// ---- Reporter quorum (SOW deliverable 1) ----

const ROUND: u64 = 3_600;
const NOW: u64 = 20_000;

/// `n` reporters authorized for mainnet, a registered mainnet anchor, a
/// quorum of `threshold` with the given max spread and hourly rounds.
fn quorum_setup(h: &Harness, n: u32, threshold: u32, max_spread: u32) -> (std::vec::Vec<Address>, Symbol) {
    at(&h.env, NOW);
    let reporters: std::vec::Vec<Address> = (0..n)
        .map(|_| {
            let r = Address::generate(&h.env);
            h.oracle.authorize_reporter(&r, &SourceType::RealMainnet);
            r
        })
        .collect();
    let anchor_id = Symbol::new(&h.env, "anchor_1");
    register_and_stake(h, &anchor_id, 0);
    h.oracle.set_quorum_config(&QuorumConfig { threshold, max_spread, round_seconds: ROUND });
    (reporters, anchor_id)
}

fn scored(env: &Env, score: u32, window_end: u64, hash: u8) -> ScoreCardInput {
    ScoreCardInput { inputs_hash: BytesN::from_array(env, &[hash; 32]), ..card(env, score, 80, window_end) }
}

#[test]
fn without_a_quorum_config_one_card_is_final_at_once() {
    let env = Env::default();
    let h = setup(&env);
    let (reporter, anchor_id) = mainnet_anchor(&h);
    at(&env, NOW);
    assert_eq!(h.oracle.get_quorum_config().threshold, 1);
    h.oracle.publish_score_card(&reporter, &anchor_id, &card(&env, 70, 80, 7_000));
    assert_eq!(h.oracle.get_score_card(&anchor_id).unwrap().score, 70);
    assert_eq!(h.oracle.get_pending_round(&anchor_id), None);
    assert_eq!(h.oracle.get_quorum_info(&anchor_id).unwrap().reporters.len(), 1);
}

#[test]
fn one_card_of_two_changes_nothing() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 2, 2, 10);
    let score_before = h.registry.get_anchor_info(&id).score;
    assert_eq!(h.oracle.publish_score_card(&r[0], &id, &scored(&env, 70, 7_200, 1)), 0);
    assert_eq!(h.oracle.get_score_card(&id), None);
    assert_eq!(h.registry.get_anchor_info(&id).score, score_before);
    let round = h.oracle.get_pending_round(&id).unwrap();
    assert_eq!(round.window_end, 7_200);
    assert_eq!(round.submissions.len(), 1);
}

#[test]
fn the_second_reporter_makes_the_lower_median_final() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 2, 2, 10);
    h.oracle.publish_score_card(&r[0], &id, &scored(&env, 74, 7_200, 1));
    assert_eq!(h.oracle.publish_score_card(&r[1], &id, &scored(&env, 70, 7_200, 2)), 70);
    let c = h.oracle.get_score_card(&id).unwrap();
    assert_eq!(c.score, 70);
    assert_eq!(c.inputs_hash, BytesN::from_array(&env, &[2u8; 32]), "the bundle of the card whose score is the median");
    assert_eq!(h.registry.get_anchor_info(&id).score, 70);
    assert_eq!(h.oracle.get_pending_round(&id), None);
    let q = h.oracle.get_quorum_info(&id).unwrap();
    assert_eq!(q.reporters.len(), 2);
    assert_eq!(q.spread, 4);
    assert_eq!(q.outliers.len(), 0);
    assert_eq!(c.flags & FLAG_REPORTER_DISAGREEMENT, 0);
}

#[test]
fn three_reporters_take_the_middle_card_field_by_field() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 3, 3, 100);
    let mk = |score, availability, speed, hash| ScoreCardInput { availability, speed, ..scored(&env, score, 7_200, hash) };
    h.oracle.publish_score_card(&r[0], &id, &mk(90, 60, 100, 1));
    h.oracle.publish_score_card(&r[1], &id, &mk(50, 100, 40, 2));
    h.oracle.publish_score_card(&r[2], &id, &mk(70, 80, 70, 3));
    let c = h.oracle.get_score_card(&id).unwrap();
    assert_eq!((c.score, c.availability, c.speed), (70, 80, 70));
}

#[test]
fn a_reporter_counts_once_per_round() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 2, 2, 10);
    h.oracle.publish_score_card(&r[0], &id, &scored(&env, 70, 7_200, 1));
    assert_eq!(h.oracle.try_publish_score_card(&r[0], &id, &scored(&env, 71, 7_200, 1)), Err(Ok(Error::DuplicateSubmission)));
    assert_eq!(h.oracle.get_score_card(&id), None);
}

#[test]
fn a_round_takes_one_methodology_version() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 2, 2, 10);
    h.oracle.publish_score_card(&r[0], &id, &scored(&env, 70, 7_200, 1));
    let other = ScoreCardInput { methodology_version: 2, ..scored(&env, 70, 7_200, 2) };
    assert_eq!(h.oracle.try_publish_score_card(&r[1], &id, &other), Err(Ok(Error::MethodologyMismatch)));
}

#[test]
fn windows_must_end_on_a_round_boundary() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 2, 2, 10);
    assert_eq!(h.oracle.try_publish_score_card(&r[0], &id, &scored(&env, 70, 7_201, 1)), Err(Ok(Error::MisalignedWindow)));
}

#[test]
fn a_newer_window_replaces_an_unfinished_round_and_an_older_one_is_stale() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 2, 2, 10);
    h.oracle.publish_score_card(&r[0], &id, &scored(&env, 70, 7_200, 1));
    h.oracle.publish_score_card(&r[1], &id, &scored(&env, 72, 10_800, 2));
    let round = h.oracle.get_pending_round(&id).unwrap();
    assert_eq!((round.window_end, round.submissions.len()), (10_800, 1));
    assert_eq!(h.oracle.try_publish_score_card(&r[0], &id, &scored(&env, 70, 7_200, 1)), Err(Ok(Error::StaleScoreCard)));
}

#[test]
fn a_late_card_for_a_finished_round_is_stale() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 3, 2, 10);
    h.oracle.publish_score_card(&r[0], &id, &scored(&env, 70, 7_200, 1));
    h.oracle.publish_score_card(&r[1], &id, &scored(&env, 70, 7_200, 2));
    assert_eq!(h.oracle.try_publish_score_card(&r[2], &id, &scored(&env, 90, 7_200, 3)), Err(Ok(Error::StaleScoreCard)));
    assert_eq!(h.oracle.get_score_card(&id).unwrap().score, 70);
}

#[test]
fn reporters_too_far_apart_flag_the_card_and_name_the_outlier() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 3, 3, 10);
    h.oracle.publish_score_card(&r[0], &id, &scored(&env, 70, 7_200, 1));
    h.oracle.publish_score_card(&r[1], &id, &scored(&env, 72, 7_200, 2));
    h.oracle.publish_score_card(&r[2], &id, &scored(&env, 95, 7_200, 3));
    assert_eq!(events_named(&env, "reporter_outlier"), 1);
    let c = h.oracle.get_score_card(&id).unwrap();
    assert_eq!(c.score, 72);
    assert_ne!(c.flags & FLAG_REPORTER_DISAGREEMENT, 0);
    let q = h.oracle.get_quorum_info(&id).unwrap();
    assert_eq!(q.spread, 25);
    assert_eq!(q.outliers.len(), 1);
    assert_eq!(q.outliers.get(0).unwrap(), r[2]);
}

#[test]
fn the_market_pillar_counts_only_when_most_reporters_measured_it() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 3, 3, 100);
    let with = |m, hash| ScoreCardInput { market: m, ..scored(&env, 70, 7_200, hash) };
    h.oracle.publish_score_card(&r[0], &id, &with(Some(90), 1));
    h.oracle.publish_score_card(&r[1], &id, &with(None, 2));
    h.oracle.publish_score_card(&r[2], &id, &with(None, 3));
    assert_eq!(h.oracle.get_score_card(&id).unwrap().market, None);

    let id2 = Symbol::new(&env, "anchor_2");
    register_and_stake(&h, &id2, 0);
    let with2 = |m, hash| ScoreCardInput { market: m, ..scored(&env, 70, 7_200, hash) };
    h.oracle.publish_score_card(&r[0], &id2, &with2(Some(90), 1));
    h.oracle.publish_score_card(&r[1], &id2, &with2(Some(60), 2));
    h.oracle.publish_score_card(&r[2], &id2, &with2(None, 3));
    assert_eq!(h.oracle.get_score_card(&id2).unwrap().market, Some(60));
}

#[test]
fn a_flag_holds_when_most_reporters_raise_it() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 3, 3, 100);
    let flagged = |flags, hash| ScoreCardInput { flags, ..scored(&env, 70, 7_200, hash) };
    h.oracle.publish_score_card(&r[0], &id, &flagged(0b011, 1));
    h.oracle.publish_score_card(&r[1], &id, &flagged(0b001, 2));
    h.oracle.publish_score_card(&r[2], &id, &flagged(0b100, 3));
    assert_eq!(h.oracle.get_score_card(&id).unwrap().flags, 0b001);
}

#[test]
fn with_a_quorum_one_reporters_reports_move_neither_score_nor_risk() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 2, 2, 10);
    let score_before = h.registry.get_anchor_info(&id).score;
    for _ in 0..5 {
        h.oracle.submit_report(&r[0], &id, &false, &0, &NOW, &SourceType::RealMainnet);
    }
    assert_eq!(h.registry.get_anchor_info(&id).score, score_before);
    let health = h.oracle.get_health(&id);
    assert_eq!(health.risk_reason, RiskReason::None);
    assert_eq!(health.consecutive_failures, 5, "the observations still count");
}

#[test]
fn a_higher_threshold_applies_at_once_a_lower_one_waits_out_the_delay() {
    let env = Env::default();
    let h = setup(&env);
    at(&env, NOW);
    h.oracle.set_upgrade_delay(&3_600);
    h.oracle.set_quorum_config(&QuorumConfig { threshold: 2, max_spread: 10, round_seconds: ROUND });
    assert_eq!(h.oracle.get_quorum_config().threshold, 2);
    h.oracle.set_quorum_config(&QuorumConfig { threshold: 1, max_spread: 10, round_seconds: ROUND });
    assert_eq!(h.oracle.get_quorum_config().threshold, 2, "lowering waits");
    at(&env, NOW + 3_600);
    assert_eq!(h.oracle.get_quorum_config().threshold, 1);
}

#[test]
fn a_quorum_config_must_be_possible() {
    let env = Env::default();
    let h = setup(&env);
    let bad = |threshold, max_spread| QuorumConfig { threshold, max_spread, round_seconds: ROUND };
    assert_eq!(h.oracle.try_set_quorum_config(&bad(0, 10)), Err(Ok(Error::InvalidQuorumConfig)));
    assert_eq!(h.oracle.try_set_quorum_config(&bad(MAX_REPORTERS + 1, 10)), Err(Ok(Error::InvalidQuorumConfig)));
    assert_eq!(h.oracle.try_set_quorum_config(&bad(2, 101)), Err(Ok(Error::InvalidQuorumConfig)));
    env.set_auths(&[]);
    assert!(h.oracle.try_set_quorum_config(&bad(2, 10)).is_err(), "admin only");
}

#[test]
fn the_reporter_list_follows_authorizations() {
    let env = Env::default();
    let h = setup(&env);
    let a = Address::generate(&env);
    h.oracle.authorize_reporter(&a, &SourceType::RealMainnet);
    h.oracle.authorize_reporter(&a, &SourceType::RealMainnet);
    assert_eq!(h.oracle.get_reporters(&SourceType::RealMainnet).len(), 1, "no duplicates");
    h.oracle.authorize_reporter(&a, &SourceType::RealTestnet);
    assert_eq!(h.oracle.get_reporters(&SourceType::RealMainnet).len(), 0, "moved, not copied");
    assert_eq!(h.oracle.get_reporters(&SourceType::RealTestnet).len(), 1);
}

#[test]
fn a_source_type_has_at_most_seven_reporters() {
    let env = Env::default();
    let h = setup(&env);
    for _ in 0..MAX_REPORTERS {
        h.oracle.authorize_reporter(&Address::generate(&env), &SourceType::RealMainnet);
    }
    assert_eq!(
        h.oracle.try_authorize_reporter(&Address::generate(&env), &SourceType::RealMainnet),
        Err(Ok(Error::TooManyReporters))
    );
}

#[test]
fn a_revoked_reporter_can_submit_nothing() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 2, 1, 10);
    h.oracle.revoke_reporter(&r[0]);
    assert_eq!(h.oracle.get_reporters(&SourceType::RealMainnet).len(), 1);
    assert_eq!(h.oracle.get_reporter_source_type(&r[0]), None);
    assert_eq!(h.oracle.try_publish_score_card(&r[0], &id, &scored(&env, 70, 7_200, 1)), Err(Ok(Error::NotAuthorizedReporter)));
    assert_eq!(h.oracle.try_submit_report(&r[0], &id, &true, &1, &NOW, &SourceType::RealMainnet), Err(Ok(Error::NotAuthorizedReporter)));
    assert_eq!(h.oracle.try_revoke_reporter(&r[0]), Err(Ok(Error::ReporterNotFound)));
}

#[test]
fn a_quorum_publishes_its_steps() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 2, 2, 10);
    h.oracle.publish_score_card(&r[0], &id, &scored(&env, 70, 7_200, 1));
    assert_eq!(event_topics(&env), ["score_card_submitted"]);
    h.oracle.publish_score_card(&r[1], &id, &scored(&env, 72, 7_200, 2));
    let topics = event_topics(&env);
    assert!(topics.contains(&"score_card_submitted".into()));
    assert!(topics.contains(&"quorum_reached".into()));
    assert!(topics.contains(&"score_card_published".into()));
}

#[test]
fn a_reporter_of_the_wrong_type_cannot_join_a_round() {
    let env = Env::default();
    let h = setup(&env);
    let (r, id) = quorum_setup(&h, 1, 2, 10);
    let testnet = Address::generate(&env);
    h.oracle.authorize_reporter(&testnet, &SourceType::RealTestnet);
    h.oracle.publish_score_card(&r[0], &id, &scored(&env, 70, 7_200, 1));
    assert_eq!(h.oracle.try_publish_score_card(&testnet, &id, &scored(&env, 70, 7_200, 2)), Err(Ok(Error::ReporterWrongSourceType)));
    assert_eq!(h.oracle.get_score_card(&id), None);
}

#[test]
fn lower_median_and_majority_are_what_they_say() {
    use crate::quorum::{lower_median, majority_flags};
    assert_eq!(lower_median(&[5]), 5);
    assert_eq!(lower_median(&[9, 1]), 1);
    assert_eq!(lower_median(&[3, 9, 1]), 3);
    assert_eq!(lower_median(&[4, 3, 2, 1]), 2);
    assert_eq!(majority_flags(&[0b1, 0b1, 0b0]), 0b1);
    assert_eq!(majority_flags(&[0b1, 0b0]), 0, "a tie is not a majority");
}
