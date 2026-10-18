//! One event per state change, so everything the registry does can be
//! followed from the ledger alone. Per-anchor events carry the anchor id as
//! their second topic, so an indexer can filter on it.
use soroban_sdk::{contractevent, Address, BytesN, String, Symbol};

use crate::types::SourceType;

#[contractevent(topics = ["initialized"])]
#[derive(Clone, Debug, PartialEq)]
pub struct Initialized {
    pub admin: Address,
    pub oracle: Address,
    pub token: Address,
}

#[contractevent(topics = ["anchor_registered"])]
#[derive(Clone, Debug, PartialEq)]
pub struct AnchorRegistered {
    #[topic]
    pub anchor_id: Symbol,
    pub operator: Address,
    pub domain: String,
    pub source_type: SourceType,
}

#[contractevent(topics = ["stake_added"])]
#[derive(Clone, Debug, PartialEq)]
pub struct StakeAdded {
    #[topic]
    pub anchor_id: Symbol,
    pub amount: i128,
    /// The anchor's stake after the change.
    pub stake: i128,
}

#[contractevent(topics = ["withdrawal_requested"])]
#[derive(Clone, Debug, PartialEq)]
pub struct WithdrawalRequested {
    #[topic]
    pub anchor_id: Symbol,
    pub amount: i128,
    pub unlock_time: u64,
}

#[contractevent(topics = ["stake_withdrawn"])]
#[derive(Clone, Debug, PartialEq)]
pub struct StakeWithdrawn {
    #[topic]
    pub anchor_id: Symbol,
    pub amount: i128,
    /// The anchor's stake after the change.
    pub stake: i128,
}

#[contractevent(topics = ["score_updated"])]
#[derive(Clone, Debug, PartialEq)]
pub struct ScoreUpdated {
    #[topic]
    pub anchor_id: Symbol,
    pub score: u32,
}

#[contractevent(topics = ["anchor_deactivated"])]
#[derive(Clone, Debug, PartialEq)]
pub struct AnchorDeactivated {
    #[topic]
    pub anchor_id: Symbol,
    pub reason: String,
}

#[contractevent(topics = ["anchor_reactivated"])]
#[derive(Clone, Debug, PartialEq)]
pub struct AnchorReactivated {
    #[topic]
    pub anchor_id: Symbol,
}

#[contractevent(topics = ["anchor_removed"])]
#[derive(Clone, Debug, PartialEq)]
pub struct AnchorRemoved {
    #[topic]
    pub anchor_id: Symbol,
}

#[contractevent(topics = ["index_migrated"])]
#[derive(Clone, Debug, PartialEq)]
pub struct IndexMigrated {
    /// Ids copied into the paged index so far, of `total`.
    pub copied: u32,
    pub total: u32,
}

#[contractevent(topics = ["index_finalized"])]
#[derive(Clone, Debug, PartialEq)]
pub struct IndexFinalized {
    pub count: u32,
}

#[contractevent(topics = ["admin_proposed"])]
#[derive(Clone, Debug, PartialEq)]
pub struct AdminProposed {
    pub admin: Address,
    pub proposed: Address,
}

#[contractevent(topics = ["admin_changed"])]
#[derive(Clone, Debug, PartialEq)]
pub struct AdminChanged {
    pub previous: Address,
    pub admin: Address,
}

#[contractevent(topics = ["upgrade_delay_set"])]
#[derive(Clone, Debug, PartialEq)]
pub struct UpgradeDelaySet {
    pub seconds: u64,
    /// When it applies: now for a longer delay, after the current one has
    /// passed for a shorter one.
    pub effective_at: u64,
}

#[contractevent(topics = ["upgrade_proposed"])]
#[derive(Clone, Debug, PartialEq)]
pub struct UpgradeProposed {
    pub wasm_hash: BytesN<32>,
    pub executable_at: u64,
}

#[contractevent(topics = ["upgrade_executed"])]
#[derive(Clone, Debug, PartialEq)]
pub struct UpgradeExecuted {
    pub wasm_hash: BytesN<32>,
}

#[contractevent(topics = ["upgrade_cancelled"])]
#[derive(Clone, Debug, PartialEq)]
pub struct UpgradeCancelled {
    pub wasm_hash: BytesN<32>,
}
