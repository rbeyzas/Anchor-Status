# Prompt: implement the new scoring methodology

Paste everything below the line into a new Claude Code session opened in this repository.

---

You are implementing a new score mechanism for Mona, and removing the TRY-specific focus from the project's docs. The methodology is fully specified in `docs/SCORING.md`. **Read it completely before writing any code**, then read the code it touches. The spec is the source of truth; if you find it wrong or ambiguous, say so and propose a fix in your report rather than silently deviating.

## Context you must know

- Mona probes Stellar anchors, submits reports to a Soroban `PerformanceOracle`, which updates `AnchorRegistry`. A Next.js dashboard reads both contracts.
- The live score today is a per-report EMA (`contracts/performance-oracle/src/scoring.rs`). Volume is already excluded from it. The new score is a windowed, multi-pillar **score card** with a separate **confidence**, computed off-chain by the aggregator and published on-chain with the hash of its inputs.
- Data flow: `services/mainnet-probe` (JSONL results, `status.json`, evidence docs) → `services/aggregator` (submits reports) → `contracts/performance-oracle` → `dashboard`. `services/passive-monitor` scans Horizon and is currently "kept as data, not scored". `scripts/collect.sh` runs the collectors every 20 minutes.
- Existing conventions to follow, not reinvent: content-addressed evidence via `canonicalJson` + sha256 (`services/mainnet-probe/src/evidence.ts`; `testnet-probe` already keeps its own copy, so a copy in the aggregator is consistent with the repo), env-overridable paths in each package's `config.ts`, atomic writes for status files, the dashboard tolerating contracts deployed before a feature exists, `vitest` in every TS package, contract tests in `test.rs`.
- Do not use em dashes in any user-facing copy (the project recently removed them). Comments explain why, not what.
- The product is being prepared for public launch. **Never show or store invented data.** A value we cannot measure is `n/a`, never a flattering default.

## Ground rules

- Keep it lean. No config framework, no abstractions with one implementation, no new dependencies (use built-in `fetch`, `node:crypto`, `node:tls`, `smol-toml` and `@stellar/stellar-sdk`, which are already present). All scoring constants live in one file.
- Test-first for logic. The golden examples in `docs/SCORING.md` section 10 become unit tests verbatim.
- Do **not** commit, push, deploy, upgrade contracts, run `scripts/upgrade-contracts.sh`, `scripts/deploy-*.sh`, or touch the collector host, unless I explicitly ask. Prepare everything and tell me the exact commands to run.
- Do not edit `judging-criteria.md` (it is the hackathon organizers' text) or anything under `graphify-out/`.
- Work in the phases below, in order. After each phase run its verification commands, then give me a short summary (what changed, what passed, anything that surprised you) before starting the next one. If a phase's assumptions turn out false (for example a Horizon field does not exist), stop and tell me.

## Part A: remove the TRY focus

The product is currency-agnostic: it tracks every discovered Stellar anchor. TRY appears only in `docs/ROADMAP.md` (the ramp was already removed from the dashboard, so some of that file is also stale). Edit `docs/ROADMAP.md`:

1. Line 3 (continuation path): drop "once a TRY anchor is routing live traffic on mainnet". Replace with the condition "once the new scoring methodology (`docs/SCORING.md`) is live on mainnet and backed by real transfers".
2. Line 9 (the "Ramp" bullet) describes a feature that no longer exists. Replace it with what exists: a read-only dashboard of every discovered mainnet anchor with score, confidence, pillars and the evidence behind each report. Also reconcile the neighbouring "Where we are" bullets with `README.md`'s current description (mainnet-probe is now the primary mainnet collector; passive-monitor is context only).
3. Milestone M1 ("TRY live on testnet"): replace with "New scoring live". Deliverable: phases 1-3 of `docs/SCORING.md` running on the collector host; success measure: every discovered mainnet anchor has a score card with a confidence, at least 30 days of history exist, and a third party can reproduce one card with `verify-score`. Delete the TRY anchor registration, the TRY ramp flow and the "Turkish UI" from it.
4. Milestone M3: change "best anchor for TRY/EUR/…" to "best anchor for a given asset or currency". Leave the rest of M3.
5. Milestone M4: add "Completion pillar from real mainnet transfers" to the deliverable (see `docs/SCORING.md` section 18).
6. Known limitations: replace the "Mainnet signal is a proxy" wording if it now contradicts the new methodology; keep the reporter-trust and probe-vs-anchor-failure items.

Acceptance: `grep -rInE '\bTRY\b|Turkish|Türk' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=target --exclude-dir=graphify-out --exclude-dir=test_snapshots .` returns only `judging-criteria.md`, and `ROADMAP.md` no longer mentions a ramp or a TRY flow. Do not touch external files (for example the pitch deck outside the repo); just mention that they may need the same edit.

## Part B: implementation

### Phase 1: contract, engine and publisher on existing data

No new data sources; everything needed is in the current probe logs.

**1a. mainnet-probe**: add `stages_expected: StageName[]` to `MainnetProbeResult` (`services/mainnet-probe/src/probe.ts`), derived from what the toml advertises: always `toml`, `info`; plus `challenge`, `token` when a `WEB_AUTH_ENDPOINT` and `SIGNING_KEY` exist; plus `initiate` when SEP-24 and a deposit asset exist. Persist it in the JSONL line. Add tests in `probe.test.ts` for the three shapes (SEP-24, SEP-6 only, no SEP-10).

**1b. Contract** (`contracts/performance-oracle`, `contracts/anchor-registry`), per `docs/SCORING.md` section 12:
- Add `ScoreCard`, `DataKey::Card(Symbol)` (append only; do **not** modify `AnchorHealth` or reorder existing variants), the `score_card_published` event, `publish_score_card`, `get_score_card`.
- `publish_score_card` authorizes the reporter for the anchor's source type by reading `get_anchor_info` from the registry; validates bounds; rejects a `window_end` that is not strictly newer than the stored card's or is too far in the future; stores with the same TTL bump as other keys; calls `registry.update_score`; re-evaluates the risk reason with the new headline and emits `risk_status_changed` on transition.
- `record_report`: keep EMA and health updates, but the score it emits and returns is the headline (card score if present, else EMA); call `registry.update_score` only when the anchor has no card.
- `get_score`: card, else EMA, else 0. `AnchorRegistry.register_anchor`: initial score 0.
- Tests to add: unauthorized reporter; wrong source type; out-of-range values; replayed or older `window_end`; registry receives the card score; after a card exists, `submit_report` no longer overwrites the registry and emits the headline; risk floor uses the card score; unreported anchor returns 0; card TTL is extended. Update existing tests that assumed an initial score of 100 for unscored reads (keep the EMA seed of 100 for the legacy path, it is unchanged). Regenerate snapshots only for tests you changed, and review the diff.
- Do not add on-chain recomputation of the formula; the headline is verifiable off-chain from the card's own fields.

**1c. Aggregator engine** (`services/aggregator/src/scoring/`): `constants.ts` (section 17), pure `computeCard` with helpers, and a golden test file covering the six examples in section 10 plus edge cases: no probes, all inconclusive, zero successes (Speed 0), Market n/a weight redistribution, multiple gates (lowest cap wins), round-half-up boundaries (for example 80.5 → 81), clamping outside curve ranges, coverage fallback to 0.5. The engine has no I/O, no `Date.now()`, no randomness.

**1d. Inputs builder and publisher**:
- `inputs.ts`: stream the last 30 daily JSONL files, exclude inconclusive runs, compute per-anchor inputs. In this phase Integrity, Market and flow inputs are absent, so Integrity uses only the checks derivable from existing logs (`toml_valid`, `sep10_signed`, `info_valid`, `signing_key_stable` from stored transcripts) and Market and flow gates are `n/a`.
- `evidence.ts` copy plus a bundle writer producing `anchor-status/score-inputs/v1` documents into a new `EVIDENCE_DIR` config (default matching mainnet-probe's).
- Publisher in `index.ts` after the report loop, with the change-or-24h rule, the `MAX_CARDS_PER_RUN` cap, floor-to-hour `window_end`, last-published state in a JSON file beside the existing state, and a `contract.ts` function for `publish_score_card`. Tolerate a contract that has no `publish_score_card` yet: log once and skip, do not fail the run.
- `verify-score.ts` and an `npm run verify-score` script (see section 14), with a roundtrip test: build bundle → hash → recompute → equals the published card.

**1e. Dashboard**:
- Types and `soroban.ts`: read `get_score_card` per anchor, tolerate absence. Add the card to `AnchorViewModel`.
- Card and modal changes per section 15: confidence chip, withheld number below 40, pillar bars, flags, methodology version, inputs-bundle link. Put flag copy and pillar labels in one small module. Update `hasEnoughData` to use confidence when a card exists.
- Update the landing page method text and `dashboard/README.md`. Show only real values.
- Tests for the new formatting and gating logic.

**Verification for phase 1**:
```bash
cd contracts/performance-oracle && cargo test && cargo build --target wasm32v1-none --release
cd ../anchor-registry && cargo test
cd ../../services/mainnet-probe && npm test && npm run typecheck
cd ../aggregator && npm test && npm run typecheck
cd ../../dashboard && npm test && npm run typecheck && npm run build
```
Also run the aggregator engine against real probe output if a `results/` directory is available locally, or against generated fixtures otherwise, and show me the resulting cards for a few anchors.

### Phase 2: integrity checklist

- Extend `parseAnchorToml` to read `[[CURRENCIES]]` (code, issuer, `anchor_asset_type`, `anchor_asset`, `is_asset_anchored`) and expose the response headers from `fetchAnchorToml` (for CORS).
- In `probe.ts`, record a `checks` object on each result: `toml_valid`, `toml_cors`, `sep10_signature_valid` (distinguish "not signed by the published key" from a plain HTTP failure at the challenge stage), `info_valid`, `tls_ok` and `tls_days_left` (via `node:tls`, a separate connection whose time is **not** added to `settlement_seconds`). Record `assets` from the toml.
- Issuer verification: for each listed asset with an issuer, `GET {horizon}/accounts/{issuer}` and compare `home_domain` with the anchor's domain. Cache 24h per issuer in an output file. Write per-asset `{code, issuer, anchor_asset_type, anchor_asset, issuer_home_domain_matches, issuer_created_at?}` into `status.json`. Fetch `issuer_created_at` from the issuer's first operation for the dashboard's "on-chain since".
- Feed the full checklist into `inputs.ts` and `computeCard` per section 6.3.
- Tests: toml parsing with and without currencies, CORS present/absent, the tls check with an injected certificate, issuer match/mismatch/cache hit, the "earlier stage failed counts as fail; policy or not-applicable counts as n/a" rule.

Verification: the phase 1 commands, plus `npm test` in `mainnet-probe`.

### Phase 3: chain signals (Market and flows)

Work in `services/passive-monitor`. Keep the existing payment profile as activity context.

- Read `status.json` (path via env, default to mainnet-probe's output) and process only anchors with at least one asset where `issuer_home_domain_matches === true`.
- `flows.ts`: reuse `fetchRecentPayments` from `horizon.ts` against the issuer account. Classify payments of the anchor's own asset: from the issuer is a mint, to the issuer is a burn. Keep daily buckets `{mint_amount, mint_count, burn_amount, burn_count}` in a state file. First run backfills 30 days; later runs recompute only the current and previous UTC day. If the page cap truncates a window, mark it `truncated` and treat flow gates as n/a for that window. Respect the existing request delay.
- `fx.ts`: USD-to-currency reference rate for assets with `anchor_asset_type = "fiat"`. Use a free daily source with no API key; check its current documentation before coding, prefer one covering many currencies, and fall back to a second source. Cache for a day. Record source, rate and date. No rate means Market is `n/a`, never a guess.
- `market.ts`: once per round, per verified fiat issuer asset, sample the price against the numeraire USD asset from the order book mid and the AMM pool, apply the depth and spread rules, compute `dev_bps`, and append to a daily JSONL file. Verify the numeraire USD asset's issuer against Circle's and StellarExpert's published data before hardcoding it, and keep it as one named constant.
- `inputs.ts` and `computeCard`: add the Market pillar, DEPEG, ONE_WAY_FLOW, SILENT and NO_MARKET per sections 6.4 and 8. Add golden test example 6 and gate tests. Update `scripts/collect.sh` comments only if the order of steps changes (it should not).
- Tests: mint/burn classification, day-bucket recompute without double counting, truncation handling, FX missing, thin market, order-book-only vs AMM-only vs both, run detection for the persistence metrics.

Verification: phase 1 commands plus `cd services/passive-monitor && npm test && npm run typecheck`. Dry-run the collectors against live Horizon read-only for two or three anchors and show me the raw samples and the resulting card.

### Phase 4: docs and handoff

- Update `README.md` (the architecture step for `PerformanceOracle`, the "Score math" and "Trend and risk floor" bullets), `contracts/performance-oracle/README.md`, `services/aggregator/README.md`, `services/mainnet-probe/README.md`, `services/passive-monitor/README.md` (no longer "not scored", now "context and chain signals"), and `dashboard/README.md`. Keep `docs/SCORING.md` in sync with anything you changed.
- Do **not** implement the Completion pillar; leave it as described in section 18.

## What to hand back

1. A per-phase summary and the list of files changed.
2. The result of every verification command (paste failures, do not paraphrase them).
3. Any deviation from `docs/SCORING.md` and why, plus any constant you think needs calibration and what data you would need.
4. The exact ordered commands I should run to roll this out on testnet (contract upgrade, then collectors, then dashboard build), and anything on the collector host I must do by hand (for example serving the probe results directory read-only beside the evidence directory, a new `EVIDENCE_DIR` env for the aggregator).
5. Known risks you noticed that the spec does not cover.
