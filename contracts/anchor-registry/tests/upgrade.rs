//! Upgrade rehearsal: starts from the wasm the testnet registry really runs
//! (contracts/fixtures), registers 120 anchors with it, upgrades to this
//! crate's code, migrates the index and checks that everything reads back.
//!
//! Needs this crate built as wasm first:
//!   stellar contract build && cargo test

use anchor_registry::{AnchorRegistryClient, Error, SourceType};
use soroban_sdk::{testutils::{Address as _, Events as _, Ledger}, token, Address, Bytes, Env, String, Symbol, Vec};

mod live {
    soroban_sdk::contractimport!(file = "../fixtures/anchor_registry_live.wasm");
}

const ANCHORS: u32 = 120;
// Each id costs two writes; 25 a batch stays well inside a transaction.
const BATCH: u32 = 25;

fn new_wasm(env: &Env) -> Bytes {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/target/wasm32v1-none/release/anchor_registry.wasm");
    let bytes = std::fs::read(path).unwrap_or_else(|_| panic!("{path} is missing: run `stellar contract build` first"));
    Bytes::from_slice(env, &bytes)
}

#[test]
fn upgrades_the_live_registry_and_migrates_its_index() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let operator = Address::generate(&env);
    let token_address = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let _ = token::Client::new(&env, &token_address);

    // The registry as it is on testnet today.
    let id = env.register(live::WASM, ());
    let old = live::Client::new(&env, &id);
    old.init(&admin, &oracle, &token_address);
    let mut ids = Vec::new(&env);
    for i in 0..ANCHORS {
        let anchor_id = Symbol::new(&env, &format!("anchor_{i}"));
        old.register_anchor(
            &operator,
            &anchor_id,
            &String::from_str(&env, &format!("Anchor {i}")),
            &String::from_str(&env, &format!("a{i}.example.com")),
            &live::SourceType::RealMainnet,
        );
        ids.push_back(anchor_id);
    }
    old.update_score(&ids.get_unchecked(3), &77);

    // Upgrade in place: same contract id, same storage, new code.
    let hash = env.deployer().upload_contract_wasm(new_wasm(&env));
    old.upgrade(&hash);
    let registry = AnchorRegistryClient::new(&env, &id);

    // Before the migration the old index is read, complete.
    assert_eq!(registry.anchor_count(), ANCHORS);
    assert_eq!(registry.list_anchors(), ids);
    assert_eq!(registry.list_anchors_page(&100, &50).len(), ANCHORS - 100);
    let blocked = registry.try_register_anchor(
        &operator,
        &Symbol::new(&env, "too_early"),
        &String::from_str(&env, "Too early"),
        &String::from_str(&env, "early.example.com"),
        &SourceType::RealMainnet,
    );
    assert_eq!(blocked, Err(Ok(Error::MigrationInProgress)));

    // Migrate in batches, each one inside the default (network) budget.
    let mut calls = 0;
    loop {
        env.cost_estimate().budget().reset_default();
        let left = registry.migrate_anchor_index(&BATCH);
        calls += 1;
        if left == 0 {
            break;
        }
    }
    assert_eq!(calls, ANCHORS.div_ceil(BATCH));
    env.cost_estimate().budget().reset_default();
    registry.finalize_migration();

    // After: the paged index alone, same ids in the same order, records intact.
    assert_eq!(registry.anchor_count(), ANCHORS);
    let mut paged = Vec::new(&env);
    let mut start = 0;
    loop {
        env.cost_estimate().budget().reset_default();
        let page = registry.list_anchors_page(&start, &50);
        if page.is_empty() {
            break;
        }
        start += page.len();
        paged.append(&page);
    }
    assert_eq!(paged, ids);
    let info = registry.get_anchor_info(&ids.get_unchecked(3));
    assert_eq!(info.name, String::from_str(&env, "Anchor 3"));
    assert_eq!(info.score, 77, "the score written before the upgrade survives it");
    assert_eq!(info.operator, operator);
    let status = registry.get_anchor_status(&ids.get_unchecked(3));
    assert_eq!(status.state, anchor_registry::AnchorState::Active, "an anchor from before is active");
    assert_eq!(status.since, info.registered_at);

    // The oracle still writes scores, and registration is open again.
    registry.update_score(&ids.get_unchecked(119), &64);
    assert_eq!(registry.get_anchor_info(&ids.get_unchecked(119)).score, 64);
    let late = Symbol::new(&env, "after_upgrade");
    registry.register_anchor(
        &operator,
        &late,
        &String::from_str(&env, "After"),
        &String::from_str(&env, "after.example.com"),
        &SourceType::RealTestnet,
    );
    assert_eq!(registry.anchor_count(), ANCHORS + 1);
    assert_eq!(registry.list_anchors_page(&ANCHORS, &1), soroban_sdk::vec![&env, late]);
    assert_eq!(registry.try_migrate_anchor_index(&BATCH), Err(Ok(Error::NothingToMigrate)));

    // From here on the code changes only through the time lock: the next
    // upgrade (to the same wasm) runs after the delay and keeps the state.
    registry.set_upgrade_delay(&600);
    let now = env.ledger().timestamp();
    registry.propose_upgrade(&hash);
    assert_eq!(registry.try_execute_upgrade(), Err(Ok(Error::UpgradeNotReady)));
    env.ledger().with_mut(|l| l.timestamp = now + 600);
    registry.execute_upgrade();
    let published: std::vec::Vec<_> = env.events().all().events().iter().map(|e| {
        let soroban_sdk::xdr::ContractEventBody::V0(body) = &e.body;
        body.topics.first().cloned()
    }).collect();
    assert_eq!(published, std::vec![Some(soroban_sdk::xdr::ScVal::Symbol("upgrade_executed".try_into().unwrap()))]);
    assert_eq!(registry.get_pending_upgrade(), None);
    assert_eq!(registry.anchor_count(), ANCHORS + 1);
}
