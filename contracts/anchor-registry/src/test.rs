#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
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
fn slash_from_oracle_succeeds() {
    let env = Env::default();
    let (client, _admin, oracle, token_address, _tc) = setup(&env);
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

    // `mock_all_auths` satisfies require_auth for any address, including
    // `oracle`, so this exercises slash()'s business logic (stake
    // reduction, event, clamping). The actual on-chain guarantee — that
    // only the real PerformanceOracle *contract* can satisfy
    // `oracle_address.require_auth()` as a direct invoker — is exercised
    // by performance-oracle's cross-contract integration tests (Faz 2),
    // where a genuine contract-to-contract call is made without mocking.
    let _ = &oracle;
    client.slash(&anchor_id, &200_000, &String::from_str(&env, "low reliability score"));

    let info = client.get_anchor_info(&anchor_id);
    assert_eq!(info.stake, 300_000);
}

#[test]
fn slash_caps_at_current_stake() {
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
    client.stake(&anchor_id, &100_000);

    client.slash(&anchor_id, &999_999, &String::from_str(&env, "reason"));

    let info = client.get_anchor_info(&anchor_id);
    assert_eq!(info.stake, 0);
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
