# testnet-probe

Node/TypeScript service. Tests testnet anchors with a real money flow, every
round, and admits new ones that apply. On testnet, money moves: every
payment is checked on the ledger, not taken from the anchor's word.

## The money-flow check (`src/flow.ts`)

For each anchor on the list (`TESTNET_ANCHORS_PATH`; SDF's reference
anchor `testanchor.stellar.org` is always on it):

| Step | What happens |
|---|---|
| `toml` | Its stellar.toml names the testnet (or no network) and advertises SEP-10 and a SEP-24 or SEP-6 transfer server. The asset: the configured one, or the first depositable one with an issuer. |
| `account`, `trustline` | A fresh testnet account from Friendbot opens a trustline to that asset. |
| `sep10` | The challenge must be signed by the toml's `SIGNING_KEY`; a token is issued. |
| `deposit` | SEP-24 (preferred when offered): the interactive page is filled in a headless browser (`src/interactive.ts`). SEP-6: the deposit is requested, then the sandbox's own control on the transaction's `more_info_url` marks the fiat as paid (a POST form whose button reads like "Simulate incoming transfer" or "Mark as paid", on the anchor's own host; `src/sep6.ts`). |
| `deposit_settled` | Polled until terminal; must be `completed` with a `stellar_transaction_id`. |
| `deposit_onchain` | That transaction, read from Horizon, pays the asset to our account, for the reported `amount_out`: a classic payment, or a Stellar Asset Contract transfer (the reference anchor pays that way). The sender is shown; a sender missing from the toml's `ACCOUNTS` is noted, not failed (`ACCOUNTS` is optional). |
| `withdraw`, `withdraw_onchain`, `withdraw_settled` | SEP-6 only: a withdrawal of what we received is requested, we pay it to the anchor with its memo, the payment is checked on Horizon, and the anchor must complete the withdrawal. SEP-24 withdrawal is interactive and not tested; a step that does not apply is recorded as such. |

A failure on our side (Friendbot, our browser) is inconclusive and never
submitted. Each conclusive run publishes an evidence document with every
step and its ledger transactions, and is appended to
`results/probe-log.json`, which the aggregator submits as `RealTestnet`.

## Applications (`npm run onboard`, `npm run register`)

Testnet applications are kept apart from mainnet's: the dashboard's
`/apply/testnet` posts to `/api/onboarding/testnet`, the collector's intake
appends to `ONBOARDING_TESTNET_DIR` (default `<ONBOARDING_DIR>/testnet`),
and `onboard` checks up to `ONBOARDING_TESTNET_MAX_PER_RUN` (3) per round:
the domain must resolve to a public address, then the money flow must pass
once. An admitted anchor joins the list under an id ending in `_testnet`
(never colliding with the same domain's mainnet id), `register` registers it
on-chain as `RealTestnet` with the deployer key, and the probe tests it from
then on. `onboarding.json` in that directory is published as
`onboarding-testnet.json`.

`npm run onboard -- --dry-run --domain example.com` runs the admission check
once (real transfers) and records nothing.

## Run it

```bash
npm install
npx playwright install chromium   # one-time browser download (SEP-24)
npm run probe        # every listed anchor, once
npm run onboard      # process testnet applications
npm run register     # register admitted anchors on-chain (RealTestnet)
npm run schedule     # the probe on TESTNET_PROBE_SCHEDULE_CRON
npm test             # network-free unit tests (vitest)
npm run typecheck
```

Set `PROBE_HEADLESS=false` to watch a SEP-24 interactive flow in a visible
browser.
