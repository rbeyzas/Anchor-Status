# Scoring methodology (v1)

This is the single source of truth for how an anchor's score is computed, published and verified. It replaces the per-report EMA as the headline score for mainnet anchors. The implementation plan is in [`docs/prompts/scoring-v2-implementation.md`](prompts/scoring-v2-implementation.md); where the implementation departs from this text, section 19 says how and why.

## 1. Why the current score is not enough

The live score is an exponential moving average of one observation per probe (failure = 0, success = 40..100 by API latency). Volume is already excluded, on purpose: on Stellar a payment costs about 0.00001 XLM, so transaction counts can be inflated by anyone. The problems are elsewhere:

1. **Everything healthy saturates at 100.** Two healthy anchors are indistinguishable, so the score cannot rank them.
2. **The memory is hours long.** An EMA weight of 0.35 at a 20-minute cadence remembers about the last hour; the 20-outcome window covers about 6.7 hours. "Reliable for 30 days" cannot be expressed.
3. **A new anchor starts at 100.** For a trust score the starting assumption should be "unknown", not "perfect".
4. **Untestable reads as perfect.** An anchor that declines our anonymous wallet at the SEP-10 step (for example MoneyGram, "client_domain is required") is recorded as a success and scores 100 even though we tested only two of five stages.

## 2. Principles

- **Reliability, not popularity.** Volume, age and activity never add points. They only feed confidence and informational flags.
- **Score and confidence are two numbers.** A score says how well the anchor did on what we measured; confidence says how much we measured.
- **Weakest link.** A hard failure caps the headline no matter how good the average is (the contract already does this with its risk floor).
- **Deterministic and explainable.** No machine learning at runtime. The headline is a pure function of the fields on the score card, and the card is a pure function of a published inputs bundle. Anyone can recompute both.
- **Never invent data.** A pillar we cannot measure is `n/a` and its weight is redistributed. Nothing is defaulted to a flattering value.
- **Currency-agnostic.** No currency is special-cased. Everything that needs a reference currency reads it from the anchor's own `stellar.toml`.

## 3. Scope: what is scored

- Score cards are produced for **`RealMainnet` anchors** only. `RealTestnet` and `SimulatedMock` anchors keep the existing per-report EMA (they are demo and reference anchors).
- **An anchor is scored on an asset only if it issues that asset**: the asset's issuer account has `home_domain` equal to the anchor's domain, and the anchor's `stellar.toml` lists that asset (SEP-1 bidirectional check). Anchors that only distribute a third party's asset (for example USDC by Circle) are not blamed for that asset's peg or issuance flow. For them the Market pillar and the flow gates are `n/a`.

## 4. Overview

```
mainnet-probe ──► results/probe-YYYY-MM-DD.jsonl ─┐
   (+ status.json: assets, issuer verification)   │
passive-monitor ─► market samples, flows.json ────┤
                                                  ▼
                        aggregator: inputs builder ─► computeCard() ─► card
                                                  │                     │
                              inputs bundle (sha256, published)         │
                                                  ▼                     ▼
                                        PerformanceOracle.publish_score_card
                                                  │
                             registry.update_score(card.score) + events
                                                  ▼
                                             dashboard
```

Cards are computed off-chain (rolling windows and percentiles are impractical in Soroban, and a formula change would otherwise be a contract upgrade) and published on-chain with the hash of their inputs. The per-report path stays for what it is good at: outage detection within one probe round, evidence per probe, and legacy anchors.

## 5. Inputs

| Input | Produced by | Notes |
| --- | --- | --- |
| Conclusive probe results, last 30 days | `mainnet-probe` (`results/probe-*.jsonl`) | Inconclusive runs (our own failures) are excluded, as today. |
| `stages_expected`, `checks`, `assets` per probe | `mainnet-probe` (new fields) | See sections 6.2 and 6.3. |
| Issuer verification per asset | `mainnet-probe` (`status.json`, cached 24h) | Horizon `GET /accounts/{issuer}` → `home_domain`. |
| Market samples, last 7 days | `passive-monitor` (new) | Only for verified issuer assets with a fiat reference. |
| Mint/burn flows, last 30 days | `passive-monitor` (new) | Only for verified issuer assets. |
| Payment activity profile | `passive-monitor` (existing) | Context and the SILENT flag only. Never scored. |

## 6. Pillars

Each pillar is a number 0-100, rounded half up to an integer. `interp(points, x)` below means piecewise-linear interpolation through the listed `(x, value)` points, clamped to the first and last value outside the range.

### 6.1 Availability (weight 450 permille)

Uptime is the share of conclusive probes that succeeded. A probe that the anchor answered but declined by policy counts as a success, as today (the anchor is up); the lost depth shows up in coverage, not here.

`uptimeScore = interp([(100,100), (99.5,100), (99,90), (97,75), (95,60), (90,35), (80,10), (0,0)], uptime%)`

`Availability = round(0.5 · uptimeScore(u7) + 0.5 · uptimeScore(u30))`

`u7` and `u30` are computed over the last 7 and 30 days, or over all available data when the anchor is younger than the window. The curve is shaped by "nines" because a linear percentage is useless at the top end: 95% uptime is a poor anchor, not a "95".

### 6.2 Speed (weight 200 permille)

Per successful probe, the metric is the **mean time of its completed stages** in seconds. Using a per-stage mean keeps an anchor that stops at stage 2 (policy) comparable with one that runs all five. Over the last 7 days take the **p95** of that metric across successful probes.

`Speed = round(interp([(0.75,100), (5.0,40)], p95_seconds))`

No successful probe in 7 days gives `Speed = 0`. The breakpoints are initial values to be calibrated against the observed distribution (see section 17).

### 6.3 Integrity (weight 200 permille)

A weighted checklist. Each check is pass, fail, or n/a. `Integrity = round(100 · Σ(w · pass) / Σ(w over applicable checks))`. A check that could not run because an earlier required stage failed on the anchor's side counts as **fail**; a check that is not applicable by design, or was declined by policy, is **n/a**.

| Check | Weight | Pass when |
| --- | --- | --- |
| `toml_valid` | 1 | `stellar.toml` fetched, parsed, and advertises a SEP-6/24 transfer server. |
| `toml_cors` | 1 | The `stellar.toml` response has `Access-Control-Allow-Origin` (SEP-1 requires it). |
| `sep10_signed` | 3 | The SEP-10 challenge is signed by the published `SIGNING_KEY`. n/a if SEP-10 is not advertised or the challenge was declined by policy. |
| `info_valid` | 1 | `/info` parses as JSON and lists at least one enabled asset. |
| `tls_ok` | 1 | Certificate valid and at least 14 days from expiry. |
| `signing_key_stable` | 2 | `SIGNING_KEY` unchanged across all conclusive probes in the last 30 days. n/a with fewer than 2 probes. |
| `issuer_home_domain_matches` | 3 | Every asset the toml lists with an issuer has that issuer's `home_domain` equal to the anchor's domain. n/a if no listed asset has an issuer. |

Maximum weight sum is 12. The checks are taken from the most recent conclusive probe, except `signing_key_stable` (30-day window) and `issuer_home_domain_matches` (24h cache).

### 6.4 Market (weight 150 permille, often n/a)

Applies only to a verified issuer asset whose toml declares `anchor_asset_type = "fiat"` and an `anchor_asset` (ISO code), and only when a reference rate and enough liquidity exist. Otherwise it is `n/a` and its weight is redistributed (section 9).

Sampling, once per collection round: price of the asset in USD from the Stellar DEX order book mid (only when both sides exist and the spread is under 5%) and from the AMM pool spot, using their median when both exist, against a single numeraire USD asset (a constant, see section 17). Reference: `1 unit of anchor_asset = r USD` from a public daily FX source. `dev_bps = |price_usd / r − 1| · 10000`. A sample requires depth of at least 500 USD within 1% slippage; otherwise no sample and, if that persists for 7 days, Market is `n/a` and the informational flag NO_MARKET is set.

Over the last 7 days compute `median_bps`, `share_outside_50` (share of samples above 50 bps), and `longest_run_gt100_hours` / `longest_run_gt300_hours` (longest run of consecutive samples above 100 / 300 bps).

`base = interp([(0,100), (25,100), (50,90), (100,70), (200,45), (300,25), (500,0)], median_bps)`

`Market = round(max(0, base − 20·[share_outside_50 > 0.25] − 20·[longest_run_gt100_hours > 6]))`

Why persistence matters more than size: a brief gap is a healthy market at work. A gap that arbitrageurs cannot close means they cannot redeem at the anchor, which is exactly the failure users care about. Depth is displayed as context but does not enter the score in v1.

Known limitation: for currencies with a parallel-market rate (capital controls) a persistent deviation can reflect the currency rather than the anchor. The DEPEG gate therefore requires the deviation to persist for over 24 hours, and the reference source and rate are published in the inputs bundle. The numeraire USD asset is assumed to hold its own peg.

## 7. Confidence

`Confidence = round(100 · sufficiency · depth)` where

- `sufficiency = 0.5 · min(1, monitored_days / 14) + 0.5 · min(1, n30 / 100)`. `monitored_days` is the time since the anchor's first conclusive probe; `n30` is the conclusive probes in the last 30 days.
- `depth = 0.5 + 0.5 · coverage`, `coverage` = median over the last 7 days of `ok_stages / expected_stages`, taken over **successful** probes only. Legacy records without `stages_expected` are ignored; with none at all, `coverage = 0.5`.

Bands: below 40 is **insufficient** (the number is withheld, flags are still shown); 40-69 low; 70-89 medium; 90 and above high.

Tenure enters here and nowhere else. "On-chain since" (the issuer account's first operation) is shown as context only, because age is not reliability: an old, abandoned anchor is old.

## 8. Gates

A gate is a hard cap applied after everything else. Multiple gates: the lowest cap wins. Gates and flags are always shown, whatever the confidence.

| Flag (bit) | Condition | Cap |
| --- | --- | --- |
| `OUTAGE` (0) | The last 3 conclusive probes all failed. | 50 |
| `LOW_UPTIME` (1) | `n7 ≥ 20` and `u7 < 90%`. | 60 |
| `SEP10_MISMATCH` (2) | Any of the last 3 conclusive probes found the challenge not signed by the published `SIGNING_KEY`. | 40 |
| `DEPEG` (3) | `longest_run_gt300_hours > 24` in the last 7 days. | 50 |
| `ONE_WAY_FLOW` (4) | Verified issuer asset, not truncated: `mint_count_14d ≥ 5` and `burn_count_14d = 0`. | 70 |
| `SILENT` (5) | Verified issuer asset: no mint and no burn in 30 days. | none (info) |
| `LOW_COVERAGE` (6) | `coverage < 0.6`. | none (info) |
| `NO_MARKET` (7) | Verified fiat issuer asset but no usable market samples in 7 days. | none (info) |

Balanced mint and burn is not rewarded: a growing anchor legitimately mints more than it burns. Only a complete absence of redemption is flagged. Flow counts come from payments to and from the issuer account; anchors that redeem by other means are a known blind spot.

## 9. Headline formula

Integer arithmetic on the card's own on-chain integers, so anyone can check it from the card alone:

```
weights (permille): A=450, S=200, I=200, M=150
present = pillars that are not n/a;  W = sum of their weights
raw_sum = sum(weight_i · pillar_i over present)
c       = confidence (0-100)
shrunk  = (c · raw_sum + (100 − c) · 50 · W) / (100 · W)        # prior 50
score   = round_half_up(shrunk), then min(score, lowest cap of active gates)
```

The prior of 50 is deliberately neutral: an anchor we know little about lands near the middle, not at 100. With Market `n/a`, W = 850.

## 10. Worked examples (golden tests)

Pillars are the rounded integers used in the formula. "cap" is the lowest active gate cap.

| # | Situation | A | S | I | M | c | Gates | raw | score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Established and flawless: u7 = 100%, u30 = 99.91%, p95 0.6s, 12/12 checks, 30 days, full coverage | 100 | 100 | 100 | n/a | 100 | none | 100 | **100** |
| 2 | Established but flaky: u7 = 484/504, u30 = 97%, p95 3.0s, 10/12 checks | 71 | 68 | 83 | n/a | 100 | none | 73.12 | **73** |
| 3 | Currently down: last 3 probes failed, u7 = 92%, u30 = 98% | 64 | 100 | 100 | n/a | 100 | OUTAGE (50) | 80.94 | **50** |
| 4 | New but clean: 3 days, 216 probes, all healthy | 100 | 100 | 100 | n/a | 61 | none | 100 | **81** |
| 5 | Partly testable (MoneyGram-like): 30 days, all up, only 2 of 5 stages ever complete (coverage 0.4) | 100 | 100 | 100 | n/a | 70 | LOW_COVERAGE (info) | 100 | **85** |
| 6 | Issuer, depegged: median 350 bps, 80% of samples over 50 bps, 30h run over 300 bps | 100 | 100 | 100 | 0 | 100 | DEPEG (50) | 85 | **50** |

Derivations worth pinning in tests:

- Ex. 2: `uptimeScore(96.03) = 60 + (96.03−95)/2·15 = 67.74`; `(67.74 + 75)/2 = 71.37 → 71`. Speed: `100 − 60·(3.0−0.75)/(5.0−0.75) = 68.24 → 68`. Integrity: `100·10/12 = 83.33 → 83`. `raw = (450·71 + 200·68 + 200·83) / 850 = 73.12`.
- Ex. 3: `uptimeScore(92) = 45`, `uptimeScore(98) = 82.5`, average `63.75 → 64`.
- Ex. 4: sufficiency `0.5·(3/14) + 0.5·1 = 0.6071`, `c = 61`, `shrunk = (61·100 + 39·50)/100 = 80.5 → 81`.
- Ex. 5: `depth = 0.5 + 0.5·0.4 = 0.7`, `c = 70`, `shrunk = 0.7·100 + 0.3·50 = 85`.
- Ex. 6: `base = 25 − (350−300)/200·25 = 18.75`, minus 20 twice, floored at 0.

## 11. Signals deliberately not scored

| Signal | Why not | Where it goes |
| --- | --- | --- |
| Transaction count / daily volume | Free to inflate on Stellar; a busy anchor is not a reliable one. The old volume-as-latency proxy already scored busy above reliable. | SILENT flag, activity context. |
| Age of the anchor | Age is not reliability (Cowrie is old and abandoned). | Confidence (our monitoring time); "on-chain since" as context. |
| Stake | Optional, and no one is slashed on it. | Displayed only when present. |
| Machine learning | No labeled ground truth, only tens of anchors, and the score must be deterministic and explainable so anchors can dispute it. | Not used. See section 16. |

## 12. On-chain design (PerformanceOracle)

New storage, so no migration of existing structs. `AnchorHealth` and the existing `DataKey` variants are not modified; only `DataKey::Card(Symbol)` is appended.

```rust
#[contracttype] #[derive(Clone, Debug, PartialEq)]
pub struct ScoreCard {
    pub score: u32,             // headline 0-100 (after shrinkage and caps)
    pub availability: u32,      // 0-100
    pub speed: u32,             // 0-100
    pub integrity: u32,         // 0-100
    pub market: Option<u32>,    // None = n/a
    pub confidence: u32,        // 0-100
    pub flags: u32,             // bitmask, section 8
    pub window_end: u64,        // unix seconds; the end of the measured window
    pub methodology_version: u32,
    pub inputs_hash: BytesN<32>,// sha256 of the published inputs bundle
    pub published_at: u64,      // ledger timestamp, set by the contract
}
```

New functions:

- `publish_score_card(reporter, anchor_id, card)`, where `card` is a `ScoreCardInput` struct holding `score, availability, speed, integrity, market, confidence, flags, window_end, methodology_version, inputs_hash` (a contract function takes at most 10 arguments): `reporter.require_auth()`; the reporter must be authorized for the **anchor's source type**, read from the registry with `get_anchor_info` (no new admin step); all percentages ≤ 100; `methodology_version ≥ 1`; `window_end` not in the future beyond the existing skew and strictly greater than the previous card's (replay protection). Stores the card (persistent, TTL bumped like the other keys), calls `registry.update_score(anchor_id, score)`, re-evaluates the risk reason with the new headline, publishes `score_card_published` (flat fields: `score`, `confidence`, `flags`, `methodology_version`, `inputs_hash`), and `risk_status_changed` on a transition.
- `get_score_card(anchor_id) -> Option<ScoreCard>`.

Changes to existing behavior:

- `get_score`: the card's score if a card exists, else the stored EMA, else **0** (unscored), never 100.
- `record_report` (`submit_report*`): still updates the EMA and the health record and still publishes `report_submitted`, but the score it publishes and returns is the **headline** (card score if a card exists, else the EMA), and it calls `registry.update_score` **only when the anchor has no card**. This keeps testnet and mock anchors unchanged and removes any flicker between two writers for carded anchors. `ScoreBelowFloor` evaluates against the headline.
- `AnchorRegistry.register_anchor`: initial score is **0** instead of 100. 0 with no report means unscored; consumers must read confidence from the card.

Upgrades use `scripts/upgrade-contracts.sh` (same contract IDs, same state). The dashboard and aggregator must tolerate a contract that has not been upgraded yet (no `get_score_card`), as the dashboard already does for health.

## 13. Off-chain design

**Pure engine**, `services/aggregator/src/scoring/`: `computeCard(inputs) → card` and its helpers (`interp`, `uptimeScore`, `speedScore`, `integrityScore`, `marketScore`, `confidence`, `flags`, `headline`). No I/O, no clock, no randomness. All constants live in one file (`constants.ts`), see section 17.

**Inputs builder**, `services/aggregator/src/scoring/inputs.ts`: reads the last 30 daily probe files (streaming), `status.json`, and the passive-monitor outputs, and returns the aggregate inputs per anchor. First version reads raw JSONL each run; add daily rollups only if a run takes uncomfortably long.

**Publisher**, in `services/aggregator/src/index.ts` after the report loop: for each `RealMainnet` anchor with at least one conclusive probe in 30 days, build inputs, write the inputs bundle, compute the card, and publish when the card differs from the last published one or the last publish is older than 24 hours. `window_end` is the current time floored to the hour. At most 40 publishes per run, oldest first, so a first run or backlog cannot stall the 20-minute round. Last-published state goes in a small JSON state file next to the existing dedup state.

**Inputs bundle**: content-addressed `<sha256>.json` in the evidence directory, schema `anchor-status/score-inputs/v1`, written with the same canonical-JSON scheme as probe evidence (the aggregator gets its own copy of that small module, as `testnet-probe` already does). Contents: `methodology_version`, `anchor_id`, `window_end`, uptime counts for 7 and 30 days, the Speed p95 and its sample count, the integrity check results, coverage, market and flow aggregates with the FX source and rate, `monitored_days`, `n30`, and per-day `{date, n, ok, digest}` for 30 days, where `digest` is the SHA-256 of that day's sorted `timestamp|success|evidence_hash` lines for the anchor.

## 14. Verifiability

- `npm run verify-score -- <bundle sha256 | url | file>` in `services/aggregator`: checks the file hashes to its name, recomputes the card from the bundle with `computeCard`, prints the pillars and headline, and, given `--anchor`, compares with the on-chain `get_score_card`. Optional if cheap: `--logs <dir>` rebuilds the aggregates from a local copy of the probe results and compares them with the bundle.
- The headline is checkable from the on-chain card alone (section 9). The pillars are checkable from the bundle. The bundle's daily digests are checkable against the probe logs, and each probe's own evidence document is checkable with the existing `npm run verify` in `mainnet-probe`.
- Operational note for the collector host: serve the probe results directory read-only beside the evidence directory so daily digests can be checked by outsiders.

## 15. Dashboard

- Read `get_score_card` per anchor. If the call does not exist (older contract) or returns none, fall back to the current display. A `RealMainnet` anchor without a card shows "Not enough data".
- Card: the score and tier as today, plus a confidence chip (Low / Medium / High). Confidence below 40 withholds the number; flag chips are still shown.
- Detail modal: four pillar bars (Market shows "n/a" with the reason: "this anchor does not issue the asset", "no fiat reference", or "no liquid market"), the confidence factors (days monitored, checks in 30 days, test depth), active flags in plain language, the methodology version, "on-chain since", and a link to the inputs bundle.
- Flag copy, without em dashes: OUTAGE "Outage: last 3 checks failed"; LOW_UPTIME "Uptime under 90% this week"; SEP10_MISMATCH "Sign-in challenge not signed by the published key"; DEPEG "Asset more than 3% off its peg for over 24 hours"; ONE_WAY_FLOW "Assets issued but none redeemed in 14 days"; SILENT "No issuance or redemption in 30 days"; LOW_COVERAGE "Only partly testable: declines anonymous wallets"; NO_MARKET "No liquid market to measure a peg".
- Update the landing page method section and `dashboard/README.md` to describe the pillars. Show only measured values; never a placeholder that looks like data.
- The chart needs no change: `report_submitted.new_score` carries the headline, so the history stays one continuous series.

## 16. Gaming and failure modes

| Risk | Mitigation |
| --- | --- |
| Volume inflation by wash payments | Volume is not scored. |
| Anchor recognizes the probe and serves it specially (our User-Agent and SEP-10 client identity are public) | Fresh random wallet per probe, randomized start offsets. Real transfers (section 18) and multiple vantage points close it. |
| Thin-market price manipulation | Depth threshold before a sample counts; median of order book and AMM; the DEPEG gate needs 24 hours. |
| Numeraire USD asset depegs | Documented assumption; the numeraire is one constant. |
| Capital-controlled currencies (official vs market rate) | Persistence requirement; rate source published; limitation stated. |
| Blaming an anchor for a third party's asset | Issuer rule (section 3). |
| Our own outage recorded as theirs | Existing inconclusive handling stays. |
| Single reporter key | Known; multi-reporter quorum is roadmap M4. A deterministic engine over public inputs makes quorum straightforward: reporters must produce the same card. |
| Machine learning | Not needed. Classical statistics (rolling windows, percentiles, shrinkage toward a prior) do the job. A future use is offline calibration of weights once there are months of data and real-transfer labels, publishing fixed weights. There is no model at runtime. |

## 17. Tunable constants

All in `services/aggregator/src/scoring/constants.ts`, each with a comment saying why. Changing any of them means a new `methodology_version`.

| Constant | Value |
| --- | --- |
| `METHODOLOGY_VERSION` | 1 |
| Weights (permille) A / S / I / M | 450 / 200 / 200 / 150 |
| Prior | 50 |
| Uptime curve | (100,100) (99.5,100) (99,90) (97,75) (95,60) (90,35) (80,10) (0,0) |
| Availability blend | 0.5 · u7 + 0.5 · u30 |
| Speed breakpoints | 100 at ≤ 0.75s, 40 at ≥ 5.0s (p95 of per-probe mean stage time) |
| Integrity weights | toml_valid 1, toml_cors 1, sep10_signed 3, info_valid 1, tls_ok 1, signing_key_stable 2, issuer_home_domain_matches 3 |
| TLS minimum days left | 14 |
| Confidence | time 14 days, samples 100, depth 0.5 + 0.5 · coverage |
| Confidence bands | < 40 insufficient, < 70 low, < 90 medium, else high |
| Gate caps | OUTAGE 50, LOW_UPTIME 60, SEP10_MISMATCH 40, DEPEG 50, ONE_WAY_FLOW 70 |
| LOW_UPTIME | `n7 ≥ 20` and `u7 < 90%` |
| DEPEG | run over 300 bps for more than 24h |
| ONE_WAY_FLOW | `mint_count_14d ≥ 5` and `burn_count_14d = 0` |
| LOW_COVERAGE | `coverage < 0.6` |
| Market curve | (0,100) (25,100) (50,90) (100,70) (200,45) (300,25) (500,0) |
| Market penalties | −20 if `share_outside_50 > 0.25`; −20 if `longest_run_gt100_hours > 6` |
| Market sample | min depth 500 USD within 1% slippage; order book spread under 5% |
| Numeraire USD asset | one constant (verify the issuer against Circle and StellarExpert before use) |
| `MAX_CARDS_PER_RUN` | 40 |

Calibration task: after two weeks of real data, run a one-off report of the distribution of the Speed metric, uptime and Market deviation across anchors, and adjust the breakpoints so that the score separates healthy anchors from each other. Ship the adjusted constants as methodology version 1 if before launch, otherwise as version 2.

## 18. Roadmap beyond v1

- **Completion pillar (before public launch).** A real mainnet transfer (deposit and withdrawal through the anchor's SEP-24 flow) is the only ground truth for "does the money arrive". It becomes the dominant pillar, for example Completion 40 / Availability 25 / Integrity 15 / Speed 10 / Market 10, and the confidence `depth` factor counts completed transfers. The card format, `methodology_version` and verifier stay; only the weights and one pillar change.
- **Multiple reporters (M4).** Several independent reporters compute the same card from the same public inputs; a card counts when a quorum agrees.
- **Anchor disputes (M2).** Because every number traces to a published input, an anchor can point to the exact probe or sample it contests.
- **Pillar history.** v1 keeps only the latest card's pillars. Archive `score_card_published` events if pillar trends become useful.

## 19. Implementation notes (methodology version 1)

Where the implementation had to choose, or departs from the text above.

**Contract.**
- `publish_score_card` takes the card as one `ScoreCardInput` struct: Soroban caps a function at 10 arguments (`ScSpecFunctionV0.inputs` is `VecM<_, 10>`).
- The score floor (`ScoreBelowFloor`) is not judged while the anchor's card has a confidence under 40. That number is withheld (section 7); an anchor we know little about sits near the prior of 50, which is below the floor of 55 and would otherwise read as "at risk" for want of data. The outage and success-rate rules still apply.
- New errors: `InvalidScoreCard` (7), `StaleScoreCard` (8, a `window_end` not after the stored card's), `AnchorNotFound` (9).
- The **score of record** (what `AnchorRegistry` holds and `get_score` returns) is the card's score only when its confidence is at least 40, and **0** otherwise, like an anchor never scored. Anyone reading the registry alone would otherwise take a number the card itself says not to show (a dead anchor with a confidence of 3 would read 49). `get_verdict(anchor_id)` returns the score of record together with the confidence, the flags, whether it is withheld, and the card's own score. `score_card_published` and `report_submitted` still carry the card's own score, as the data behind the history.

**Integrity.**
- `issuer_home_domain_matches` applies SEP-1's two-way link to every listed asset with an issuer. An asset the anchor issues passes when its issuer's `home_domain` is the anchor's domain. An asset issued by someone else (USDC, say) passes when the issuer's own home domain lists it in its toml. It fails when the issuer does not exist, names no home domain, or its home domain's toml is reachable and does not list it. When that toml cannot be read at all, the asset is left out of the check: Circle's USDC issuer names `circle.com`, which serves no stellar.toml, and section 3 says an anchor is not blamed for a third party's asset. Read literally ("every listed asset's issuer points at the anchor"), the check would fail every anchor that lists USDC, which contradicts section 3 and example 5.
- A check a probe never recorded (log lines from before `checks` existed) is n/a, not a pass. For those lines the signing key is read back from their evidence documents, so `signing_key_stable` covers them.

**Pillars and flags.**
- An anchor that issues several fiat assets: Market is the weakest asset's score; DEPEG and ONE_WAY_FLOW are set if any asset trips them; SILENT only if none of its issued assets moved in 30 days.
- Market is n/a with reason `not_issuer` when the anchor issues nothing, `no_fiat_reference` when it issues only non-fiat assets or no reference rate exists, and `no_market` when no sample was usable. NO_MARKET is set only for `no_market`.
- LOW_COVERAGE is set only for a measured coverage. The 0.5 used when coverage is unknown is not a finding about the anchor.
- With no probe in the last 7 days, the 30-day uptime stands for both halves of Availability.
- Percentiles are nearest-rank. A run's length is the time from its first to its last sample.

**Market sampling.** The numeraire is Circle's USDC (`GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`, checked against Circle's published addresses, StellarExpert and the Centre toml). The order book counts when both sides exist, the spread is under 5%, and the weaker side holds at least $500 within 1% of the mid (a bid's amount is in USDC, an ask's in the asset). The AMM pool counts when moving its price 1% either way takes at least $500 of USDC (`reserve·(√1.01−1)` up, `reserve·(1−√0.99)` down). Reference rates come from fawazahmed0/exchange-api, falling back to ExchangeRate-API's open endpoint; a rate over two days old is not used.

**One operator, several domains.** Two tracked domains whose tomls name the same transfer server and the same `SIGNING_KEY` are one operator (anclap.com and api.anclap.com). One is canonical: the one measured every round, else the one found first, else the shorter domain; a pairing once made is kept. The others carry `alias_of` in the status file: they stay listed and registered with their history, are checked every few hours only to notice if they diverge, and get no reports and no card of their own, so one anchor is not counted twice.

**Context.** "On-chain since" is the issuer account's creation time from StellarExpert: SDF's Horizon keeps about a year of history, so its first-operation query returns wherever its history starts.

**Published files.** Besides the bundles, the aggregator writes `score-summary.json` (for each published card: its bundle hash, monitored days, checks in 30 days, coverage, and why Market is n/a), so the dashboard can show the confidence factors from one file. The dashboard uses it only when the hash matches the on-chain card.

**Observed on the first run (19 September 2026), for calibration.** Only one day of probes with the new fields existed, so every card's confidence was under 40 and every number was withheld; that is expected and resolves within days. None of the 28 issued fiat assets had a usable market: order-book spreads of 120-200% and near-zero depth, the best being ZARZ (40 bps off its peg with a 0.3% spread, but $225 of depth). The $500 depth threshold and the single USDC numeraire (several of these assets trade against XLM, not USDC) are the first constants to revisit.
