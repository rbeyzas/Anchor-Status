# Mainnet deployment runbook

How AnchorRegistry and PerformanceOracle go to Stellar mainnet. The
contracts run on testnet today; every step below has been run there, on the
live contracts or on fresh rehearsal contracts (see
[`docs/instaward/EVIDENCE.md`](instaward/EVIDENCE.md)). Mainnet waits for the
prerequisites in section 1.

## 1. Before mainnet

| Prerequisite | Why | State on testnet |
| --- | --- | --- |
| An external security audit of both contracts | A self-assessment ([`SECURITY.md`](SECURITY.md)) is not an audit | Not done; planned before mainnet |
| A multisig admin account (2-of-3, keys held by different people, one offline) | No single key can upgrade, change the quorum or hand over the admin role | Planned (sprint item 3.4) |
| At least 3 reporters, at least one run outside the team | A quorum of the team's own servers removes the single key, not the single team; a third reporter makes an outlier attributable | 2 reporters, both run by the team |
| A max_spread chosen from shadow data | Too tight flags honest measurement noise; too loose hides a bad reporter | Shadow mode since 18 Oct 2026 |
| Reproducible builds checked by someone else | Anyone must be able to tie the on-chain wasm to this repository | Done on a second machine (section 2) |

## 2. Build, and check the build

The wasm hash depends on the compiler and on stellar-cli, which writes its
own version into the wasm. Use exactly the pinned versions:

- Rust **1.98.0** (`rust-toolchain.toml`; rustup picks it up)
- stellar-cli **28.0.0**: `cargo install --locked stellar-cli@28.0.0`
  (a newer CLI gives different bytes)

```bash
(cd contracts/anchor-registry && stellar contract build)
(cd contracts/performance-oracle && stellar contract build)
shasum -a 256 contracts/*/target/wasm32v1-none/release/*.wasm
stellar contract info meta --wasm <file>    # rsver 1.98.0, cliver 28.0.0
```

Record both hashes. After deployment, `stellar contract fetch --id <id>`
and the same `shasum` must give them again.

## 3. Mainnet configuration profile

| Setting | Testnet today | Mainnet | Set with |
| --- | --- | --- | --- |
| Upgrade delay, both contracts | 86,400 s (24 h) | **604,800 s (7 days)** | `set_upgrade_delay` (a longer delay applies at once) |
| Admin | One key (`GARNK5UJ…`) | **2-of-3 multisig account** (low 1, medium 2, high 2, master weight 0) | `propose_admin` then `accept_admin`, signed by the multisig |
| Quorum threshold | 1 (shadow mode) | **2**, with at least 3 reporters | `set_quorum_config` |
| max_spread | 100 (unused) | From shadow data: the gap 95% of honest pairs stay within, rounded up | `set_quorum_config` |
| round_seconds | 0 | **21,600** (6 h) | `set_quorum_config` |
| Reporters per source type | 2 | 3–7 (the contract caps at 7) | `authorize_reporter` |
| Dispute min_stake | 10 XLM (default) | Proportionate to the stake token chosen (e.g. 100 USDC) | `set_dispute_config` |
| Dispute cooldown | 7 days (default) | 7 days | `set_dispute_config` |
| Stake token | Native XLM SAC | USDC SAC or native XLM, decided before deploy | `init` (cannot be changed later) |

A lower quorum threshold only takes effect after the upgrade delay, like an
upgrade.

## 4. Deploy

All commands target `--network mainnet`. Steps marked **multisig** are built
unsigned and signed by two of the admin's signers
(`scripts/upgrade-contracts.sh` shows the `stellar tx sign` / `send` flow).

1. **Deploy both wasm files** from the build in section 2:
   `stellar contract deploy --wasm <registry.wasm>` and the same for the oracle.
   Note both contract IDs.
2. **Initialise**: `AnchorRegistry.init(admin, oracle_id, token)`, then
   `PerformanceOracle.init(admin, registry_id)` (**multisig**: both require
   the admin's signature).
3. **Lock upgrades at once**: `set_upgrade_delay(604800)` on both (**multisig**).
4. **Reporters**: each reporter generates its keys on its own server;
   `authorize_reporter(<key>, RealMainnet)` for each (**multisig**).
5. **Quorum and disputes**: `set_quorum_config({threshold: 2, max_spread, round_seconds: 21600})`
   and `set_dispute_config` (**multisig**).
6. **Anchors**: `scripts/collect.sh` on the primary registers every
   discovered anchor (`register_anchor` needs no admin).
7. **Publish**: add the mainnet IDs and reporter keys to
   `dashboard/public/.well-known/stellar.toml`, and point each reporter's
   `.env` and the dashboard at them.

## 5. Measured costs

Simulated on testnet (20 Oct 2026) with the deployed code, on the deliverable-3
rehearsal contracts, from the SDK's simulation of each call. Testnet's per-transaction limits at the time: 400M
CPU instructions, 200 ledger writes.

| Call | CPU instructions | Write bytes | Footprint (read-only / read-write) | Min. resource fee (XLM) |
| --- | ---: | ---: | --- | ---: |
| `publish_score_card`, round still open | 2,494,705 | 648 | 8 / 1 | 0.0100 |
| `publish_score_card`, finalizes (2 reporters) | 4,275,188 | 1,828 | 9 / 5 | 0.0117 |
| `submit_report` | 1,968,468 | 536 | 8 / 2 | 0.6385 * |
| `attest_signing_key` | 2,318,869 | 252 | 7 / 1 | 0.0045 |
| `claim_anchor` (with `ed25519_verify`) | 1,778,591 | 820 | 5 / 3 | 0.0014 |
| `open_dispute` | 2,399,423 | 460 | 8 / 1 | 0.0011 |
| `vote_dispute` | 2,402,784 | 504 | 7 / 1 | 0.0532 |
| `list_anchors_page(0, 100)` over 106 anchors | 12,184,645 | 0 | 102 / 0 | 0.0035 |
| `get_verdict` | 815,934 | 0 | 4 / 0 | 0.0007 |

\* Includes first-time rent for a new storage entry; later calls on the same
anchor cost far less. The largest call uses about 3% of the instruction
limit. A round is capped at 7 cards (`MAX_REPORTERS`), so finalization stays
bounded.

Per reporter, per day, at mainnet scale (about 105 anchors, 6-hour rounds):
about 420 card submissions. Single reports are optional on mainnet; the
cards carry the score.

## 6. After deploy: checks

```bash
scripts/upgrade-contracts.sh status registry   # admin = multisig, delay 604800
scripts/upgrade-contracts.sh status oracle
stellar contract invoke --id <oracle> --network mainnet --send=no -- get_quorum_config
stellar contract invoke --id <oracle> --network mainnet --send=no -- get_reporters --source_type RealMainnet
(cd services/aggregator && npm run verify-score -- --quorum <anchor_id>)
```

- Both fetched wasm files hash as built in section 2.
- The first quorum cards appear within one round; `verify-score --quorum`
  rebuilds one from its reporters' bundles.
- The dashboard reads the mainnet IDs; `curl -sI https://monarank.xyz/.well-known/stellar.toml`
  returns 200 with `access-control-allow-origin: *`.

## 7. Upgrades and rollback

- Every change: rehearse it first on fresh contracts
  (`scripts/rehearse-upgrade.sh`, `scripts/rehearse-d3.sh`), then
  `propose_upgrade` with the new wasm hash, publish the hash, wait the delay
  (7 days), `execute_upgrade` (**multisig**).
- There is no instant upgrade and no emergency bypass, by design. A bad
  proposal is withdrawn with `cancel_upgrade`; a bad deployed version is
  replaced by proposing the previous wasm, which also waits the delay.
- Storage layouts only ever add keys; existing keys keep their encoding, so
  an older wasm still reads every key it knows.
