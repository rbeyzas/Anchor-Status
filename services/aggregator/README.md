# aggregator

Node/TypeScript service. Merges reports from all three sources and
writes them to `PerformanceOracle.submit_report()` on testnet.

Sources:
- `services/passive-monitor/output/base-profiles.json` (source_type: RealMainnet)
- `services/testnet-probe/results/probe-log.json` (source_type: RealTestnet)
- `services/mock-anchors/*/logs/*.json` (source_type: SimulatedMock)

Each record is normalized to
`{ anchor_id, success, settlement_seconds, timestamp, source_type }`
and, if not already submitted (see the dedup state in `state.json`),
signed with the authorized reporter key for that source type and sent to
testnet.

**Important note on passive-monitor**: Horizon's payment history doesn't
give us a real "deposit started → completed" latency (only
testnet-probe, which actually drives the SEP-24 flow, can measure that).
So for the passive-monitor source, `success` = "was at least one real
payment seen in the window", and `settlement_seconds` = "window length /
transaction count" (average time between payments) — a proxy, not a real
settlement measurement. This is a deliberate approximation; see
`src/normalize.ts`.

Run it:

```bash
npm install
npm run aggregate    # reads all 3 sources, submits new records to
                      # PerformanceOracle.submit_report() on testnet
npm test              # network-free unit tests (normalize + dedup state)
npm run typecheck
```
