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
}
