#![no_std]

mod errors;
mod scoring;
mod types;

#[cfg(test)]
mod test;

use anchor_registry::{AnchorRegistryClient, SourceType};
use errors::Error;
use soroban_sdk::{contract, contractimpl, Address, Env, String, Symbol};
use types::{DataKey, ReportSubmittedEvent, ScoreSlashedEvent};

/// Reports timestamped further than this many seconds in the future
/// (relative to ledger time) are rejected as invalid.
const MAX_FUTURE_SKEW_SECONDS: u64 = 5 * 60;
/// Reports older than this are rejected as stale.
const MAX_REPORT_AGE_SECONDS: u64 = 2 * 24 * 60 * 60;

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

        env.storage()
            .persistent()
            .set(&DataKey::Reporter(reporter), &source_type);
        Ok(())
    }

    /// Submits a single performance observation for `anchor_id`. Must be
    /// signed by `reporter`, which must be authorized (via
    /// `authorize_reporter`) for exactly `source_type`. Updates the
    /// anchor's weighted EMA score, pushes it to AnchorRegistry, and if the
    /// score has fallen to/below the slash threshold, triggers a slash.
    /// Returns the anchor's new score.
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

        let authorized_source: SourceType = env
            .storage()
            .persistent()
            .get(&DataKey::Reporter(reporter))
            .ok_or(Error::NotAuthorizedReporter)?;
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

        let registry_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::RegistryAddress)
            .ok_or(Error::NotInitialized)?;
        let registry = AnchorRegistryClient::new(&env, &registry_address);
        registry.update_score(&anchor_id, &new_score);

        ReportSubmittedEvent {
            anchor_id: anchor_id.clone(),
            source_type,
            success,
            settlement_seconds,
            new_score,
        }
        .publish(&env);

        if new_score <= scoring::SLASH_THRESHOLD {
            let info = registry.get_anchor_info(&anchor_id);
            let amount = scoring::slash_amount(info.stake);
            if amount > 0 {
                registry.slash(
                    &anchor_id,
                    &amount,
                    &String::from_str(&env, "score fell to/below slash threshold"),
                );
                ScoreSlashedEvent {
                    anchor_id,
                    new_score,
                    slashed_amount: amount,
                }
                .publish(&env);
            }
        }

        Ok(new_score)
    }

    pub fn get_score(env: Env, anchor_id: Symbol) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::Score(anchor_id))
            .unwrap_or(scoring::DEFAULT_SCORE)
    }

    pub fn get_reporter_source_type(env: Env, reporter: Address) -> Option<SourceType> {
        env.storage().persistent().get(&DataKey::Reporter(reporter))
    }
}
