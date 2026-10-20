//! Random sequences of score cards, reports and unauthorized attempts
//! against a real AnchorRegistry + PerformanceOracle pair, checked step by
//! step against a model of the quorum rules. The two invariants the SOW
//! names, after every step:
//!   1. the registry's score is the final card's score of record;
//!   2. the card changes only when `threshold` distinct authorized reporters
//!      have submitted the same window, and then to their lower median.
//! Every call is also expected to succeed or fail exactly as the model says.
#![no_main]

use anchor_registry::{AnchorRegistry, AnchorRegistryClient, SourceType};
use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;
use performance_oracle::{PerformanceOracle, PerformanceOracleClient, QuorumConfig, ScoreCardInput};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, String, Symbol,
};

const ROUND: u64 = 3_600;
const NOW: u64 = 10 * ROUND;

#[derive(Arbitrary, Debug)]
struct Input {
    reporters: u8,
    threshold: u8,
    max_spread: u8,
    steps: Vec<Step>,
}

#[derive(Arbitrary, Debug)]
enum Step {
    Card { reporter: u8, window: u8, score: u8, confidence: u8, other_methodology: bool },
    Report { reporter: u8, success: bool },
    Unauthorized { window: u8, score: u8 },
}

/// The open round in the model: its window, methodology and (reporter, score).
struct Round {
    window: u64,
    methodology: u32,
    cards: Vec<(usize, u32)>,
}

fn lower_median(mut v: Vec<u32>) -> u32 {
    v.sort_unstable();
    v[(v.len() - 1) / 2]
}

fn card(env: &Env, score: u32, confidence: u32, window: u64, methodology: u32) -> ScoreCardInput {
    ScoreCardInput {
        score,
        availability: 100,
        speed: 100,
        integrity: 100,
        market: None,
        confidence,
        flags: 0,
        window_end: window,
        methodology_version: methodology,
        inputs_hash: BytesN::from_array(env, &[score as u8; 32]),
    }
}

fuzz_target!(|input: Input| {
    let n = 1 + (input.reporters % 5) as usize;
    let threshold = 1 + (input.threshold as u32) % n as u32;
    let max_spread = (input.max_spread % 101) as u32;

    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = NOW);
    let admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let registry_id = env.register(AnchorRegistry, ());
    let oracle_id = env.register(PerformanceOracle, ());
    let registry = AnchorRegistryClient::new(&env, &registry_id);
    let oracle = PerformanceOracleClient::new(&env, &oracle_id);
    registry.init(&admin, &oracle_id, &token);
    oracle.init(&admin, &registry_id);
    let id = Symbol::new(&env, "anchor_1");
    registry.register_anchor(
        &Address::generate(&env),
        &id,
        &String::from_str(&env, "a"),
        &String::from_str(&env, "a.example"),
        &SourceType::RealMainnet,
    );
    let reporters: Vec<Address> = (0..n).map(|_| Address::generate(&env)).collect();
    for r in &reporters {
        oracle.authorize_reporter(r, &SourceType::RealMainnet);
    }
    let outsider = Address::generate(&env);
    oracle.set_quorum_config(&QuorumConfig { threshold, max_spread, round_seconds: ROUND });

    let mut round: Option<Round> = None;
    let mut last_final: Option<u64> = None;

    for step in input.steps.iter().take(64) {
        let before = oracle.get_score_card(&id);
        // Some(score) when this step is expected to finalize a round.
        let mut finalized: Option<u32> = None;

        match step {
            Step::Card { reporter, window, score, confidence, other_methodology } => {
                let r = *reporter as usize % n;
                let w = ROUND * (1 + (*window as u64 % 9));
                let score = (*score % 101) as u32;
                let methodology = if *other_methodology { 3 } else { 2 };
                let result = oracle.try_publish_score_card(
                    &reporters[r],
                    &id,
                    &card(&env, score, (*confidence % 101) as u32, w, methodology),
                );

                // The model's verdict, in the contract's order of checks.
                let accepted = if last_final.is_some_and(|f| w <= f) {
                    false
                } else {
                    match &mut round {
                        Some(open) if open.window == w => {
                            open.methodology == methodology && !open.cards.iter().any(|(who, _)| *who == r)
                        }
                        Some(open) if open.window > w => false,
                        _ => {
                            round = Some(Round { window: w, methodology, cards: Vec::new() });
                            true
                        }
                    }
                };
                assert_eq!(result.is_ok(), accepted, "step {step:?}: contract and model disagree");
                if accepted {
                    let open = round.as_mut().unwrap();
                    open.cards.push((r, score));
                    if open.cards.len() as u32 >= threshold {
                        finalized = Some(lower_median(open.cards.iter().map(|(_, s)| *s).collect()));
                        last_final = Some(w);
                        round = None;
                    }
                }
            }
            Step::Report { reporter, success } => {
                let r = *reporter as usize % n;
                let _ = oracle.try_submit_report(&reporters[r], &id, success, &1, &NOW, &SourceType::RealMainnet);
            }
            Step::Unauthorized { window, score } => {
                let w = ROUND * (1 + (*window as u64 % 9));
                let attempt = card(&env, (*score % 101) as u32, 90, w, 2);
                assert!(oracle.try_publish_score_card(&outsider, &id, &attempt).is_err(), "an unauthorized card was accepted");
            }
        }

        let after = oracle.get_score_card(&id);
        // Invariant 2: the card moves only when a round of `threshold`
        // distinct reporters completes, and then to their lower median.
        match finalized {
            Some(median) => {
                let c = after.as_ref().expect("a finished round leaves a card");
                assert_eq!(c.score, median, "the final card is not the round's lower median");
                assert_eq!(c.window_end, last_final.unwrap());
            }
            None => assert_eq!(after, before, "the card changed without a quorum: {step:?}"),
        }
        // Invariant 1: the registry holds the card's score of record.
        let held = registry.get_anchor_info(&id).score;
        match &after {
            Some(c) => assert_eq!(held, if c.confidence < 40 { 0 } else { c.score }, "registry score is not the card's"),
            // With a quorum, no single reporter's reports move the registry.
            None if threshold > 1 => assert_eq!(held, 0, "a single reporter moved the registry's score"),
            None => {}
        }
    }
});
