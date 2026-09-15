# dashboard

Next.js (App Router) + TypeScript + Tailwind CSS + recharts. Reads
`AnchorRegistry` and `PerformanceOracle` state over testnet Soroban RPC
and visualizes it (read-only — never signs a transaction).

- 4 filters at the top: All / Live mainnet / Live testnet / Simulated.
- Each anchor is a card: name, source badge, stake, a large score with a
  sparkline, and a "Recent slashing" tag when the score dropped more
  than 15 points in the last 24 hours.
- Clicking a card opens a detailed score-history line chart (slashing
  moments marked with a `ReferenceLine`).
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

## Data layer and the mock fallback

`lib/soroban.ts::getDashboardData()` first tries a live read from
testnet Soroban RPC:

1. `AnchorRegistry.list_anchors()` to get every registered anchor id.
2. For each one, `AnchorRegistry.get_anchor_info()` (name, domain,
   source_type, stake, last update) and `PerformanceOracle.get_score()`
   (current score).
3. Score history via `PerformanceOracle`'s `report_submitted` events,
   and slashing markers via `AnchorRegistry`'s `slash` events, both
   through `rpc.Server.getEvents()` filtered on the `anchor_id` topic.

**Important — event query window**: on the public
`soroban-testnet.stellar.org` RPC, the range `getEvents` will *accept*
(from its own range-validation error) is much longer than the range it
will actually *return results for*. Empirically, a `startLedger` more
than roughly 10,000–12,000 ledgers behind the tip (~14–17 hours) starts
silently returning zero events — no error, it just finds nothing, even
though the same query against a more recent `startLedger` returns real
results. So the code intentionally queries a short, empirically-safe
window (`MAX_QUERYABLE_LEDGERS_BACK`, currently 9,000 ledgers /
~12–13 hours) rather than the much longer window the RPC advertises as
valid; a catch-and-retry step (using `min + 1`, since the advertised
minimum is itself already-pruned/exclusive) is a secondary safety net,
not the primary strategy. If a query still comes back empty (e.g. an
anchor's most recent event really is older than the safe window), that
anchor's chart falls back to a single point at its current score rather
than crashing the page. If you switch to a different RPC provider,
re-verify this constant — it isn't a documented, universal Soroban RPC
guarantee.

If the live read fails entirely (contracts not deployed yet, no network
access to the RPC, etc.) the dashboard **automatically** falls back to
the deterministic demo data in `lib/mock-data.ts` and shows an orange
"Showing demo data" banner. This means the dashboard can always be
reviewed in a real browser even before contracts are deployed or without
testnet access.

## Setup and running

```bash
npm install
npm run dev          # auto-loads the root .env (via dotenv-cli)
npm run build         # production build
npm test               # network-free unit tests (analysis.ts — the "Recent slashing" logic)
npm run typecheck
```

For live data, the root `.env` needs: `NEXT_PUBLIC_SOROBAN_RPC_URL`,
`NEXT_PUBLIC_NETWORK_PASSPHRASE`, `NEXT_PUBLIC_ANCHOR_REGISTRY_CONTRACT_ID`,
`NEXT_PUBLIC_PERFORMANCE_ORACLE_CONTRACT_ID`, and
`NEXT_PUBLIC_READER_PUBLIC_KEY` (any funded testnet account — used only
as the source account for read-only simulation, never asked to sign).

If any of these are missing or the RPC is unreachable, the dashboard
automatically falls back to demo data (see above).
