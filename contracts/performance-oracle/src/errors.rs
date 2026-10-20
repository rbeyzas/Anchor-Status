use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAuthorizedReporter = 3,
    ReporterWrongSourceType = 4,
    ReportTimestampInFuture = 5,
    ReportTimestampTooOld = 6,
    /// A percentage over 100, or a methodology version of 0.
    InvalidScoreCard = 7,
    /// The card's window does not end after the stored card's: a replay,
    /// or an older card arriving late.
    StaleScoreCard = 8,
    /// The anchor is not registered in AnchorRegistry.
    AnchorNotFound = 9,
    /// The anchor is deactivated in AnchorRegistry: nothing more is taken
    /// for it.
    AnchorDeactivated = 10,
    /// A card whose window does not end on a round boundary.
    MisalignedWindow = 11,
    /// The reporter already submitted a card for this round.
    DuplicateSubmission = 12,
    /// The round's cards were computed with another methodology version.
    MethodologyMismatch = 13,
    /// MAX_REPORTERS are already authorized for that source type.
    TooManyReporters = 14,
    /// A threshold outside 1..=MAX_REPORTERS, or a max_spread over 100.
    InvalidQuorumConfig = 15,
    /// revoke_reporter for an address that is not a reporter.
    ReporterNotFound = 16,
    /// open_dispute by anyone but the operator the anchor's own
    /// SIGNING_KEY named (AnchorRegistry.claim_anchor).
    NotTheClaimedOperator = 17,
    // 18-22 carry the same numbers as in AnchorRegistry, so #21 is
    // TimelockActive in both contracts.
    /// accept_admin with no admin proposed.
    NoPendingAdmin = 18,
    /// propose_upgrade while another one is pending: cancel it first.
    UpgradePending = 19,
    /// execute_upgrade or cancel_upgrade with nothing proposed.
    NoPendingUpgrade = 20,
    /// execute_upgrade before the delay has passed.
    TimelockActive = 21,
    /// An upgrade delay over MAX_UPGRADE_DELAY_SECONDS.
    DelayTooLong = 22,
    /// The anchor's current card is already disputed.
    DisputeAlreadyOpen = 23,
    /// A dispute was rejected recently; wait for the cooldown.
    DisputeCoolingDown = 24,
    /// The anchor's record holds less stake than DisputeConfig.min_stake.
    StakeTooLow = 25,
    /// The window named is not the anchor's current card.
    NotTheCurrentCard = 26,
    /// vote_dispute with no open dispute.
    NoOpenDispute = 27,
    /// The reporter already voted on this dispute.
    AlreadyVoted = 28,
    /// A negative min_stake, or a cooldown over MAX_UPGRADE_DELAY_SECONDS.
    InvalidDisputeConfig = 29,
}
