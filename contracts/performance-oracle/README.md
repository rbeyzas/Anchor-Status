# performance-oracle

Soroban/Rust smart contract. Collects anchor performance reports,
computes a weighted EMA score per source type, and triggers
`AnchorRegistry.slash()` when the score falls at or below the threshold.

- `init(admin, registry_address)` — one-time setup; sets the
  `AnchorRegistry` contract this oracle reports into.
- `authorize_reporter(reporter, source_type)` — admin-only; authorizes
  `reporter` to submit reports for exactly one `source_type`. Calling
  again for the same reporter replaces the authorization.
- `submit_report(reporter, anchor_id, success, settlement_seconds, timestamp, source_type)`
  — callable only by a reporter authorized for that exact `source_type`.
- Score: a per-source-weighted exponential moving average (`RealMainnet`
  and `RealTestnet` move the score faster than `SimulatedMock`).
- If the resulting score falls at or below the slash threshold, this
  contract cross-calls `AnchorRegistry.slash()` for 10% of the anchor's
  current stake.
- `get_score(anchor_id)` — returns the current score.

Tests: `cargo test` (also exercises the real cross-contract call via
`testutils`; no network access needed).

Deploy: `../../scripts/deploy-contracts.sh` — references the
`AnchorRegistry` contract address (it must be deployed first).
