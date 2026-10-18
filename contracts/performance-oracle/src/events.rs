//! Events for the oracle's configuration and governance changes, so every
//! state change can be followed from the ledger alone. The measurement
//! events (report_submitted, risk_status_changed, score_card_published)
//! live in types.rs. Topic names match AnchorRegistry's where the action is
//! the same.
use anchor_registry::SourceType;
use soroban_sdk::{contractevent, Address, BytesN};

#[contractevent(topics = ["initialized"])]
#[derive(Clone, Debug, PartialEq)]
pub struct Initialized {
    pub admin: Address,
    pub registry: Address,
}

#[contractevent(topics = ["reporter_authorized"])]
#[derive(Clone, Debug, PartialEq)]
pub struct ReporterAuthorized {
    #[topic]
    pub reporter: Address,
    pub source_type: SourceType,
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

#[contractevent(topics = ["reporter_revoked"])]
#[derive(Clone, Debug, PartialEq)]
pub struct ReporterRevoked {
    #[topic]
    pub reporter: Address,
    pub source_type: SourceType,
}

#[contractevent(topics = ["quorum_config_set"])]
#[derive(Clone, Debug, PartialEq)]
pub struct QuorumConfigSet {
    pub threshold: u32,
    pub max_spread: u32,
    pub round_seconds: u64,
    /// When it applies: now, or after the upgrade delay for a lower
    /// threshold.
    pub effective_at: u64,
}
