#![no_std]

mod errors;
#[cfg(feature = "contract")]
mod events;
#[cfg(not(feature = "contract"))]
mod client;
mod types;

#[cfg(test)]
mod test;

pub use errors::Error;
#[cfg(not(feature = "contract"))]
pub use client::AnchorRegistryClient;
pub use types::{AnchorInfo, AnchorState, AnchorStatus, ClaimInfo, ClaimMessage, SourceType};

use soroban_sdk::{contract, contractimpl, token, xdr::ToXdr, Address, Bytes, BytesN, Env, String, Symbol, Vec};
use types::{AnchorState as State, DataKey, WithdrawalRequest};
pub use types::{PendingDelay, PendingUpgrade};

/// How long, in seconds, an operator must wait between requesting a stake
/// withdrawal and executing it. 7 days.
pub const WITHDRAWAL_COOLDOWN_SECONDS: u64 = 60 * 60 * 24 * 7;

/// The most ids `list_anchors_page` returns in one call, so a page always
/// fits a transaction's read limits.
pub const MAX_PAGE: u32 = 100;

/// The longest upgrade delay that can be set: long enough for a mainnet
/// review, short enough that a mistake cannot lock the contract for good.
pub const MAX_UPGRADE_DELAY_SECONDS: u64 = 60 * 60 * 24 * 30;

/// The longest deactivation reason accepted, in bytes.
pub const MAX_REASON_BYTES: u32 = 256;

// Storage TTLs, in ledgers (~5s each). Soroban archives any entry whose TTL
// runs out; an archived anchor record makes every read fail until someone
// restores it. Every write re-extends the entry, so an anchor that is still
// being reported on can never expire. Kept well under the network's maximum
// entry TTL.
#[cfg(feature = "contract")]
const DAY_IN_LEDGERS: u32 = 17_280;
#[cfg(feature = "contract")]
const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
#[cfg(feature = "contract")]
const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;
#[cfg(feature = "contract")]
const PERSISTENT_BUMP_AMOUNT: u32 = 90 * DAY_IN_LEDGERS;
#[cfg(feature = "contract")]
const PERSISTENT_LIFETIME_THRESHOLD: u32 = PERSISTENT_BUMP_AMOUNT - 7 * DAY_IN_LEDGERS;

#[cfg(feature = "contract")]
fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

#[cfg(feature = "contract")]
fn bump_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_LIFETIME_THRESHOLD, PERSISTENT_BUMP_AMOUNT);
}

#[cfg(feature = "contract")]
fn require_admin(env: &Env) -> Result<Address, Error> {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)?;
    admin.require_auth();
    Ok(admin)
}

#[cfg(feature = "contract")]
fn require_anchor(env: &Env, anchor_id: &Symbol) -> Result<AnchorInfo, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Anchor(anchor_id.clone()))
        .ok_or(Error::AnchorNotFound)
}

#[cfg(feature = "contract")]
fn is_deactivated(env: &Env, anchor_id: &Symbol) -> bool {
    env.storage()
        .persistent()
        .get::<_, AnchorStatus>(&DataKey::Status(anchor_id.clone()))
        .is_some_and(|s| s.state == State::Deactivated)
}

/// The upgrade delay in effect: a pending shortening counts once its time
/// has come.
#[cfg(feature = "contract")]
fn upgrade_delay(env: &Env) -> u64 {
    let pending: Option<PendingDelay> = env.storage().instance().get(&DataKey::PendingDelay);
    match pending {
        Some(p) if env.ledger().timestamp() >= p.effective_at => p.seconds,
        _ => env.storage().instance().get(&DataKey::UpgradeDelay).unwrap_or(0),
    }
}

/// The original AnchorIds index, while it still exists.
#[cfg(feature = "contract")]
fn old_index(env: &Env) -> Option<Vec<Symbol>> {
    env.storage().instance().get(&DataKey::AnchorIds)
}

#[cfg(feature = "contract")]
fn stored_count(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::AnchorCount).unwrap_or(0)
}

/// The bytes an anchor's SIGNING_KEY signs to hand its record to
/// `operator` (the XDR of a ClaimMessage).
#[cfg(feature = "contract")]
fn claim_message_bytes(env: &Env, anchor_id: &Symbol, operator: &Address) -> Bytes {
    let nonce: u64 = env.storage().persistent().get(&DataKey::ClaimNonce(anchor_id.clone())).unwrap_or(0);
    ClaimMessage {
        domain: Symbol::new(env, "monarank_claim"),
        network_id: env.ledger().network_id(),
        registry: env.current_contract_address(),
        anchor_id: anchor_id.clone(),
        operator: operator.clone(),
        nonce,
    }
    .to_xdr(env)
}

/// Puts `anchor_id` at position `i` of the paged index, both ways.
#[cfg(feature = "contract")]
fn set_position(env: &Env, i: u32, anchor_id: &Symbol) {
    let at = DataKey::AnchorAt(i);
    let pos = DataKey::AnchorPos(anchor_id.clone());
    env.storage().persistent().set(&at, anchor_id);
    env.storage().persistent().set(&pos, &i);
    bump_persistent(env, &at);
    bump_persistent(env, &pos);
}

#[cfg(feature = "contract")]
#[contract]
pub struct AnchorRegistry;

#[cfg(feature = "contract")]
#[contractimpl]
impl AnchorRegistry {
    /// One-time setup. `oracle_address` is the only address ever allowed to
    /// call `update_score`. `token_address` is the SAC (e.g. the
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
        bump_instance(&env);
        events::Initialized { admin, oracle: oracle_address, token: token_address }.publish(&env);
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
        if env.storage().instance().has(&DataKey::AnchorIds) {
            return Err(Error::MigrationInProgress);
        }

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
            // Unscored: unknown, not perfect. The oracle writes the first
            // real score.
            score: 0,
            registered_at: now,
            last_updated: now,
        };
        env.storage().persistent().set(&key, &info);
        bump_persistent(&env, &key);

        let count = stored_count(&env);
        set_position(&env, count, &anchor_id);
        env.storage().instance().set(&DataKey::AnchorCount, &(count + 1));
        bump_instance(&env);
        events::AnchorRegistered {
            anchor_id,
            operator: info.operator,
            domain: info.domain,
            source_type: info.source_type,
        }
        .publish(&env);

        Ok(())
    }

    /// How many anchors are registered.
    pub fn anchor_count(env: Env) -> u32 {
        match old_index(&env) {
            Some(ids) => ids.len(),
            None => stored_count(&env),
        }
    }

    /// Up to `limit` (at most MAX_PAGE) anchor ids from position `start`,
    /// in registration order. An empty page means `start` is past the end.
    /// While the old index still exists it is the one read: it stays
    /// complete until finalize_migration, the paged one does not.
    pub fn list_anchors_page(env: Env, start: u32, limit: u32) -> Vec<Symbol> {
        let mut page = Vec::new(&env);
        let take = if limit > MAX_PAGE { MAX_PAGE } else { limit };
        match old_index(&env) {
            Some(ids) => {
                let end = (start.saturating_add(take)).min(ids.len());
                for i in start..end {
                    page.push_back(ids.get_unchecked(i));
                }
            }
            None => {
                let end = (start.saturating_add(take)).min(stored_count(&env));
                for i in start..end {
                    page.push_back(env.storage().persistent().get(&DataKey::AnchorAt(i)).unwrap());
                }
            }
        }
        page
    }

    /// Every anchor id, in registration order. Kept for existing callers;
    /// it reads one entry per anchor, so with many anchors use
    /// `anchor_count` and `list_anchors_page` instead.
    pub fn list_anchors(env: Env) -> Vec<Symbol> {
        if let Some(ids) = old_index(&env) {
            return ids;
        }
        let mut all = Vec::new(&env);
        for i in 0..stored_count(&env) {
            all.push_back(env.storage().persistent().get(&DataKey::AnchorAt(i)).unwrap());
        }
        all
    }

    /// Admin-only, once after upgrading from the AnchorIds layout: copies up
    /// to `batch` more ids into the paged index and returns how many are
    /// left. Run until it returns 0, then call finalize_migration. Each id
    /// costs two writes, so keep `batch` within a transaction's write limit.
    pub fn migrate_anchor_index(env: Env, batch: u32) -> Result<u32, Error> {
        require_admin(&env)?;
        let ids = old_index(&env).ok_or(Error::NothingToMigrate)?;
        let done: u32 = env.storage().instance().get(&DataKey::MigrationCursor).unwrap_or(0);
        let end = done.saturating_add(batch).min(ids.len());
        for i in done..end {
            set_position(&env, i, &ids.get_unchecked(i));
        }
        env.storage().instance().set(&DataKey::MigrationCursor, &end);
        bump_instance(&env);
        events::IndexMigrated { copied: end, total: ids.len() }.publish(&env);
        Ok(ids.len() - end)
    }

    /// Admin-only: switches to the paged index once every id is in it, and
    /// deletes the old AnchorIds entry. Registration is open again after.
    pub fn finalize_migration(env: Env) -> Result<(), Error> {
        require_admin(&env)?;
        let ids = old_index(&env).ok_or(Error::NothingToMigrate)?;
        let done: u32 = env.storage().instance().get(&DataKey::MigrationCursor).unwrap_or(0);
        if done < ids.len() {
            return Err(Error::MigrationIncomplete);
        }
        env.storage().instance().set(&DataKey::AnchorCount, &ids.len());
        env.storage().instance().remove(&DataKey::AnchorIds);
        env.storage().instance().remove(&DataKey::MigrationCursor);
        bump_instance(&env);
        events::IndexFinalized { count: ids.len() }.publish(&env);
        Ok(())
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
        // Withdrawing stays open; adding stake to an anchor nobody measures
        // does not.
        if is_deactivated(&env, &anchor_id) {
            return Err(Error::AnchorDeactivated);
        }

        let token_address: Address = env.storage().instance().get(&DataKey::TokenAddress).unwrap();
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&info.operator, env.current_contract_address(), &amount);

        info.stake += amount;
        info.last_updated = env.ledger().timestamp();
        env.storage().persistent().set(&key, &info);
        bump_persistent(&env, &key);
        bump_instance(&env);
        events::StakeAdded { anchor_id, amount, stake: info.stake }.publish(&env);
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
        let req_key = DataKey::WithdrawalRequest(anchor_id.clone());
        env.storage().persistent().set(&req_key, &request);
        bump_persistent(&env, &req_key);
        bump_persistent(&env, &key);
        events::WithdrawalRequested { anchor_id, amount, unlock_time: request.unlock_time }.publish(&env);
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
        bump_persistent(&env, &key);
        env.storage().persistent().remove(&req_key);
        events::StakeWithdrawn { anchor_id, amount: request.amount, stake: info.stake }.publish(&env);
        Ok(())
    }

    /// Updates an anchor's reliability score. Only callable by the contract
    /// registered as `oracle_address` at init time. Soroban auto-authorizes
    /// a contract's own address when it is the direct invoker of the
    /// current call frame, so no signature is needed — but only the real
    /// PerformanceOracle contract can satisfy this check.
    ///
    /// There is deliberately no slashing entry point. The registry publishes
    /// a neutral score; it never moves an operator's stake on its own.
    pub fn update_score(env: Env, anchor_id: Symbol, new_score: u32) -> Result<(), Error> {
        if new_score > 100 {
            return Err(Error::InvalidScore);
        }
        let oracle_address: Address = env.storage().instance().get(&DataKey::OracleAddress).unwrap();
        oracle_address.require_auth();
        if is_deactivated(&env, &anchor_id) {
            return Err(Error::AnchorDeactivated);
        }

        let key = DataKey::Anchor(anchor_id.clone());
        let mut info: AnchorInfo = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::AnchorNotFound)?;
        info.score = new_score;
        info.last_updated = env.ledger().timestamp();
        env.storage().persistent().set(&key, &info);
        bump_persistent(&env, &key);
        // The index entries are written once; without this they would be
        // archived after ~90 days and the anchor would drop out of the list.
        let pos_key = DataKey::AnchorPos(anchor_id.clone());
        if let Some(pos) = env.storage().persistent().get::<_, u32>(&pos_key) {
            bump_persistent(&env, &pos_key);
            bump_persistent(&env, &DataKey::AnchorAt(pos));
        }
        bump_instance(&env);
        events::ScoreUpdated { anchor_id, score: new_score }.publish(&env);
        Ok(())
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

    /// Admin-only: stops measuring an anchor, with the reason the dashboard
    /// shows. The record and its history stay; the oracle refuses new
    /// reports and cards, and update_score refuses new scores.
    pub fn deactivate_anchor(env: Env, anchor_id: Symbol, reason: String) -> Result<(), Error> {
        require_admin(&env)?;
        require_anchor(&env, &anchor_id)?;
        if is_deactivated(&env, &anchor_id) {
            return Err(Error::AnchorDeactivated);
        }
        if reason.len() > MAX_REASON_BYTES {
            return Err(Error::ReasonTooLong);
        }
        let status = AnchorStatus { state: State::Deactivated, reason, since: env.ledger().timestamp() };
        let key = DataKey::Status(anchor_id.clone());
        env.storage().persistent().set(&key, &status);
        bump_persistent(&env, &key);
        bump_instance(&env);
        events::AnchorDeactivated { anchor_id, reason: status.reason }.publish(&env);
        Ok(())
    }

    /// Admin-only: undoes deactivate_anchor.
    pub fn reactivate_anchor(env: Env, anchor_id: Symbol) -> Result<(), Error> {
        require_admin(&env)?;
        require_anchor(&env, &anchor_id)?;
        if !is_deactivated(&env, &anchor_id) {
            return Err(Error::NotDeactivated);
        }
        let status = AnchorStatus {
            state: State::Active,
            reason: String::from_str(&env, ""),
            since: env.ledger().timestamp(),
        };
        let key = DataKey::Status(anchor_id.clone());
        env.storage().persistent().set(&key, &status);
        bump_persistent(&env, &key);
        bump_instance(&env);
        events::AnchorReactivated { anchor_id }.publish(&env);
        Ok(())
    }

    /// Admin-only: deletes a deactivated anchor that holds no stake and has
    /// no withdrawal pending, so nobody's money can be left behind. Meant
    /// for registrations that were wrong; an anchor that simply stopped is
    /// deactivated and kept. The last anchor in the index takes the removed
    /// one's position, so after a removal the order is no longer exactly
    /// registration order.
    pub fn remove_anchor(env: Env, anchor_id: Symbol) -> Result<(), Error> {
        require_admin(&env)?;
        if env.storage().instance().has(&DataKey::AnchorIds) {
            return Err(Error::MigrationInProgress);
        }
        let info = require_anchor(&env, &anchor_id)?;
        if !is_deactivated(&env, &anchor_id) {
            return Err(Error::NotDeactivated);
        }
        if info.stake != 0 {
            return Err(Error::StakeNotZero);
        }
        if env.storage().persistent().has(&DataKey::WithdrawalRequest(anchor_id.clone())) {
            return Err(Error::WithdrawalPending);
        }

        let pos_key = DataKey::AnchorPos(anchor_id.clone());
        let pos: u32 = env.storage().persistent().get(&pos_key).unwrap();
        let last = stored_count(&env) - 1;
        if pos != last {
            let moved: Symbol = env.storage().persistent().get(&DataKey::AnchorAt(last)).unwrap();
            set_position(&env, pos, &moved);
        }
        env.storage().persistent().remove(&DataKey::AnchorAt(last));
        env.storage().persistent().remove(&pos_key);
        env.storage().persistent().remove(&DataKey::Anchor(anchor_id.clone()));
        env.storage().persistent().remove(&DataKey::Status(anchor_id.clone()));
        // The claim count stays, so a signature for this id never works
        // again if it is registered anew.
        env.storage().persistent().remove(&DataKey::SigningKey(anchor_id.clone()));
        env.storage().persistent().remove(&DataKey::Claim(anchor_id.clone()));
        env.storage().instance().set(&DataKey::AnchorCount, &last);
        bump_instance(&env);
        events::AnchorRemoved { anchor_id }.publish(&env);
        Ok(())
    }

    /// Whether an anchor is measured. An anchor never deactivated is
    /// active since its registration.
    pub fn get_anchor_status(env: Env, anchor_id: Symbol) -> Result<AnchorStatus, Error> {
        let info = require_anchor(&env, &anchor_id)?;
        Ok(env
            .storage()
            .persistent()
            .get(&DataKey::Status(anchor_id))
            .unwrap_or(AnchorStatus {
                state: State::Active,
                reason: String::from_str(&env, ""),
                since: info.registered_at,
            }))
    }

    /// PerformanceOracle-only: the anchor's SEP-1 SIGNING_KEY, once a
    /// quorum of reporters has read the same key from its stellar.toml.
    /// It is the key claim_anchor checks. A contract cannot read a
    /// stellar.toml; the reporters are its eyes, under the same quorum as
    /// the scores.
    pub fn set_signing_key(env: Env, anchor_id: Symbol, signing_key: BytesN<32>) -> Result<(), Error> {
        let oracle_address: Address = env.storage().instance().get(&DataKey::OracleAddress).ok_or(Error::NotInitialized)?;
        oracle_address.require_auth();
        require_anchor(&env, &anchor_id)?;
        let key = DataKey::SigningKey(anchor_id.clone());
        env.storage().persistent().set(&key, &signing_key);
        bump_persistent(&env, &key);
        bump_instance(&env);
        events::SigningKeyAttested { anchor_id, signing_key }.publish(&env);
        Ok(())
    }

    pub fn get_signing_key(env: Env, anchor_id: Symbol) -> Option<BytesN<32>> {
        env.storage().persistent().get(&DataKey::SigningKey(anchor_id))
    }

    /// The exact bytes the anchor's SIGNING_KEY must sign so that
    /// claim_anchor hands its record to `operator`. Read it with a
    /// simulated call and sign it off-chain; it changes after every claim.
    pub fn claim_message(env: Env, anchor_id: Symbol, operator: Address) -> Bytes {
        claim_message_bytes(&env, &anchor_id, &operator)
    }

    /// Hands an anchor's record to `operator`, on the anchor's own word: an
    /// ed25519 signature of claim_message by the SIGNING_KEY a quorum of
    /// reporters attested. `operator` signs the transaction too. A
    /// signature for another network, registry, anchor, operator or an
    /// earlier claim does not verify. Refused while the record holds a
    /// stake, which the current operator must withdraw first.
    pub fn claim_anchor(env: Env, anchor_id: Symbol, operator: Address, signature: BytesN<64>) -> Result<(), Error> {
        operator.require_auth();
        let key = DataKey::Anchor(anchor_id.clone());
        let mut info = require_anchor(&env, &anchor_id)?;
        if is_deactivated(&env, &anchor_id) {
            return Err(Error::AnchorDeactivated);
        }
        let signing_key: BytesN<32> = env
            .storage()
            .persistent()
            .get(&DataKey::SigningKey(anchor_id.clone()))
            .ok_or(Error::NoSigningKey)?;
        if info.stake != 0 {
            return Err(Error::StakeNotZero);
        }
        if env.storage().persistent().has(&DataKey::WithdrawalRequest(anchor_id.clone())) {
            return Err(Error::WithdrawalPending);
        }
        // Traps unless the signature verifies: the whole call fails.
        env.crypto()
            .ed25519_verify(&signing_key, &claim_message_bytes(&env, &anchor_id, &operator), &signature);

        let nonce_key = DataKey::ClaimNonce(anchor_id.clone());
        let nonce: u64 = env.storage().persistent().get(&nonce_key).unwrap_or(0);
        env.storage().persistent().set(&nonce_key, &(nonce + 1));
        bump_persistent(&env, &nonce_key);

        let previous_operator = info.operator.clone();
        info.operator = operator.clone();
        env.storage().persistent().set(&key, &info);
        bump_persistent(&env, &key);
        let claim_key = DataKey::Claim(anchor_id.clone());
        env.storage().persistent().set(
            &claim_key,
            &ClaimInfo { operator: operator.clone(), signing_key: signing_key.clone(), claimed_at: env.ledger().timestamp() },
        );
        bump_persistent(&env, &claim_key);
        bump_instance(&env);
        events::AnchorClaimed { anchor_id, previous_operator, operator, signing_key }.publish(&env);
        Ok(())
    }

    /// Who claimed the anchor, if anyone has: the operator its own
    /// SIGNING_KEY named.
    pub fn get_claim(env: Env, anchor_id: Symbol) -> Option<ClaimInfo> {
        env.storage().persistent().get(&DataKey::Claim(anchor_id))
    }

    pub fn get_anchor_info(env: Env, anchor_id: Symbol) -> Result<AnchorInfo, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Anchor(anchor_id))
            .ok_or(Error::AnchorNotFound)
    }
}
