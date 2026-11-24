# dashboard

Next.js (App Router) + TypeScript + Tailwind CSS + recharts. Reads
`AnchorRegistry` and `PerformanceOracle` state over testnet Soroban RPC
and visualizes it. The public pages are read-only; only `/panel` builds
transactions, and each one is signed in the visitor's own wallet.

- 3 filters at the top: All / Live mainnet / Live testnet.
- Each anchor is a card: name, source badge, the score with a sparkline
  and a confidence chip (Low / Medium / High), the oracle's trend and risk
  reason, and the score card's flags ("Outage: last 3 checks failed",
  "Only partly testable: declines anonymous wallets", ...).
- Clicking a card opens the score card (see below), the score-history
  chart and the health summary (recent success rate, failure streak,
  number of checks). Slashes from the previous oracle version are marked
  as legacy.
- **Reporter quorum.** The detail view has a "Reporters" panel: how many
  reporters the card needed, each reporter's address and score, and the
  spread between them (`get_quorum_info`). While a round has fewer cards
  than the threshold, the card in the list shows "Pending k/K"
  (`get_pending_round`).
- **Disputes.** A card whose current score card is disputed shows the
  dispute's state (open, upheld, rejected) on the list and in the detail
  view, with the votes, the reason code and the evidence hash. An upheld
  dispute shows the score as withheld, never as a number. An anchor the
  admin deactivated on-chain is greyed out with its reason.
- **Visual direction**: a dark-first "console" (the Mona design
  system): flat `surface-0` ground, `as-panel` cards with a 1px ring,
  one accent (`signal` green) for live readings and primary actions,
  `pulse` blue for on-chain references and focus rings, Space Grotesk for
  text and Geist Mono for every number (via `next/font/google`). Tokens
  are the `--as-*` custom properties in `app/globals.css` (dark by
  default, light kept), exposed to Tailwind as `as-*` colors, radii and
  shadows; `StatusChip`, `ScoreValue` (arc that draws in as its numeral
  counts up) and `Radar` (home hero ambience only) are the shared pieces.
- Home page, every figure from live data (`lib/home.ts`): a ticker of the
  latest checks, the chain's own counts (anchors, reports, cards, last
  publish), one real check drawn step by step with its timings, the top
  score card recomputed in four steps (shown only when the recomputation
  lands exactly on the on-chain score), and the chain from that check's
  evidence hash to the card. Whatever cannot be drawn from real data falls
  back to text; nothing is filled in.
- `/apply` (mainnet) and `/apply/testnet`: an anchor operator applies with
  a domain. Two pages, two queues, two published files: mainnet is checked
  read-only, testnet with a real money flow whose ledger transactions are
  linked from each step.

## Score cards

Mainnet and testnet anchors are both scored by a windowed score card
([`docs/SCORING.md`](../docs/SCORING.md)), by the same engine.

- The number is shown only when the card's **confidence** is at least 40.
  Below that the card says "Not enough data yet", and the flags are still
  shown. A measured anchor without a published card says the same. The page
  never shows a placeholder that looks like a score.
- The detail view shows the four pillars as bars (Availability, Speed,
  Integrity, Market; Market reads "n/a" with its reason: the anchor does
  not issue the assets it lists, no fiat reference rate, or no liquid
  market), the confidence factors (days monitored, checks in 30 days, test
  depth), the active flags in plain language, the methodology version,
  "on-chain since" for an issuing anchor (context only: age is not
  scored), and a link to the inputs bundle with the command to recompute
  it.
- Averages and "top anchors" count only scores the page shows.

Flag copy, pillar labels and the confidence bands live in `lib/scorecard.ts`.

## Data layer

`lib/soroban.ts::getDashboardData()` reads the chain directly, in a handful
of calls rather than two per anchor:

1. The `AnchorRegistry` instance entry, for the list of anchor ids.
2. Every anchor's `AnchorInfo`, `AnchorHealth` and `ScoreCard` ledger
   entries in batches of up to 200 keys (`getLedgerEntries`). An entry
   whose TTL ran out is reported as archived, not as current data.
3. Score history from `report_submitted` events over the public RPC's
   7-day retention, scanned in parallel ranges of 10,000 ledgers
   (`getEvents` scans about that many per call and returns an empty page
   with a cursor when it finds nothing).

Three server-side fetches enrich it, all from the collector host over
plain HTTP (so never from the browser): the history archive
(`HISTORY_ARCHIVE_URL`), each anchor's latest probe verdict and listed
assets (`ANCHOR_STATUS_URL`), and the score cards' confidence factors
(`score-summary.json` beside it, or `SCORE_SUMMARY_URL`). The factors are
attached only when they describe the very bundle the on-chain card names.
Each is optional: without it the page still renders from the chain.

If the public RPC fails, the page falls back to `SOROBAN_RPC_FALLBACK_URL`
(server-side only; ours is an Alchemy URL with its key), with at most 8
requests in flight. If no RPC answers, the page says so and shows no
scores. There is no demo data.

## Panel

`/panel` is for the two parties who can act on the contracts, each with a
connected wallet. What the page shows depends on what the connected
address is on-chain.

- **An anchor's operator** (the address `get_claim` names): the anchor's
  current card, its stake, a form to add stake or take it back, and a form
  to dispute the current card. The evidence text stays with the collector;
  only its SHA-256 goes on-chain. A timeline follows the dispute: opened,
  admins decide, reporters vote, result. "Claim another anchor" walks
  through `claim_message` and `claim_anchor`.
- **An admin signer** (a signer of the contracts' multisig admin account):
  the open disputes with both reporters' cards for the disputed window and
  a recommendation, buttons to sign "uphold" or "reject", and a queue of
  contract changes waiting for a second signature. A decision on a dispute
  is a signed message, not a transaction: once enough signers agree, the
  reporter servers check the signatures and vote that way on-chain in their
  next round.

The queue and the dispute decisions go through `/api/admin-queue` and
`/api/disputes` to the collector; nothing is decided in the browser.

## Applications

`/apply` posts to `/api/onboarding` and `/apply/testnet` to
`/api/onboarding/testnet`: each validates the domain and forwards it,
server-side, to that network's queue on the collector's intake, with a
shared token and the caller's address (for the intake's per-client limit;
never stored). The pages read the collector's public `onboarding.json` and
`onboarding-testnet.json`; nothing about an application is decided here.
The checks: `services/mainnet-probe/README.md` (mainnet, read-only) and
`services/testnet-probe/README.md` (testnet: the same read-only checks,
then a real money flow).

## Setup and running

```bash
npm install
npm run dev          # auto-loads the root .env (via dotenv-cli)
npm run build        # production build
npm test             # network-free unit tests
npm run typecheck
```

For live data, the root `.env` needs `NEXT_PUBLIC_SOROBAN_RPC_URL`,
`NEXT_PUBLIC_NETWORK_PASSPHRASE`, `NEXT_PUBLIC_ANCHOR_REGISTRY_CONTRACT_ID`
and `NEXT_PUBLIC_PERFORMANCE_ORACLE_CONTRACT_ID`. Optional, server-side:
`SOROBAN_RPC_FALLBACK_URL`, `HISTORY_ARCHIVE_URL`, `ANCHOR_STATUS_URL`,
`SCORE_SUMMARY_URL`, and `NEXT_PUBLIC_EVIDENCE_BASE_URL` for the evidence
links. Applications need `ONBOARDING_INTAKE_URL` and
`ONBOARDING_INTAKE_TOKEN` (server-side; without them `/apply` says
applications are not open yet; the testnet route uses the same intake at
`…/testnet`, or `ONBOARDING_TESTNET_INTAKE_URL`), and read
`onboarding.json` and `onboarding-testnet.json` beside `ANCHOR_STATUS_URL`
(or `ONBOARDING_STATUS_URL` / `ONBOARDING_TESTNET_STATUS_URL`).
