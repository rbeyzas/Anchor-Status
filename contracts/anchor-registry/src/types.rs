use soroban_sdk::{contracttype, Address, BytesN, String, Symbol};

/// Where an anchor's performance data comes from. The same three
/// variants (`RealMainnet`, `RealTestnet`, `SimulatedMock`) are used
/// consistently across every service in this repo.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SourceType {
    RealMainnet,
    RealTestnet,
    SimulatedMock,
}

#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct AnchorInfo {
    pub name: String,
    pub domain: String,
    pub source_type: SourceType,
    /// Address authorized to stake/withdraw/manage this anchor entry.
    pub operator: Address,
    /// Current staked amount, in the stake token's smallest unit (stroops for XLM).
    pub stake: i128,
    /// Reliability score, 0-100: 0 until PerformanceOracle writes the first
    /// one via update_score().
    pub score: u32,
    pub registered_at: u64,
    pub last_updated: u64,
}

/// Whether an anchor is still measured.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AnchorState {
    Active,
    /// No longer measured: the oracle takes no report or card for it, and
    /// its record stays readable, so its history keeps its owner.
    Deactivated,
}

#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct AnchorStatus {
    pub state: AnchorState,
    /// Why, in words the dashboard shows as they are. Empty while active.
    pub reason: String,
    /// Ledger timestamp of the change (registration, for an anchor never
    /// deactivated).
    pub since: u64,
}

/// A code upgrade waiting out the delay.
#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct PendingUpgrade {
    pub wasm_hash: BytesN<32>,
    /// Ledger timestamp from which execute_upgrade may run.
    pub executable_at: u64,
}

/// A shorter upgrade delay, waiting out the current one.
#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct PendingDelay {
    pub seconds: u64,
    pub effective_at: u64,
}

#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct WithdrawalRequest {
    pub amount: i128,
    /// Ledger timestamp (unix seconds) after which the withdrawal may execute.
    pub unlock_time: u64,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    OracleAddress,
    TokenAddress,
    Anchor(Symbol),
    WithdrawalRequest(Symbol),
    /// The original index: every id in one instance-storage vector. Its
    /// size grows with every anchor, toward the per-entry limit, so it is
    /// replaced by the paged index below and deleted by finalize_migration.
    AnchorIds,
    /// Paged index: how many anchors there are (instance storage)...
    AnchorCount,
    /// ...the id at each position, 0-based (persistent)...
    AnchorAt(u32),
    /// ...and each id's position, for removal (persistent).
    AnchorPos(Symbol),
    /// How many AnchorIds entries migrate_anchor_index has copied so far.
    MigrationCursor,
    /// An anchor's AnchorStatus (persistent). Absent means active.
    Status(Symbol),
    /// The admin propose_admin named, until it accepts (instance).
    PendingAdmin,
    /// Seconds between propose_upgrade and execute_upgrade (instance).
    /// Absent means 0.
    UpgradeDelay,
    /// A shortening of UpgradeDelay not yet in effect (instance).
    PendingDelay,
    /// The proposed upgrade, if any (instance).
    PendingUpgrade,
}
