//! How the cards of one round become one card: field-wise lower median,
//! majority flags, and the spread between reporters. Pure functions over at
//! most MAX_REPORTERS cards, kept apart from storage so they can be tested
//! (and property-tested) on their own.
use soroban_sdk::{Address, Vec};

use crate::types::{ScoreCardInput, Submission};

/// The most reporters one source type can have, which bounds every round.
pub const MAX_REPORTERS: u32 = 7;

/// Set on a final card when its reporters' scores are further apart than
/// max_spread. Bits 0-9 are the off-chain flags (docs/SCORING.md section 8);
/// 16 and up are set by the contract itself.
pub const FLAG_REPORTER_DISAGREEMENT: u32 = 1 << 16;

const N: usize = MAX_REPORTERS as usize;

/// The lower median of the first `n` values: the middle one, or the lower
/// of the two middle ones for an even count, so the result is always a value
/// some reporter actually submitted.
pub fn lower_median(values: &[u32]) -> u32 {
    let mut sorted = [0u32; N];
    let n = values.len().min(N);
    sorted[..n].copy_from_slice(&values[..n]);
    sorted[..n].sort_unstable();
    sorted[(n - 1) / 2]
}

/// Each bit set when more than half the masks have it.
pub fn majority_flags(masks: &[u32]) -> u32 {
    let mut out = 0u32;
    for bit in 0..32 {
        let set = masks.iter().filter(|m| *m & (1 << bit) != 0).count();
        if set * 2 > masks.len() {
            out |= 1 << bit;
        }
    }
    out
}

/// The final card of a round, its spread, and the reporters further than
/// `max_spread` from the median score.
pub struct Combined {
    pub card: ScoreCardInput,
    pub spread: u32,
    pub outliers: Vec<Address>,
    pub median_score: u32,
}

/// Combines a round's cards (1..=MAX_REPORTERS of them, same window and
/// methodology). The inputs hash is that of the first card whose score is
/// the median, so the final card can still be recomputed from one published
/// bundle.
pub fn combine(submissions: &Vec<Submission>, max_spread: u32) -> Combined {
    let n = (submissions.len() as usize).min(N);
    let mut score = [0u32; N];
    let mut availability = [0u32; N];
    let mut speed = [0u32; N];
    let mut integrity = [0u32; N];
    let mut confidence = [0u32; N];
    let mut flags = [0u32; N];
    let mut market = [0u32; N];
    let mut markets = 0usize;
    for (i, s) in submissions.iter().take(n).enumerate() {
        score[i] = s.card.score;
        availability[i] = s.card.availability;
        speed[i] = s.card.speed;
        integrity[i] = s.card.integrity;
        confidence[i] = s.card.confidence;
        flags[i] = s.card.flags;
        if let Some(m) = s.card.market {
            market[markets] = m;
            markets += 1;
        }
    }

    let median_score = lower_median(&score[..n]);
    let (lowest, highest) = score[..n].iter().fold((u32::MAX, 0), |(lo, hi), s| (lo.min(*s), hi.max(*s)));
    let spread = highest - lowest;

    let first = submissions.get(0).expect("a round has at least one card");
    let from_median = submissions
        .iter()
        .take(n)
        .find(|s| s.card.score == median_score)
        .unwrap_or(first.clone());

    let mut outliers = Vec::new(submissions.env());
    for s in submissions.iter().take(n) {
        if s.card.score.abs_diff(median_score) > max_spread {
            outliers.push_back(s.reporter.clone());
        }
    }

    let mut combined_flags = majority_flags(&flags[..n]);
    if spread > max_spread {
        combined_flags |= FLAG_REPORTER_DISAGREEMENT;
    }

    Combined {
        card: ScoreCardInput {
            score: median_score,
            availability: lower_median(&availability[..n]),
            speed: lower_median(&speed[..n]),
            integrity: lower_median(&integrity[..n]),
            // A pillar only most reporters could measure; else n/a.
            market: if markets * 2 > n { Some(lower_median(&market[..markets])) } else { None },
            confidence: lower_median(&confidence[..n]),
            flags: combined_flags,
            window_end: first.card.window_end,
            methodology_version: first.card.methodology_version,
            inputs_hash: from_median.card.inputs_hash,
        },
        spread,
        outliers,
        median_score,
    }
}
