# performance-oracle

Soroban/Rust smart contract. Publishes, per anchor, a headline score, a
trend and a risk flag: a **score card** computed off-chain from 30 days of
checks (see [`docs/SCORING.md`](../../docs/SCORING.md)) and made final by a
quorum of reporters, or else an EMA of individual reports. It is a neutral
measurement: it never slashes or moves anyone's stake.

## Setup and reporters

- `init(admin, registry_address)` — one-time setup; sets the
  `AnchorRegistry` contract this oracle reports into.
- `authorize_reporter(reporter, source_type)` — admin-only; authorizes
  `reporter` to submit for exactly one `source_type`. Calling again for the
  same reporter replaces the authorization. At most 7 reporters per source
  type (`TooManyReporters`).
- `revoke_reporter(reporter)` — admin-only; the key can no longer submit.
- `get_reporters(source_type)` — the authorized reporters, so the set can be
  compared with the keys published in the project's stellar.toml.
- `get_reporter_source_type(reporter)` — what one key is authorized for.

## Reports

- `submit_report(reporter, anchor_id, success, settlement_seconds, timestamp, source_type)`
  — callable only by a reporter authorized for that exact `source_type`.
  Rejects reports more than 5 minutes in the future or 2 days in the past.
- `submit_report_with_evidence(..., evidence)` — the same, plus the SHA-256
  of the published evidence document, emitted in `report_submitted`.
- Both refuse an anchor that AnchorRegistry has deactivated
  (`AnchorDeactivated`), before anything is written.
- With a quorum threshold over 1, a report still counts as an observation
  but moves neither the registry's score nor the risk flag: one key cannot
  change an anchor's standing on its own.

## Score cards and the reporter quorum

- `set_quorum_config({ threshold, max_spread, round_seconds })` —
  admin-only. How many reporters must agree, how far apart their scores may
  be before the card is flagged, and the round length. A higher threshold
  applies at once; a lower one only after the upgrade delay, so one key
  cannot quietly go back to deciding alone. Without a config the threshold
  is 1 and every card is final at once.
- `publish_score_card(reporter, anchor_id, card)` — `card` is a
  `ScoreCardInput`: score, availability, speed, integrity, market
  (optional), confidence, flags, window_end, methodology_version,
  inputs_hash. The reporter must be authorized for the anchor's own source
  type, read from the registry. The card joins the anchor's round for its
  window (temporary storage). When `threshold` distinct reporters have
  submitted the same window, the **field-wise lower median** becomes the
  anchor's card, the quorum record is stored, the score goes to the
  registry and the risk floor is re-checked. Until then nothing about the
  anchor changes.
- Rules for a round:
  - `window_end` must sit on a round boundary (`MisalignedWindow`) and not
    be in the future.
  - One card per reporter per round (`DuplicateSubmission`).
  - One methodology version per round (`MethodologyMismatch`).
  - A newer window replaces an unfinished round; an older or already final
    window is refused (`StaleScoreCard`).
- When the reporters' scores are more than `max_spread` apart, the final
  card carries `FLAG_REPORTER_DISAGREEMENT` (bit 16) and a
  `reporter_outlier` event names each reporter further than that from the
  median. A flag is set on the final card when more than half the reporters
  raised it. The final card points to the inputs bundle of the reporter
  whose score is the median.
- `get_pending_round(anchor_id)` — the cards waiting in the current round.
- `get_quorum_info(anchor_id)` — who agreed on the current card: the
  reporters, their scores and inputs hashes, the spread and any outliers.
- `get_quorum_config()` — the settings in force.
- `get_score_card(anchor_id)` — the latest final card, if any.

## Reading the result

- `get_score(anchor_id)` — the score of record, the same number the
  registry holds: the card's score when its confidence is at least 40 (0
  while it is lower: withheld), else the per-source-weighted EMA
  (`RealMainnet` and `RealTestnet` at 35%, `SimulatedMock` at 15%), else
  **0** for an anchor never scored.
- `get_verdict(anchor_id)` — the score of record with its confidence,
  flags, whether it is withheld, and the card's own score. Consumers should
  read this rather than `get_score`, to tell "withheld" from "failing". A
  dispute on the current card shows here: `FLAG_DISPUTED` (bit 17) while it
  is open or upheld, and score 0 with `withheld` once it is upheld.
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

## Signing keys and disputes

A contract cannot read a stellar.toml, so the reporters do it.

- `attest_signing_key(reporter, anchor_id, signing_key)` — a reporter's
  reading of the anchor's SEP-1 `SIGNING_KEY`. Once `threshold` reporters
  (the scores' quorum) have read the same key, it goes to AnchorRegistry,
  where the anchor uses it to claim its record (`claim_anchor`). Returns
  how many reporters agree so far.
- `open_dispute(operator, anchor_id, window_end, reason_code, evidence_hash)`
  — only the operator the anchor's own key named can open one
  (`NotTheClaimedOperator`), against the current card only
  (`NotTheCurrentCard`), one per card (`DisputeAlreadyOpen`). The record
  must hold the minimum stake (`StakeTooLow`); the stake is checked and
  never moved. After a rejected dispute a cooldown applies
  (`DisputeCoolingDown`).
- `vote_dispute(reporter, anchor_id, uphold)` — one vote per reporter.
  `threshold` votes to uphold withhold the card's score until a newer card
  (the registry's score goes to 0 too); as many votes to reject close the
  dispute and start the cooldown. A newer final card supersedes a dispute
  that is still open.
- `get_dispute(anchor_id)` — the anchor's latest dispute: `Open`,
  `Upheld`, `Rejected` or `Superseded`, with the votes.
- `set_dispute_config({ min_stake, cooldown_seconds })`,
  `get_dispute_config()` — admin-only setter; the defaults are 10 XLM and
  7 days.

## Governance

The same rules as AnchorRegistry, with the same error codes (`#21` is
`TimelockActive` in both).

- Admin handover in two steps: `propose_admin(new_admin)`, then
  `accept_admin()` signed by the proposed address. `get_admin()`.
- Time-locked upgrades, all admin-only: `propose_upgrade(wasm_hash)`,
  `execute_upgrade()` once `get_upgrade_delay()` seconds have passed
  (`TimelockActive` before that), `cancel_upgrade()`,
  `get_pending_upgrade()`. The code is replaced in place, keeping the
  contract ID and all state. There is no instant `upgrade()`.
- `set_upgrade_delay(seconds)` — at most 30 days. A longer delay applies at
  once, a shorter one only after the current delay has passed.

## Events

`initialized`, `reporter_authorized`, `reporter_revoked`,
`quorum_config_set`, `report_submitted`, `score_card_submitted` (a card
joined a round), `quorum_reached` (reporters and spread),
`reporter_outlier`, `score_card_published` (the final card),
`risk_status_changed`, `signing_key_attestation`, `dispute_opened`,
`dispute_voted`, `dispute_resolved`, `dispute_config_set`, and the
governance events `admin_proposed`, `admin_changed`, `upgrade_delay_set`,
`upgrade_proposed`, `upgrade_executed`, `upgrade_cancelled`.

Trend and risk live in contract state rather than in event history, so they
don't depend on how long an RPC node serves events (7 days on the public
testnet RPC).

## Tests

`cargo test` (also exercises the real cross-contract call via `testutils`;
no network access needed). It includes four property tests of the quorum
arithmetic, 10,000 random rounds each (`src/proptests.rs`). The fuzz target
in `fuzz/` runs random sequences of cards, reports and unauthorized
attempts against a real registry and oracle pair and checks them against a
model:

```bash
cargo +nightly fuzz run publish_sequence -- -max_total_time=3600 -max_len=2048
```

## Deploy and upgrade

`../../scripts/deploy-contracts.sh` creates both contracts, links them,
authorizes the reporters and registers the anchors in
`../registered-anchors.json`. For later changes use
`../../scripts/upgrade-contracts.sh` (`upload`, `propose`, `execute`,
`cancel`, `status`), which keeps the contract IDs. Rehearse every upgrade
first on fresh contracts with `../../scripts/rehearse-upgrade.sh`.
