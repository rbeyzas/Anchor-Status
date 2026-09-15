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
}
