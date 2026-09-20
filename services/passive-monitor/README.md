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
  days are marked truncated and the flow gates do not apply to them. An
  issuer Horizon cannot be read for is left exactly as it was and retried
  next round, rather than costing every other issuer its scan: the file is
  written once, after the whole loop. An issuer Horizon has no history for
  at all (it 404s the collection, which is how it answers for an account
  that has never been in a classic operation — a Stellar Asset Contract
  issuer, for one) is read as zero mint and zero burn, because that is what
  can be seen.
- **Supply** (`PASSIVE_MONITOR_SUPPLY_DIR`, one JSON-lines file a day): the
  total outstanding amount of each issued asset, read once a round from
  Horizon's `/assets`, with the buckets it is made of (trustlines, claimable
  balances, liquidity pools, Stellar Asset Contract balances) and the number
  of holders. A mint or a burn moves this number to the seventh decimal, so
  a supply identical across two samples twenty minutes apart means nothing
  settled in between. It also sees what the payment scan cannot: a SAC
  balance is counted here, so an issuer whose asset moves only through
  Soroban is no longer read as having done nothing. An asset Horizon does
  not know is recorded as `not_found`, never as a supply of zero.
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
