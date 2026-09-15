use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AnchorAlreadyExists = 3,
    AnchorNotFound = 4,
    InvalidAmount = 5,
    InsufficientStake = 6,
    NoWithdrawalRequest = 7,
    CooldownNotElapsed = 8,
    InvalidScore = 9,
}
