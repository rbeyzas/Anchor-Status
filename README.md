<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Anchor Reliability Oracle Network — a Soroban SEP-24 reliability oracle scoring anchors from real mainnet activity, real testnet probes, and controlled mock anchors">
</p>

<p align="center">
  <a href="#quick-start"><b>Quick start</b></a> ·
  <a href="#how-it-works"><b>How it works</b></a> ·
  <a href="#running-the-full-system"><b>Run it locally</b></a> ·
  <a href="#deployed-testnet-contracts"><b>Deployed contracts</b></a> ·
  <a href="#repository-layout"><b>Repository layout</b></a>
</p>

## What this is

Anyone can *claim* a Stellar SEP-24 anchor is reliable. This project measures it, on-chain, from evidence a wallet or user can't fake:

- **Real mainnet activity** — does the anchor actually process payments today?
- **Real testnet behavior** — does a live SEP-10 + SEP-24 deposit against it actually complete?
- **Controlled reference anchors** — a known-good and known-bad anchor, so the scoring math itself can be validated against ground truth.

Those three signals are normalized, submitted to a [Soroban](https://developers.stellar.org/docs/build/smart-contracts/overview) smart contract, and blended into one weighted score per anchor, alongside a trend (improving / stable / degrading) and a hard risk floor. The contract publishes that verdict openly; it never slashes or moves anyone's stake. A live dashboard reads it from the chain.

Nothing here trades real assets. Mainnet is read-only. Testnet is where every write happens.

## How it works

<p align="center">
  <img src="./assets/readme/architecture.svg" width="100%" alt="Pipeline: passive-monitor, testnet-probe, and mock-anchors feed the aggregator, which reports to PerformanceOracle; it cross-calls AnchorRegistry to update scores; the dashboard reads both contracts read-only">
</p>

1. **Three collectors** independently observe anchor behavior and each emit a normalized `{ success, settlement_seconds, source_type }` report.
2. **`aggregator`** dedupes those reports and calls `PerformanceOracle.submit_report()` on testnet, signed by a reporter key authorized for that source type.
3. **`PerformanceOracle`** updates a weighted exponential moving average per anchor (real sources move the score faster than mock ones), plus an on-chain health record: a fast and a slow EMA whose gap gives the trend, a consecutive-failure counter, and a 20-report outcome window. It flags an anchor at risk when 3 reports in a row fail, when fewer than half of the recent window succeeded, or when the score reaches 55, and emits `risk_status_changed` on each transition.
4. **`AnchorRegistry`** is the source of truth for anchor identity, operator, staked collateral, and current score.
5. **`dashboard`** reads both contracts straight from Soroban RPC. Score history older than the RPC's event window (~12 hours in practice) comes from `history-archiver`'s durable archive, fetched server-side and merged in; without it the dashboard still renders, with a shorter chart.

| Source type | Produced by | What "success" means |
| --- | --- | --- |
| `RealMainnet` | `services/passive-monitor` | The anchor's distribution account shows real payment activity in the last 7 days (Horizon, read-only) |
| `RealTestnet` | `services/testnet-probe` | A real SEP-10 auth + SEP-24 interactive deposit against the anchor actually reaches a terminal state |
| `SimulatedMock` | `services/mock-anchors` | A scripted, seeded behavior profile (success rate, latency, optional time-based degradation) |

## Repository layout

| Path | Stack | Role |
| --- | --- | --- |
| [`contracts/anchor-registry`](contracts/anchor-registry) | Rust / Soroban | Anchor identity, optional stake, score of record |
| [`contracts/performance-oracle`](contracts/performance-oracle) | Rust / Soroban | Weighted scoring, trend and risk floor, cross-contract calls into `anchor-registry` |
| [`services/passive-monitor`](services/passive-monitor) | Node / TypeScript | Read-only mainnet Horizon scan |
| [`services/testnet-probe`](services/testnet-probe) | Node / TypeScript / Playwright | Live SEP-10 + SEP-24 test against a real testnet anchor |
| [`services/mock-anchors`](services/mock-anchors) | Python / Django / django-polaris | Four fully-controlled SEP-24 anchors with scripted behavior |
| [`services/aggregator`](services/aggregator) | Node / TypeScript | Normalizes and submits reports from all three sources |
| [`dashboard`](dashboard) | Next.js / TypeScript / Tailwind | Live read-only view of on-chain state |
| [`scripts`](scripts) | Bash | One-shot setup, deploy, and demo scripts |

Each directory has its own README with implementation-level detail.

## Quick start

Everything below **writes to Stellar Testnet only**. `passive-monitor` is the one exception — it only ever reads mainnet.

```bash
cp .env.example .env                  # fill in as you go — scripts below populate most of it
bash scripts/setup-env.sh             # toolchain check + funded deployer account
bash scripts/deploy-contracts.sh      # build + deploy both contracts to testnet
bash scripts/demo.sh                  # bring every service up end-to-end
```

`scripts/demo.sh` is idempotent — safe to re-run, it skips steps already done. See [`docs/DEMO.md`](docs/DEMO.md) for a guided walkthrough.

## Running the full system

### 1. Prerequisites

| Tool | Version | Used by |
| --- | --- | --- |
| [Rust](https://rustup.rs) + `wasm32v1-none` target | 1.82+ | Contracts |
| [`stellar-cli`](https://developers.stellar.org/docs/tools/developer-tools/cli/) | latest | Deploying + invoking contracts |
| [Node.js](https://nodejs.org) | 20+ | `passive-monitor`, `testnet-probe`, `aggregator`, `dashboard` |
| [Python](https://www.python.org) + `venv` | 3.11+ | `mock-anchors` |
| `npm` | bundled with Node | Every Node service (no workspaces — each service is independent) |

```bash
rustup target add wasm32v1-none
cargo install --locked stellar-cli
```

### 2. Configure the environment

```bash
cp .env.example .env
```

The root `.env` is shared by every service (each one also merges its own local `.env` on top, if present). Key groups:

| Variable group | Purpose |
| --- | --- |
| `SOROBAN_RPC_URL`, `SOROBAN_NETWORK_PASSPHRASE`, `HORIZON_TESTNET_URL`, `FRIENDBOT_URL` | Testnet network config |
| `HORIZON_MAINNET_URL` | Mainnet, read-only, `passive-monitor` only |
| `DEPLOYER_SECRET_KEY` / `DEPLOYER_PUBLIC_KEY` | The account that deploys contracts and registers/stakes anchors |
| `REPORTER_MAINNET_SECRET_KEY` / `REPORTER_TESTNET_SECRET_KEY` / `REPORTER_MOCK_SECRET_KEY` | One authorized reporter key per source type |
| `ANCHOR_REGISTRY_CONTRACT_ID` / `PERFORMANCE_ORACLE_CONTRACT_ID` | Filled in automatically by the deploy script |
| `NEXT_PUBLIC_*` | Same values, re-exposed for the browser-side dashboard |

### 3. Deploy the contracts

```bash
bash scripts/setup-env.sh        # generates + funds a testnet deployer via Friendbot
bash scripts/deploy-contracts.sh # builds both contracts and deploys them to testnet
```

This writes `ANCHOR_REGISTRY_CONTRACT_ID` and `PERFORMANCE_ORACLE_CONTRACT_ID` (plus the `NEXT_PUBLIC_*` mirrors) straight into `.env`.

Register an anchor and authorize a reporter directly with `stellar contract invoke` once deployed — see [`contracts/anchor-registry/README.md`](contracts/anchor-registry/README.md) and [`contracts/performance-oracle/README.md`](contracts/performance-oracle/README.md) for the exact function signatures.

### 4. Run the collectors

Each service is independent — install and run only the ones you need.

| Service | Install | Run | Notes |
| --- | --- | --- | --- |
| `passive-monitor` | `cd services/passive-monitor && npm install` | `npm run start` | Copy `anchors.example.json` → `anchors.json` first and list real mainnet distribution accounts to watch |
| `testnet-probe` | `cd services/testnet-probe && npm install && npx playwright install chromium` | `npm run probe` | One-shot; `npm run schedule` runs it hourly via `node-schedule` |
| `mock-anchors` | `cd services/mock-anchors && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt` | `bash scripts/bootstrap-issuers.sh` then `bash scripts/run-all.sh` | Starts 4 anchors on ports 8001–8004; `scripts/stop-all.sh` tears them down |
| `aggregator` | `cd services/aggregator && npm install` | `npm run aggregate` | Reads all three sources' output, dedupes, and calls `submit_report()` on testnet |

Run collectors first, `aggregator` last (it only submits what the others have already produced).

#### `mock-anchors` behavior profiles

| Instance | Port | Success rate | Behavior |
| --- | --- | --- | --- |
| `mock_anchor_1` | 8001 | 98% | Consistently reliable, fast settlement |
| `mock_anchor_2` | 8002 | 90% | Decent but slower, occasional failures |
| `mock_anchor_3` | 8003 | 92% → 40% | Reliable at first, degrades sharply after simulated day 20 — the risk-detection scenario |
| `mock_anchor_4` | 8004 | 35% | Unreliable from the start |

`TIME_ACCELERATION` (default `1440`) compresses simulated days into real minutes, so `mock_anchor_3`'s degradation — and the resulting risk flag — shows up roughly 20 real minutes after its first transaction instead of 20 real days.

### 5. Run the dashboard

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:3000`. It reads `AnchorRegistry` and `PerformanceOracle` straight from `NEXT_PUBLIC_SOROBAN_RPC_URL` — no server-side component of its own. If the contract IDs aren't set yet or the RPC is unreachable, it falls back to a deterministic demo fixture and shows a banner saying so, so the UI is always reviewable even before you deploy anything.

### 6. Everything at once

```bash
bash scripts/demo.sh
```

Runs setup, deploy (if needed), every collector once, one aggregation pass, and installs the dashboard — then prints the command to start it. See [`docs/DEMO.md`](docs/DEMO.md) for the full walkthrough, including how to watch `mock_anchor_3` degrade and trip the risk floor live.

### 7. Continuous collection (the deployed setup)

A demo run is a single snapshot. To keep scoring anchors — and to build a
chart that covers more than a few hours — the real collectors run on a
host, on a schedule:

```bash
COLLECTOR_HOST=root@your-host bash scripts/deploy-to-server.sh
```

That syncs the services, installs their dependencies, and leaves
`/var/lib/anchor-status` untouched. Cron then runs one round every 20
minutes:

```
*/20 * * * * root /usr/bin/flock -n /var/lock/anchor-collect.lock /opt/anchor-status/scripts/collect.sh >> /var/log/anchor-status/collect.log 2>&1
```

Deployment is pull-based: [`scripts/server-autodeploy.sh`](scripts/server-autodeploy.sh)
runs on the host every 5 minutes, fetches the tracked branch, and exits when
the SHA hasn't moved. Whoever pushes gets deployed, and nobody needs SSH
access to the host — the host authenticates to GitHub with a read-only
deploy key. A push-from-your-laptop hook was tried first and quietly skipped
every commit made on anyone else's machine.

One round is [`scripts/collect.sh`](scripts/collect.sh): `passive-monitor`,
`testnet-probe`, `aggregator` (with `AGGREGATOR_SKIP_MOCK=true`, so only
real sources are submitted), then `history-archiver`. `flock` skips a tick
rather than stacking rounds when a probe runs long.

**Nothing accumulated lives in the deployed tree.** Everything that must
survive a redeploy sits in `/var/lib/anchor-status`:

| File | What it holds | Why it must not reset |
| --- | --- | --- |
| `history.json` | Every score point and risk transition ever observed (plus slash events from the previous oracle, which slashed) | Soroban RPC only serves events for ~12 hours, so this is the only long-term record |
| `aggregator-state.json` | Dedup keys for reports already submitted | A reset would resubmit tens of thousands of reports |
| `probe-results/probe-log.json` | Every testnet probe run | The `RealTestnet` evidence trail |

[`services/history-archiver`](services/history-archiver) re-reads the RPC's
event window each round and merges it into `history.json` by
`(timestamp, value)`, so overlapping rounds never duplicate and a failed
round never drops what is already archived. The file is written via temp +
rename with a `.bak` copy, and served read-only over HTTP; the dashboard
reads it from `HISTORY_ARCHIVE_URL` server-side and unions it into the live
contract read. If it is unreachable the dashboard still renders live data —
just with a shorter chart.

## Deployed testnet contracts

| Contract | Contract ID |
| --- | --- |
| `AnchorRegistry` | [`CBQGNUIX5ZDQOE6VBDHTF3SSWSCNMYK37ES5CBYUTQAED7NLZOFEE4AB`](https://stellar.expert/explorer/testnet/contract/CBQGNUIX5ZDQOE6VBDHTF3SSWSCNMYK37ES5CBYUTQAED7NLZOFEE4AB) |
| `PerformanceOracle` | [`CBDDBO5YU3MERDJ7LFA5RIXFORW5HI3NKMK67TG5TPO5QT64M5GUWGWU`](https://stellar.expert/explorer/testnet/contract/CBDDBO5YU3MERDJ7LFA5RIXFORW5HI3NKMK67TG5TPO5QT64M5GUWGWU) |

Network: Stellar Testnet (`Test SDF Network ; September 2015`). For code changes use `scripts/upgrade-contracts.sh`, which keeps these IDs. Only a fresh `scripts/deploy-contracts.sh` creates new ones (and writes them into `.env`) — update this table if you do.

## Testing

Every contract and service ships with its own test suite; none require network access.

```bash
(cd contracts/anchor-registry && cargo test)
(cd contracts/performance-oracle && cargo test)
(cd services/passive-monitor && npm test)
(cd services/testnet-probe && npm test)
(cd services/aggregator && npm test)
(cd services/mock-anchors && .venv/bin/pytest)
(cd dashboard && npm test)
```

## Design notes

- **Mainnet stays read-only.** `passive-monitor` never signs or submits a mainnet transaction — it only scans Horizon payment history for anchors you list.
- **Score math**: a per-source-weighted exponential moving average (`RealMainnet` / `RealTestnet` move the score faster than `SimulatedMock`); a single slow-but-successful transaction still scores far better than a failure.
- **No slashing.** The oracle is a neutral measurement layer: it publishes a score, a trend and a risk flag, and `AnchorRegistry` has no slashing entry point at all. An earlier version slashed 10% of stake automatically; on testnet it was triggered by bugs in our own probe, which is exactly why a measurement error must not be able to cost an operator money.
- **Trend and risk floor live in contract state**, not in event history, so detecting them never depends on how long an RPC node keeps events. Transaction volume enters only as an observation count — confidence in the score, never part of it.
- **Cross-contract authorization**: `PerformanceOracle` is the only caller `AnchorRegistry` accepts for `update_score`, enforced by Soroban's own invoker-authentication — no shared secret or allowlist needed.
- **Upgrades keep the address.** Both contracts have an admin-only `upgrade`; `scripts/upgrade-contracts.sh` replaces the code in place, so a fix doesn't change contract IDs or reset state.

## License

No license file is currently published for this repository. Treat the code as all-rights-reserved unless the repository owner adds one.
