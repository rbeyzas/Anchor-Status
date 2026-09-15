# passive-monitor

Node/TypeScript service. Monitors real mainnet anchors in **read-only**
mode — never signs or submits a transaction.

- Reads the distribution account addresses and domains to watch from
  `anchors.json`.
- Fetches each anchor's last 7 days of payment/path_payment operations
  from **mainnet** Horizon (`https://horizon.stellar.org`) and computes
  average volume and frequency.
- Fetches each anchor's `stellar.toml` (SEP-1) and SEP-24 `/info`
  endpoint to extract supported currency, fee, and limit info.
- Writes the result as a normalized "base profile" to
  `output/base-profiles.json` (`source_type: RealMainnet`).
- Waits `PASSIVE_MONITOR_REQUEST_DELAY_MS` between requests (rate-limit
  protection).

Run it:

```bash
cp anchors.example.json anchors.json   # fill in real mainnet anchors
npm install
npm run start      # one-shot scan, produces output/base-profiles.json
npm test           # network-free aggregation unit tests (vitest)
npm run typecheck
```

**Important**: this service is READ-ONLY against mainnet. It does not
and must not contain any write call such as
`Horizon.submitTransaction`.
