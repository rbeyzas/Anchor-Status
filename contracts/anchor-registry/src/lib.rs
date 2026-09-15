#![no_std]

mod errors;
#[cfg(not(feature = "contract"))]
mod client;
mod types;

#[cfg(test)]
mod test;

pub use errors::Error;
#[cfg(not(feature = "contract"))]
pub use client::AnchorRegistryClient;
pub use types::{AnchorInfo, SourceType};

use soroban_sdk::{contract, contractimpl, token, Address, Env, String, Symbol, Vec};
use types::{DataKey, SlashEvent, WithdrawalRequest};

/// How long, in seconds, an operator must wait between requesting a stake
/// withdrawal and executing it. 7 days.
pub const WITHDRAWAL_COOLDOWN_SECONDS: u64 = 60 * 60 * 24 * 7;

#[cfg(feature = "contract")]
#[contract]
pub struct AnchorRegistry;

#[cfg(feature = "contract")]
#[contractimpl]
impl AnchorRegistry {
    /// One-time setup. `oracle_address` is the only address ever allowed to
    /// call `slash` / `update_score`. `token_address` is the SAC (e.g. the
    /// native XLM contract on testnet) used for staking.
    pub fn init(
        env: Env,
        admin: Address,
        oracle_address: Address,
        token_address: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::OracleAddress, &oracle_address);
        env.storage()
            .instance()
            .set(&DataKey::TokenAddress, &token_address);
        Ok(())
    }

    /// Registers a new anchor. Must be signed by `operator`, the address
    /// that will subsequently be allowed to stake/withdraw for this anchor.
    pub fn register_anchor(
        env: Env,
        operator: Address,
        anchor_id: Symbol,
        name: String,
        domain: String,
        source_type: SourceType,
    ) -> Result<(), Error> {
        operator.require_auth();

        let key = DataKey::Anchor(anchor_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AnchorAlreadyExists);
        }

        let now = env.ledger().timestamp();
        let info = AnchorInfo {
            name,
            domain,
            source_type,
            operator,
            stake: 0,
            score: 100,
            registered_at: now,
            last_updated: now,
        };
        env.storage().persistent().set(&key, &info);

        let mut ids: Vec<Symbol> = env
            .storage()
            .instance()
            .get(&DataKey::AnchorIds)
            .unwrap_or_else(|| Vec::new(&env));
        ids.push_back(anchor_id);
        env.storage().instance().set(&DataKey::AnchorIds, &ids);

        Ok(())
    }

    /// Returns the ids of every registered anchor, in registration order.
    /// Used by the dashboard to discover which anchors exist on-chain
    /// (there is no other way to enumerate them).
    pub fn list_anchors(env: Env) -> Vec<Symbol> {
        env.storage()
            .instance()
            .get(&DataKey::AnchorIds)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Transfers `amount` of the stake token from the anchor's operator into
    /// the registry contract and credits it to the anchor's stake balance.
    pub fn stake(env: Env, anchor_id: Symbol, amount: i128) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let key = DataKey::Anchor(anchor_id.clone());
        let mut info: AnchorInfo = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::AnchorNotFound)?;

        info.operator.require_auth();

        let token_address: Address = env.storage().instance().get(&DataKey::TokenAddress).unwrap();
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&info.operator, env.current_contract_address(), &amount);

        info.stake += amount;
        info.last_updated = env.ledger().timestamp();
        env.storage().persistent().set(&key, &info);
        Ok(())
    }

    /// Starts the withdrawal cooldown for `amount` of an anchor's stake.
    pub fn request_withdrawal(env: Env, anchor_id: Symbol, amount: i128) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let key = DataKey::Anchor(anchor_id.clone());
        let info: AnchorInfo = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::AnchorNotFound)?;
        info.operator.require_auth();

        if amount > info.stake {
            return Err(Error::InsufficientStake);
        }

        let request = WithdrawalRequest {
            amount,
            unlock_time: env.ledger().timestamp() + WITHDRAWAL_COOLDOWN_SECONDS,
        };
        env.storage()
            .persistent()
            .set(&DataKey::WithdrawalRequest(anchor_id), &request);
        Ok(())
    }

    /// Executes a previously requested withdrawal once its cooldown has
    /// elapsed, transferring the stake token back to the operator.
    pub fn withdraw_stake(env: Env, anchor_id: Symbol) -> Result<(), Error> {
        let key = DataKey::Anchor(anchor_id.clone());
        let mut info: AnchorInfo = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::AnchorNotFound)?;
        info.operator.require_auth();

        let req_key = DataKey::WithdrawalRequest(anchor_id.clone());
        let request: WithdrawalRequest = env
            .storage()
            .persistent()
            .get(&req_key)
            .ok_or(Error::NoWithdrawalRequest)?;

        if env.ledger().timestamp() < request.unlock_time {
            return Err(Error::CooldownNotElapsed);
        }
        if request.amount > info.stake {
            return Err(Error::InsufficientStake);
        }

        let token_address: Address = env.storage().instance().get(&DataKey::TokenAddress).unwrap();
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &info.operator, &request.amount);

        info.stake -= request.amount;
        info.last_updated = env.ledger().timestamp();
        env.storage().persistent().set(&key, &info);
        env.storage().persistent().remove(&req_key);
        Ok(())
    }

    /// Slashes `amount` from an anchor's stake. Only callable by the
    /// contract registered as `oracle_address` at init time — Soroban
    /// auto-authorizes a contract's own address when it is the direct
    /// invoker of the current call frame, so no signature is needed, but
    /// only the real PerformanceOracle contract can satisfy this check.
    pub fn slash(env: Env, anchor_id: Symbol, amount: i128, reason: String) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let oracle_address: Address = env.storage().instance().get(&DataKey::OracleAddress).unwrap();
        oracle_address.require_auth();

        let key = DataKey::Anchor(anchor_id.clone());
        let mut info: AnchorInfo = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::AnchorNotFound)?;

        let slashed = if amount > info.stake { info.stake } else { amount };
        info.stake -= slashed;
        info.last_updated = env.ledger().timestamp();
        env.storage().persistent().set(&key, &info);

        // `reason` is accepted for observability (surfaced via emitted event)
        // even though it isn't persisted on the anchor record itself.
        SlashEvent {
            anchor_id,
            amount: slashed,
            reason,
        }
        .publish(&env);
        Ok(())
    }

    /// Updates an anchor's reliability score. Only callable by the
    /// PerformanceOracle contract (see `slash` for the auth mechanism).
    pub fn update_score(env: Env, anchor_id: Symbol, new_score: u32) -> Result<(), Error> {
        if new_score > 100 {
            return Err(Error::InvalidScore);
        }
        let oracle_address: Address = env.storage().instance().get(&DataKey::OracleAddress).unwrap();
        oracle_address.require_auth();

        let key = DataKey::Anchor(anchor_id);
        let mut info: AnchorInfo = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::AnchorNotFound)?;
        info.score = new_score;
        info.last_updated = env.ledger().timestamp();
        env.storage().persistent().set(&key, &info);
        Ok(())
    }

    pub fn get_anchor_info(env: Env, anchor_id: Symbol) -> Result<AnchorInfo, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Anchor(anchor_id))
            .ok_or(Error::AnchorNotFound)
    }
}
