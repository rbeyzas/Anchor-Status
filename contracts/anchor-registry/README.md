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
- `anchor_count()` and `list_anchors_page(start, limit)` — how many anchors
  there are, and up to `limit` (at most 100) ids from position `start`, in
  registration order. Each id is its own persistent entry (`AnchorAt(i)`,
  with `AnchorPos(id)` for the way back), so the index never grows into a
  single entry's size limit.
- `list_anchors()` — every id at once; kept for existing callers, but it
  reads one entry per anchor, so page instead once there are many.
- `migrate_anchor_index(batch)` and `finalize_migration()` — admin-only,
  once after upgrading from the old layout, where every id sat in one
  instance-storage `AnchorIds` vector. The first copies up to `batch` ids
  into the paged index per call and returns how many are left; the second
  then deletes `AnchorIds`. Until then reads still come from `AnchorIds`
  (it stays complete, the paged index fills over several calls) and
  `register_anchor` fails with `MigrationInProgress`. Each id costs two
  writes; testnet allows 200 per transaction, so a batch of up to ~90 fits.
- `deactivate_anchor(anchor_id, reason)` and `reactivate_anchor(anchor_id)`
  — admin-only. A deactivated anchor is no longer measured: its record,
  list position and history stay, `update_score` and `stake` refuse it,
  and PerformanceOracle takes no report or card for it. `reason` (at most
  256 bytes) is what the dashboard shows. Withdrawing stake stays open.
- `remove_anchor(anchor_id)` — admin-only, for wrong registrations: only a
  deactivated anchor with zero stake and no pending withdrawal. The last
  anchor in the index moves into its position.
- `get_anchor_status(anchor_id)` — `{ state, reason, since }`; an anchor
  never deactivated is `Active` since its registration.
- Admin handover in two steps: `propose_admin(new_admin)` (admin), then
  `accept_admin()` signed by the proposed address. Until it accepts nothing
  changes, so a mistyped address cannot take the contract. `get_admin()`.
- Time-locked upgrades, all admin-only: `propose_upgrade(wasm_hash)` (the
  wasm already uploaded), `execute_upgrade()` once `get_upgrade_delay()`
  seconds have passed, `cancel_upgrade()`, `get_pending_upgrade()`. The
  code is replaced in place, keeping the contract ID and all state. There
  is no instant `upgrade()` any more; the testnet registry's own (old)
  `upgrade` is what brings this code in.
- `set_upgrade_delay(seconds)` — admin-only, at most 30 days, 0 until set
  (testnet). A longer delay applies at once, a shorter one only after the
  current delay has passed, so the lock cannot be dropped and an upgrade
  pushed through in one go.

Every state change publishes one event (`src/events.rs`), so all of it can
be followed from the ledger. Events about one anchor carry its id as the
second topic: `anchor_registered`, `stake_added`, `withdrawal_requested`,
`stake_withdrawn`, `score_updated`, `anchor_deactivated` (with the reason),
`anchor_reactivated`, `anchor_removed`. The rest: `initialized`,
`index_migrated` (copied of total), `index_finalized`, `admin_proposed`,
`admin_changed`, `upgrade_delay_set` (with when it applies),
`upgrade_proposed` (wasm hash and when it can run), `upgrade_executed`,
`upgrade_cancelled`.

Every write extends the storage TTL of what it touched, so records that are
still in use are never archived by the network.

Tests: `stellar contract build && cargo test` (no network access needed —
uses `soroban_sdk::testutils`). The build is for `tests/upgrade.rs`, which
starts from the wasm testnet really runs (`../fixtures`), registers 120
anchors, upgrades to this code and migrates the index.

Deploy: `../../scripts/deploy-contracts.sh` (testnet, requires network
access).
