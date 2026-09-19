# performance-oracle

Soroban/Rust smart contract. Publishes, per anchor, a headline score, a
trend and a risk flag: a **score card** computed off-chain from 30 days of
checks (mainnet anchors, see [`docs/SCORING.md`](../../docs/SCORING.md)), or
else an EMA of individual reports. It is a neutral measurement: it never
slashes or moves anyone's stake.

- `init(admin, registry_address)` — one-time setup; sets the
  `AnchorRegistry` contract this oracle reports into.
- `authorize_reporter(reporter, source_type)` — admin-only; authorizes
  `reporter` to submit reports for exactly one `source_type`. Calling
  again for the same reporter replaces the authorization.
- `submit_report(reporter, anchor_id, success, settlement_seconds, timestamp, source_type)`
  — callable only by a reporter authorized for that exact `source_type`.
  Rejects reports more than 5 minutes in the future or 2 days in the past.
- `submit_report_with_evidence(..., evidence)` — the same, plus the SHA-256
  of the published evidence document, emitted in `report_submitted`.
- `publish_score_card(reporter, anchor_id, card)` — `card` is a
  `ScoreCardInput`: score, availability, speed, integrity, market (optional),
  confidence, flags, window_end, methodology_version, inputs_hash (one
  struct, because a contract function takes at most 10 arguments). The
  reporter must be authorized for the anchor's own source type, read from
  the registry. All percentages at most 100, methodology version at least
  1, `window_end` strictly after the stored card's and not in the future.
  Stores the card, pushes its score to the registry, re-checks the risk
  floor, and emits `score_card_published`. From then on, reports still
  update the EMA and the health record but no longer overwrite the
  registry's score, and `report_submitted.new_score` carries the card's.
- `get_score_card(anchor_id)` — the latest card, if any.
- `get_score(anchor_id)` — the headline: the card's score, else the
  per-source-weighted EMA (`RealMainnet` and `RealTestnet` at 35%,
  `SimulatedMock` at 15%), else **0** for an anchor never scored.
- `get_health(anchor_id)` — the trend and risk record:
  - **Trend** from a fast (50%) and a slow (8%) EMA, both seeded from the
    anchor's first real report: `Degrading` when the fast one sits more
    than 10 points below the slow one, `Improving` when it sits 10 above.
  - **Risk floor**, checked in order: 3 failed reports in a row
    (`ConsecutiveFailures`); under 50% success across the last 10–20
    reports (`LowSuccessRate`), so a short recovery can't hide a mostly
    failing window; or a headline score of 55 or less (`ScoreBelowFloor`),
    not judged while the anchor's card has a confidence under 40, whose
    number is withheld.
  - `observations`: how many reports back the score. Volume counts as
    confidence here — it never raises the score.
- `risk_status_changed` event — emitted only when an anchor's risk reason
  changes, so consumers see transitions rather than one event per report.
- `upgrade(new_wasm_hash)` — admin-only; replaces the code in place.

Trend and risk live in contract state rather than in event history, so they
don't depend on how long an RPC node serves events (7 days on the public
testnet RPC).

Tests: `cargo test` (also exercises the real cross-contract call via
`testutils`; no network access needed).

Deploy: `../../scripts/deploy-contracts.sh` creates both contracts, links
them, authorizes the reporters and registers the anchors in
`../registered-anchors.json`. For later changes use
`../../scripts/upgrade-contracts.sh`, which keeps the contract IDs.
