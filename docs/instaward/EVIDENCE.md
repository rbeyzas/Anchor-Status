# Evidence log

What was done for each SOW item, and where to check it. Newest week first.
Testnet transactions link to stellar.expert; commits are on `main`.

Contracts (testnet):
- AnchorRegistry `CBQGNUIX5ZDQOE6VBDHTF3SSWSCNMYK37ES5CBYUTQAED7NLZOFEE4AB`
- PerformanceOracle `CBDDBO5YU3MERDJ7LFA5RIXFORW5HI3NKMK67TG5TPO5QT64M5GUWGWU`

## Week 1 (19–25 Oct)

### 1.1 Live wasm kept as fixtures (D2) — 18 Oct
- `contracts/fixtures/anchor_registry_live.wasm`, sha256 `9b8a9ab8…7868`, and
  `performance_oracle_live.wasm`, sha256 `0929e468…bde2`, each equal to the
  wasm hash in the contract's on-chain instance before the upgrade below.
  See `contracts/fixtures/README.md`. Commit `d435d62`.

### 1.2–1.6 Registry: paged index, lifecycle, governance, events (D2) — 18 Oct
- Code: commit `fa14b98`. Tests: `stellar contract build && cargo test` in
  `contracts/anchor-registry` (30 unit tests, plus `tests/upgrade.rs`), and
  `cargo test` in `contracts/performance-oracle` (51).
- `tests/upgrade.rs` starts from the live wasm, registers 120 anchors,
  upgrades, migrates in batches of 25 (52 ledger writes and ~11.5M
  instructions per batch, against testnet's 200 writes and 400M
  instructions per transaction), checks every id and record, then runs a
  time-locked second upgrade.
- Live upgrade, 18 Oct (collector paused for its duration):

| Step | Result | Transaction |
| --- | --- | --- |
| Registry wasm uploaded | sha256 `4a79942d56fcdd92432fdc9cd7aaffae505154db5c7b62291eb8993269fef8a6`, ledger 5260254 | |
| Registry upgraded (old instant `upgrade`, its last use) | `anchor_count` 110, admin unchanged, delay 0 | [`22283054…`](https://stellar.expert/explorer/testnet/tx/222830542a9944731796e4dad8ee773d5f9a44f0bf322bca06a5cb8695351e15) |
| `migrate_anchor_index(90)` | 20 left | [`888f3ddf…`](https://stellar.expert/explorer/testnet/tx/888f3ddfb7a13aecae30742656c2d4b13750854e628d921fb6a8ae21cb2c950c) |
| `migrate_anchor_index(90)` | 0 left | [`a173a9e5…`](https://stellar.expert/explorer/testnet/tx/a173a9e5552c01b79f79f19a7fb397e5aef0b20823a1c545b5e8b748003c8168) |
| `finalize_migration` | 110 ids in the paged index, same order as `AnchorIds` | [`233919ab…`](https://stellar.expert/explorer/testnet/tx/233919ab5abcb3df911824c74ee4f4ac02fd9a5542d51a9f65a9251d530dedc0) |
| Oracle wasm uploaded | sha256 `38f0a314c24b443f9e162c9187b364228e94615d66f2d9011fc4dfc2690fdcfc`, ledger 5260335 | |
| Oracle upgraded | moneygram score 82 and its card kept | [`66cdef2a…`](https://stellar.expert/explorer/testnet/tx/66cdef2ad93454af6f6d1e9ea2523dbca0b84a790e0a0243946394cdac148b8f) |
| `tr_mock_anchor_fly_dev` deactivated (testnet anchor registered on mainnet by mistake, stake 0) | | [`152b2a48…`](https://stellar.expert/explorer/testnet/tx/152b2a48085eac7506eb70adcdca7703c7307c455a9c9b4f44fd501006e8fad4) |
| …and removed; `tr_mock_anchor_fly_dev_testnet` stays active | 109 anchors | [`51592cce…`](https://stellar.expert/explorer/testnet/tx/51592cce5f0ba81d6382d41f8eb76aee30a9c706a032fec43aabcc13c1b73679) |
| `mock_anchor_1`–`4` (retired simulated anchors, stake 0) deactivated and removed | 105 anchors, all unique | deactivate/remove: [`34dbf222`](https://stellar.expert/explorer/testnet/tx/34dbf222d65e9db2051e1861282e8f158f57cd1d997e23ee21b33497ff25bf9a)/[`bee1f213`](https://stellar.expert/explorer/testnet/tx/bee1f2135026121f321c9eeff721961784122868e7371fd625683b5c72760d64), [`8cdd21e6`](https://stellar.expert/explorer/testnet/tx/8cdd21e65acde754764c06f75fdddb669609c95285a153af703112ff260e008d)/[`c3b08b1d`](https://stellar.expert/explorer/testnet/tx/c3b08b1d98101362e09fe7b78eb6262a26dfd91a04f93196bb48db347495f1da), [`1cc90a92`](https://stellar.expert/explorer/testnet/tx/1cc90a9294ac7a66a86fd7dea49e03a4d60a887129cde1d6477cfb508f2b0601)/[`ab4ed901`](https://stellar.expert/explorer/testnet/tx/ab4ed9019575ad96226e75907e806d03861a039581f8b4e1b677ab361fac9fb5), [`9dbf4fb7`](https://stellar.expert/explorer/testnet/tx/9dbf4fb754aff5f2657b505c67f6e2d0fe97ce23b950377b8ec94ab2596fcfbf)/[`49ac20e8`](https://stellar.expert/explorer/testnet/tx/49ac20e8ddd71d53783426b94f66ccb96fe5d1567c10c47365281733946a1cff) |

- After: the dashboard read the paged layout (`count 110`, then 105) with
  no unreadable anchor; the first collector round after the upgrade
  (12:20 UTC) submitted 42 reports with 0 failures.

### 1.7 Dashboard reads both registry layouts (D2) — 18 Oct
- Commit `d8aaeca`, on `main` (and so on Vercel) before the upgrade.
  `dashboard/lib/contract-state.test.ts` covers the old layout, the paged
  one, mid-migration (the old list wins) and an empty registry.
- The page-level hide lists went once their entries were off the chain:
  `lib/delisted.ts` (commit `4e8ccce`) and the `SimulatedMock` filter.

### 1.9 Identifying User-Agent (D1) — 18 Oct
- Every request from mainnet-probe, testnet-probe and passive-monitor,
  including testnet-probe's browser, sends
  `MonaRank-probe/1.0 (+https://monarank.xyz; monarank@protonmail.com)`.
  Commit `8bd01a7`; `src/user-agent.test.ts` in each service. Checked on
  both servers after deploy by capturing a request on a local listener.

### 1.10 Archive (shared, not billed) — 18 Oct
- `history-archiver` keeps every `score_card_published` (score,
  confidence, flags, methodology version, inputs hash), not only the
  latest card the contract holds. Commit `6d765fd`. First run archived
  1,064 cards for 105 anchors, back to 11 Oct (the RPC's 7-day window);
  earlier cards were not backfilled, by decision.
- Off-host copy: A pushes `/var/lib/anchor-status` (559 MB) to B nightly
  into a write-only, no-delete `incoming/`; B keeps 30 dated, hardlinked
  snapshots (a second same-day snapshot added nothing on disk). A's key
  on B was tested: reading, deleting and running a shell are refused.
  `scripts/backup-archive.sh`, commit `d435d62`.

### 1.11 Upgrade scripts (D2) — 18 Oct
- `scripts/upgrade-contracts.sh upload|propose|execute|cancel|status|instant|send`.
  With `ADMIN=G…` and no signing key it writes the unsigned, simulated
  transaction for a multisig admin's signers (`stellar tx sign`, then
  `send`). Checked on testnet without a key: `status` on both contracts,
  and a built `propose_upgrade` (admin source, 1 auth entry, footprint and
  resources set, no signature); a call that would fail leaves no file.

## Week 0 (16–18 Oct)

| # | Item | Evidence |
| --- | --- | --- |
| 0.1 | Server B | Frankfurt (MVPS LTD); A is in Ankara (Web9): another provider and region. SSH by key; collector cron in `/etc/cron.d/anchor-status`. |
| 0.2 | B measures only | `COLLECTOR_ROLE=secondary`, `SECONDARY_PUBLISH=false`: the aggregator is skipped every round, so B writes nothing on-chain. Its anchor list comes from the on-chain registry (`sync-from-chain`). ~17 new evidence documents per 20-minute round in `/var/lib/anchor-status/evidence` on B. |
| 0.3 | Leaked testnet keys | The only committed secrets were the mock anchors' issuer keys and Django key. The issuer accounts no longer exist on testnet or mainnet (Horizon 404) and the mock service is gone, so nothing can be signed with them. Reporter keys were never committed; they are rotated with `revoke_reporter` (D1). |
| 0.4 | Apex domain | `curl -sI https://monarank.xyz/.well-known/stellar.toml`: HTTP/2 200, `access-control-allow-origin: *`, no redirect. |
| 0.5 | Evidence log | This file. |
