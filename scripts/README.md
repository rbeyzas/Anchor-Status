# scripts

Root-level setup / deploy / demo scripts.

- `setup-env.sh` — toolchain check, creates and funds a deployer account
  (testnet, requires Friendbot).
- `deploy-contracts.sh` — deploys the `anchor-registry` and
  `performance-oracle` contracts to testnet, writes the resulting
  contract IDs into `.env`.
- `demo.sh` — brings the whole system up end-to-end for a live demo.

These scripts **require network access** to Stellar testnet.
