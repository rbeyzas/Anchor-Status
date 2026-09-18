#!/usr/bin/env bash
# Upgrades the deployed contracts IN PLACE (TESTNET): same contract IDs, same
# stored state, new code. Use this for every change after the first deploy —
# scripts/deploy-contracts.sh creates brand-new contracts with new IDs and
# empty state, which means re-pointing every service and the dashboard.
#
# Only the admin (DEPLOYER_* in .env) can upgrade. A storage-layout change
# must stay compatible with what is already stored; new fields need a
# migration, not just new code.
set -euo pipefail
cd "$(dirname "$0")/.."
source .env

: "${DEPLOYER_SECRET_KEY:?DEPLOYER_SECRET_KEY is empty in .env}"
: "${ANCHOR_REGISTRY_CONTRACT_ID:?no ANCHOR_REGISTRY_CONTRACT_ID in .env — deploy first}"
: "${PERFORMANCE_ORACLE_CONTRACT_ID:?no PERFORMANCE_ORACLE_CONTRACT_ID in .env — deploy first}"
export STELLAR_ACCOUNT="$DEPLOYER_SECRET_KEY"

echo "== Build =="
(cd contracts/anchor-registry && cargo build --target wasm32v1-none --release)
(cd contracts/performance-oracle && cargo build --target wasm32v1-none --release)

upgrade() {
  local id="$1" wasm="$2" name="$3"
  local hash
  hash=$(stellar contract upload --wasm "$wasm" --network testnet)
  stellar contract invoke --id "$id" --network testnet -- upgrade --new_wasm_hash "$hash" >/dev/null
  echo "$name ($id) -> wasm $hash"
}

upgrade "$ANCHOR_REGISTRY_CONTRACT_ID" \
  contracts/anchor-registry/target/wasm32v1-none/release/anchor_registry.wasm AnchorRegistry
upgrade "$PERFORMANCE_ORACLE_CONTRACT_ID" \
  contracts/performance-oracle/target/wasm32v1-none/release/performance_oracle.wasm PerformanceOracle
