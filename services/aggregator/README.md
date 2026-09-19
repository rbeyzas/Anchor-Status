# aggregator

Node/TypeScript service. Two jobs, in this order, every collection round:

1. **Reports.** Merges reports from the collectors and writes new ones to
   `PerformanceOracle.submit_report_with_evidence()` on testnet, signed by the
   reporter key authorized for each source type. Sources:
   `mainnet-probe`'s daily JSON-lines log (RealMainnet), `testnet-probe`'s
   log (RealTestnet), and the mock anchors' logs (SimulatedMock, skipped on
   the collector host). Dedup keys live in `AGGREGATOR_STATE_PATH`.
2. **Score cards** ([`docs/SCORING.md`](../../docs/SCORING.md)). For every
   mainnet anchor with a conclusive probe in 30 days: build its inputs from
   the probe log, `mainnet-probe`'s status file (listed and issued assets)
   and `passive-monitor`'s flows and market samples; compute the card; and
   publish the ones that changed, or are a day old, with
   `publish_score_card`, at most 40 per run. Each card's inputs are written
   first as a content-addressed bundle (`anchor-status/score-inputs/v1`)
   into `EVIDENCE_DIR`, and its SHA-256 goes on-chain with the card.

The engine (`src/scoring/engine.ts`) is a pure function from a bundle to a
card: no I/O, no clock, no randomness. Its constants are all in
`src/scoring/constants.ts`; changing one means a new methodology version.

```bash
npm install
npm run aggregate                 # reports, then due score cards
npm run score -- --dry-run        # print every card from local data; sends nothing
npm run verify-score -- <sha256 | url | file> [--anchor <id>] [--logs <dir>]
npm test
npm run typecheck
```

`verify-score` checks that a bundle hashes to its name, recomputes the card
from it, and with `--anchor` compares it with the card stored on-chain (read
straight from the ledger, no account needed). With `--logs` it also checks
the bundle's per-day digests against a copy of the probe logs, which the
collector host serves at `/probe-results/`.

Paths (all env-overridable): `MAINNET_PROBE_RESULTS_DIR`,
`MAINNET_STATUS_PATH`, `EVIDENCE_DIR`, `PASSIVE_MONITOR_FLOWS_PATH`,
`PASSIVE_MONITOR_MARKET_DIR`. The last published card per anchor is kept in
`score-cards.json` beside the dedup state; `score-summary.json`, beside the
status file, is the public summary the dashboard reads.

The passive-monitor payment profiles are not submitted as reports by
default (`AGGREGATOR_SUBMIT_PASSIVE_MONITOR`): they encoded volume as a
latency, and volume is not reliability.
