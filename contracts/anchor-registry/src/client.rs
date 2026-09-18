//! Export-free cross-contract call client for `AnchorRegistry`.
//!
//! Used only when the `contract` feature is disabled (i.e. by
//! performance-oracle, which depends on this crate with
//! `default-features = false`). A real `#[contractimpl]` block always
//! emits `#[no_mangle]` wasm exports for its functions, and those get
//! linked into ANY wasm binary that depends on the crate — so pulling in
//! anchor-registry's own contract impl from performance-oracle would
//! collide with performance-oracle's own same-named exports (e.g. `init`).
//! `#[contractclient]` on a plain trait generates only the typed call
//! wrapper, with no exports, so it's safe to use from a dependent contract.
use soroban_sdk::{contractclient, Address, Env, Symbol};

use crate::errors::Error;
use crate::types::AnchorInfo;

#[contractclient(name = "AnchorRegistryClient")]
pub trait AnchorRegistryInterface {
    fn init(
        env: Env,
        admin: Address,
        oracle_address: Address,
        token_address: Address,
    ) -> Result<(), Error>;
    fn update_score(env: Env, anchor_id: Symbol, new_score: u32) -> Result<(), Error>;
    fn get_anchor_info(env: Env, anchor_id: Symbol) -> Result<AnchorInfo, Error>;
}
