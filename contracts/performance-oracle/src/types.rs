use anchor_registry::SourceType;
use soroban_sdk::{contractevent, contracttype, Address, BytesN, Symbol, Vec};

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
    // Governance, the same keys AnchorRegistry uses (instance storage).
    /// The admin named by propose_admin, until it accepts.
    PendingAdmin,
    /// Seconds between propose_upgrade and execute_upgrade; absent = 0.
    UpgradeDelay,
    /// A shortening of UpgradeDelay not yet in effect.
    PendingDelay,
    /// The proposed wasm and when it may run.
    PendingUpgrade,
    // Reporter quorum (docs/SCORING.md; SOW deliverable 1).
    /// QuorumConfig (instance); absent = threshold 1, today's behaviour.
    QuorumCfg,
    /// A lower threshold waiting out the upgrade delay (instance).
    PendingQuorumCfg,
    /// source_type -> every reporter authorized for it (persistent).
    Reporters(SourceType),
    /// anchor_id -> the PendingRound collecting cards (temporary: a round
    /// that never reaches the threshold simply expires).
    Round(Symbol),
    /// anchor_id -> QuorumInfo behind the current card (persistent).
    Quorum(Symbol),
}

/// How many authorized reporters must agree before a score card counts.
#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct QuorumConfig {
    /// Distinct reporters whose cards for the same window make it final.
    pub threshold: u32,
    /// The largest distance from the median score a reporter may be before
    /// the card is flagged and the reporter named as an outlier.
    pub max_spread: u32,
    /// Card windows must end on a multiple of this many seconds, so every
    /// reporter scores the same window. 0 = any window.
    pub round_seconds: u64,
}

/// A lower threshold, in force from `effective_at`.
#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct PendingQuorumConfig {
    pub config: QuorumConfig,
    pub effective_at: u64,
}

/// One reporter's card for a round.
#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct Submission {
    pub reporter: Address,
    pub card: ScoreCardInput,
    pub submitted_at: u64,
}

/// The cards collected so far for one window of one anchor.
#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct PendingRound {
    pub window_end: u64,
    pub methodology_version: u32,
    pub submissions: Vec<Submission>,
}

/// The audit trail behind a final card: who agreed, with what.
#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct QuorumInfo {
    pub window_end: u64,
    pub reporters: Vec<Address>,
    /// Each reporter's own score, in the order of `reporters`.
    pub scores: Vec<u32>,
    /// Each reporter's own inputs bundle, in the order of `reporters`.
    pub inputs_hashes: Vec<BytesN<32>>,
    /// Highest minus lowest score.
    pub spread: u32,
    /// Reporters further than max_spread from the median score.
    pub outliers: Vec<Address>,
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

/// Everything a consumer needs to use an anchor's score correctly, in one
/// read: the score of record, and whether it is worth showing.
#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct Verdict {
    /// The score of record: what `get_score` returns and the registry holds.
    /// 0 when there is no score to show: never scored, or a card whose
    /// confidence is too low (`withheld`).
    pub score: u32,
    /// The card's confidence; None for an anchor scored by reports only.
    pub confidence: Option<u32>,
    /// The card's gate and information flags; 0 without a card.
    pub flags: u32,
    /// The anchor has a card, but its confidence is under 40: its number
    /// says too little to use. The flags still apply.
    pub withheld: bool,
    /// The card's own score even when withheld, for anyone who wants to see
    /// where it stands; None without a card.
    pub card_score: Option<u32>,
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

/// One reporter's card for a round was accepted.
#[contractevent(topics = ["score_card_submitted"])]
#[derive(Clone, Debug, PartialEq)]
pub struct ScoreCardSubmittedEvent {
    #[topic]
    pub anchor_id: Symbol,
    pub reporter: Address,
    pub window_end: u64,
    pub score: u32,
    pub inputs_hash: BytesN<32>,
    /// Cards in the round so far, and how many make it final.
    pub submitted: u32,
    pub threshold: u32,
}

/// Enough reporters agreed: the round's median is now the anchor's card.
#[contractevent(topics = ["quorum_reached"])]
#[derive(Clone, Debug, PartialEq)]
pub struct QuorumReachedEvent {
    #[topic]
    pub anchor_id: Symbol,
    pub window_end: u64,
    pub reporters: u32,
    pub spread: u32,
}

/// A reporter's score was further than max_spread from the median.
#[contractevent(topics = ["reporter_outlier"])]
#[derive(Clone, Debug, PartialEq)]
pub struct ReporterOutlierEvent {
    #[topic]
    pub anchor_id: Symbol,
    #[topic]
    pub reporter: Address,
    pub score: u32,
    pub median: u32,
}
