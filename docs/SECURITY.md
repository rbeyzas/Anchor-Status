# Security self-assessment

AnchorRegistry and PerformanceOracle, as deployed on Stellar testnet in
October 2026, reviewed by the team against a Soroban smart-contract security
checklist. This is a self-assessment, not an audit: an external audit is
planned before mainnet ([`MAINNET_RUNBOOK.md`](MAINNET_RUNBOOK.md)).

Code: `contracts/anchor-registry`, `contracts/performance-oracle`. Each
row names where the code handles the risk and what remains.

## Checklist

| Area | What could go wrong | How the contracts handle it | Residual risk |
| --- | --- | --- | --- |
| **Authorization** | A state change by someone who should not make it | Every state-changing function calls `require_auth` on the party it acts for: the admin (`require_admin`), the anchor's operator (`stake`, `request_withdrawal`, `withdraw_stake`, `claim_anchor`, `open_dispute`), the reporter (`submit_report`, `publish_score_card`, `attest_signing_key`, `vote_dispute`), or the oracle contract itself (`update_score`, `set_signing_key`, which accept the oracle as direct invoker only). Tests clear the mocked auths and expect a refusal (`*_require_the_admin`, `only_the_oracle_sets_a_signing_key`, `direct_update_score_call_without_being_the_oracle_contract_fails`). | None known. |
| **Admin key and governance** | One key changes code or hands the contract away, unnoticed | Two-step admin transfer (`propose_admin` / `accept_admin`, the new admin signs). No instant upgrade: `propose_upgrade` / `execute_upgrade` with a delay (24 h on testnet, 7 days planned for mainnet); `execute_upgrade` before it fails with `TimelockActive` (#21, same code in both contracts). A longer delay applies at once, a shorter one only after the current delay has passed, so the lock cannot be dropped and an upgrade pushed in one breath; the delay is capped at 30 days so a mistake cannot freeze the contract. Lowering the quorum threshold waits the same delay. Every step emits an event. | The admin is one key until the multisig account (sprint 3.4); after that, 2 of 3 signers. |
| **Upgrade safety** | An upgrade corrupts stored data | Storage keys are only appended; existing keys and structs keep their encoding. `tests/upgrade.rs` starts from the wasm the live registry ran and upgrades it with 120 anchors. Every live upgrade is first run on fresh contracts deployed with the live code (`scripts/rehearse-upgrade.sh`, `scripts/rehearse-d3.sh`), and the live state is compared before and after. | A future change that edits an existing struct would need a migration; the review rule is "add keys, never change them". |
| **Single reporter / oracle manipulation** | One reporter key decides every score | A card is final only when `threshold` distinct authorized reporters submitted the same window (`publish_score_card`, `quorum.rs`); the final card is the field-wise lower median, so one reporter cannot move it outside the honest range. A spread over `max_spread` sets `FLAG_REPORTER_DISAGREEMENT` and names the outliers. With a threshold over 1, a single reporter's `submit_report` moves neither the registry's score nor the risk flag. Up to 7 reporters per source type; `revoke_reporter`. | Both reporters are run by the team today (infrastructure-level decentralization); with two reporters a disagreement can be flagged but not attributed. |
| **Replay and signature binding** | A claim signature reused elsewhere | The claim message (`ClaimMessage`, signed by the anchor's SIGNING_KEY) names the network id, this registry's address, the anchor, the new operator and a per-anchor nonce; `ed25519_verify` traps on any mismatch. The nonce survives `remove_anchor`, so an old signature never works for a re-registered id. Tests: wrong key, replay, another network, another operator. | None known. |
| **Who the anchor is** | The registry trusts a SIGNING_KEY the anchor never published | A contract cannot read stellar.toml; each reporter reads it on its own server (`npm run d3 -- attest`) and the key is set only when the scores' quorum agrees. | As strong as the reporters and the anchor's DNS and TLS. |
| **Input validation** | Out-of-range values stored | Percentages ≤ 100, methodology version ≠ 0, card windows not more than 5 minutes in the future, aligned to the round, newer than the stored card; report timestamps within 5 minutes ahead and 2 days back; deactivation reasons ≤ 256 bytes; pages ≤ 100 ids; quorum threshold 1–7, `max_spread` ≤ 100; dispute `min_stake` ≥ 0, cooldown ≤ 30 days. Each has a test. | None known. |
| **Unbounded growth, denial of service** | A growing entry or loop exceeds the transaction limits | The anchor list is a paged persistent index (one entry per anchor) instead of one instance vector read on every call; `list_anchors_page` returns at most 100. A round holds at most 7 cards. Unfinished rounds and attestations live in temporary storage and expire. Measured worst case: 12.2M CPU instructions for a 100-id page, about 3% of testnet's limit ([`MAINNET_RUNBOOK.md`](MAINNET_RUNBOOK.md) section 5). `register_anchor` is open to anyone, but each registration is the caller's own transaction and fee. | Mass registrations would clutter the list (not break it); an admin can deactivate and remove them. |
| **Storage expiry** | An entry is archived and reads fail | Every write extends the entry's TTL (persistent 90 days, instance 30 days); index entries are re-extended on each score update. | An anchor not scored for 90 days would need a restore; the collector scores every anchor far more often. |
| **Arithmetic** | Overflow or underflow | Release builds keep `overflow-checks = true`; ages use `saturating_sub`; scores are bounded u32 values; stake checks compare i128 amounts before any transfer. | None known. |
| **Funds** | Stake moved without the operator, or locked forever | The registry moves the stake token only on the operator's `stake` and `withdraw_stake` (after a 7-day cooldown). No slashing exists. A record with stake cannot be claimed or removed. Disputes check the stake, never move it. | The stake token is fixed at `init`. |
| **Cross-contract calls** | A contract trusts the wrong peer | The oracle's registry address and the registry's oracle address are set once at `init`. The oracle reads the registry with `try_` calls, so an older registry (without a function) is treated safely rather than trapping. Soroban has no reentrancy into a running contract. | None known. |
| **Time** | Decisions on a manipulated clock | Only the ledger timestamp is used (time locks, cooldowns, round alignment); validators bound its drift. | Seconds of drift are irrelevant at these scales (hours and days). |
| **Transparency** | A change no one can see | Every state change emits an event; the registry has none it does not report. Score cards carry the SHA-256 of their inputs bundle, and `verify-score` rebuilds a card (and with `--quorum`, every reporter's part of it) from published evidence. | None known. |
| **Disputes** | The party scored decides its own dispute | Disputes are opened only by the operator the anchor's own key named, at most one per card, with a minimum stake and a cooldown after a rejection; the reporters' quorum decides. | The reporters judge disputes about their own measurement (a conflict of interest); an independent panel is on the roadmap. |

## Testing behind this assessment

- Unit tests: `cargo test` in both crates (registry 38 + the upgrade test,
  oracle 87 at the time of writing).
- Property tests (proptest, `src/proptests.rs`): the quorum's median, flag
  majority, spread, outliers and order independence over 10,000 random
  rounds each; the paged index over 1,000 random register/remove sequences,
  checked after every step.
- Fuzzing (cargo-fuzz, `contracts/performance-oracle/fuzz`): random
  sequences of cards, reports and unauthorized attempts against a real
  registry/oracle pair, checked against a model after every step. Results
  in [`docs/instaward/EVIDENCE.md`](instaward/EVIDENCE.md).
- Testnet rehearsals of every upgrade on fresh contracts, and the live
  upgrades' before/after comparisons, in the same evidence log.

## Known limitations

- Testnet only; no external audit yet.
- Both reporters are run by the team; the admin is one key until the
  multisig account is in place.
- Reporters vote on disputes about their own measurement.
- An anchor's SIGNING_KEY is only as trustworthy as the reporters who read
  it and the anchor's own DNS and TLS.
