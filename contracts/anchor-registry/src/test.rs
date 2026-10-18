#![cfg(test)]
extern crate std;
use std::string::ToString;

use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Events as _, Ledger},
    BytesN, Env, String,
};

fn setup(env: &Env) -> (AnchorRegistryClient<'_>, Address, Address, Address, token::Client<'_>) {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let oracle = Address::generate(env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token_address = sac.address();
    let token_client = token::Client::new(env, &token_address);
    let token_admin = token::StellarAssetClient::new(env, &token_address);
    // silence unused warning path; token_admin used by callers via closure below
    let _ = &token_admin;

    let contract_id = env.register(AnchorRegistry, ());
    let client = AnchorRegistryClient::new(env, &contract_id);
    client.init(&admin, &oracle, &token_address);

    (client, admin, oracle, token_address, token_client)
}

fn mint(env: &Env, token_address: &Address, to: &Address, amount: i128) {
    let token_admin = token::StellarAssetClient::new(env, token_address);
    token_admin.mint(to, &amount);
}

#[test]
fn register_anchor_success() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    let anchor_id = Symbol::new(&env, "anchor_1");

    client.register_anchor(
        &operator,
        &anchor_id,
        &String::from_str(&env, "Test Anchor"),
        &String::from_str(&env, "testanchor.example.com"),
        &SourceType::RealTestnet,
    );

    let info = client.get_anchor_info(&anchor_id);
    assert_eq!(info.operator, operator);
    assert_eq!(info.stake, 0);
    assert_eq!(info.score, 0, "a new anchor is unscored, not perfect");
    assert_eq!(info.source_type, SourceType::RealTestnet);
}

#[test]
fn list_anchors_returns_registered_ids_in_order() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let operator = Address::generate(&env);

    assert_eq!(client.list_anchors(), soroban_sdk::vec![&env]);

    let anchor_a = Symbol::new(&env, "anchor_a");
    let anchor_b = Symbol::new(&env, "anchor_b");
    client.register_anchor(
        &operator,
        &anchor_a,
        &String::from_str(&env, "A"),
        &String::from_str(&env, "a.example.com"),
        &SourceType::RealTestnet,
    );
    client.register_anchor(
        &operator,
        &anchor_b,
        &String::from_str(&env, "B"),
        &String::from_str(&env, "b.example.com"),
        &SourceType::SimulatedMock,
    );

    assert_eq!(
        client.list_anchors(),
        soroban_sdk::vec![&env, anchor_a, anchor_b]
    );
}

#[test]
fn register_anchor_duplicate_fails() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    let anchor_id = Symbol::new(&env, "anchor_1");

    client.register_anchor(
        &operator,
        &anchor_id,
        &String::from_str(&env, "Test Anchor"),
        &String::from_str(&env, "testanchor.example.com"),
        &SourceType::RealTestnet,
    );

    let result = client.try_register_anchor(
        &operator,
        &anchor_id,
        &String::from_str(&env, "Test Anchor 2"),
        &String::from_str(&env, "other.example.com"),
        &SourceType::SimulatedMock,
    );
    assert_eq!(result, Err(Ok(Error::AnchorAlreadyExists)));
}

#[test]
fn get_anchor_info_not_found_fails() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let result = client.try_get_anchor_info(&Symbol::new(&env, "missing"));
    assert_eq!(result, Err(Ok(Error::AnchorNotFound)));
}

#[test]
fn stake_success_transfers_token() {
    let env = Env::default();
    let (client, _admin, _oracle, token_address, token_client) = setup(&env);
    let operator = Address::generate(&env);
    let anchor_id = Symbol::new(&env, "anchor_1");

    client.register_anchor(
        &operator,
        &anchor_id,
        &String::from_str(&env, "Test Anchor"),
        &String::from_str(&env, "testanchor.example.com"),
        &SourceType::RealTestnet,
    );

    mint(&env, &token_address, &operator, 1_000_000);
    client.stake(&anchor_id, &400_000);

    let info = client.get_anchor_info(&anchor_id);
    assert_eq!(info.stake, 400_000);
    assert_eq!(token_client.balance(&operator), 600_000);
    assert_eq!(token_client.balance(&client.address), 400_000);
}

#[test]
fn stake_invalid_amount_fails() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    let anchor_id = Symbol::new(&env, "anchor_1");
    client.register_anchor(
        &operator,
        &anchor_id,
        &String::from_str(&env, "Test Anchor"),
        &String::from_str(&env, "testanchor.example.com"),
        &SourceType::RealTestnet,
    );

    let result = client.try_stake(&anchor_id, &0);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn withdraw_stake_before_cooldown_fails() {
    let env = Env::default();
    let (client, _admin, _oracle, token_address, _tc) = setup(&env);
    let operator = Address::generate(&env);
    let anchor_id = Symbol::new(&env, "anchor_1");
    client.register_anchor(
        &operator,
        &anchor_id,
        &String::from_str(&env, "Test Anchor"),
        &String::from_str(&env, "testanchor.example.com"),
        &SourceType::RealTestnet,
    );
    mint(&env, &token_address, &operator, 1_000_000);
    client.stake(&anchor_id, &500_000);
    client.request_withdrawal(&anchor_id, &200_000);

    let result = client.try_withdraw_stake(&anchor_id);
    assert_eq!(result, Err(Ok(Error::CooldownNotElapsed)));
}

#[test]
fn withdraw_stake_after_cooldown_succeeds() {
    let env = Env::default();
    let (client, _admin, _oracle, token_address, token_client) = setup(&env);
    let operator = Address::generate(&env);
    let anchor_id = Symbol::new(&env, "anchor_1");
    client.register_anchor(
        &operator,
        &anchor_id,
        &String::from_str(&env, "Test Anchor"),
        &String::from_str(&env, "testanchor.example.com"),
        &SourceType::RealTestnet,
    );
    mint(&env, &token_address, &operator, 1_000_000);
    client.stake(&anchor_id, &500_000);
    client.request_withdrawal(&anchor_id, &200_000);

    env.ledger().with_mut(|l| {
        l.timestamp += WITHDRAWAL_COOLDOWN_SECONDS + 1;
    });

    client.withdraw_stake(&anchor_id);

    let info = client.get_anchor_info(&anchor_id);
    assert_eq!(info.stake, 300_000);
    assert_eq!(token_client.balance(&operator), 700_000);
}

#[test]
fn withdraw_stake_without_request_fails() {
    let env = Env::default();
    let (client, _admin, _oracle, token_address, _tc) = setup(&env);
    let operator = Address::generate(&env);
    let anchor_id = Symbol::new(&env, "anchor_1");
    client.register_anchor(
        &operator,
        &anchor_id,
        &String::from_str(&env, "Test Anchor"),
        &String::from_str(&env, "testanchor.example.com"),
        &SourceType::RealTestnet,
    );
    mint(&env, &token_address, &operator, 1_000_000);
    client.stake(&anchor_id, &500_000);

    let result = client.try_withdraw_stake(&anchor_id);
    assert_eq!(result, Err(Ok(Error::NoWithdrawalRequest)));
}

#[test]
fn update_score_success() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    let anchor_id = Symbol::new(&env, "anchor_1");
    client.register_anchor(
        &operator,
        &anchor_id,
        &String::from_str(&env, "Test Anchor"),
        &String::from_str(&env, "testanchor.example.com"),
        &SourceType::RealTestnet,
    );

    client.update_score(&anchor_id, &42);
    let info = client.get_anchor_info(&anchor_id);
    assert_eq!(info.score, 42);
}

#[test]
fn update_score_invalid_fails() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    let anchor_id = Symbol::new(&env, "anchor_1");
    client.register_anchor(
        &operator,
        &anchor_id,
        &String::from_str(&env, "Test Anchor"),
        &String::from_str(&env, "testanchor.example.com"),
        &SourceType::RealTestnet,
    );

    let result = client.try_update_score(&anchor_id, &101);
    assert_eq!(result, Err(Ok(Error::InvalidScore)));
}

#[test]
fn double_init_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token_address = sac.address();

    let contract_id = env.register(AnchorRegistry, ());
    let client = AnchorRegistryClient::new(&env, &contract_id);
    client.init(&admin, &oracle, &token_address);

    let result = client.try_init(&admin, &oracle, &token_address);
    assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn register_anchor_extends_the_record_ttl() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    let anchor_id = Symbol::new(&env, "anchor_1");
    client.register_anchor(
        &operator,
        &anchor_id,
        &String::from_str(&env, "Test Anchor"),
        &String::from_str(&env, "testanchor.example.com"),
        &SourceType::RealTestnet,
    );

    // Without an explicit bump the record would sit at the network's
    // minimum persistent TTL and could be archived within days.
    let ttl = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Anchor(anchor_id.clone()))
    });
    assert!(ttl >= PERSISTENT_LIFETIME_THRESHOLD, "anchor record TTL was not extended: {ttl}");
}

#[test]
fn governance_calls_require_the_admin() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    env.set_auths(&[]);
    let hash = BytesN::from_array(&env, &[7u8; 32]);
    assert!(client.try_propose_upgrade(&hash).is_err());
    assert!(client.try_execute_upgrade().is_err());
    assert!(client.try_cancel_upgrade().is_err());
    assert!(client.try_set_upgrade_delay(&60).is_err());
    assert!(client.try_propose_admin(&Address::generate(&env)).is_err());
}

#[test]
fn hands_the_admin_role_over_only_when_accepted() {
    let env = Env::default();
    let (client, admin, _oracle, _token, _tc) = setup(&env);
    assert_eq!(client.try_accept_admin(), Err(Ok(Error::NoPendingAdmin)));

    let next = Address::generate(&env);
    client.propose_admin(&next);
    assert_eq!(client.get_admin(), admin, "a proposal alone changes nothing");

    client.accept_admin();
    // The acceptance was signed by the proposed admin, not the old one.
    assert_eq!(env.auths()[0].0, next);
    assert_eq!(client.get_admin(), next);
    assert_eq!(client.try_accept_admin(), Err(Ok(Error::NoPendingAdmin)));
}

#[test]
fn an_upgrade_waits_out_the_delay_and_can_be_cancelled() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let hash = BytesN::from_array(&env, &[7u8; 32]);
    assert_eq!(client.try_execute_upgrade(), Err(Ok(Error::NoPendingUpgrade)));
    assert_eq!(client.try_cancel_upgrade(), Err(Ok(Error::NoPendingUpgrade)));

    env.ledger().with_mut(|l| l.timestamp = 1_000);
    client.set_upgrade_delay(&3_600);
    let pending = client.propose_upgrade(&hash);
    assert_eq!(pending.executable_at, 4_600);
    assert_eq!(client.get_pending_upgrade(), Some(pending));
    assert_eq!(client.try_propose_upgrade(&hash), Err(Ok(Error::UpgradePending)));

    env.ledger().with_mut(|l| l.timestamp = 4_599);
    assert_eq!(client.try_execute_upgrade(), Err(Ok(Error::TimelockActive)));

    client.cancel_upgrade();
    assert_eq!(client.get_pending_upgrade(), None);
    assert_eq!(client.try_execute_upgrade(), Err(Ok(Error::NoPendingUpgrade)));
}

#[test]
fn the_delay_grows_at_once_but_shrinks_only_after_waiting_it_out() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    assert_eq!(client.get_upgrade_delay(), 0);
    env.ledger().with_mut(|l| l.timestamp = 1_000);

    client.set_upgrade_delay(&3_600);
    assert_eq!(client.get_upgrade_delay(), 3_600);

    // Dropping the lock to push an upgrade through at once does not work:
    // the shorter delay waits out the longer one.
    client.set_upgrade_delay(&0);
    assert_eq!(client.get_upgrade_delay(), 3_600);
    assert_eq!(client.propose_upgrade(&BytesN::from_array(&env, &[7u8; 32])).executable_at, 4_600);
    client.cancel_upgrade();

    env.ledger().with_mut(|l| l.timestamp = 4_600);
    assert_eq!(client.get_upgrade_delay(), 0);

    assert_eq!(client.try_set_upgrade_delay(&(MAX_UPGRADE_DELAY_SECONDS + 1)), Err(Ok(Error::DelayTooLong)));
}

fn register(env: &Env, client: &AnchorRegistryClient<'_>, operator: &Address, id: &str) -> Symbol {
    let anchor_id = Symbol::new(env, id);
    client.register_anchor(
        operator,
        &anchor_id,
        &String::from_str(env, "Anchor"),
        &String::from_str(env, "anchor.example.com"),
        &SourceType::RealMainnet,
    );
    anchor_id
}

/// Puts the registry in the state an upgrade from the old code leaves it:
/// ids only in the instance-storage AnchorIds vector.
fn seed_old_index(env: &Env, client: &AnchorRegistryClient<'_>, operator: &Address, n: u32) -> Vec<Symbol> {
    let mut ids = Vec::new(env);
    for i in 0..n {
        let id = Symbol::new(env, &std::format!("old_{i}"));
        ids.push_back(id.clone());
        env.as_contract(&client.address, || {
            let info = AnchorInfo {
                name: String::from_str(env, "Old"),
                domain: String::from_str(env, "old.example.com"),
                source_type: SourceType::RealMainnet,
                operator: operator.clone(),
                stake: 0,
                score: 0,
                registered_at: 0,
                last_updated: 0,
            };
            env.storage().persistent().set(&DataKey::Anchor(id.clone()), &info);
        });
    }
    env.as_contract(&client.address, || env.storage().instance().set(&DataKey::AnchorIds, &ids));
    ids
}

#[test]
fn pages_through_the_paged_index() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    for i in 0..5 {
        register(&env, &client, &operator, &std::format!("a{i}"));
    }
    assert_eq!(client.anchor_count(), 5);
    let page = client.list_anchors_page(&1, &2);
    assert_eq!(page, soroban_sdk::vec![&env, Symbol::new(&env, "a1"), Symbol::new(&env, "a2")]);
    assert_eq!(client.list_anchors_page(&4, &10).len(), 1, "a page stops at the end");
    assert_eq!(client.list_anchors_page(&5, &10).len(), 0, "past the end is empty");
    assert_eq!(client.list_anchors().len(), 5);
    // The old vector is never written by the new code.
    env.as_contract(&client.address, || assert!(!env.storage().instance().has(&DataKey::AnchorIds)));
}

#[test]
fn caps_a_page_at_max_page() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    seed_old_index(&env, &client, &operator, MAX_PAGE + 5);
    assert_eq!(client.list_anchors_page(&0, &(MAX_PAGE + 5)).len(), MAX_PAGE);
}

#[test]
fn migrates_in_batches_and_reads_the_old_list_until_finalized() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    let ids = seed_old_index(&env, &client, &operator, 7);

    // Registration waits for the migration.
    let blocked = client.try_register_anchor(
        &operator,
        &Symbol::new(&env, "new_one"),
        &String::from_str(&env, "New"),
        &String::from_str(&env, "new.example.com"),
        &SourceType::RealMainnet,
    );
    assert_eq!(blocked, Err(Ok(Error::MigrationInProgress)));

    assert_eq!(client.migrate_anchor_index(&3), 4);
    // Half-way, the full list still comes from AnchorIds.
    assert_eq!(client.anchor_count(), 7);
    assert_eq!(client.list_anchors(), ids);
    assert_eq!(client.try_finalize_migration(), Err(Ok(Error::MigrationIncomplete)));

    assert_eq!(client.migrate_anchor_index(&3), 1);
    assert_eq!(client.migrate_anchor_index(&3), 0);
    client.finalize_migration();

    env.as_contract(&client.address, || {
        assert!(!env.storage().instance().has(&DataKey::AnchorIds), "finalize deletes the old index");
        assert!(!env.storage().instance().has(&DataKey::MigrationCursor));
    });
    assert_eq!(client.anchor_count(), 7);
    assert_eq!(client.list_anchors(), ids, "same ids, same order");
    assert_eq!(client.list_anchors_page(&6, &5), soroban_sdk::vec![&env, Symbol::new(&env, "old_6")]);

    // Registration is open again and appends after the migrated ids.
    register(&env, &client, &operator, "new_one");
    assert_eq!(client.anchor_count(), 8);
    assert_eq!(client.list_anchors_page(&7, &1), soroban_sdk::vec![&env, Symbol::new(&env, "new_one")]);
    assert_eq!(client.try_migrate_anchor_index(&10), Err(Ok(Error::NothingToMigrate)));
}

#[test]
fn migration_requires_the_admin() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    seed_old_index(&env, &client, &operator, 2);
    env.set_auths(&[]);
    assert!(client.try_migrate_anchor_index(&10).is_err());
    assert!(client.try_finalize_migration().is_err());
}

#[test]
fn a_score_update_keeps_the_index_entries_alive() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    let id = register(&env, &client, &operator, "a0");

    // Let the index entries age past their renewal threshold.
    env.ledger().with_mut(|l| l.sequence_number += PERSISTENT_BUMP_AMOUNT - PERSISTENT_LIFETIME_THRESHOLD + 1);
    client.update_score(&id, &80);

    let (at, pos) = env.as_contract(&client.address, || {
        (
            env.storage().persistent().get_ttl(&DataKey::AnchorAt(0)),
            env.storage().persistent().get_ttl(&DataKey::AnchorPos(id.clone())),
        )
    });
    assert!(at >= PERSISTENT_LIFETIME_THRESHOLD, "AnchorAt TTL was not extended: {at}");
    assert!(pos >= PERSISTENT_LIFETIME_THRESHOLD, "AnchorPos TTL was not extended: {pos}");
}

#[test]
fn deactivates_with_a_reason_and_reactivates() {
    let env = Env::default();
    let (client, _admin, _oracle, token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    let id = register(&env, &client, &operator, "a0");
    let since_registration = client.get_anchor_status(&id);
    assert_eq!(since_registration.state, AnchorState::Active);

    env.ledger().with_mut(|l| l.timestamp = 5_000);
    let reason = String::from_str(&env, "Testnet sandbox admitted as a mainnet anchor");
    client.deactivate_anchor(&id, &reason);
    let status = client.get_anchor_status(&id);
    assert_eq!((status.state, status.reason, status.since), (AnchorState::Deactivated, reason.clone(), 5_000));
    assert_eq!(client.try_deactivate_anchor(&id, &reason), Err(Ok(Error::AnchorDeactivated)));

    // Its record and place in the list stay; scores and new stake do not land.
    assert_eq!(client.anchor_count(), 1);
    assert_eq!(client.get_anchor_info(&id).operator, operator);
    assert_eq!(client.try_update_score(&id, &50), Err(Ok(Error::AnchorDeactivated)));
    mint(&env, &token, &operator, 10);
    assert_eq!(client.try_stake(&id, &10), Err(Ok(Error::AnchorDeactivated)));

    client.reactivate_anchor(&id);
    assert_eq!(client.get_anchor_status(&id).state, AnchorState::Active);
    client.update_score(&id, &50);
    assert_eq!(client.try_reactivate_anchor(&id), Err(Ok(Error::NotDeactivated)));
}

#[test]
fn refuses_a_reason_over_the_limit() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let id = register(&env, &client, &Address::generate(&env), "a0");
    let long = String::from_str(&env, &"x".repeat(MAX_REASON_BYTES as usize + 1));
    assert_eq!(client.try_deactivate_anchor(&id, &long), Err(Ok(Error::ReasonTooLong)));
}

#[test]
fn removes_only_a_deactivated_anchor_with_no_stake_left() {
    let env = Env::default();
    let (client, _admin, _oracle, token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    let a0 = register(&env, &client, &operator, "a0");
    let a1 = register(&env, &client, &operator, "a1");
    let a2 = register(&env, &client, &operator, "a2");
    let reason = String::from_str(&env, "wrong registration");

    assert_eq!(client.try_remove_anchor(&a0), Err(Ok(Error::NotDeactivated)));

    // Stake must be fully withdrawn first, and no withdrawal left pending.
    mint(&env, &token, &operator, 100);
    client.stake(&a0, &100);
    client.deactivate_anchor(&a0, &reason);
    assert_eq!(client.try_remove_anchor(&a0), Err(Ok(Error::StakeNotZero)));
    client.request_withdrawal(&a0, &100);
    env.ledger().with_mut(|l| l.timestamp += WITHDRAWAL_COOLDOWN_SECONDS);
    client.withdraw_stake(&a0);
    assert_eq!(client.get_anchor_info(&a0).stake, 0);

    client.remove_anchor(&a0);
    assert_eq!(client.try_get_anchor_info(&a0), Err(Ok(Error::AnchorNotFound)));
    assert_eq!(client.try_get_anchor_status(&a0), Err(Ok(Error::AnchorNotFound)));
    // The last anchor took the removed one's place; nothing is lost.
    assert_eq!(client.anchor_count(), 2);
    assert_eq!(client.list_anchors(), soroban_sdk::vec![&env, a2.clone(), a1.clone()]);
    env.as_contract(&client.address, || {
        assert_eq!(env.storage().persistent().get::<_, u32>(&DataKey::AnchorPos(a2.clone())), Some(0));
        assert!(!env.storage().persistent().has(&DataKey::AnchorAt(2)));
        assert!(!env.storage().persistent().has(&DataKey::AnchorPos(a0.clone())));
    });

    // Removing the last one in the index leaves the rest as they are.
    client.deactivate_anchor(&a1, &reason);
    client.remove_anchor(&a1);
    assert_eq!(client.list_anchors(), soroban_sdk::vec![&env, a2]);
}

#[test]
fn a_pending_withdrawal_blocks_removal() {
    let env = Env::default();
    let (client, _admin, _oracle, token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    let id = register(&env, &client, &operator, "a0");
    mint(&env, &token, &operator, 100);
    client.stake(&id, &100);
    client.request_withdrawal(&id, &40);
    env.ledger().with_mut(|l| l.timestamp += WITHDRAWAL_COOLDOWN_SECONDS);
    client.withdraw_stake(&id);
    client.request_withdrawal(&id, &60);
    client.deactivate_anchor(&id, &String::from_str(&env, "closing"));
    env.as_contract(&client.address, || {
        // Not reachable through the calls today (a request needs stake, and
        // withdrawing clears it), so the state is set directly: the check
        // keeps removal safe if that ever changes.
        let mut info: AnchorInfo = env.storage().persistent().get(&DataKey::Anchor(id.clone())).unwrap();
        info.stake = 0;
        env.storage().persistent().set(&DataKey::Anchor(id.clone()), &info);
    });
    assert_eq!(client.try_remove_anchor(&id), Err(Ok(Error::WithdrawalPending)));
}

#[test]
fn lifecycle_calls_require_the_admin() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let id = register(&env, &client, &Address::generate(&env), "a0");
    env.set_auths(&[]);
    assert!(client.try_deactivate_anchor(&id, &String::from_str(&env, "x")).is_err());
    assert!(client.try_reactivate_anchor(&id).is_err());
    assert!(client.try_remove_anchor(&id).is_err());
}

#[test]
fn removal_waits_for_the_migration() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    let operator = Address::generate(&env);
    let ids = seed_old_index(&env, &client, &operator, 2);
    let id = ids.get_unchecked(0);
    client.deactivate_anchor(&id, &String::from_str(&env, "x"));
    assert_eq!(client.try_remove_anchor(&id), Err(Ok(Error::MigrationInProgress)));
}

/// Topics of the events the last top-level call published, as strings
/// (event name, then the anchor id when the event is about one anchor).
fn last_call_events(env: &Env) -> std::vec::Vec<std::vec::Vec<std::string::String>> {
    use soroban_sdk::xdr;
    env.events()
        .all()
        .events()
        .iter()
        .map(|event| {
            let xdr::ContractEventBody::V0(body) = &event.body;
            body.topics
                .iter()
                .map(|t| match t {
                    xdr::ScVal::Symbol(s) => s.to_utf8_string_lossy(),
                    other => std::format!("{other:?}"),
                })
                .collect()
        })
        .collect()
}

#[track_caller]
fn assert_event(env: &Env, topics: &[&str]) {
    let want: std::vec::Vec<std::string::String> = topics.iter().map(|t| t.to_string()).collect();
    assert_eq!(last_call_events(env), std::vec![want]);
}

#[test]
fn every_state_change_publishes_one_event() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let client = AnchorRegistryClient::new(&env, &env.register(AnchorRegistry, ()));
    client.init(&admin, &Address::generate(&env), &token);
    assert_event(&env, &["initialized"]);

    let operator = Address::generate(&env);
    let id = register(&env, &client, &operator, "a0");
    assert_event(&env, &["anchor_registered", "a0"]);

    mint(&env, &token, &operator, 100);
    client.stake(&id, &100);
    // The token transfer publishes its own event first; ours is the last.
    assert_eq!(last_call_events(&env).last().unwrap(), &std::vec!["stake_added".to_string(), "a0".to_string()]);
    client.request_withdrawal(&id, &100);
    assert_event(&env, &["withdrawal_requested", "a0"]);
    env.ledger().with_mut(|l| l.timestamp += WITHDRAWAL_COOLDOWN_SECONDS);
    client.withdraw_stake(&id);
    assert_eq!(last_call_events(&env).last().unwrap(), &std::vec!["stake_withdrawn".to_string(), "a0".to_string()]);

    client.update_score(&id, &70);
    assert_event(&env, &["score_updated", "a0"]);
    client.deactivate_anchor(&id, &String::from_str(&env, "wrong registration"));
    assert_event(&env, &["anchor_deactivated", "a0"]);
    client.reactivate_anchor(&id);
    assert_event(&env, &["anchor_reactivated", "a0"]);
    client.deactivate_anchor(&id, &String::from_str(&env, "wrong registration"));
    client.remove_anchor(&id);
    assert_event(&env, &["anchor_removed", "a0"]);

    let next = Address::generate(&env);
    client.propose_admin(&next);
    assert_event(&env, &["admin_proposed"]);
    client.accept_admin();
    assert_event(&env, &["admin_changed"]);
    client.set_upgrade_delay(&600);
    assert_event(&env, &["upgrade_delay_set"]);
    client.propose_upgrade(&BytesN::from_array(&env, &[7u8; 32]));
    assert_event(&env, &["upgrade_proposed"]);
    client.cancel_upgrade();
    assert_event(&env, &["upgrade_cancelled"]);
}

#[test]
fn migration_publishes_its_progress() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    seed_old_index(&env, &client, &Address::generate(&env), 3);
    client.migrate_anchor_index(&2);
    assert_event(&env, &["index_migrated"]);
    client.migrate_anchor_index(&2);
    client.finalize_migration();
    assert_event(&env, &["index_finalized"]);
}
