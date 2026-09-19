# passive-monitor

Node/TypeScript service. Reads mainnet Horizon in **read-only** mode (it never
signs or submits a transaction) for two things:

**Chain signals for the score cards** ([`docs/SCORING.md`](../../docs/SCORING.md)
sections 6.4 and 8). Only for assets an anchor issues itself, as found by
`mainnet-probe` (the issuer's `home_domain` points back at the anchor):

- **Flows** (`PASSIVE_MONITOR_FLOWS_PATH`): daily counts of mints (payments of
  the asset from its issuer) and burns (payments to it). Each issuer is read
  once for all its assets. A new issuer is backfilled over 30 days, at most
  `PASSIVE_MONITOR_MAX_BACKFILLS_PER_RUN` (5) per round; after that only the
  days since the last run are recomputed, so nothing is counted twice and a
  missed round leaves no gap. When the page cap cuts a history short, those
  days are marked truncated and the flow gates do not apply to them.
- **Market samples** (`PASSIVE_MONITOR_MARKET_DIR`, one JSON-lines file a
  day): for each issued fiat asset, its price against Circle's USDC from the
  DEX order book mid (both sides present, spread under 5%) and the AMM pool
  spot, each counted only with at least $500 on each side within 1% of the
  price; against a daily reference rate from
  [fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api),
  falling back to [ExchangeRate-API's open endpoint](https://www.exchangerate-api.com/docs/free)
  (Rates By Exchange Rate API). An attempt without a rate or without a liquid
  market is recorded as such, with its reason; a rate or a price is never
  guessed.

**Activity context** (optional, `anchors.json`): 7 days of payment volume and
frequency for hand-listed distribution accounts, in
`output/base-profiles.json`. Context only: volume is never scored.

Run it:

```bash
npm install
npm run start      # activity profiles (if anchors.json exists), then chain signals
npm test
npm run typecheck
```

Requests are spaced by `PASSIVE_MONITOR_REQUEST_DELAY_MS` to stay under
Horizon's public rate limits. This service is READ-ONLY against mainnet: it
does not and must not contain any write call such as
`Horizon.submitTransaction`.
