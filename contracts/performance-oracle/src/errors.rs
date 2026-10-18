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
    // 17 is free. 18-22 carry the same numbers as in AnchorRegistry, so #21
    // is TimelockActive in both contracts.
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
}
