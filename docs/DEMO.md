# End-to-End Demo — Presentation Walkthrough

This document explains how to demo the system `scripts/demo.sh` sets up.
**Requires network access** to Stellar testnet.

## Prerequisites

```bash
cp .env.example .env   # fill in values (or let scripts/setup-env.sh handle it)
bash scripts/setup-env.sh
bash scripts/demo.sh
```

`scripts/demo.sh` (see the comments at the top of the script for exact
detail): verifies the deployer account, deploys the contracts if needed,
runs `mainnet-probe` and `passive-monitor` once, runs `testnet-probe` once, runs
`aggregator` to write everything to testnet, and prints the command to
start the dashboard.

## Presentation flow

### 1) Introduce the collectors

- **RealMainnet** (`services/mainnet-probe`): every live SEP-6/24 anchor on
  mainnet, discovered automatically and checked **read-only** every 20
  minutes. No money moves.
- **RealTestnet** (`services/testnet-probe`): every listed testnet anchor
  gets the same read-only check and then a real deposit and withdrawal,
  each payment verified on the ledger.
- **Chain signals** (`services/passive-monitor`): read-only Horizon context
  for the assets anchors issue: mints, burns and market price. Never a
  report of its own; it feeds the Market pillar and the flow flags.
### 2) Open the dashboard

```bash
cd dashboard && npm run dev
```

At `http://localhost:3000`, with the "All" filter active, show anchors
from every collector side by side (green "Live mainnet", blue "Live
testnet" badges). Point out that each source is
distinguished by badge color and text, the score is large and
color-coded (green/amber/red), and the sparkline summarizes recent
history.

### 3) Show the filters

Click "Live mainnet" / "Live testnet" to show the list
filtering and the active button highlighting.

### 4) Click an anchor to open its detail view

Show the full score-history chart and, under it, the anchor's on-chain
health: its trend, its recent success rate, any failure streak, and how
many checks back the score. Any dashed red `ReferenceLine` is a *legacy*
slash from the previous oracle version, which slashed automatically; the
current one never does.

### 5) Closing

- Emphasize that `AnchorRegistry`/`PerformanceOracle` run on testnet as a
  neutral measurement layer — trend and risk floor live in contract
  state, nobody's stake is ever touched — and that the dashboard
  discovers anchors on-chain via `list_anchors()`.
- Reiterate that the whole system (aside from mainnet's read-only leg)
  runs on testnet — no real money ever moves.

## Troubleshooting

- **Dashboard says "Showing demo data"**: contract IDs or
  `NEXT_PUBLIC_READER_PUBLIC_KEY` are missing from `.env`, or the RPC is
  unreachable. See `dashboard/README.md`.
- **aggregator isn't sending anything**: check that the source files
  (`services/passive-monitor/output/base-profiles.json`,
  `services/testnet-probe/results/probe-log.json`) exist — the corresponding
  services must have run at least once.
