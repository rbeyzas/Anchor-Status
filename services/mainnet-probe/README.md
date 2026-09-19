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
live or not. Every domain already tracked is rechecked too, so an anchor no
directory lists (one admitted by application) keeps its `last_seen_live`
fresh. With `--daily`, discovery skips if it ran in the last 24 hours.

## Applications — `npm run onboard` and `npm run intake`

An operator can apply on the dashboard's `/apply` page with nothing but a
domain. Each round, `onboard` checks up to `ONBOARDING_MAX_PER_RUN` (5)
applications, oldest first, and adds the ones that qualify to the anchor
list; `register` right after puts them on-chain and the probe measures them
from then on. Nothing else changes for an admitted anchor.

| Check | Passes when |
|---|---|
| Public domain | every address it resolves to is public (the collector holds keys: a name pointing into a private network is never fetched) |
| stellar.toml | fetched and parsed |
| Transfer server | `TRANSFER_SERVER_SEP0024` or `TRANSFER_SERVER` is advertised |
| Live check | the same probe every anchor gets passes (a policy decline counts as up) |
| Issuer age | its oldest own issuer account is `ONBOARDING_MIN_AGE_DAYS` (7) days old or more |
| Payments | its own assets have `ONBOARDING_MIN_TRANSFERS` (100) payments or more on the network, as StellarExpert counts them |

The last two apply only to an anchor that issues its own asset (the issuer's
`home_domain` points back at it); one that only distributes someone else's
asset, USDC for instance, is admitted on the first four. Payments are
StellarExpert's per-asset count, not the issuer's own mints and burns:
anchors mint in batches to a distribution account and serve customers from
there, so issuer-level counts are tiny (CLPX: 9, against 530,674 payments).

A domain or transfer server already tracked is reported as already
measured. A failure on our side (network, Horizon, StellarExpert) decides
nothing and is retried next round, up to `ONBOARDING_MAX_ATTEMPTS` (6). A
rejected domain can apply again 24 hours after its check.

`npm run onboard -- --dry-run --domain example.com` checks one domain and
prints every result without writing anything.

**Files** (under `ONBOARDING_DIR`, default `output/onboarding`):
`submissions.jsonl`, appended to by the intake only, and `onboarding.json`,
written by `onboard` only and published as-is (every application and its
checks are public; no client address is stored anywhere).

**Intake** (`npm run intake`) is the collector's one always-on,
internet-facing process: a small HTTP server on loopback, behind nginx,
that appends applications to `submissions.jsonl`. It loads no `.env` and
holds no key, refuses to start without `ONBOARDING_INTAKE_TOKEN` (32+
characters, shared with the dashboard's `/api/onboarding` proxy, which is
the only caller), and limits body size (2 KB), requests per client
(`ONBOARDING_PER_CLIENT_PER_HOUR`, 10, by the address the proxy passes on)
and unchecked applications (`ONBOARDING_MAX_PENDING`, 50).
`ONBOARDING_INTAKE_PORT` defaults to 8787.

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
- The npm scripts run with `UV_THREADPOOL_SIZE=64`. Node resolves names on
  libuv's thread pool, 4 threads by default, and the dead domains' lookups
  can each hold a thread for 10 s or more. With the whole list due at once
  (every 6 hours, when the dormant anchors are), healthy anchors' lookups
  queued behind them past `fetch`'s 10 s connect timeout and were recorded
  as outages: 24 anchors that answer instantly on their own, CLPX and
  MoneyGram among them, failed in one such round. With 64 threads the
  median lookup in that round fell from 14 s to 0.2 s, and the only
  failures left were anchors that really are down.

`settlement_seconds` is the time the anchor's API took. Transaction volume
plays no part in the score.

Each result also records what the score card needs
([`docs/SCORING.md`](../../docs/SCORING.md)):

- `stages_expected`: the stages the anchor's own toml says a full check
  reaches: `toml` and `info` always, `challenge` and `token` when it
  publishes `WEB_AUTH_ENDPOINT` and `SIGNING_KEY`, `initiate` when it offers
  SEP-24 deposits. Completed stages over these is how deep we could test,
  which feeds the card's confidence.
- `checks`: raw integrity observations. `toml_valid`, `toml_cors` (the
  toml's `Access-Control-Allow-Origin`), `sep10_advertised`,
  `sep10_signature_valid` (true or false only when a challenge came back,
  so a wrong key is told apart from an HTTP failure), `info_valid` (at
  least one enabled asset), `tls_ok` and `tls_days_left` (a separate TLS
  connection, not counted in `settlement_seconds`; fails under 14 days),
  and `signing_key`. The scorer decides pass, fail or n/a.

The toml's `[[CURRENCIES]]` are checked against their issuers: Horizon's
`home_domain` of each issuer account, cached for a day in `issuers.json`
beside the status file. An asset whose issuer points back at the anchor is
one it **issues**; that is what the Market pillar and the flow signals apply
to. For an asset issued by someone else (USDC, say), the issuer's own
domain's toml must list it; if that toml cannot be read at all (Circle's
circle.com serves none), the asset is left unjudged rather than counted
against the anchor. "On-chain since" is the issuer account's creation time
from StellarExpert, because SDF's Horizon keeps only about a year of
history.

Two domains whose tomls name the same transfer server and the same
`SIGNING_KEY` are one operator (anclap.com and api.anclap.com). One stays
canonical and the others get `alias_of` in the status file: they are kept
on the list, checked every few hours to notice if they ever diverge, and
not reported or scored on their own (see `src/aliases.ts`).

After each run the latest verdict per anchor — its directory label, whether
it is dormant, the stage and error of its last failure, its listed assets
with the issuer check, its operator and any alias — is written to `status.json`
(`MAINNET_STATUS_PATH`). The collector serves it next to the history
archive and the dashboard shows it on each card.

Results are appended, one JSON line per anchor, to
`results/probe-YYYY-MM-DD.jsonl` (`MAINNET_PROBE_RESULTS_DIR`). Nothing is
rewritten; `aggregator` reads the last three days for reports and the last
30 for score cards.

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
