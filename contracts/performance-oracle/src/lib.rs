#![no_std]

mod errors;
mod scoring;
mod types;

#[cfg(test)]
mod test;

use anchor_registry::{AnchorRegistryClient, SourceType};
use errors::Error;
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Symbol};
use types::{
    AnchorHealth, DataKey, ReportSubmittedEvent, RiskStatusChangedEvent, ScoreCard, ScoreCardInput,
    ScoreCardPublishedEvent, Verdict,
};

/// Reports timestamped further than this many seconds in the future
/// (relative to ledger time) are rejected as invalid.
const MAX_FUTURE_SKEW_SECONDS: u64 = 5 * 60;
/// Reports older than this are rejected as stale.
const MAX_REPORT_AGE_SECONDS: u64 = 2 * 24 * 60 * 60;

// Storage TTLs, in ledgers (~5s each). Soroban archives any entry whose TTL
// runs out; an archived score or health record makes reads fail until it is
// restored. Every write re-extends the entry, so an anchor that is still
// being reported on can never expire.
const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;
const PERSISTENT_BUMP_AMOUNT: u32 = 90 * DAY_IN_LEDGERS;
const PERSISTENT_LIFETIME_THRESHOLD: u32 = PERSISTENT_BUMP_AMOUNT - 7 * DAY_IN_LEDGERS;

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

fn bump_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_LIFETIME_THRESHOLD, PERSISTENT_BUMP_AMOUNT);
}

#[contract]
pub struct PerformanceOracle;

#[contractimpl]
impl PerformanceOracle {
    pub fn init(env: Env, admin: Address, registry_address: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::RegistryAddress, &registry_address);
        bump_instance(&env);
        Ok(())
    }

    /// Admin-only: authorizes `reporter` to submit reports for exactly one
    /// `source_type`. Calling again for the same reporter replaces the
    /// authorization (e.g. to revoke by re-authorizing to a source_type
    /// the operator doesn't actually control, or to rotate keys).
    pub fn authorize_reporter(
        env: Env,
        reporter: Address,
        source_type: SourceType,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let key = DataKey::Reporter(reporter);
        env.storage().persistent().set(&key, &source_type);
        bump_persistent(&env, &key);
        bump_instance(&env);
        Ok(())
    }

    /// Submits a single performance observation for `anchor_id`. Must be
    /// signed by `reporter`, which must be authorized (via
    /// `authorize_reporter`) for exactly `source_type`. Updates the
    /// anchor's weighted EMA score and its trend/risk health, pushes the
    /// score to AnchorRegistry, and publishes a `risk_status_changed` event
    /// when the anchor crosses a risk floor in either direction.
    ///
    /// The oracle is a neutral measurement: it never slashes or moves an
    /// operator's stake. Returns the anchor's new score.
    #[allow(clippy::too_many_arguments)]
    pub fn submit_report(
        env: Env,
        reporter: Address,
        anchor_id: Symbol,
        success: bool,
        settlement_seconds: u64,
        timestamp: u64,
        source_type: SourceType,
    ) -> Result<u32, Error> {
        record_report(env, reporter, anchor_id, success, settlement_seconds, timestamp, source_type, None)
    }

    /// Same as `submit_report`, plus the SHA-256 of the evidence document the
    /// reporter published for this observation. The hash is emitted in the
    /// `report_submitted` event, so the claim and its evidence are tied
    /// together on-chain.
    #[allow(clippy::too_many_arguments)]
    pub fn submit_report_with_evidence(
        env: Env,
        reporter: Address,
        anchor_id: Symbol,
        success: bool,
        settlement_seconds: u64,
        timestamp: u64,
        source_type: SourceType,
        evidence: BytesN<32>,
    ) -> Result<u32, Error> {
        record_report(env, reporter, anchor_id, success, settlement_seconds, timestamp, source_type, Some(evidence))
    }

    /// Admin-only: replaces this contract's code in place. The contract ID
    /// and all stored state are kept, so a fix no longer means redeploying
    /// under a new ID and re-pointing every service and the dashboard.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    /// Publishes a score card computed off-chain (docs/SCORING.md) from the
    /// inputs bundle whose SHA-256 is `card.inputs_hash`. The reporter must
    /// be authorized for the anchor's own source type, read from the
    /// registry. The card becomes the anchor's headline: it is pushed to the
    /// registry, and from then on per-report updates no longer overwrite it.
    /// Returns the headline score.
    pub fn publish_score_card(env: Env, reporter: Address, anchor_id: Symbol, card: ScoreCardInput) -> Result<u32, Error> {
        reporter.require_auth();

        let reporter_key = DataKey::Reporter(reporter);
        let authorized_source: SourceType = env
            .storage()
            .persistent()
            .get(&reporter_key)
            .ok_or(Error::NotAuthorizedReporter)?;
        bump_persistent(&env, &reporter_key);

        let registry_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::RegistryAddress)
            .ok_or(Error::NotInitialized)?;
        let registry = AnchorRegistryClient::new(&env, &registry_address);
        let info = match registry.try_get_anchor_info(&anchor_id) {
            Ok(Ok(info)) => info,
            _ => return Err(Error::AnchorNotFound),
        };
        if info.source_type != authorized_source {
            return Err(Error::ReporterWrongSourceType);
        }

        let percentages = [card.score, card.availability, card.speed, card.integrity, card.confidence];
        if percentages.iter().any(|p| *p > 100)
            || card.market.is_some_and(|m| m > 100)
            || card.methodology_version == 0
        {
            return Err(Error::InvalidScoreCard);
        }
        let now = env.ledger().timestamp();
        if card.window_end > now + MAX_FUTURE_SKEW_SECONDS {
            return Err(Error::ReportTimestampInFuture);
        }
        let card_key = DataKey::Card(anchor_id.clone());
        if let Some(previous) = env.storage().persistent().get::<_, ScoreCard>(&card_key) {
            if card.window_end <= previous.window_end {
                return Err(Error::StaleScoreCard);
            }
        }

        let stored = ScoreCard {
            score: card.score,
            availability: card.availability,
            speed: card.speed,
            integrity: card.integrity,
            market: card.market,
            confidence: card.confidence,
            flags: card.flags,
            window_end: card.window_end,
            methodology_version: card.methodology_version,
            inputs_hash: card.inputs_hash.clone(),
            published_at: now,
        };
        env.storage().persistent().set(&card_key, &stored);
        bump_persistent(&env, &card_key);

        // The registry holds the score of record: 0 while the card is too
        // uncertain to use, so that nobody reading the registry alone takes
        // a number that the card itself says not to show.
        registry.update_score(&anchor_id, &score_of_record(&stored));

        // The risk floor follows the new headline.
        let health_key = DataKey::Health(anchor_id.clone());
        let mut health: AnchorHealth = env
            .storage()
            .persistent()
            .get(&health_key)
            .unwrap_or_else(scoring::new_health);
        let reason = scoring::risk_reason(floor_score(&stored), &health);
        if reason != health.risk_reason {
            health.risk_reason = reason;
            env.storage().persistent().set(&health_key, &health);
            bump_persistent(&env, &health_key);
            RiskStatusChangedEvent {
                anchor_id: anchor_id.clone(),
                risk_reason: reason,
                score: card.score,
                trend: health.trend,
            }
            .publish(&env);
        }
        bump_instance(&env);

        ScoreCardPublishedEvent {
            anchor_id,
            score: card.score,
            confidence: card.confidence,
            flags: card.flags,
            methodology_version: card.methodology_version,
            inputs_hash: card.inputs_hash,
        }
        .publish(&env);
        Ok(card.score)
    }

    pub fn get_score_card(env: Env, anchor_id: Symbol) -> Option<ScoreCard> {
        env.storage().persistent().get(&DataKey::Card(anchor_id))
    }

    /// The score of record: the card's score when the anchor has a card
    /// confident enough to show (else 0), the per-report EMA for an anchor
    /// scored by reports only, or 0 for an anchor never scored (unknown,
    /// not perfect). The same number the registry holds.
    pub fn get_score(env: Env, anchor_id: Symbol) -> u32 {
        Self::get_verdict(env, anchor_id).score
    }

    /// The score of record with the confidence and flags behind it. Use
    /// this rather than `get_score` to tell "withheld" from "failing".
    pub fn get_verdict(env: Env, anchor_id: Symbol) -> Verdict {
        if let Some(card) = env
            .storage()
            .persistent()
            .get::<_, ScoreCard>(&DataKey::Card(anchor_id.clone()))
        {
            return Verdict {
                score: score_of_record(&card),
                confidence: Some(card.confidence),
                flags: card.flags,
                withheld: card.confidence < scoring::CONFIDENCE_INSUFFICIENT,
                card_score: Some(card.score),
            };
        }
        Verdict {
            score: env.storage().persistent().get(&DataKey::Score(anchor_id)).unwrap_or(0),
            confidence: None,
            flags: 0,
            withheld: false,
            card_score: None,
        }
    }

    /// Trend, risk status and recent-window stats for `anchor_id`. An anchor
    /// that has never been reported on returns the initial (healthy) state.
    pub fn get_health(env: Env, anchor_id: Symbol) -> AnchorHealth {
        env.storage()
            .persistent()
            .get(&DataKey::Health(anchor_id))
            .unwrap_or_else(scoring::new_health)
    }

    pub fn get_reporter_source_type(env: Env, reporter: Address) -> Option<SourceType> {
        env.storage().persistent().get(&DataKey::Reporter(reporter))
    }
}

/// What the registry and `get_score` hold for a card: its score, or 0 while
/// its confidence is too low to show it.
fn score_of_record(card: &ScoreCard) -> u32 {
    if card.confidence < scoring::CONFIDENCE_INSUFFICIENT {
        0
    } else {
        card.score
    }
}

/// The score the risk floor judges: none for a card too uncertain to show.
fn floor_score(card: &ScoreCard) -> Option<u32> {
    if card.confidence < scoring::CONFIDENCE_INSUFFICIENT {
        None
    } else {
        Some(card.score)
    }
}

#[allow(clippy::too_many_arguments)]
fn record_report(
    env: Env,
    reporter: Address,
    anchor_id: Symbol,
    success: bool,
    settlement_seconds: u64,
    timestamp: u64,
    source_type: SourceType,
    evidence: Option<BytesN<32>>,
) -> Result<u32, Error> {
    reporter.require_auth();

    let reporter_key = DataKey::Reporter(reporter);
    let authorized_source: SourceType = env
        .storage()
        .persistent()
        .get(&reporter_key)
        .ok_or(Error::NotAuthorizedReporter)?;
    bump_persistent(&env, &reporter_key);
    if authorized_source != source_type {
        return Err(Error::ReporterWrongSourceType);
    }

    let now = env.ledger().timestamp();
    if timestamp > now + MAX_FUTURE_SKEW_SECONDS {
        return Err(Error::ReportTimestampInFuture);
    }
    if now.saturating_sub(timestamp) > MAX_REPORT_AGE_SECONDS {
        return Err(Error::ReportTimestampTooOld);
    }

    let score_key = DataKey::Score(anchor_id.clone());
    let old_score: u32 = env
        .storage()
        .persistent()
        .get(&score_key)
        .unwrap_or(scoring::DEFAULT_SCORE);

    let observation = scoring::observation_score(success, settlement_seconds, &source_type);
    let ema = scoring::ema_update(old_score, observation, &source_type);
    env.storage().persistent().set(&score_key, &ema);
    bump_persistent(&env, &score_key);

    // With a score card, the card is the headline: reports still feed the
    // EMA and the health record, but must not overwrite the card's score.
    let card: Option<ScoreCard> = env.storage().persistent().get(&DataKey::Card(anchor_id.clone()));
    let new_score = card.as_ref().map_or(ema, |c| c.score);
    let judged = card.as_ref().map_or(Some(ema), floor_score);

    // Trend and risk floors live in contract state, not in event
    // history, so detecting them never depends on how long an RPC
    // node keeps events.
    let health_key = DataKey::Health(anchor_id.clone());
    let previous: AnchorHealth = env
        .storage()
        .persistent()
        .get(&health_key)
        .unwrap_or_else(scoring::new_health);
    let previous_reason = previous.risk_reason;
    let health = scoring::update_health(previous, success, observation, judged, timestamp);
    env.storage().persistent().set(&health_key, &health);
    bump_persistent(&env, &health_key);

    let registry_address: Address = env
        .storage()
        .instance()
        .get(&DataKey::RegistryAddress)
        .ok_or(Error::NotInitialized)?;
    if card.is_none() {
        AnchorRegistryClient::new(&env, &registry_address).update_score(&anchor_id, &ema);
    }
    bump_instance(&env);

    ReportSubmittedEvent {
        anchor_id: anchor_id.clone(),
        source_type,
        success,
        settlement_seconds,
        new_score,
        evidence,
    }
    .publish(&env);

    if health.risk_reason != previous_reason {
        RiskStatusChangedEvent {
            anchor_id,
            risk_reason: health.risk_reason,
            score: new_score,
            trend: health.trend,
        }
        .publish(&env);
    }

    Ok(new_score)
}
