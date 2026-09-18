# performance-oracle

Soroban/Rust smart contract. Collects anchor performance reports and
publishes, per anchor, a weighted EMA score, a trend, and a risk flag. It is
a neutral measurement: it never slashes or moves anyone's stake.

- `init(admin, registry_address)` — one-time setup; sets the
  `AnchorRegistry` contract this oracle reports into.
- `authorize_reporter(reporter, source_type)` — admin-only; authorizes
  `reporter` to submit reports for exactly one `source_type`. Calling
  again for the same reporter replaces the authorization.
- `submit_report(reporter, anchor_id, success, settlement_seconds, timestamp, source_type)`
  — callable only by a reporter authorized for that exact `source_type`.
  Rejects reports more than 5 minutes in the future or 2 days in the past.
- `get_score(anchor_id)` — the headline score: a per-source-weighted
  exponential moving average (`RealMainnet` and `RealTestnet` at 35%,
  `SimulatedMock` at 15%).
- `get_health(anchor_id)` — the trend and risk record:
  - **Trend** from a fast (50%) and a slow (8%) EMA, both seeded from the
    anchor's first real report: `Degrading` when the fast one sits more
    than 10 points below the slow one, `Improving` when it sits 10 above.
  - **Risk floor**, checked in order: 3 failed reports in a row
    (`ConsecutiveFailures`); under 50% success across the last 10–20
    reports (`LowSuccessRate`), so a short recovery can't hide a mostly
    failing window; or a headline score of 55 or less (`ScoreBelowFloor`).
  - `observations`: how many reports back the score. Volume counts as
    confidence here — it never raises the score.
- `risk_status_changed` event — emitted only when an anchor's risk reason
  changes, so consumers see transitions rather than one event per report.
- `upgrade(new_wasm_hash)` — admin-only; replaces the code in place.

Trend and risk live in contract state rather than in event history, so they
don't depend on how long an RPC node serves events (~12 hours in practice).

Tests: `cargo test` (also exercises the real cross-contract call via
`testutils`; no network access needed).

Deploy: `../../scripts/deploy-contracts.sh` creates both contracts, links
them, authorizes the reporters and registers the anchors in
`../registered-anchors.json`. For later changes use
`../../scripts/upgrade-contracts.sh`, which keeps the contract IDs.
