use anchor_registry::SourceType;
use soroban_sdk::{contractevent, contracttype, Address, Symbol};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    RegistryAddress,
    /// reporter address -> the single source_type it's authorized for.
    Reporter(Address),
    /// anchor_id -> current EMA score (0-100), the oracle's own running
    /// state used to compute the next EMA update.
    Score(Symbol),
}

#[contractevent(topics = ["report_submitted"])]
#[derive(Clone, Debug, PartialEq)]
pub struct ReportSubmittedEvent {
    #[topic]
    pub anchor_id: Symbol,
    pub source_type: SourceType,
    pub success: bool,
    pub settlement_seconds: u64,
    pub new_score: u32,
}

#[contractevent(topics = ["score_slashed"])]
#[derive(Clone, Debug, PartialEq)]
pub struct ScoreSlashedEvent {
    #[topic]
    pub anchor_id: Symbol,
    pub new_score: u32,
    pub slashed_amount: i128,
}
