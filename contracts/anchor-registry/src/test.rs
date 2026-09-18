#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger},
    Env, String,
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
    assert_eq!(info.score, 100);
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
fn upgrade_requires_the_admin() {
    let env = Env::default();
    let (client, _admin, _oracle, _token, _tc) = setup(&env);
    env.set_auths(&[]);
    let result = client.try_upgrade(&soroban_sdk::BytesN::from_array(&env, &[0u8; 32]));
    assert!(result.is_err());
}
