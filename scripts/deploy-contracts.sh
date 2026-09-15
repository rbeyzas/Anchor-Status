#!/usr/bin/env bash
# Anchor Oracle — contract deploy script (TESTNET).
#
# REQUIRES NETWORK ACCESS. scripts/setup-env.sh must have run first
# (the deployer account must be funded).
#
# Does:
#   1) Compiles the anchor-registry and performance-oracle contracts to wasm.
#   2) Deploys both to testnet.
#   3) Points performance-oracle at anchor-registry's address
#      (via each contract's admin init call).
#   4) Writes the contract IDs into .env.
set -euo pipefail
cd "$(dirname "$0")/.."
source .env

if [ -z "${DEPLOYER_SECRET_KEY:-}" ]; then
  echo "DEPLOYER_SECRET_KEY is empty in .env. Run scripts/setup-env.sh first."
  exit 1
fi

echo "== 1) Build the contracts =="
(cd contracts/anchor-registry && cargo build --target wasm32v1-none --release)
(cd contracts/performance-oracle && cargo build --target wasm32v1-none --release)

REGISTRY_WASM="contracts/anchor-registry/target/wasm32v1-none/release/anchor_registry.wasm"
ORACLE_WASM="contracts/performance-oracle/target/wasm32v1-none/release/performance_oracle.wasm"

echo "== 2) Deploy anchor-registry =="
REGISTRY_ID=$(stellar contract deploy \
  --wasm "$REGISTRY_WASM" \
  --source deployer \
  --network testnet)
echo "AnchorRegistry contract ID: ${REGISTRY_ID}"

echo "== 3) Deploy performance-oracle =="
ORACLE_ID=$(stellar contract deploy \
  --wasm "$ORACLE_WASM" \
  --source deployer \
  --network testnet)
echo "PerformanceOracle contract ID: ${ORACLE_ID}"

echo "== 4) Find the native XLM SAC (stake token) address =="
NATIVE_TOKEN_ID=$(stellar contract id asset --asset native --network testnet)
echo "Native XLM SAC: ${NATIVE_TOKEN_ID}"

echo "== 5) anchor-registry init (authorize the oracle address to call slash/update_score, set the stake token) =="
stellar contract invoke \
  --id "$REGISTRY_ID" \
  --source deployer \
  --network testnet \
  -- init \
  --admin "$DEPLOYER_PUBLIC_KEY" \
  --oracle_address "$ORACLE_ID" \
  --token_address "$NATIVE_TOKEN_ID"

echo "== 6) performance-oracle init (set the registry address) =="
stellar contract invoke \
  --id "$ORACLE_ID" \
  --source deployer \
  --network testnet \
  -- init \
  --admin "$DEPLOYER_PUBLIC_KEY" \
  --registry_address "$REGISTRY_ID"

echo "== 7) Update .env =="
sed -i.bak "s|^ANCHOR_REGISTRY_CONTRACT_ID=.*|ANCHOR_REGISTRY_CONTRACT_ID=${REGISTRY_ID}|" .env
sed -i.bak "s|^PERFORMANCE_ORACLE_CONTRACT_ID=.*|PERFORMANCE_ORACLE_CONTRACT_ID=${ORACLE_ID}|" .env
sed -i.bak "s|^NEXT_PUBLIC_ANCHOR_REGISTRY_CONTRACT_ID=.*|NEXT_PUBLIC_ANCHOR_REGISTRY_CONTRACT_ID=${REGISTRY_ID}|" .env
sed -i.bak "s|^NEXT_PUBLIC_PERFORMANCE_ORACLE_CONTRACT_ID=.*|NEXT_PUBLIC_PERFORMANCE_ORACLE_CONTRACT_ID=${ORACLE_ID}|" .env
rm -f .env.bak

echo ""
echo "Deploy complete:"
echo "  AnchorRegistry:    ${REGISTRY_ID}"
echo "  PerformanceOracle: ${ORACLE_ID}"
echo "These IDs were written into .env."
