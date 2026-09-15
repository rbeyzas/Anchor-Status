#!/usr/bin/env bash
# Anchor Oracle — end-to-end demo script.
#
# REQUIRES NETWORK ACCESS (Stellar testnet). Run it on your local machine
# or a CI/session with network access.
#
# What it does (in order):
#   1) Verifies the testnet deployer account is set up and funded
#      (reminds you to run scripts/setup-env.sh if not).
#   2) Checks whether AnchorRegistry + PerformanceOracle are deployed on
#      testnet; runs scripts/deploy-contracts.sh if not.
#   3) Runs passive-monitor once (read-only mainnet scan).
#   4) Starts the 4 mock-anchors instances (bootstrapping them first if
#      needed).
#   5) Runs testnet-probe once (a real SEP-10/24 test).
#   6) Runs aggregator, which writes data from all 3 sources to
#      PerformanceOracle on testnet.
#   7) Installs the dashboard's dependencies and prints the URL to open.
#
# The script is idempotent — steps already done (deploy, bootstrap) are
# skipped on a re-run. See docs/DEMO.md for the full presentation
# walkthrough.
set -euo pipefail
cd "$(dirname "$0")/.."

source .env 2>/dev/null || true

echo "================================================================"
echo " Anchor Reliability Oracle Network — End-to-End Demo"
echo "================================================================"

echo ""
echo "== 1/7: Deployer account check =="
if [ -z "${DEPLOYER_SECRET_KEY:-}" ]; then
  echo "DEPLOYER_SECRET_KEY is empty in .env."
  echo "Run: bash scripts/setup-env.sh"
  exit 1
fi
echo "OK — deployer: ${DEPLOYER_PUBLIC_KEY:-?}"

echo ""
echo "== 2/7: Contract deploy status =="
if [ -z "${ANCHOR_REGISTRY_CONTRACT_ID:-}" ] || [ -z "${PERFORMANCE_ORACLE_CONTRACT_ID:-}" ]; then
  echo "Contract IDs not in .env, deploying..."
  bash scripts/deploy-contracts.sh
  source .env
else
  echo "OK — AnchorRegistry: ${ANCHOR_REGISTRY_CONTRACT_ID}"
  echo "OK — PerformanceOracle: ${PERFORMANCE_ORACLE_CONTRACT_ID}"
fi

echo ""
echo "== 3/7: passive-monitor (read-only mainnet scan) =="
if [ -f services/passive-monitor/anchors.json ]; then
  (cd services/passive-monitor && npm install --silent && npm run start)
else
  echo "services/passive-monitor/anchors.json not found, skipping."
  echo "(see services/passive-monitor/anchors.example.json)"
fi

echo ""
echo "== 4/7: mock-anchors (4 fully-controlled SEP-24 mock anchors) =="
if [ ! -d services/mock-anchors/.venv ]; then
  (cd services/mock-anchors && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)
fi
if [ ! -f services/mock-anchors/secrets.env ]; then
  (cd services/mock-anchors && bash scripts/bootstrap-issuers.sh)
fi
(cd services/mock-anchors && bash scripts/run-all.sh)
echo "4 mock anchors running in the background (8001-8004). To stop them:"
echo "  (cd services/mock-anchors && bash scripts/stop-all.sh)"

echo ""
echo "== 5/7: testnet-probe (a real SEP-10/24 test) =="
(cd services/testnet-probe && npm install --silent && npm run probe) || \
  echo "testnet-probe failed (could be network/anchor related), demo continues."

echo ""
echo "== 6/7: aggregator (writes all 3 sources to testnet PerformanceOracle) =="
(cd services/aggregator && npm install --silent && npm run aggregate)

echo ""
echo "== 7/7: dashboard =="
(cd dashboard && npm install --silent)
echo "To start the dashboard, in a separate terminal:"
echo "  cd dashboard && npm run dev"
echo "Then open: http://localhost:3000"

echo ""
echo "================================================================"
echo " Demo setup complete."
echo " See docs/DEMO.md for the presentation walkthrough (especially"
echo " mock_anchor_3 degrading and triggering a slash after ~20 minutes)."
echo "================================================================"
