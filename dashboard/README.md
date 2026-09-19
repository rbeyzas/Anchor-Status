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
- **Visual direction**: a dark-first "premium web3" interface — glass
  panel cards (`.glass-panel`, backdrop-blur), an SVG ring gauge for the
  score (`ScoreValue`), Phosphor icons, `framer-motion` entrance/hover
  animation, and a `next-themes` light/dark toggle (dark by default).
  Fonts: Space Grotesk for headings, Inter for body text, JetBrains Mono
  for numeric data (via `next/font/google`, exposed as `font-heading` /
  `font-body` / `font-mono` in `tailwind.config.ts`). All colors come
  from the `:root` / `.dark` CSS custom properties in
  `app/globals.css` (light and dark were designed together, contrast
  checked separately for each).

## Score cards

Mainnet anchors are scored by a windowed score card
([`docs/SCORING.md`](../docs/SCORING.md)); testnet and reference anchors
keep the per-report score.

- The number is shown only when the card's **confidence** is at least 40.
  Below that the card says "Not enough data yet", and the flags are still
  shown. A mainnet anchor without a published card says the same. The page
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
links.
