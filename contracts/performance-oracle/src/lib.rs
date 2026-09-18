#![no_std]

mod errors;
mod scoring;
mod types;

#[cfg(test)]
mod test;

use anchor_registry::{AnchorRegistryClient, SourceType};
use errors::Error;
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Symbol};
use types::{AnchorHealth, DataKey, ReportSubmittedEvent, RiskStatusChangedEvent};

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

        let observation = scoring::observation_score(success, settlement_seconds);
        let new_score = scoring::ema_update(old_score, observation, &source_type);
        env.storage().persistent().set(&score_key, &new_score);
        bump_persistent(&env, &score_key);

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
        let health = scoring::update_health(previous, success, observation, new_score, timestamp);
        env.storage().persistent().set(&health_key, &health);
        bump_persistent(&env, &health_key);

        let registry_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::RegistryAddress)
            .ok_or(Error::NotInitialized)?;
        let registry = AnchorRegistryClient::new(&env, &registry_address);
        registry.update_score(&anchor_id, &new_score);
        bump_instance(&env);

        ReportSubmittedEvent {
            anchor_id: anchor_id.clone(),
            source_type,
            success,
            settlement_seconds,
            new_score,
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

    pub fn get_score(env: Env, anchor_id: Symbol) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::Score(anchor_id))
            .unwrap_or(scoring::DEFAULT_SCORE)
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
