# anchor-registry

Soroban/Rust smart contract. The system of record for anchor registration,
optional stake, and each anchor's current score.

It never slashes: there is no slashing entry point, so no process — not the
oracle, not the admin — can take an operator's stake. Scores are published,
not enforced.

- `init(admin, oracle_address, token_address)` — one-time setup; sets the
  only address (`oracle_address`) ever allowed to call `update_score`, and
  the SAC used for staking.
- `register_anchor(operator, anchor_id, name, domain, source_type)` —
  registers a new anchor (`source_type`: RealMainnet | RealTestnet |
  SimulatedMock), signed by the `operator` who controls it.
- `stake(anchor_id, amount)` — transfers `amount` from the anchor's
  operator into the contract and credits it to that anchor's stake.
- `request_withdrawal(anchor_id, amount)` — starts the withdrawal cooldown
  (7 days) for `amount` of an anchor's stake.
- `withdraw_stake(anchor_id)` — executes a previously requested withdrawal
  once its cooldown has elapsed.
- `update_score(anchor_id, new_score)` — callable only by the contract
  address registered as `oracle_address` (i.e. only the real
  `PerformanceOracle` contract, enforced by Soroban's own invoker
  authentication).
- `get_anchor_info(anchor_id)` — returns stake, score, source_type,
  operator, and last-updated timestamp.
- `list_anchors()` — returns every registered anchor id in registration
  order (how the dashboard discovers which anchors exist).
- `upgrade(new_wasm_hash)` — admin-only; replaces the code in place,
  keeping the contract ID and all stored state.

Every write extends the storage TTL of what it touched, so records that are
still in use are never archived by the network.

Tests: `cargo test` (no network access needed — uses
`soroban_sdk::testutils`).

Deploy: `../../scripts/deploy-contracts.sh` (testnet, requires network
access).
