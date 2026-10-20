#![no_std]

mod errors;
mod events;
mod quorum;
mod scoring;
mod types;

#[cfg(test)]
mod test;

use anchor_registry::{AnchorInfo, AnchorRegistryClient, AnchorState, PendingDelay, PendingUpgrade, SourceType};
use errors::Error;
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Symbol, Vec};
pub use quorum::{FLAG_REPORTER_DISAGREEMENT, MAX_REPORTERS};
use types::{
    AnchorHealth, Attestation, DataKey, Dispute, DisputeConfig, DisputeOpenedEvent, DisputeResolvedEvent,
    DisputeStatus, DisputeVotedEvent, PendingQuorumConfig, PendingRound, QuorumConfig, QuorumInfo,
    QuorumReachedEvent, ReportSubmittedEvent, ReporterOutlierEvent, RiskStatusChangedEvent, ScoreCard,
    ScoreCardInput, ScoreCardPublishedEvent, ScoreCardSubmittedEvent, SigningKeyAttestationEvent, Submission,
    Verdict,
};

/// Reports timestamped further than this many seconds in the future
/// (relative to ledger time) are rejected as invalid.
const MAX_FUTURE_SKEW_SECONDS: u64 = 5 * 60;
/// Reports older than this are rejected as stale.
const MAX_REPORT_AGE_SECONDS: u64 = 2 * 24 * 60 * 60;

/// The longest upgrade delay that can be set, as in AnchorRegistry: long
/// enough for a mainnet review, short enough that a mistake cannot lock the
/// contract for good.
pub const MAX_UPGRADE_DELAY_SECONDS: u64 = 60 * 60 * 24 * 30;

/// Set in a verdict's flags while the card is disputed (open or upheld).
pub const FLAG_DISPUTED: u32 = 1 << 17;

/// Disputes without a DisputeConfig: 10 XLM of stake (in stroops) and a
/// week between a rejected dispute and the next.
pub const DEFAULT_DISPUTE_MIN_STAKE: i128 = 100_000_000;
pub const DEFAULT_DISPUTE_COOLDOWN_SECONDS: u64 = 7 * 24 * 60 * 60;

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

fn require_admin(env: &Env) -> Result<Address, Error> {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)?;
    admin.require_auth();
    Ok(admin)
}

/// How long an unfinished round is kept: two days, far longer than any
/// round, so a slow reporter is not cut off, short enough to clean up.
const ROUND_TTL_LEDGERS: u32 = 2 * DAY_IN_LEDGERS;

/// The quorum in force: a pending lower threshold counts once its time has
/// come; with nothing configured, one reporter decides (as before quorums).
fn quorum_config(env: &Env) -> QuorumConfig {
    let pending: Option<PendingQuorumConfig> = env.storage().instance().get(&DataKey::PendingQuorumCfg);
    if let Some(p) = pending {
        if env.ledger().timestamp() >= p.effective_at {
            return p.config;
        }
    }
    env.storage()
        .instance()
        .get(&DataKey::QuorumCfg)
        .unwrap_or(QuorumConfig { threshold: 1, max_spread: 100, round_seconds: 0 })
}

fn dispute_config(env: &Env) -> DisputeConfig {
    env.storage().instance().get(&DataKey::DisputeCfg).unwrap_or(DisputeConfig {
        min_stake: DEFAULT_DISPUTE_MIN_STAKE,
        cooldown_seconds: DEFAULT_DISPUTE_COOLDOWN_SECONDS,
    })
}

fn registry_client(env: &Env) -> Result<AnchorRegistryClient<'_>, Error> {
    let address: Address = env.storage().instance().get(&DataKey::RegistryAddress).ok_or(Error::NotInitialized)?;
    Ok(AnchorRegistryClient::new(env, &address))
}

/// `reporter` signed and is authorized for the anchor's own source type;
/// the anchor is registered and active. Returns its record.
fn require_reporter_for(
    env: &Env,
    registry: &AnchorRegistryClient,
    reporter: &Address,
    anchor_id: &Symbol,
) -> Result<AnchorInfo, Error> {
    reporter.require_auth();
    let key = DataKey::Reporter(reporter.clone());
    let authorized: SourceType = env.storage().persistent().get(&key).ok_or(Error::NotAuthorizedReporter)?;
    bump_persistent(env, &key);
    let info = match registry.try_get_anchor_info(anchor_id) {
        Ok(Ok(info)) => info,
        _ => return Err(Error::AnchorNotFound),
    };
    if info.source_type != authorized {
        return Err(Error::ReporterWrongSourceType);
    }
    require_active(registry, anchor_id)?;
    Ok(info)
}

fn reporters_of(env: &Env, source_type: &SourceType) -> Vec<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::Reporters(source_type.clone()))
        .unwrap_or(Vec::new(env))
}

fn set_reporters(env: &Env, source_type: &SourceType, list: &Vec<Address>) {
    let key = DataKey::Reporters(source_type.clone());
    env.storage().persistent().set(&key, list);
    bump_persistent(env, &key);
}

/// The upgrade delay in effect: a pending shortening counts once its time
/// has come.
fn upgrade_delay(env: &Env) -> u64 {
    let pending: Option<PendingDelay> = env.storage().instance().get(&DataKey::PendingDelay);
    match pending {
        Some(p) if env.ledger().timestamp() >= p.effective_at => p.seconds,
        _ => env.storage().instance().get(&DataKey::UpgradeDelay).unwrap_or(0),
    }
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
        events::Initialized { admin, registry: registry_address }.publish(&env);
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
        require_admin(&env)?;
        let key = DataKey::Reporter(reporter.clone());
        // A reporter belongs to one source type: moving it takes it off the
        // previous type's list.
        if let Some(previous) = env.storage().persistent().get::<_, SourceType>(&key) {
            if previous != source_type {
                let mut old = reporters_of(&env, &previous);
                if let Some(i) = old.first_index_of(&reporter) {
                    old.remove(i);
                    set_reporters(&env, &previous, &old);
                }
            }
        }
        let mut list = reporters_of(&env, &source_type);
        if !list.contains(&reporter) {
            if list.len() >= MAX_REPORTERS {
                return Err(Error::TooManyReporters);
            }
            list.push_back(reporter.clone());
            set_reporters(&env, &source_type, &list);
        }
        env.storage().persistent().set(&key, &source_type);
        bump_persistent(&env, &key);
        bump_instance(&env);
        events::ReporterAuthorized { reporter, source_type }.publish(&env);
        Ok(())
    }

    /// Admin-only: takes a reporter's authorization away. Its submitted
    /// cards stay where they are; it can submit nothing new.
    pub fn revoke_reporter(env: Env, reporter: Address) -> Result<(), Error> {
        require_admin(&env)?;
        let key = DataKey::Reporter(reporter.clone());
        let source_type: SourceType = env.storage().persistent().get(&key).ok_or(Error::ReporterNotFound)?;
        env.storage().persistent().remove(&key);
        let mut list = reporters_of(&env, &source_type);
        if let Some(i) = list.first_index_of(&reporter) {
            list.remove(i);
            set_reporters(&env, &source_type, &list);
        }
        bump_instance(&env);
        events::ReporterRevoked { reporter, source_type }.publish(&env);
        Ok(())
    }

    /// Admin-only: how many reporters must agree, how far apart they may
    /// be, and the round length. A higher threshold applies at once; a
    /// lower one only after the upgrade delay, like an upgrade, so one key
    /// cannot quietly go back to deciding alone.
    pub fn set_quorum_config(env: Env, config: QuorumConfig) -> Result<(), Error> {
        require_admin(&env)?;
        if config.threshold == 0 || config.threshold > MAX_REPORTERS || config.max_spread > 100 {
            return Err(Error::InvalidQuorumConfig);
        }
        let now = env.ledger().timestamp();
        let effective_at = if config.threshold >= quorum_config(&env).threshold {
            env.storage().instance().set(&DataKey::QuorumCfg, &config);
            env.storage().instance().remove(&DataKey::PendingQuorumCfg);
            now
        } else {
            let pending = PendingQuorumConfig { config: config.clone(), effective_at: now + upgrade_delay(&env) };
            env.storage().instance().set(&DataKey::PendingQuorumCfg, &pending);
            pending.effective_at
        };
        bump_instance(&env);
        events::QuorumConfigSet {
            threshold: config.threshold,
            max_spread: config.max_spread,
            round_seconds: config.round_seconds,
            effective_at,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_quorum_config(env: Env) -> QuorumConfig {
        quorum_config(&env)
    }

    pub fn get_reporters(env: Env, source_type: SourceType) -> Vec<Address> {
        reporters_of(&env, &source_type)
    }

    /// The cards collected for the anchor's next card, until enough
    /// reporters have submitted.
    pub fn get_pending_round(env: Env, anchor_id: Symbol) -> Option<PendingRound> {
        env.storage().temporary().get(&DataKey::Round(anchor_id))
    }

    /// Who agreed on the anchor's current card, with what.
    pub fn get_quorum_info(env: Env, anchor_id: Symbol) -> Option<QuorumInfo> {
        env.storage().persistent().get(&DataKey::Quorum(anchor_id))
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

    /// Admin-only, step one of handing over the admin role: names the next
    /// admin. Nothing changes until that address accepts, so a typo cannot
    /// hand the contract to an address nobody controls. A new proposal
    /// replaces the previous one.
    pub fn propose_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        let admin = require_admin(&env)?;
        env.storage().instance().set(&DataKey::PendingAdmin, &new_admin);
        bump_instance(&env);
        events::AdminProposed { admin, proposed: new_admin }.publish(&env);
        Ok(())
    }

    /// Step two, signed by the proposed admin: it becomes the admin.
    pub fn accept_admin(env: Env) -> Result<(), Error> {
        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(Error::NoPendingAdmin)?;
        pending.require_auth();
        let previous: Address = env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)?;
        env.storage().instance().set(&DataKey::Admin, &pending);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        bump_instance(&env);
        events::AdminChanged { previous, admin: pending }.publish(&env);
        Ok(())
    }

    /// Admin-only: sets the wait between propose_upgrade and
    /// execute_upgrade. A longer delay applies at once; a shorter one only
    /// after the current delay has passed, so the lock cannot be dropped
    /// and an upgrade pushed through in the same breath.
    pub fn set_upgrade_delay(env: Env, seconds: u64) -> Result<(), Error> {
        require_admin(&env)?;
        if seconds > MAX_UPGRADE_DELAY_SECONDS {
            return Err(Error::DelayTooLong);
        }
        let current = upgrade_delay(&env);
        let now = env.ledger().timestamp();
        let effective_at = if seconds >= current {
            env.storage().instance().set(&DataKey::UpgradeDelay, &seconds);
            env.storage().instance().remove(&DataKey::PendingDelay);
            now
        } else {
            let pending = PendingDelay { seconds, effective_at: now + current };
            env.storage().instance().set(&DataKey::PendingDelay, &pending);
            pending.effective_at
        };
        bump_instance(&env);
        events::UpgradeDelaySet { seconds, effective_at }.publish(&env);
        Ok(())
    }

    /// Admin-only: proposes new code. It can run once the delay has passed.
    /// The wasm must already be uploaded; publish its hash so anyone can
    /// check what is coming.
    pub fn propose_upgrade(env: Env, wasm_hash: BytesN<32>) -> Result<PendingUpgrade, Error> {
        require_admin(&env)?;
        if env.storage().instance().has(&DataKey::PendingUpgrade) {
            return Err(Error::UpgradePending);
        }
        let pending = PendingUpgrade { wasm_hash, executable_at: env.ledger().timestamp() + upgrade_delay(&env) };
        env.storage().instance().set(&DataKey::PendingUpgrade, &pending);
        bump_instance(&env);
        events::UpgradeProposed { wasm_hash: pending.wasm_hash.clone(), executable_at: pending.executable_at }.publish(&env);
        Ok(pending)
    }

    /// Admin-only: replaces this contract's code with the proposed wasm,
    /// once its delay has passed. The contract ID and all stored state are
    /// kept.
    pub fn execute_upgrade(env: Env) -> Result<(), Error> {
        require_admin(&env)?;
        let pending: PendingUpgrade = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrade)
            .ok_or(Error::NoPendingUpgrade)?;
        if env.ledger().timestamp() < pending.executable_at {
            return Err(Error::TimelockActive);
        }
        env.storage().instance().remove(&DataKey::PendingUpgrade);
        events::UpgradeExecuted { wasm_hash: pending.wasm_hash.clone() }.publish(&env);
        env.deployer().update_current_contract_wasm(pending.wasm_hash);
        Ok(())
    }

    /// Admin-only: withdraws the proposed upgrade.
    pub fn cancel_upgrade(env: Env) -> Result<(), Error> {
        require_admin(&env)?;
        let pending: PendingUpgrade = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrade)
            .ok_or(Error::NoPendingUpgrade)?;
        env.storage().instance().remove(&DataKey::PendingUpgrade);
        bump_instance(&env);
        events::UpgradeCancelled { wasm_hash: pending.wasm_hash }.publish(&env);
        Ok(())
    }

    pub fn get_pending_upgrade(env: Env) -> Option<PendingUpgrade> {
        env.storage().instance().get(&DataKey::PendingUpgrade)
    }

    /// The delay in effect now, in seconds.
    pub fn get_upgrade_delay(env: Env) -> u64 {
        upgrade_delay(&env)
    }

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)
    }

    /// Submits a reporter's score card for one window, computed off-chain
    /// (docs/SCORING.md) from the inputs bundle whose SHA-256 is
    /// `card.inputs_hash`. The reporter must be authorized for the anchor's
    /// own source type, read from the registry.
    ///
    /// Cards are collected per window. Once `threshold` distinct reporters
    /// have submitted the same window (`get_quorum_config`), their
    /// field-wise median becomes the anchor's card: it is pushed to the
    /// registry, and from then on per-report updates no longer overwrite
    /// it. Until then nothing about the anchor changes. With the default
    /// threshold of 1 every card is final at once.
    ///
    /// Returns the anchor's card score after the call: the new card's once
    /// final, the current card's (or 0) while the round waits.
    pub fn publish_score_card(env: Env, reporter: Address, anchor_id: Symbol, card: ScoreCardInput) -> Result<u32, Error> {
        reporter.require_auth();

        let reporter_key = DataKey::Reporter(reporter.clone());
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
        require_active(&registry, &anchor_id)?;

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
        let config = quorum_config(&env);
        if config.round_seconds > 0 && card.window_end % config.round_seconds != 0 {
            return Err(Error::MisalignedWindow);
        }
        let card_key = DataKey::Card(anchor_id.clone());
        let previous: Option<ScoreCard> = env.storage().persistent().get(&card_key);
        if let Some(previous) = &previous {
            if card.window_end <= previous.window_end {
                return Err(Error::StaleScoreCard);
            }
        }

        // The round for this window: a newer window starts a new round (an
        // unfinished older one is dropped); an older one is stale.
        let round_key = DataKey::Round(anchor_id.clone());
        let mut round = match env.storage().temporary().get::<_, PendingRound>(&round_key) {
            Some(r) if r.window_end == card.window_end => {
                if r.methodology_version != card.methodology_version {
                    return Err(Error::MethodologyMismatch);
                }
                if r.submissions.iter().any(|s| s.reporter == reporter) {
                    return Err(Error::DuplicateSubmission);
                }
                r
            }
            Some(r) if r.window_end > card.window_end => return Err(Error::StaleScoreCard),
            _ => PendingRound {
                window_end: card.window_end,
                methodology_version: card.methodology_version,
                submissions: Vec::new(&env),
            },
        };
        round.submissions.push_back(Submission { reporter: reporter.clone(), card: card.clone(), submitted_at: now });
        ScoreCardSubmittedEvent {
            anchor_id: anchor_id.clone(),
            reporter,
            window_end: card.window_end,
            score: card.score,
            inputs_hash: card.inputs_hash.clone(),
            submitted: round.submissions.len(),
            threshold: config.threshold,
        }
        .publish(&env);

        if round.submissions.len() < config.threshold {
            env.storage().temporary().set(&round_key, &round);
            env.storage()
                .temporary()
                .extend_ttl(&round_key, ROUND_TTL_LEDGERS, ROUND_TTL_LEDGERS);
            bump_instance(&env);
            return Ok(previous.as_ref().map_or(0, |c| c.score));
        }

        // Quorum: the median card becomes the anchor's card.
        env.storage().temporary().remove(&round_key);
        let combined = quorum::combine(&round.submissions, config.max_spread);
        let final_card = combined.card;
        let stored = ScoreCard {
            score: final_card.score,
            availability: final_card.availability,
            speed: final_card.speed,
            integrity: final_card.integrity,
            market: final_card.market,
            confidence: final_card.confidence,
            flags: final_card.flags,
            window_end: final_card.window_end,
            methodology_version: final_card.methodology_version,
            inputs_hash: final_card.inputs_hash.clone(),
            published_at: now,
        };
        env.storage().persistent().set(&card_key, &stored);
        bump_persistent(&env, &card_key);

        let mut reporters = Vec::new(&env);
        let mut scores = Vec::new(&env);
        let mut hashes = Vec::new(&env);
        for s in round.submissions.iter() {
            reporters.push_back(s.reporter.clone());
            scores.push_back(s.card.score);
            hashes.push_back(s.card.inputs_hash.clone());
        }
        let quorum_key = DataKey::Quorum(anchor_id.clone());
        env.storage().persistent().set(
            &quorum_key,
            &QuorumInfo {
                window_end: stored.window_end,
                reporters,
                scores,
                inputs_hashes: hashes,
                spread: combined.spread,
                outliers: combined.outliers.clone(),
            },
        );
        bump_persistent(&env, &quorum_key);

        // A dispute still open against the previous card has nothing left
        // to decide: the card it named is no longer the anchor's.
        let dispute_key = DataKey::Dispute(anchor_id.clone());
        if let Some(mut dispute) = env.storage().persistent().get::<_, Dispute>(&dispute_key) {
            if dispute.status == DisputeStatus::Open {
                dispute.status = DisputeStatus::Superseded;
                dispute.resolved_at = now;
                env.storage().persistent().set(&dispute_key, &dispute);
                bump_persistent(&env, &dispute_key);
                DisputeResolvedEvent { anchor_id: anchor_id.clone(), status: dispute.status, window_end: dispute.window_end }
                    .publish(&env);
            }
        }

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
                score: stored.score,
                trend: health.trend,
            }
            .publish(&env);
        }
        bump_instance(&env);

        QuorumReachedEvent {
            anchor_id: anchor_id.clone(),
            window_end: stored.window_end,
            reporters: round.submissions.len(),
            spread: combined.spread,
        }
        .publish(&env);
        for outlier in combined.outliers.iter() {
            let score = round
                .submissions
                .iter()
                .find(|s| s.reporter == outlier)
                .map_or(0, |s| s.card.score);
            ReporterOutlierEvent { anchor_id: anchor_id.clone(), reporter: outlier, score, median: combined.median_score }
                .publish(&env);
        }
        ScoreCardPublishedEvent {
            anchor_id,
            score: stored.score,
            confidence: stored.confidence,
            flags: stored.flags,
            methodology_version: stored.methodology_version,
            inputs_hash: stored.inputs_hash.clone(),
        }
        .publish(&env);
        Ok(stored.score)
    }

    /// A reporter's reading of the anchor's SEP-1 SIGNING_KEY, from its
    /// stellar.toml. Once `threshold` reporters (the scores' quorum) have
    /// read the same key, it goes to AnchorRegistry, where the anchor can
    /// use it to claim its record. A reporter's newer reading replaces its
    /// older one. Returns how many reporters agree on this key so far.
    pub fn attest_signing_key(env: Env, reporter: Address, anchor_id: Symbol, signing_key: BytesN<32>) -> Result<u32, Error> {
        let registry = registry_client(&env)?;
        require_reporter_for(&env, &registry, &reporter, &anchor_id)?;
        let key = DataKey::Attestations(anchor_id.clone());
        let mut readings: Vec<Attestation> = env.storage().temporary().get(&key).unwrap_or(Vec::new(&env));
        if let Some(i) = readings.iter().position(|a| a.reporter == reporter) {
            readings.remove(i as u32);
        }
        readings.push_back(Attestation { reporter: reporter.clone(), signing_key: signing_key.clone() });
        let agreeing = readings.iter().filter(|a| a.signing_key == signing_key).count() as u32;
        let threshold = quorum_config(&env).threshold;
        SigningKeyAttestationEvent {
            anchor_id: anchor_id.clone(),
            reporter,
            signing_key: signing_key.clone(),
            agreeing,
            threshold,
        }
        .publish(&env);
        if agreeing >= threshold {
            env.storage().temporary().remove(&key);
            registry.set_signing_key(&anchor_id, &signing_key);
        } else {
            env.storage().temporary().set(&key, &readings);
            env.storage().temporary().extend_ttl(&key, ROUND_TTL_LEDGERS, ROUND_TTL_LEDGERS);
        }
        bump_instance(&env);
        Ok(agreeing)
    }

    /// The operator the anchor's own SIGNING_KEY named (see
    /// AnchorRegistry.claim_anchor) objects to the anchor's current card.
    /// One dispute per card; the record must hold DisputeConfig.min_stake
    /// (checked, never moved); after a rejected dispute a cooldown applies.
    /// While open, the verdict carries FLAG_DISPUTED. The reporters decide
    /// with vote_dispute.
    pub fn open_dispute(
        env: Env,
        operator: Address,
        anchor_id: Symbol,
        window_end: u64,
        reason_code: u32,
        evidence_hash: BytesN<32>,
    ) -> Result<(), Error> {
        operator.require_auth();
        let registry = registry_client(&env)?;
        match registry.try_get_claim(&anchor_id) {
            Ok(Ok(Some(claim))) if claim.operator == operator => {}
            _ => return Err(Error::NotTheClaimedOperator),
        }
        let info = match registry.try_get_anchor_info(&anchor_id) {
            Ok(Ok(info)) => info,
            _ => return Err(Error::AnchorNotFound),
        };
        let config = dispute_config(&env);
        if info.stake < config.min_stake {
            return Err(Error::StakeTooLow);
        }
        let card: ScoreCard = env
            .storage()
            .persistent()
            .get(&DataKey::Card(anchor_id.clone()))
            .ok_or(Error::NotTheCurrentCard)?;
        if card.window_end != window_end {
            return Err(Error::NotTheCurrentCard);
        }
        let now = env.ledger().timestamp();
        let key = DataKey::Dispute(anchor_id.clone());
        if let Some(previous) = env.storage().persistent().get::<_, Dispute>(&key) {
            if previous.status == DisputeStatus::Open || previous.window_end == window_end {
                return Err(Error::DisputeAlreadyOpen);
            }
        }
        if env.storage().persistent().get::<_, u64>(&DataKey::DisputeCooldown(anchor_id.clone())).is_some_and(|until| now < until) {
            return Err(Error::DisputeCoolingDown);
        }
        let dispute = Dispute {
            operator: operator.clone(),
            window_end,
            opened_at: now,
            reason_code,
            evidence_hash: evidence_hash.clone(),
            status: DisputeStatus::Open,
            uphold: Vec::new(&env),
            reject: Vec::new(&env),
            resolved_at: 0,
        };
        env.storage().persistent().set(&key, &dispute);
        bump_persistent(&env, &key);
        bump_instance(&env);
        DisputeOpenedEvent { anchor_id, operator, window_end, reason_code, evidence_hash }.publish(&env);
        Ok(())
    }

    /// A reporter's vote on the anchor's open dispute. `threshold`
    /// reporters (the scores' quorum) upholding it withhold the card's
    /// score until a newer card; as many rejecting it close it and start
    /// the cooldown. One vote per reporter.
    pub fn vote_dispute(env: Env, reporter: Address, anchor_id: Symbol, uphold: bool) -> Result<DisputeStatus, Error> {
        let registry = registry_client(&env)?;
        require_reporter_for(&env, &registry, &reporter, &anchor_id)?;
        let key = DataKey::Dispute(anchor_id.clone());
        let mut dispute: Dispute = env
            .storage()
            .persistent()
            .get(&key)
            .filter(|d: &Dispute| d.status == DisputeStatus::Open)
            .ok_or(Error::NoOpenDispute)?;
        if dispute.uphold.contains(&reporter) || dispute.reject.contains(&reporter) {
            return Err(Error::AlreadyVoted);
        }
        if uphold {
            dispute.uphold.push_back(reporter.clone());
        } else {
            dispute.reject.push_back(reporter.clone());
        }
        DisputeVotedEvent {
            anchor_id: anchor_id.clone(),
            reporter,
            uphold,
            uphold_votes: dispute.uphold.len(),
            reject_votes: dispute.reject.len(),
        }
        .publish(&env);

        let threshold = quorum_config(&env).threshold;
        let now = env.ledger().timestamp();
        if dispute.uphold.len() >= threshold {
            dispute.status = DisputeStatus::Upheld;
            dispute.resolved_at = now;
            // Nobody reading the registry alone should take the disputed
            // number either.
            registry.update_score(&anchor_id, &0);
        } else if dispute.reject.len() >= threshold {
            dispute.status = DisputeStatus::Rejected;
            dispute.resolved_at = now;
            let cooldown_key = DataKey::DisputeCooldown(anchor_id.clone());
            env.storage().persistent().set(&cooldown_key, &(now + dispute_config(&env).cooldown_seconds));
            bump_persistent(&env, &cooldown_key);
        }
        env.storage().persistent().set(&key, &dispute);
        bump_persistent(&env, &key);
        if dispute.status != DisputeStatus::Open {
            DisputeResolvedEvent { anchor_id, status: dispute.status, window_end: dispute.window_end }.publish(&env);
        }
        bump_instance(&env);
        Ok(dispute.status)
    }

    /// The anchor's latest dispute, whatever its status.
    pub fn get_dispute(env: Env, anchor_id: Symbol) -> Option<Dispute> {
        env.storage().persistent().get(&DataKey::Dispute(anchor_id))
    }

    /// Admin-only: the stake a record needs to open a dispute, and the
    /// cooldown after a rejected one.
    pub fn set_dispute_config(env: Env, config: DisputeConfig) -> Result<(), Error> {
        require_admin(&env)?;
        if config.min_stake < 0 || config.cooldown_seconds > MAX_UPGRADE_DELAY_SECONDS {
            return Err(Error::InvalidDisputeConfig);
        }
        env.storage().instance().set(&DataKey::DisputeCfg, &config);
        bump_instance(&env);
        events::DisputeConfigSet { min_stake: config.min_stake, cooldown_seconds: config.cooldown_seconds }.publish(&env);
        Ok(())
    }

    pub fn get_dispute_config(env: Env) -> DisputeConfig {
        dispute_config(&env)
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
            // A dispute counts against the card it named only.
            let status = env
                .storage()
                .persistent()
                .get::<_, Dispute>(&DataKey::Dispute(anchor_id.clone()))
                .filter(|d| d.window_end == card.window_end)
                .map(|d| d.status);
            let disputed = matches!(status, Some(DisputeStatus::Open) | Some(DisputeStatus::Upheld));
            let upheld = status == Some(DisputeStatus::Upheld);
            return Verdict {
                score: if upheld { 0 } else { score_of_record(&card) },
                confidence: Some(card.confidence),
                flags: card.flags | if disputed { FLAG_DISPUTED } else { 0 },
                withheld: upheld || card.confidence < scoring::CONFIDENCE_INSUFFICIENT,
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
/// Refuses an anchor the registry has deactivated. A registry without
/// get_anchor_status (code from before deactivation existed) answers with
/// an error, which counts as active, so the two contracts can be upgraded
/// in either order.
fn require_active(registry: &AnchorRegistryClient, anchor_id: &Symbol) -> Result<(), Error> {
    match registry.try_get_anchor_status(anchor_id) {
        Ok(Ok(status)) if status.state == AnchorState::Deactivated => Err(Error::AnchorDeactivated),
        _ => Ok(()),
    }
}

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

    let registry_address: Address = env
        .storage()
        .instance()
        .get(&DataKey::RegistryAddress)
        .ok_or(Error::NotInitialized)?;
    let registry = AnchorRegistryClient::new(&env, &registry_address);
    require_active(&registry, &anchor_id)?;

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
    let mut health = scoring::update_health(previous, success, observation, judged, timestamp);
    // With a quorum, one reporter's reports still count as observations,
    // but cannot raise or clear a risk flag, nor move the registry's score.
    let one_key_decides = quorum_config(&env).threshold <= 1;
    if !one_key_decides {
        health.risk_reason = previous_reason;
    }
    env.storage().persistent().set(&health_key, &health);
    bump_persistent(&env, &health_key);

    if card.is_none() && one_key_decides {
        registry.update_score(&anchor_id, &ema);
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
