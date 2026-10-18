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
    /// The old AnchorIds index is still in place: run migrate_anchor_index
    /// and finalize_migration first.
    MigrationInProgress = 10,
    /// There is no AnchorIds index to migrate.
    NothingToMigrate = 11,
    /// finalize_migration before every id was copied.
    MigrationIncomplete = 12,
    /// The anchor is deactivated.
    AnchorDeactivated = 13,
    /// Only a deactivated anchor can be reactivated or removed.
    NotDeactivated = 14,
    /// remove_anchor with stake still held: it must be withdrawn first.
    StakeNotZero = 15,
    /// remove_anchor while a stake withdrawal is pending.
    WithdrawalPending = 16,
    /// A deactivation reason over MAX_REASON_BYTES.
    ReasonTooLong = 17,
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
