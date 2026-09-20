# dashboard

Next.js (App Router) + TypeScript + Tailwind CSS + recharts. Reads
`AnchorRegistry` and `PerformanceOracle` state over testnet Soroban RPC
and visualizes it (read-only — never signs a transaction).

- 4 filters at the top: All / Live mainnet / Live testnet / Simulated.
- Each anchor is a card: name, source badge, the score with a sparkline
  and a confidence chip (Low / Medium / High), the oracle's trend and risk
  reason, and the score card's flags ("Outage: last 3 checks failed",
  "Only partly testable: declines anonymous wallets", ...).
- Clicking a card opens the score card (see below), the score-history
  chart and the health summary (recent success rate, failure streak,
  number of checks). Slashes from the previous oracle version are marked
  as legacy.
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
([`docs/SCORING.md`](../docs/SCORING.md)), by the same engine; only the
reference mock anchors keep the per-report score.

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
Registrations listed in `lib/delisted.ts` are not shown; the registry
cannot remove an entry, so a wrong one is hidden there with its reason.

If the public RPC fails, the page falls back to `SOROBAN_RPC_FALLBACK_URL`
(server-side only; ours is an Alchemy URL with its key), with at most 8
requests in flight. If no RPC answers, the page says so and shows no
scores. There is no demo data.

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
