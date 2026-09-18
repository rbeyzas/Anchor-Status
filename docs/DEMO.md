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
runs `passive-monitor` once, starts the 4 `mock-anchors` instances (plus
demo traffic) in the background, runs `testnet-probe` once, runs
`aggregator` to write everything to testnet, and prints the command to
start the dashboard.

## Presentation flow

### 1) Introduce the three layers

- **Layer 1 — RealMainnet** (`services/passive-monitor`): real mainnet
  anchors, monitored **read-only** via Horizon. No money moves — we're
  only observing real-world activity.
- **Layer 2 — RealTestnet** (`services/testnet-probe`): a real SEP-10 +
  SEP-24 flow run against `testanchor.stellar.org` on testnet — this
  simulates an actual user experience.
- **Layer 3 — SimulatedMock** (`services/mock-anchors`): 4 fully
  controlled mock anchors. We script their behavior
  (`behavior_profiles/anchor-N.json`) ourselves, which is what lets us
  demonstrate deterministic, repeatable risk-detection scenarios.

### 2) Open the dashboard

```bash
cd dashboard && npm run dev
```

At `http://localhost:3000`, with the "All" filter active, show anchors
from all three sources side by side (green "Live mainnet", blue "Live
testnet", gray "Simulated" badges). Point out that each source is
distinguished by badge color and text, the score is large and
color-coded (green/amber/red), and the sparkline summarizes recent
history.

### 3) Show the filters

Click "Live mainnet" / "Live testnet" / "Simulated" to show the list
filtering and the active button highlighting.

### 4) Click an anchor to open its detail view

Show the full score-history chart and, under it, the anchor's on-chain
health: its trend, its recent success rate, any failure streak, and how
many checks back the score. Any dashed red `ReferenceLine` is a *legacy*
slash from the previous oracle version, which slashed automatically; the
current one never does.

### 5) Show risk detection live (the actual "wow" moment)

`mock_anchor_3`'s behavior profile
(`services/mock-anchors/behavior_profiles/anchor-3.json`) defines its
success rate dropping from 92% to 40% after simulated day 20. With the
default `TIME_ACCELERATION=1440` (1 real minute = 1 simulated day), this
happens **roughly 20 real minutes after the mock anchors start**:

1. Start `scripts/demo.sh` about 20 minutes before you need this moment
   (or start it early and fill the gap with the rest of the demo).
2. Run `aggregator` periodically (e.g.
   `watch -n 30 'cd services/aggregator && npm run aggregate'`, or run it
   by hand a few times) — each run reads `mock-anchors`'s new logs and
   writes them to `PerformanceOracle.submit_report()` on testnet.
3. As you approach the 20-minute mark, keep the dashboard open and watch
   the `mock_anchor_3` card: its trend turns to *Degrading* before the
   score itself crosses the floor — that early warning is the point — and
   then a risk badge appears (an outage, a mostly-failing window, or a
   score below 55).
4. Click the card and show the drop, the trend, and the recent success
   rate in the detail view. Point out that the stake did not move: the
   oracle publishes risk, it never penalizes.
5. Optionally also show `mock_anchor_4` — unreliable from the start, the
   contrasting "flagged almost immediately" scenario.

To speed this up, raise `TIME_ACCELERATION` before starting
`services/mock-anchors/scripts/run-all.sh` (e.g. `4320` = 1 minute = 3
days → triggers in ~7 minutes). Lower it to slow things down.

### 6) Closing

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
- **No activity in mock-anchors**: check
  `services/mock-anchors/state/anchor{N}-traffic.log` and
  `-simulator.log`; if `seed_demo_transactions` isn't running, make sure
  `SEED_DEMO_TRAFFIC=true`.
- **aggregator isn't sending anything**: check that the source files
  (`services/passive-monitor/output/base-profiles.json`,
  `services/testnet-probe/results/probe-log.json`,
  `services/mock-anchors/logs/*.json`) exist — the corresponding
  services must have run at least once.
