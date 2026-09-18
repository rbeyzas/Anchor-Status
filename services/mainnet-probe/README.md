# mainnet-probe

Finds every live SEP-6/24 anchor on Stellar mainnet and checks, every round,
whether its public API actually works for a wallet — without moving funds.

## Discovery — `npm run discover`

Nothing is left out for being broken, abandoned or flagged: every anchor is
tracked and labeled, so the dashboard can show what the directory claims
next to what we measured. (They disagree: cowrie.exchange and nTokens are
listed as abandoned/discontinued, yet their SEP-6 APIs still answer.)

1. Collects the issuer home domains of StellarExpert's 2,000 top-rated
   assets, **and** every domain in its anchor-tagged directory, with the
   directory's flags: `abandoned` (name says abandoned, discontinued,
   defunct…) or `unsafe` (tagged unsafe/malicious).
2. A domain from the directory or our own registry is always tracked. A
   rated-asset domain is tracked only once its `stellar.toml` advertises
   `TRANSFER_SERVER_SEP0024` or `TRANSFER_SERVER` and its `/info` returns a
   JSON object — single-page web apps answer any path with an HTML 200,
   which is not an anchor.
3. Collapses domains that share one transfer server into one operator.
4. Merges the result into the anchor list. **Anchors are only ever added.**
   One that stops answering stays on the list; otherwise its outage would
   never be measured and its score would freeze.

Mainnet anchors in `contracts/registered-anchors.json` are always tracked,
live or not. With `--daily`, discovery skips if it ran in the last 24 hours.

## Registration — `npm run register`

Registers every tracked anchor the on-chain `AnchorRegistry` doesn't know
yet; the oracle rejects reports for unregistered anchors.

## Probe — `npm run probe`

Each anchor runs as its own job, with its own timeout, up to 12 at a time; a
hung anchor can't hold up the round. An anchor not seen answering for a week
is **dormant**: still probed, but every 6 hours instead of every round, so
~85 dead directory entries don't turn each round into 85 failing
transactions.

| Stage | What happens | Required |
| --- | --- | --- |
| `toml` | Fetch `stellar.toml`; it must still advertise a SEP-6/24 server | yes |
| `info` | `GET /info` on the transfer server returns JSON | yes |
| `challenge` | `GET` a SEP-10 challenge and verify the anchor's `SIGNING_KEY` signed it | if SEP-10 is advertised (always for SEP-24) |
| `token` | Sign the challenge with a throwaway key and exchange it for a JWT | extended |
| `initiate` | Start a SEP-24 interactive deposit — then abandon it | extended |

- A 5xx, no answer, or a missing endpoint (404/410) at any stage is an
  **outage**.
- A request the anchor understands and declines (400/401/403/429) ends the
  probe as a **success** marked `policy`: the anchor is up, it just won't
  serve an anonymous wallet past that point. MoneyGram, for example, answers
  `client_domain is required`.
- If our own network looks down (Horizon unreachable, or every anchor fails
  without an HTTP answer), failures are marked `inconclusive` and never
  submitted — our outage must not be recorded as theirs.

`settlement_seconds` is the time the anchor's API took. Transaction volume
plays no part in the score.

After each run the latest verdict per anchor — its directory label, whether
it is dormant, and the stage and error of its last failure — is written to
`status.json` (`MAINNET_STATUS_PATH`). The collector serves it next to the
history archive and the dashboard shows it on each card.

Results are appended, one JSON line per anchor, to
`results/probe-YYYY-MM-DD.jsonl` (`MAINNET_PROBE_RESULTS_DIR`). Nothing is
rewritten; `aggregator` reads the last three days.

## Evidence — `npm run verify -- <sha256>`

Every conclusive probe (mainnet and testnet) publishes an evidence document
named by its own SHA-256, and that hash goes on-chain in the
`report_submitted` event (`submit_report_with_evidence`). The claim and its
proof are tied together, and nobody has to trust the reporter:

| Check | Against |
| --- | --- |
| The document matches the on-chain hash | the bytes themselves |
| The anchor signed the SEP-10 challenge | the anchor's own `SIGNING_KEY` |
| The signature dates from the check | the challenge's time bounds |
| The challenge was issued to the probe's throwaway account | the challenge's source account |
| The anchor still publishes that key | its live `stellar.toml` |
| The anchor paid the probe (testnet deposits) | the ledger — a classic payment or a Stellar Asset Contract transfer |

`npm run verify -- <hash>` runs all of them; documents are served at
`http://37.221.76.23/evidence/<hash>.json` (`EVIDENCE_BASE_URL`). A mainnet
probe moves no funds, so it has no payout to check — the anchor-signed
challenge is what proves its API answered.

Tests: `npm test` (network-free; a fake anchor issues real SEP-10 challenges).
