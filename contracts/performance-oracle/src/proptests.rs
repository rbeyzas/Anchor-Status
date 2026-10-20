#![cfg(test)]
//! Property tests for the reporter quorum's arithmetic (SOW deliverable 1):
//! the field-wise lower median, majority flags, the spread, the outliers
//! and the disagreement flag, over random rounds of 1..=MAX_REPORTERS cards.
extern crate std;

use proptest::prelude::*;
use soroban_sdk::{testutils::{Address as _, EnvTestConfig}, Address, BytesN, Env, Vec};
use std::vec::Vec as StdVec;

use crate::quorum::{combine, lower_median, majority_flags, FLAG_REPORTER_DISAGREEMENT, MAX_REPORTERS};
use crate::types::{ScoreCardInput, Submission};

const CASES: u32 = 10_000;

/// One reporter's card: every pillar 0..=100, an optional market, and the
/// off-chain flags (bits 0-9).
#[derive(Clone, Debug)]
struct Card {
    score: u32,
    availability: u32,
    speed: u32,
    integrity: u32,
    market: Option<u32>,
    confidence: u32,
    flags: u32,
}

fn card() -> impl Strategy<Value = Card> {
    (0..=100u32, 0..=100u32, 0..=100u32, 0..=100u32, prop::option::of(0..=100u32), 0..=100u32, 0..1024u32).prop_map(
        |(score, availability, speed, integrity, market, confidence, flags)| Card {
            score,
            availability,
            speed,
            integrity,
            market,
            confidence,
            flags,
        },
    )
}

fn round() -> impl Strategy<Value = StdVec<Card>> {
    prop::collection::vec(card(), 1..=MAX_REPORTERS as usize)
}

fn submissions(env: &Env, cards: &[Card]) -> (Vec<Submission>, StdVec<Address>) {
    let mut out = Vec::new(env);
    let mut reporters = StdVec::new();
    for (i, c) in cards.iter().enumerate() {
        let reporter = Address::generate(env);
        reporters.push(reporter.clone());
        out.push_back(Submission {
            reporter,
            card: ScoreCardInput {
                score: c.score,
                availability: c.availability,
                speed: c.speed,
                integrity: c.integrity,
                market: c.market,
                confidence: c.confidence,
                flags: c.flags,
                window_end: 7_200,
                methodology_version: 2,
                // Each reporter's bundle is told apart by its position.
                inputs_hash: BytesN::from_array(env, &[i as u8; 32]),
            },
            submitted_at: 0,
        });
    }
    (out, reporters)
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(CASES))]

    /// The lower median is a value some reporter submitted, with at most
    /// half the values (rounded down) above it and at most half below.
    #[test]
    fn the_lower_median_is_a_submitted_middle_value(values in prop::collection::vec(0..=100u32, 1..=MAX_REPORTERS as usize)) {
        let m = lower_median(&values);
        let n = values.len();
        prop_assert!(values.contains(&m));
        prop_assert!(values.iter().filter(|v| **v < m).count() <= (n - 1) / 2);
        prop_assert!(values.iter().filter(|v| **v > m).count() <= n / 2);
    }

    /// A bit is in the result exactly when more than half the masks have it.
    #[test]
    fn a_flag_holds_exactly_when_most_reporters_raise_it(masks in prop::collection::vec(any::<u32>(), 1..=MAX_REPORTERS as usize)) {
        let out = majority_flags(&masks);
        for bit in 0..32 {
            let set = masks.iter().filter(|m| *m & (1 << bit) != 0).count();
            prop_assert_eq!(out & (1 << bit) != 0, set * 2 > masks.len(), "bit {}", bit);
        }
    }

    /// The final card of a round, field by field.
    #[test]
    fn a_round_becomes_its_median_card(cards in round(), max_spread in 0..=100u32) {
        let env = Env::new_with_config(EnvTestConfig { capture_snapshot_at_drop: false });
        let (subs, reporters) = submissions(&env, &cards);
        let c = combine(&subs, max_spread);
        let col = |f: fn(&Card) -> u32| cards.iter().map(f).collect::<StdVec<u32>>();
        let scores = col(|c| c.score);

        prop_assert_eq!(c.card.score, lower_median(&scores));
        prop_assert_eq!(c.median_score, c.card.score);
        prop_assert_eq!(c.card.availability, lower_median(&col(|c| c.availability)));
        prop_assert_eq!(c.card.speed, lower_median(&col(|c| c.speed)));
        prop_assert_eq!(c.card.integrity, lower_median(&col(|c| c.integrity)));
        prop_assert_eq!(c.card.confidence, lower_median(&col(|c| c.confidence)));

        let spread = scores.iter().max().unwrap() - scores.iter().min().unwrap();
        prop_assert_eq!(c.spread, spread);
        prop_assert_eq!(c.card.flags & FLAG_REPORTER_DISAGREEMENT != 0, spread > max_spread);
        prop_assert_eq!(c.card.flags & !FLAG_REPORTER_DISAGREEMENT, majority_flags(&col(|c| c.flags)));

        // Outliers: exactly the reporters further than max_spread from the
        // median, in submission order.
        let expected: StdVec<Address> = cards
            .iter()
            .zip(&reporters)
            .filter(|(card, _)| card.score.abs_diff(c.median_score) > max_spread)
            .map(|(_, r)| r.clone())
            .collect();
        prop_assert_eq!(c.outliers.iter().collect::<StdVec<Address>>(), expected);

        // Market: only when most reporters measured it.
        let markets: StdVec<u32> = cards.iter().filter_map(|c| c.market).collect();
        let want = if markets.len() * 2 > cards.len() { Some(lower_median(&markets)) } else { None };
        prop_assert_eq!(c.card.market, want);

        // The bundle behind the final card: the first reporter whose score
        // is the median, so the card can be recomputed from it.
        let first = scores.iter().position(|s| *s == c.median_score).unwrap();
        prop_assert_eq!(c.card.inputs_hash, BytesN::from_array(&env, &[first as u8; 32]));
    }

    /// The order the cards arrive in changes no number on the final card.
    #[test]
    fn the_order_of_arrival_does_not_matter(cards in round(), max_spread in 0..=100u32, seed in any::<u64>()) {
        let env = Env::new_with_config(EnvTestConfig { capture_snapshot_at_drop: false });
        let mut shuffled = cards.clone();
        // A deterministic shuffle from the seed.
        let mut s = seed;
        for i in (1..shuffled.len()).rev() {
            s = s.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            shuffled.swap(i, (s >> 33) as usize % (i + 1));
        }
        let a = combine(&submissions(&env, &cards).0, max_spread).card;
        let b = combine(&submissions(&env, &shuffled).0, max_spread).card;
        prop_assert_eq!(
            (a.score, a.availability, a.speed, a.integrity, a.market, a.confidence, a.flags),
            (b.score, b.availability, b.speed, b.integrity, b.market, b.confidence, b.flags)
        );
    }
}
