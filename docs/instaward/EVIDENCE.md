# Evidence log

What was done for each SOW item, and where to check it. Newest week first.
Testnet transactions link to stellar.expert; commits are on `main`.

Contracts (testnet):
- AnchorRegistry `CBQGNUIX5ZDQOE6VBDHTF3SSWSCNMYK37ES5CBYUTQAED7NLZOFEE4AB`
- PerformanceOracle `CBDDBO5YU3MERDJ7LFA5RIXFORW5HI3NKMK67TG5TPO5QT64M5GUWGWU`

## Week 3 (2–8 Nov)

### 3.1–3.2 Operator claims and disputes (D3) — 20 Oct
- `contracts/anchor-registry`: `set_signing_key` (PerformanceOracle only),
  `get_signing_key`, `claim_message`, `claim_anchor`, `get_claim`. The
  claim message is the XDR of a `ClaimMessage` naming the network id, this
  registry, the anchor, the new operator and a per-anchor nonce, so a
  signature works for exactly one claim; `claim_anchor` checks it with
  `ed25519_verify` against the attested SIGNING_KEY and refuses while the
  record holds a stake. Events `signing_key_attested`, `anchor_claimed`;
  error `NoSigningKey` (#23). Tests: 38 + the upgrade test (8 new).
- `contracts/performance-oracle`: `attest_signing_key` (a reporter's reading
  of the anchor's stellar.toml; the scores' quorum makes it final and sends
  it to the registry), `open_dispute` (only the claimed operator, one per
  card, `min_stake` checked and never moved, cooldown after a rejection),
  `vote_dispute` (the scores' threshold upholds or rejects), `get_dispute`,
  `set_dispute_config` / `get_dispute_config` (default 10 XLM, 7 days).
  `get_verdict` sets `FLAG_DISPUTED` (bit 17, 131072) while a dispute is
  open or upheld; upheld withholds the score (0, also in the registry); a
  newer final card supersedes an open dispute. Events
  `signing_key_attestation`, `dispute_opened`, `dispute_voted`,
  `dispute_resolved`, `dispute_config_set`; errors #17, #23–#29. Tests: 87
  (10 new).
- `services/aggregator/src/d3.ts`: `npm run d3 -- attest | claim |
  dispute-open | dispute-vote | show`. `attest` reads the anchor's
  stellar.toml itself on the reporter's own server.
- Wasm: registry `e62e6e25…085a`, oracle `42a8d332…fa88`.
- Rehearsal on fresh IDs, `scripts/rehearse-d3.sh` (registry
  [`CBHPRX6T…7PJK`](https://stellar.expert/explorer/testnet/contract/CBHPRX6TS2VF5XZ5LWLEMO4CFYILZYZWUJH4LDLOYYDTNJ2IKW6A7PJK),
  oracle
  [`CDAP43LL…PJK27`](https://stellar.expert/explorer/testnet/contract/CDAP43LLXFODAODDQY4XND2BWJTOQ3TPPVYRLDRDQURQYH5CI6OPJK27),
  both deployed with the live code and upgraded the live way):

| Step | Result | Transaction |
| --- | --- | --- |
| Registry and oracle upgraded to the D3 wasm | propose/execute each | [`8fc65e59`](https://stellar.expert/explorer/testnet/tx/8fc65e599ffa27dbc8121d366f25b22ced887c0d8033aaa7e2ef3475959655b3), [`883c0d26`](https://stellar.expert/explorer/testnet/tx/883c0d2696ca9415e6386bd795b312d0833ae54ca8fd2a72cd2c9de3f3a852cc), [`90c715ce`](https://stellar.expert/explorer/testnet/tx/90c715ce9c3153acb0d2322759740abc7067af66157bf522d9c5adc6950ba39f), [`3e97e489`](https://stellar.expert/explorer/testnet/tx/3e97e4897a84f366825b164a20d76ec1dd8ce2332370b85fac1f117f35a6662d) |
| Two reporters read ref1.monarank.xyz's stellar.toml (`npm run d3 -- attest`) | `GBA7U6K6…JXAB` in the registry after the second | [`9189618f`](https://stellar.expert/explorer/testnet/tx/9189618fccd45d594216320c1497c38e3ef82adc0fa248269ab690c0905793ca), [`02a98e0f`](https://stellar.expert/explorer/testnet/tx/02a98e0f40eb93e55e3dcec2283b6d7277982772e0863be214cf0396d0f1d3ee) |
| Test anchor claimed with a wrong key | refused: `Error(Crypto, InvalidInput)` from `ed25519_verify` | |
| Claimed with its SIGNING_KEY (`npm run d3 -- claim`) | operator `GBUDCR2W…LHXM3` | [`08e6aa95`](https://stellar.expert/explorer/testnet/tx/08e6aa9566539beaad1d5e9107f344b7c2a66a175ccdd7d14a4a6eabaa97aea5) |
| A stranger opens a dispute | refused: #17 `NotTheClaimedOperator` | |
| Dispute opened | verdict flags 131072, not withheld | [`e4b2d271`](https://stellar.expert/explorer/testnet/tx/e4b2d271f1947f8862794c00c39f1602eaa89eeae36fbb9f09958f134d37bceb) |
| Two uphold votes | Upheld: verdict score 0, withheld, flags 131072; registry score 0 | [`b28b4f4d`](https://stellar.expert/explorer/testnet/tx/b28b4f4da9c617e50a56e6ba39c5eb18353a2b3b5551cbe01b6984c1adc267e4), [`239e6bd4`](https://stellar.expert/explorer/testnet/tx/239e6bd44b93f971fe8c2f89a2a1f3c961f5e8758aac87e90b6f85cba60ad04a) |
| Next card disputed, two reject votes | Rejected | [`e3705f0a`](https://stellar.expert/explorer/testnet/tx/e3705f0a841f597366aec42eaf91ef687ed65275211da64d4833c7c05b67a148), [`918b60bc`](https://stellar.expert/explorer/testnet/tx/918b60bcba390408cd9fd492fdd3d4b7d9c6a55f21ad29cb7472be66f8f7f394), [`c5e3d633`](https://stellar.expert/explorer/testnet/tx/c5e3d6331fb39c9240e4d350aeb0e2072cc7c42b52e6a496153d72bd41ff8f03) |
| A dispute inside the cooldown | refused: #24 `DisputeCoolingDown` | |
| Dispute opened after the cooldown, then a newer card | Superseded; verdict score 76, no flag | [`2cdc2044`](https://stellar.expert/explorer/testnet/tx/2cdc20441a64228228a62aa1c617ee2741ea7597f62551fa34540f4bfc7d5793), [`b1fc43e2`](https://stellar.expert/explorer/testnet/tx/b1fc43e2c8187ce564a5c1601676cf587adc316c4b7a64712e0f1e2e23fafe79), [`d8a29dcb`](https://stellar.expert/explorer/testnet/tx/d8a29dcbd27b548984c96a952a9cea7dea83c2f0898ef1d33eb5e5b1affd092c) |

### 3.4 Multisig admin account, live (D2) — 24 Oct
- [`GBLHN3SL…JO2F`](https://stellar.expert/explorer/testnet/account/GBLHN3SLZUV245KXQNCL5I6RWJ6RT3EMKHKLJNOIU77XU2WW5X2MJO2F):
  three signers of weight 1, each key generated on its holder's own
  machine and only its public key shared: `GBC4GADS…VMWG`,
  `GBKL5WL2…HI7`, and the offline backup `GBIJOL2I…UDPO`. Master weight 0,
  thresholds low 1 / medium 2 / high 2: any two of the three act for it,
  and its own key can sign nothing.

| Step | Transaction |
| --- | --- |
| Signers added | [`6ffea7cf`](https://stellar.expert/explorer/testnet/tx/6ffea7cf3ddc1cacaca7f95772bae0c03794850d9335b3faff6cece0bd3ed05a), [`c51578f0`](https://stellar.expert/explorer/testnet/tx/c51578f04f7bf2231b89aaec32b56b646b9c75d6852e8e994dd6825845fb6839), [`2f3e517f`](https://stellar.expert/explorer/testnet/tx/2f3e517fcfd9bd11de14c6e985fd4681a42d0c29ea584cb6763f0d1ac0fbc039) |
| Master weight 0, thresholds 1/2/2 | [`9e1c693d`](https://stellar.expert/explorer/testnet/tx/9e1c693db3f803d7f16897d57449addaf6784fdc6e1a0b4360347a764ed8e3ab) |
| `propose_admin(multisig)` on the registry and the oracle, by the one-key admin `GARNK5UJ…`; nothing changes until the multisig accepts | [`270990ef`](https://stellar.expert/explorer/testnet/tx/270990efae4f25d1961dda3d980f947bbd22f9bbc2e72874a6f35f741a32ad6d), [`b0af4f9b`](https://stellar.expert/explorer/testnet/tx/b0af4f9bb9bbfc9d906e72ceec5ac677a5305b011dff13644d9274d4a2c88203) |
| `accept_admin`, signed by two of the three through /panel's queue | (pending) |

### 3.4–3.5 Multisig admin, rehearsal (D2) — 24 Oct
- `scripts/rehearse-multisig.sh`: the live code under fresh IDs (registry
  [`CB5DOHTN…UTT6`](https://stellar.expert/explorer/testnet/contract/CB5DOHTNMRZOMXUAO3FBCP7FARHLVGGHY5XITOYVCIHXR6PXI55GUTT6),
  oracle
  [`CAUXDSJU…K5RE`](https://stellar.expert/explorer/testnet/contract/CAUXDSJUX76BOGZYFOKRTADG7XWX2SWUSLYNCSTOZTKLIH263BCQK5RE)),
  handed to a 2-of-3 multisig account
  [`GBEDW7I4…HVLV`](https://stellar.expert/explorer/testnet/account/GBEDW7I4NGRJNOQGTX6MWUBVWH3K7KAMN5XVYOTP5C4F7HO3R3KFHVLV)
  with throwaway keys. The multisig signs through
  `scripts/upgrade-contracts.sh`'s unsigned-transaction files, each signer
  adding a signature in turn. The live handover repeats it with the real
  three keys.

| Step | Result | Transaction |
| --- | --- | --- |
| Multisig account: three signers of weight 1, then master weight 0 and thresholds 1/2/2 | on the ledger: low 1, medium 2, high 2; master 0 | [`906147c9`](https://stellar.expert/explorer/testnet/tx/906147c9ac5d0cd3ed9691a22f454e0498d6e2228981a2b915c9dc64cf30fe5f), [`c48024d8`](https://stellar.expert/explorer/testnet/tx/c48024d85d7ef933733beea69a0f31f7b9b971b99ee82d858478abf4bbd458e8), [`503b940d`](https://stellar.expert/explorer/testnet/tx/503b940dd41d193a5d1410fb40be7fb038f46a988db46660e9f94e7f75611bcf), [`14c2710a`](https://stellar.expert/explorer/testnet/tx/14c2710a6490c1c9fedd5d117956461fd23df4d2092059a73381002f65d14ff0) |
| `propose_admin(multisig)` by the one-key admin, both contracts | pending admin set | [`30c105fb`](https://stellar.expert/explorer/testnet/tx/30c105fbcd42211f50e8cd2a85c364fbf80b63dff51ec915a013a59cc7e2ee85), [`0c97952c`](https://stellar.expert/explorer/testnet/tx/0c97952c97755d88229ffa8823794d2be19fbdac13db694c31608ebec3a0519b) |
| `accept_admin` with one signature | rejected on submission, `OpBadAuth` (under the medium threshold); never on the ledger | |
| `accept_admin` with two signatures | `get_admin` = the multisig, both contracts | [`01ca56ec`](https://stellar.expert/explorer/testnet/tx/01ca56ec9293f8df5bb887196f27973867e6518a38e753e0a800d2141615d476), [`08e7da5c`](https://stellar.expert/explorer/testnet/tx/08e7da5c4330bdaec768e0143e1d02c148d5a6e8c37a7caa41fd8cccceddaeb4) |
| The old admin calls `propose_admin` | refused: the contract asks for the multisig's authorization, which the old key cannot give | |
| `propose_upgrade` through `upgrade-contracts.sh`, signed by k2 and k3 (the offline backup) | accepted, both contracts | [`8d339552`](https://stellar.expert/explorer/testnet/tx/8d33955289759b675178fa29c00c5f9a733cc6aae1a0b9595a8572c79d2a9f33), [`74fdf905`](https://stellar.expert/explorer/testnet/tx/74fdf905b56f9dccf354b86a61ba4e2605c96988b274a7f78547b784edd8cda4) |
| `execute_upgrade` after the 60-second delay, signed by k3 and k1 | executed, both contracts | [`b4a093a3`](https://stellar.expert/explorer/testnet/tx/b4a093a3776c11ef436886e0463e641d3b4ce14fd92af619d796fdbcd5f2aaf8), [`d3ddae1d`](https://stellar.expert/explorer/testnet/tx/d3ddae1d8a71771d42220378c25e23e6bb4ab43079aa90041979d8f3e87a875d) |

### 3.3 Property tests and fuzzing (D1, D2) — 20 Oct
- **Proptest, quorum** (`contracts/performance-oracle/src/proptests.rs`,
  10,000 cases each): the lower median is a submitted value with at most
  half the values on either side; a flag holds exactly when more than half
  the reporters raise it; a round's final card is its field-wise median,
  its spread, `FLAG_REPORTER_DISAGREEMENT` exactly when the spread exceeds
  `max_spread`, exactly the reporters further than that as outliers, the
  market rule, and the median reporter's bundle; the order of arrival
  changes no number. `cargo test proptests`: 4 passed, 40,000 rounds.
- **Proptest, paged index** (`contracts/anchor-registry/src/proptests.rs`,
  1,000 random sequences of up to 40 registrations and removals, any page
  size 1–100): after every step the count matches a model and the pages
  hold each registered anchor exactly once, with no gap and nothing
  removed. Passed.
- **cargo-fuzz** (`contracts/performance-oracle/fuzz`, target
  `publish_sequence`): random sequences of up to 64 cards, single reports
  and unauthorized attempts against a real registry and oracle pair, 1 to 5
  reporters, any threshold, checked against a model after every step: (1)
  the registry's score is always the final card's score of record, (2) the
  card changes only when `threshold` distinct authorized reporters submitted
  the same window, and then to their lower median; every call also succeeds
  or fails exactly as the model says. Run on 20 Oct, 18:25–19:25 UTC:
  **606,544 sequences in 3,601 s, no failure**, 1,473 new inputs kept.
  `cargo +nightly fuzz run --sanitizer none publish_sequence -- -max_total_time=3600 -max_len=2048`
  (on macOS with `RUSTFLAGS="-Clink-arg=-Wl,-undefined,dynamic_lookup"`).

### 4.3 verify-score for quorum cards (D1) — 20 Oct
- `npm run verify-score -- --quorum <anchor_id>` reads the anchor's
  `Quorum(id)` record and card from the ledger, finds each reporter's
  evidence URL in MonaRank's stellar.toml (`[[MONA_REPORTERS]]`), fetches
  and hashes every reporter's bundle, recomputes each reporter's card, and
  rebuilds the final card the way the oracle does
  (`services/aggregator/src/scoring/quorum-verify.ts`). Run on the live
  cards of moneygram, ref1_monarank_xyz_testnet and stellar_test_anchor
  (one reporter each while the threshold is 1): "on-chain card matches the
  median of its reporters' bundles exactly".

### 3.9 Mainnet runbook and security self-assessment (D2) — 20 Oct
- [`docs/MAINNET_RUNBOOK.md`](../MAINNET_RUNBOOK.md): prerequisites, the
  pinned build and its check, the mainnet configuration profile (7-day
  delay, 2-of-3 multisig admin, quorum settings), deploy steps, resource
  costs measured from simulation, checks after deploy, upgrades and
  rollback.
- [`docs/SECURITY.md`](../SECURITY.md): the contracts reviewed against a
  Soroban security checklist (authorization, governance, upgrade safety,
  quorum, replay, input validation, growth, storage expiry, arithmetic,
  funds, cross-contract calls, time, transparency, disputes), with the code
  that handles each risk and what remains.

### 3.6 The 24-hour time lock, live (D2) — 20–23 Oct
- Both live contracts were told about the D3 code a day ahead; the wasm
  uploaded from a local build hashed exactly as rehearsed.

| Step | Result | Transaction |
| --- | --- | --- |
| Registry `propose_upgrade(e62e6e25…)` | executable from 2026-10-21 13:16:02 UTC | [`dc1af239`](https://stellar.expert/explorer/testnet/tx/dc1af23956e7c9d8babcbe829c13721c1ea5be6075bdb3938df2f48b3584f34a) |
| Oracle `propose_upgrade(42a8d332…)` | executable from 2026-10-21 13:16:07 UTC | [`7edca4ee`](https://stellar.expert/explorer/testnet/tx/7edca4ee71f405f7d54f0b7ff54cb7c16871c4d93a4a4a3ac726de5bf860aa21) |
| `execute_upgrade` at once, both contracts | refused in simulation, nothing sent: `HostError: Error(Contract, #21)` = `TimelockActive` | |
| Registry `execute_upgrade` (23 Oct, 11:44:37 UTC) | live wasm now `e62e6e25…`; anchor count (106), every page and the sampled records equal before and after; no pending upgrade | [`a3dfef49`](https://stellar.expert/explorer/testnet/tx/a3dfef49902d957b0a19f79c80bdedb6af72c33d704acccb85cf41174ee1e88b) |
| Oracle `execute_upgrade` (23 Oct, 11:45:07 UTC) | live wasm now `42a8d332…`; verdicts, quorum config, admins and delays equal before and after; dispute config at its default (10 XLM, 7 days) | [`8bead7a6`](https://stellar.expert/explorer/testnet/tx/8bead7a6f7385f6c930693c3fffc23d894d8e3b3429e5ed5126a7c121e105ed0) |

- The collector's next round on A (11:47–11:49 UTC) wrote to the upgraded
  oracle without a failed transaction (reporter `GDLWUVYW…`, e.g.
  [`7cf81093`](https://stellar.expert/explorer/testnet/tx/7cf810935a8b6b2a58cbd2856a4f535b912aebc7095f5b67d9f7f95bb1ac59c8)).
- Before executing, a clean local build (Rust 1.98.0, stellar-cli 28.0.0)
  of `main` hashed exactly as the two proposals.

Then, on the live contracts, ref1.monarank.xyz's SIGNING_KEY was read and
attested from each server's own reporter key (`npm run d3 -- attest
ref1_monarank_xyz_testnet`, under the collector lock). With the threshold
still 1, the first reading already sets the key; the second repeats it.

| Step | Result | Transaction |
| --- | --- | --- |
| A (`GBWXKNZB…`) attests `GBA7U6K6…JXAB` | 1 reporter agrees; the registry's `get_signing_key` now `41fa795e…a674` (= `GBA7U6K6…JXAB`) | [`16a1fa0a`](https://stellar.expert/explorer/testnet/tx/16a1fa0a9e5cc0792c930d226547010aea279f4d7e7bcc9ae04d55bb012c0b38) |
| B (`GBN2RFNK…`) attests the same key | same key | [`c489d677`](https://stellar.expert/explorer/testnet/tx/c489d6773b1f676719a38a49cba4d34b7d4d3921a70d8c72c53ba6cdae5fb0f6) |
| ref1 claimed (24 Oct, `npm run d3 -- claim`, with the signature made off-chain by the SIGNING_KEY's holder over the live `claim_message`, checked against it before sending) | `get_claim`: operator `GCYU7PVT…SO7U6O`, signing key `41fa795e…a674`; the record's operator moved from the admin `GARNK5UJ…` to it | [`772ce2d2`](https://stellar.expert/explorer/testnet/tx/772ce2d267da353e14ab287bf7913656be0a6897ae6efaf8757b968f4a783ff8) |

## Week 2 (26 Oct–1 Nov)

### Reproducible contract builds (D2) — 18 Oct
- `rust-toolchain.toml` pins Rust 1.98.0 (it said `stable`); with
  stellar-cli 28.0.0, the versions the deployed wasm records in its own
  metadata (`rsver`, `cliver`), a clean checkout of `main` at `a308bd3`,
  built on a second machine in another directory, gives exactly the live
  bytes: registry `4a79942d…f8a6`, oracle `38f0a314…dcfc`. Anyone can check
  that the contracts on-chain are the code in this repository.

### Time-lock error named as in the SOW (D2) — 18 Oct
- The registry's not-yet-due `execute_upgrade` error is now `TimelockActive`
  (code #21 unchanged; it was `UpgradeNotReady`). New registry wasm
  `a56c131ba7c899eea47b97c7da1b9d0a80cdd4fb1dafc04fdaf8532634e445b7`. The
  CLI shows the code: `Error(Contract, #21)` is `TimelockActive` in
  `contracts/anchor-registry/src/errors.rs`.

### Rehearsal on fresh testnet IDs (shared) — 18 Oct
- `scripts/rehearse-upgrade.sh registry <wasm>`: a throwaway admin funded by
  Friendbot (`GDNDH5BW…4PCD`); the wasm both live contracts run, fetched
  from the chain, deployed as registry
  [`CDCTZDZP…3ZHT`](https://stellar.expert/explorer/testnet/contract/CDCTZDZPRO6WNXMYU3BGSCMQUJYYRZMJZNMUEOAGGF45LB6ZHTAZ3ZHT)
  and oracle
  [`CBJLXNIK…7CWJ`](https://stellar.expert/explorer/testnet/contract/CBJLXNIKNLNDBX4FYVLVALRHKDKPU2WPQCUZFQYKSZCINSYHSWNQ7CWJ);
  all 106 live anchors copied in; one report so a score exists; then the
  upgrade to `a56c131b…` the live registry will get.

| Step | Result | Transaction |
| --- | --- | --- |
| Registry and oracle initialised, linked like the live pair | | [`1e322a6a`](https://stellar.expert/explorer/testnet/tx/1e322a6a91a75c1b3beae40631caec6b9f042ae174e8dd3eead238fedbb8113d), [`7d1b41c8`](https://stellar.expert/explorer/testnet/tx/7d1b41c8a4d8bf199516e10d896f828a21ff8b2293a50d8d420a9652979b9b05) |
| Report for moneygram (oracle → registry) | score 100 | [`42aadaab`](https://stellar.expert/explorer/testnet/tx/42aadaabd0de763334210fdb5227fd94a42a6096294920716e89f153787360f0) |
| `propose_upgrade(a56c131b…)` | delay 0 | [`9e6b20c5`](https://stellar.expert/explorer/testnet/tx/9e6b20c5283c095f80650c1b86054232cd8c5d8af2a35da250b909b31ddc561d) |
| `execute_upgrade` | 106 anchors, every page, sampled records and the score equal before and after | [`a4479a73`](https://stellar.expert/explorer/testnet/tx/a4479a735244dda62d419b190fabe930f25e779c67ad6c28b8b05033b7184b94) |
| `set_upgrade_delay(60)` | | [`4f7f959f`](https://stellar.expert/explorer/testnet/tx/4f7f959f1e4a751de23e9b57fb479b086471ec5a44f2ff3d3bbf4688b05023d5) |
| `propose_upgrade` (16:57:02 UTC) | | [`0ecda5f3`](https://stellar.expert/explorer/testnet/tx/0ecda5f30abe28ba30f1af44ee3e0e709faa4a7c4b448a5ae5801c2c666a82b5) |
| `execute_upgrade` at once | refused in simulation: `Error(Contract, #21)` = `TimelockActive`; nothing sent | |
| `execute_upgrade` after the delay (16:58:27 UTC) | succeeds | [`6e77053f`](https://stellar.expert/explorer/testnet/tx/6e77053fc1211167acc2f62c64a552c3bf9a4278f598451d29694588d260b20d) |
| `set_upgrade_delay(0)` | | [`eff77c6b`](https://stellar.expert/explorer/testnet/tx/eff77c6bb4954a6442dd93d745a26629e5ecba13b78ce8bb050b0bbe2f14e0ae) |

### Live registry upgrade and 24-hour time lock (D2) — 18 Oct
- The same steps on the live registry, from a local checkout with the
  pinned toolchain: the uploaded wasm hashed `a56c131b…` as in the
  rehearsal, and the anchor count (106), every page and three sampled
  records were identical before and after.

| Step | Result | Transaction |
| --- | --- | --- |
| `propose_upgrade(a56c131b…)` | delay was 0 | [`3366b0fb`](https://stellar.expert/explorer/testnet/tx/3366b0fbb8f68bb4c3c954af31b433d282534ba52496f552360fd578f94b02d3) |
| `execute_upgrade` | live wasm now `a56c131b…` | [`0803c74e`](https://stellar.expert/explorer/testnet/tx/0803c74e2b2e3bc9313165326e97db4006a1a857d179c9bdc4c973f249a1cf14) |
| `set_upgrade_delay(86400)` | every later registry upgrade waits 24 hours | [`cc5e92d9`](https://stellar.expert/explorer/testnet/tx/cc5e92d922ab9e624ef50bae20dfcc00665df166e851d63f30f85a7bd175c1f9) |

### 2.3 Oracle governance and events (D2) — 18 Oct
- `contracts/performance-oracle`: the registry's governance, same code and
  rules (`propose_admin`/`accept_admin`, `propose_upgrade`/
  `execute_upgrade`/`cancel_upgrade`, `set_upgrade_delay` with the same
  grow-at-once, shrink-after-waiting rule, `get_pending_upgrade`,
  `get_upgrade_delay`, `get_admin`). The instant `upgrade()` is removed.
  Error codes 18–22 equal the registry's, so `#21` is `TimelockActive` in
  both. New events: `initialized`, `reporter_authorized`, and the
  governance ones (`admin_proposed`, `admin_changed`, `upgrade_delay_set`,
  `upgrade_proposed`, `upgrade_executed`, `upgrade_cancelled`).
  Tests: 56 (`cargo test`), 6 of them new. Wasm `01c20f90…e61be`.
- Rehearsal on fresh IDs (registry
  [`CCA3GUAF…FK4K`](https://stellar.expert/explorer/testnet/contract/CCA3GUAF6JZ2BHOEFCQYCBETRGFACSZMFGR5DZHRQ2MDLUZLMU4CFK4K),
  oracle
  [`CAD7LUK7…LGZ3`](https://stellar.expert/explorer/testnet/contract/CAD7LUK7KUSUMXPXZFB7TKJSEBCTIUC4DXP4DFRWQMV6DISLXHITLGZ3),
  10 anchors): instant upgrade
  [`cb74ff95`](https://stellar.expert/explorer/testnet/tx/cb74ff958486ccc8e63420400bf2b88f1570a8bfc6a73ce44c226c470453869c),
  state equal before and after, a report after it accepted
  [`39f91d92`](https://stellar.expert/explorer/testnet/tx/39f91d9293423f40e32dfe65b54e08bef72bc47c32319785837c0a309681942b);
  then the new time lock: delay 60 s
  [`db3b2823`](https://stellar.expert/explorer/testnet/tx/db3b2823ca8e5ac7e2c27e3d389a09df5c5fd8945e975938c5ac0e33507295fc),
  propose
  [`b14b5770`](https://stellar.expert/explorer/testnet/tx/b14b5770a2cdaaaa4f776edbef2267813788d1fe63bb191876cc974ea190e2d1),
  execute at once refused with `Error(Contract, #21)`, execute after 60 s
  [`2d279b20`](https://stellar.expert/explorer/testnet/tx/2d279b208d6bff93db737a22a806cf1a15901e5a40c5890c8018f07a01a6fced).
- Live: the oracle's last instant `upgrade(01c20f90…)`
  [`faacbcfd`](https://stellar.expert/explorer/testnet/tx/faacbcfd6fe2f23173170e212fbef6415891f54f359f1ee7274c7d1203fefbd3).
  Four sampled cards and the mainnet reporter's authorization identical
  before and after. The delay stays 0 until the quorum upgrade (2.1–2.2)
  is live, then goes to 24 hours like the registry's.

### 2.1–2.2 Reporter quorum in PerformanceOracle (D1) — 18 Oct
- Code: `contracts/performance-oracle/src/quorum.rs` (field-wise lower
  median, majority flags, spread, outliers) and `publish_score_card` in
  `src/lib.rs`. A card joins the anchor's `Round(id)` (temporary storage)
  for its window; when `threshold` distinct authorized reporters have
  submitted, the median card becomes `Card(id)`, `Quorum(id)` records who
  agreed with what, and the registry is updated. Until then nothing about
  the anchor changes. Rules: windows aligned to `round_seconds`
  (`MisalignedWindow`, #11), one card per reporter per round
  (`DuplicateSubmission`, #12), one methodology version per round
  (`MethodologyMismatch`, #13), a newer window replaces an unfinished
  round, an older or already-final window is `StaleScoreCard`; a spread
  over `max_spread` sets `FLAG_REPORTER_DISAGREEMENT` (bit 16, 65536) and
  names the reporters further than that from the median. With a threshold
  over 1, `submit_report` still counts observations but moves neither the
  registry's score nor the risk flag. Up to 7 reporters per source type;
  `revoke_reporter`; a lower threshold waits out the upgrade delay.
  Functions: `set_quorum_config`, `get_quorum_config`, `revoke_reporter`,
  `get_reporters`, `get_pending_round`, `get_quorum_info`. Events:
  `score_card_submitted`, `quorum_reached`, `reporter_outlier`,
  `reporter_revoked`, `quorum_config_set`. Without a `QuorumCfg` the
  threshold is 1 and every card is final at once, as before.
- Tests: 77 in `cargo test` (21 new for the quorum). Wasm `fbbfc2b2…3d3a`.
- Rehearsal on fresh IDs (registry
  [`CCKFTSZH…YPBE`](https://stellar.expert/explorer/testnet/contract/CCKFTSZHSGABPEPT4G5G5LFDV4CBRLMPEX3DKXYPQJK63TEYK66CYPBE),
  oracle
  [`CDG5MCPB…BBIJ`](https://stellar.expert/explorer/testnet/contract/CDG5MCPBIHWGDQSBSJZWK46YD3D57RZFOJLZY376WBP3TGCIAQQ4BBIJ)):
  upgrade from the live oracle code through the new time lock (propose
  [`0809a134`](https://stellar.expert/explorer/testnet/tx/0809a134e0063ce5f47797d884223bfc21f9a85d52c31fd5c62688102ae8b020),
  execute
  [`9cc9aa4f`](https://stellar.expert/explorer/testnet/tx/9cc9aa4fa4e4fe19d0e8f5a4d1761fa9dfe8d79aaf52f7c1017e5d0bb6c3c587)),
  state equal before and after; then a quorum round on testnet with two
  reporter keys:

| Step | Result | Transaction |
| --- | --- | --- |
| `set_quorum_config(2, 10, 3600)` | | [`c98cf128`](https://stellar.expert/explorer/testnet/tx/c98cf12819e919477d40946bbcd949b77321753fb895625330f15cbeab2f50eb) |
| Reporter A's card, score 74 | pending: `get_pending_round` shows 1 card; no card, registry unchanged | [`38fda242`](https://stellar.expert/explorer/testnet/tx/38fda2424bf02b63d2d8f5133ddd9ea8290c8a7e6a04c11a96f540ebbbe5bbdf) |
| Reporter B's card, score 95 | final card 74 (lower median), spread 21 > 10: flags 65536 (`FLAG_REPORTER_DISAGREEMENT`), B named in `reporter_outlier`; events `score_card_submitted`, `quorum_reached`, `reporter_outlier`, `score_card_published`; fee 0.98 XLM, most of it first-time storage rent | [`1eb53946`](https://stellar.expert/explorer/testnet/tx/1eb53946715ec896c6f7111da8c21d8f771d1a9f19530a50ed56422afad073a6) |

- Live, through the oracle's new time lock (delay 0 until quorum is on):
  propose
  [`2d79d9ae`](https://stellar.expert/explorer/testnet/tx/2d79d9aece4b01d37d174389698d2eb6b57a852e22373eb7776889e23bff5714),
  execute
  [`75310e9a`](https://stellar.expert/explorer/testnet/tx/75310e9af4a486202abbc9d0bb3322ec6c90c3203a85224a0c7bfe6ec8510751).
  Four sampled cards identical before and after; `get_quorum_config` is the
  default (threshold 1), so the collector's cards stay final at once until
  the aggregator publishes on round boundaries (2.4) and B's keys are in
  (2.7).

### 2.4 Aggregator on round windows (D1) — 18 Oct
- `services/aggregator`: a card's window ends on the oracle's round
  boundary, read from `get_quorum_config` (hourly while it has none), so
  every reporter scores the same window; with a threshold over 1 every
  anchor is sent once per round; `AGGREGATOR_CARDS_ONLY=true` (server B)
  sends no single reports; "round already final", "already submitted",
  "not registered" and "deactivated" (#8, #12, #9, #10) are logged, not
  counted as failures. Tests: `npm test` (91). Deployed to both servers;
  the first round on A: 28 reports, 0 failed, `quorum 1, no rounds`.

### 2.7 Second reporter, key rotation, shadow mode (D1) — 18–20 Oct
- Shadow mode since 18 Oct: both servers compute every card each round and
  keep it in `/var/lib/anchor-status/shadow-cards.jsonl` without sending it
  (with a threshold of 1, B's cards would race A's on-chain).
  `npm run shadow -- compare a.jsonl b.jsonl` measures the score gap per
  anchor and window; it sets `max_spread` before the quorum goes on. B's
  file is public: http://95.169.201.61/shadow-cards.jsonl.
- Server B's own reporter keys, generated on B and never copied off it,
  authorized for each source type; B runs `AGGREGATOR_CARDS_ONLY=true` and
  stays `SECONDARY_PUBLISH=false` until the quorum is on. B serves its
  evidence at http://95.169.201.61/evidence/ (`scripts/nginx/secondary.conf`).
- Server A's reporter keys rotated: new keys generated on A and authorized,
  swapped into A's `.env` under the collector lock, one round checked (18
  reports, all signed by the new keys per Horizon, none by the old ones
  since the swap), then the old keys and the retired mock reporter revoked.
  `get_reporters` now lists exactly A's and B's key for each network.
- `stellar.toml` lists every account in `ACCOUNTS` and each reporter server
  with its keys and evidence URL in `MONA_REPORTERS`.

| Step | Transaction |
| --- | --- |
| B mainnet reporter `GC3ODFHC…2OX5` authorized | [`1a869492`](https://stellar.expert/explorer/testnet/tx/1a86949228d3e02754e58a826525e890975ddd7d0d0472c5c2f325be7fc6e15d) |
| B testnet reporter `GBN2RFNK…J2RB` authorized | [`1c4753a0`](https://stellar.expert/explorer/testnet/tx/1c4753a0bed7b3829a61b8701a3de7f1677b28ba5cf667a4aa6d434a5f83ade7) |
| A's new mainnet reporter `GDLWUVYW…X54H` authorized | [`7745167e`](https://stellar.expert/explorer/testnet/tx/7745167e4fdffe61b0f3a90278ee6f2fa482e5b0e336c7dff7b396876bfa74b4) |
| A's new testnet reporter `GBWXKNZB…MHPQG` authorized | [`17ab3f24`](https://stellar.expert/explorer/testnet/tx/17ab3f24018a212507e543de1aab0737793a42dd1a5ac34f92410068a6cf4de3) |
| A's old mainnet reporter `GCFY6PRM…LTAJ` revoked | [`17c2a5cb`](https://stellar.expert/explorer/testnet/tx/17c2a5cba4ae63a8fe26f135b1429b96ca0c8eec77d4ff030dd3b7ad2398e8cc) |
| A's old testnet reporter `GA4F2BIC…YWCC` revoked | [`fcdd690d`](https://stellar.expert/explorer/testnet/tx/fcdd690debf18a9a3ac7e57fc234e5220282102b111d069824e073ce86cfabb4) |
| Retired mock reporter `GDK2XJTC…S7JE` revoked | [`ef1ef5e5`](https://stellar.expert/explorer/testnet/tx/ef1ef5e589c48ee70b86943e2950d46aa908ad9b986d951ae0e770d9b97218b1) |
| Oracle `set_upgrade_delay(86400)`: oracle upgrades and a lower quorum threshold now wait 24 hours | [`33ef5791`](https://stellar.expert/explorer/testnet/tx/33ef579191ae9e8b7a395da31c7d45d89c15512663fabee96ccc80ffcc0d358a) |

## Week 1 (19–25 Oct)

### 1.1 Live wasm kept as fixtures (D2) — 18 Oct
- `contracts/fixtures/anchor_registry_live.wasm`, sha256 `9b8a9ab8…7868`, and
  `performance_oracle_live.wasm`, sha256 `0929e468…bde2`, each equal to the
  wasm hash in the contract's on-chain instance before the upgrade below.
  See `contracts/fixtures/README.md`. Commit `d435d62`.

### 1.2–1.6 Registry: paged index, lifecycle, governance, events (D2) — 18 Oct
- Code: commit `fa14b98`. Tests: `stellar contract build && cargo test` in
  `contracts/anchor-registry` (30 unit tests, plus `tests/upgrade.rs`), and
  `cargo test` in `contracts/performance-oracle` (51).
- `tests/upgrade.rs` starts from the live wasm, registers 120 anchors,
  upgrades, migrates in batches of 25 (52 ledger writes and ~11.5M
  instructions per batch, against testnet's 200 writes and 400M
  instructions per transaction), checks every id and record, then runs a
  time-locked second upgrade.
- Live upgrade, 18 Oct (collector paused for its duration):

| Step | Result | Transaction |
| --- | --- | --- |
| Registry wasm uploaded | sha256 `4a79942d56fcdd92432fdc9cd7aaffae505154db5c7b62291eb8993269fef8a6`, ledger 5260254 | |
| Registry upgraded (old instant `upgrade`, its last use) | `anchor_count` 110, admin unchanged, delay 0 | [`22283054…`](https://stellar.expert/explorer/testnet/tx/222830542a9944731796e4dad8ee773d5f9a44f0bf322bca06a5cb8695351e15) |
| `migrate_anchor_index(90)` | 20 left | [`888f3ddf…`](https://stellar.expert/explorer/testnet/tx/888f3ddfb7a13aecae30742656c2d4b13750854e628d921fb6a8ae21cb2c950c) |
| `migrate_anchor_index(90)` | 0 left | [`a173a9e5…`](https://stellar.expert/explorer/testnet/tx/a173a9e5552c01b79f79f19a7fb397e5aef0b20823a1c545b5e8b748003c8168) |
| `finalize_migration` | 110 ids in the paged index, same order as `AnchorIds` | [`233919ab…`](https://stellar.expert/explorer/testnet/tx/233919ab5abcb3df911824c74ee4f4ac02fd9a5542d51a9f65a9251d530dedc0) |
| Oracle wasm uploaded | sha256 `38f0a314c24b443f9e162c9187b364228e94615d66f2d9011fc4dfc2690fdcfc`, ledger 5260335 | |
| Oracle upgraded | moneygram score 82 and its card kept | [`66cdef2a…`](https://stellar.expert/explorer/testnet/tx/66cdef2ad93454af6f6d1e9ea2523dbca0b84a790e0a0243946394cdac148b8f) |
| `tr_mock_anchor_fly_dev` deactivated (testnet anchor registered on mainnet by mistake, stake 0) | | [`152b2a48…`](https://stellar.expert/explorer/testnet/tx/152b2a48085eac7506eb70adcdca7703c7307c455a9c9b4f44fd501006e8fad4) |
| …and removed; `tr_mock_anchor_fly_dev_testnet` stays active | 109 anchors | [`51592cce…`](https://stellar.expert/explorer/testnet/tx/51592cce5f0ba81d6382d41f8eb76aee30a9c706a032fec43aabcc13c1b73679) |
| `mock_anchor_1`–`4` (retired simulated anchors, stake 0) deactivated and removed | 105 anchors, all unique | deactivate/remove: [`34dbf222`](https://stellar.expert/explorer/testnet/tx/34dbf222d65e9db2051e1861282e8f158f57cd1d997e23ee21b33497ff25bf9a)/[`bee1f213`](https://stellar.expert/explorer/testnet/tx/bee1f2135026121f321c9eeff721961784122868e7371fd625683b5c72760d64), [`8cdd21e6`](https://stellar.expert/explorer/testnet/tx/8cdd21e65acde754764c06f75fdddb669609c95285a153af703112ff260e008d)/[`c3b08b1d`](https://stellar.expert/explorer/testnet/tx/c3b08b1d98101362e09fe7b78eb6262a26dfd91a04f93196bb48db347495f1da), [`1cc90a92`](https://stellar.expert/explorer/testnet/tx/1cc90a9294ac7a66a86fd7dea49e03a4d60a887129cde1d6477cfb508f2b0601)/[`ab4ed901`](https://stellar.expert/explorer/testnet/tx/ab4ed9019575ad96226e75907e806d03861a039581f8b4e1b677ab361fac9fb5), [`9dbf4fb7`](https://stellar.expert/explorer/testnet/tx/9dbf4fb754aff5f2657b505c67f6e2d0fe97ce23b950377b8ec94ab2596fcfbf)/[`49ac20e8`](https://stellar.expert/explorer/testnet/tx/49ac20e8ddd71d53783426b94f66ccb96fe5d1567c10c47365281733946a1cff) |

- After: the dashboard read the paged layout (`count 110`, then 105) with
  no unreadable anchor; the first collector round after the upgrade
  (12:20 UTC) submitted 42 reports with 0 failures.

### 1.7 Dashboard reads both registry layouts (D2) — 18 Oct
- Commit `d8aaeca`, on `main` (and so on Vercel) before the upgrade.
  `dashboard/lib/contract-state.test.ts` covers the old layout, the paged
  one, mid-migration (the old list wins) and an empty registry.
- The page-level hide lists went once their entries were off the chain:
  `lib/delisted.ts` (commit `4e8ccce`) and the `SimulatedMock` filter.

### 1.8 stellar.toml at monarank.xyz (D1) — 18 Oct, in part
- `https://monarank.xyz/.well-known/stellar.toml` (HTTP 200,
  `access-control-allow-origin: *`, `text/plain`): `ORG_URL`
  `https://monarank.xyz`, `ORG_NAME` MonaRank, and, as non-SEP-1 keys with
  a comment saying so, `MONA_ANCHOR_REGISTRY`, `MONA_PERFORMANCE_ORACLE`
  and their `MONA_NETWORK_PASSPHRASE` (testnet). Commit `698192f`.
- Still to add: `ACCOUNTS` with A's and B's reporter keys and the multisig
  admin, once those keys are final (D1: `revoke_reporter`, key rotation).

### 1.9 Identifying User-Agent (D1) — 18 Oct
- Every request from mainnet-probe, testnet-probe and passive-monitor,
  including testnet-probe's browser, sends
  `MonaRank-probe/1.0 (+https://monarank.xyz; monarank@protonmail.com)`.
  Commit `8bd01a7`; `src/user-agent.test.ts` in each service. Checked on
  both servers after deploy by capturing a request on a local listener.

### 1.10 Archive (shared, not billed) — 18 Oct
- `history-archiver` keeps every `score_card_published` (score,
  confidence, flags, methodology version, inputs hash), not only the
  latest card the contract holds. Commit `6d765fd`. First run archived
  1,064 cards for 105 anchors, back to 11 Oct (the RPC's 7-day window);
  earlier cards were not backfilled, by decision.
- Off-host copy: A pushes `/var/lib/anchor-status` (559 MB) to B nightly
  into a write-only, no-delete `incoming/`; B keeps 30 dated, hardlinked
  snapshots (a second same-day snapshot added nothing on disk). A's key
  on B was tested: reading, deleting and running a shell are refused.
  `scripts/backup-archive.sh`, commit `d435d62`.

### 1.11 Upgrade scripts (D2) — 18 Oct
- `scripts/upgrade-contracts.sh upload|propose|execute|cancel|status|instant|send`.
  With `ADMIN=G…` and no signing key it writes the unsigned, simulated
  transaction for a multisig admin's signers (`stellar tx sign`, then
  `send`). Checked on testnet without a key: `status` on both contracts,
  and a built `propose_upgrade` (admin source, 1 auth entry, footprint and
  resources set, no signature); a call that would fail leaves no file.

### 1.12 Reference anchor at ref1.monarank.xyz (D3) — 18 Oct
- A small anchor of our own (SEP-1, SEP-10, SEP-6, test asset `MONAREF`)
  instead of the mock anchors the plan named: those had no public
  stellar.toml or score cards, and their framework (django-polaris 2.5,
  Python stellar-sdk 10) is out of date. `services/reference-anchor`,
  commit `5f1f6be`; its tests drive it with testnet-probe's own parsers.
- New keys and accounts (setup tx
  [`5938b8fd…`](https://stellar.expert/explorer/testnet/tx/5938b8fd953e2eb9b40e456e12c20056b4258bcefe44b8813f1f4119cc6e21ad)):
  issuer `GBQ75MJZ…TYS3` with `home_domain` `ref1.monarank.xyz`,
  distribution `GAUCNOG6…73OY` (in the toml's `ACCOUNTS`), `SIGNING_KEY`
  `GBA7U6K6JNTVEATZNJOT66O6P2W6NLUYQI25JOA6MRM2GHTI26THJXAB`. The issuer's
  secret is kept off the server.
- Served from fly.io (`monarank-ref1`, always on), `ref1` CNAME to
  `monarank-ref1.fly.dev`, certificate issued; stellar.toml answers 200
  with `access-control-allow-origin: *`.
- Admitted through the ordinary testnet application: the onboarding check
  ran the full money flow (SEP-10, deposit paid out and verified on the
  ledger, withdrawal paid and completed) and registered it as
  `ref1_monarank_xyz_testnet` (`RealTestnet`, active). Its first probe
  rounds succeeded (26.0 s and 36.1 s), and their reports are on-chain.

## Week 0 (16–18 Oct)

| # | Item | Evidence |
| --- | --- | --- |
| 0.1 | Server B | Frankfurt (MVPS LTD); A is in Ankara (Web9): another provider and region. SSH by key; collector cron in `/etc/cron.d/anchor-status`. |
| 0.2 | B measures only | `COLLECTOR_ROLE=secondary`, `SECONDARY_PUBLISH=false`: the aggregator is skipped every round, so B writes nothing on-chain. Its anchor list comes from the on-chain registry (`sync-from-chain`). ~17 new evidence documents per 20-minute round in `/var/lib/anchor-status/evidence` on B. |
| 0.3 | Leaked testnet keys | The only committed secrets were the mock anchors' issuer keys and Django key. On 17 Oct each issuer account was merged into a fresh one (`account_merge`: [`d1c409e1`](https://stellar.expert/explorer/testnet/tx/d1c409e1c45c17d2a64dc54d013ae8ba7e2ef6a5e04b1aea3428898511a9e0ec), [`de2e3bb2`](https://stellar.expert/explorer/testnet/tx/de2e3bb2a8738bb9461e7e996c6afe4cf45196c19918aa8478fab7fece77a57f), [`41885971`](https://stellar.expert/explorer/testnet/tx/41885971561503893bcf63b8fdd386c93fb7b48c4a50b136904703d1a9b6abce), [`8e20dc7e`](https://stellar.expert/explorer/testnet/tx/8e20dc7eb505779b8196ae50f752bd6f1b9187b84c99ddccc97f49b6666f662e)) and the Django key replaced, so the leaked accounts no longer exist on testnet or mainnet (Horizon 404). The mock service is gone too, so nothing can be signed with them. Reporter keys were never committed; they are rotated with `revoke_reporter` (D1). |
| 0.4 | Apex domain | `curl -sI https://monarank.xyz/.well-known/stellar.toml`: HTTP/2 200, `access-control-allow-origin: *`, no redirect. |
| 0.5 | Evidence log | This file. |
