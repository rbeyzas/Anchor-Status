# testnet-probe

Node/TypeScript service. Runs a real, end-to-end SEP-10 + SEP-24 flow
against a testnet anchor and measures how long it takes.

Flow:
1. Creates and funds a fresh test account via Friendbot.
2. Performs SEP-10 authentication (challenge signing + token exchange)
   against `testanchor.stellar.org`.
3. Initiates a real SEP-24 `/transactions/deposit/interactive` request.
4. Polls the transaction's status (`/transaction`) until it reaches a
   terminal state or times out, measuring elapsed time.
5. Appends the result (`success`/`failure`, `settlement_seconds`,
   `timestamp`) to `results/probe-log.json` (`source_type: RealTestnet`).

Scheduling: repeats on `TESTNET_PROBE_SCHEDULE_CRON` (default: hourly)
via `node-schedule`.

Run it:

```bash
npm install
npx playwright install chromium   # one-time browser download
npm run probe       # one-shot run, appends to results/probe-log.json
npm run schedule     # run as a scheduled job (TESTNET_PROBE_SCHEDULE_CRON)
npm test             # network-free unit tests (vitest)
npm run typecheck
```

**Note**: the SEP-24 interactive deposit normally requires a browser-based
KYC form. `src/interactive.ts` is a generic, best-effort headless filler
(fill any visible input, click the obvious continue/submit button) rather
than a scraper built for one specific anchor's markup — see the comments
there. Some anchors' reference UI may not finish loading under a headless
browser at all (consistent with bot-mitigation fingerprinting); when that
happens the probe honestly reports a failed attempt rather than a
fabricated success.
