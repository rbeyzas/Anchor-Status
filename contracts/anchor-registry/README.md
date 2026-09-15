# anchor-registry

Soroban/Rust smart contract. The system of record for anchor registration,
stake, and slashing state.

- `init(admin, oracle_address, token_address)` — one-time setup; sets the
  only address (`oracle_address`) ever allowed to call `slash` /
  `update_score`, and the SAC used for staking.
- `register_anchor(operator, anchor_id, name, domain, source_type)` —
  registers a new anchor (`source_type`: RealMainnet | RealTestnet |
  SimulatedMock), signed by the `operator` who controls it.
- `stake(anchor_id, amount)` — transfers `amount` from the anchor's
  operator into the contract and credits it to that anchor's stake.
- `request_withdrawal(anchor_id, amount)` — starts the withdrawal cooldown
  (7 days) for `amount` of an anchor's stake.
- `withdraw_stake(anchor_id)` — executes a previously requested withdrawal
  once its cooldown has elapsed.
- `slash(anchor_id, amount, reason)` — callable only by the contract
  address registered as `oracle_address` (i.e. only the real
  `PerformanceOracle` contract, enforced by Soroban's own invoker
  authentication).
- `update_score(anchor_id, new_score)` — same caller restriction as
  `slash`.
- `get_anchor_info(anchor_id)` — returns stake, score, source_type,
  operator, and last-updated timestamp.
- `list_anchors()` — returns every registered anchor id in registration
  order (how the dashboard discovers which anchors exist).

Tests: `cargo test` (no network access needed — uses
`soroban_sdk::testutils`).

Deploy: `../../scripts/deploy-contracts.sh` (testnet, requires network
access).
