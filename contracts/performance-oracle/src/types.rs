use anchor_registry::SourceType;
use soroban_sdk::{contractevent, contracttype, Address, BytesN, Symbol};

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
    /// anchor_id -> AnchorHealth: the trend and risk-floor state.
    Health(Symbol),
    /// anchor_id -> ScoreCard: the latest windowed score card
    /// (docs/SCORING.md). Appended last so existing keys keep their encoding.
    Card(Symbol),
}

/// What a reporter submits: the card computed off-chain from a published
/// inputs bundle. One struct rather than one argument per field, because a
/// contract function takes at most 10 arguments.
#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct ScoreCardInput {
    /// Headline 0-100, after the confidence shrinkage and the gate caps.
    pub score: u32,
    pub availability: u32,
    pub speed: u32,
    pub integrity: u32,
    /// None when the Market pillar does not apply (n/a).
    pub market: Option<u32>,
    pub confidence: u32,
    /// Gate and information flags, as a bitmask (docs/SCORING.md section 8).
    pub flags: u32,
    /// Unix seconds: the end of the measured window.
    pub window_end: u64,
    pub methodology_version: u32,
    /// SHA-256 of the published inputs bundle the card was computed from.
    pub inputs_hash: BytesN<32>,
}

/// A stored score card: the submitted card plus when it was published.
#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct ScoreCard {
    pub score: u32,
    pub availability: u32,
    pub speed: u32,
    pub integrity: u32,
    pub market: Option<u32>,
    pub confidence: u32,
    pub flags: u32,
    pub window_end: u64,
    pub methodology_version: u32,
    pub inputs_hash: BytesN<32>,
    /// Ledger timestamp when the card was accepted.
    pub published_at: u64,
}

/// Direction of an anchor's recent performance relative to its long-run
/// baseline — a short EMA compared with a long EMA.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Trend {
    Stable,
    Improving,
    Degrading,
}

/// Why an anchor is currently flagged as risky, if it is. Checked in this
/// order; the first rule that trips is reported.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RiskReason {
    None,
    /// Several reports in a row failed — an outage, whatever the average says.
    ConsecutiveFailures,
    /// Most of the recent window failed, even if the latest reports recovered.
    LowSuccessRate,
    /// The headline score itself fell to or below the floor.
    ScoreBelowFloor,
}

/// Per-anchor summary kept on-chain so that trend and risk detection never
/// depend on event history, which Soroban RPC only serves for a short window.
#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct AnchorHealth {
    /// Short-horizon EMA (reacts within a few reports).
    pub fast_score: u32,
    /// Long-horizon EMA (the anchor's baseline).
    pub slow_score: u32,
    pub trend: Trend,
    pub consecutive_failures: u32,
    /// Outcomes of the most recent reports as a bitmap: bit 0 is the latest,
    /// 1 = success. Only the lowest `recent_count` bits are meaningful.
    pub recent_outcomes: u32,
    pub recent_count: u32,
    /// Total reports ever received. Volume goes here — as confidence in the
    /// score — never into the score itself.
    pub observations: u64,
    pub risk_reason: RiskReason,
    /// Timestamp of the latest report (unix seconds), 0 if none yet.
    pub last_report_at: u64,
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
    /// SHA-256 of the published evidence document behind this report, if
    /// the reporter supplied one. Anyone can fetch the document, hash it,
    /// and check it against this value — and then check what the document
    /// itself proves (an anchor-signed SEP-10 challenge, a settlement tx).
    pub evidence: Option<BytesN<32>>,
}

/// Published only when an anchor's risk status changes, so consumers see
/// transitions rather than one event per report.
#[contractevent(topics = ["risk_status_changed"])]
#[derive(Clone, Debug, PartialEq)]
pub struct RiskStatusChangedEvent {
    #[topic]
    pub anchor_id: Symbol,
    pub risk_reason: RiskReason,
    pub score: u32,
    pub trend: Trend,
}

/// Published for every accepted score card. Flat fields, so an indexer can
/// read the headline and its confidence without decoding a nested struct.
#[contractevent(topics = ["score_card_published"])]
#[derive(Clone, Debug, PartialEq)]
pub struct ScoreCardPublishedEvent {
    #[topic]
    pub anchor_id: Symbol,
    pub score: u32,
    pub confidence: u32,
    pub flags: u32,
    pub methodology_version: u32,
    pub inputs_hash: BytesN<32>,
}
