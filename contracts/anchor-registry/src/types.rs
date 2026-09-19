use soroban_sdk::{contracttype, Address, String, Symbol};

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
    AnchorIds,
}
