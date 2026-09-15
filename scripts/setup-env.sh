#!/usr/bin/env bash
# Anchor Oracle — environment setup script.
#
# This script REQUIRES NETWORK ACCESS (crates.io, stellar.org domains).
# If those domains aren't reachable in your environment, run this script
# somewhere with network access (your local machine, CI).
#
# Does:
#   1) Checks whether the Rust wasm32 target + stellar-cli (soroban-cli)
#      are installed.
#   2) Adds the "testnet" network to stellar-cli.
#   3) Generates a deployer key and funds it on testnet via Friendbot.
#   4) Writes the deployer keys into .env (copying it from .env.example
#      first if it doesn't exist yet).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1) Toolchain check =="
command -v rustc >/dev/null || { echo "rustc not found. https://rustup.rs"; exit 1; }
rustup target add wasm32v1-none

if ! command -v stellar >/dev/null 2>&1; then
  echo "stellar-cli not found, installing (this can take a few minutes)..."
  cargo install --locked stellar-cli
fi
stellar --version

command -v node >/dev/null || { echo "Node.js not found."; exit 1; }
command -v python3 >/dev/null || { echo "Python3 not found."; exit 1; }

echo "== 2) Add the testnet network to stellar-cli =="
stellar network add testnet \
  --rpc-url https://soroban-testnet.stellar.org:443 \
  --network-passphrase "Test SDF Network ; September 2015" \
  2>/dev/null || echo "(testnet network may already be defined, continuing)"

echo "== 3) Generate a deployer account + fund it via Friendbot =="
if ! stellar keys address deployer >/dev/null 2>&1; then
  stellar keys generate deployer --network testnet --fund
else
  echo "'deployer' key already exists, attempting to fund it..."
  stellar keys fund deployer --network testnet || true
fi
DEPLOYER_PUBLIC=$(stellar keys address deployer)
DEPLOYER_SECRET=$(stellar keys show deployer)

echo "== 4) Update the .env file =="
[ -f .env ] || cp .env.example .env
if grep -q '^DEPLOYER_PUBLIC_KEY=' .env; then
  sed -i.bak "s|^DEPLOYER_PUBLIC_KEY=.*|DEPLOYER_PUBLIC_KEY=${DEPLOYER_PUBLIC}|" .env
  sed -i.bak "s|^DEPLOYER_SECRET_KEY=.*|DEPLOYER_SECRET_KEY=${DEPLOYER_SECRET}|" .env
  rm -f .env.bak
fi

echo ""
echo "Deployer account: ${DEPLOYER_PUBLIC}"
echo "Check balance: curl -s \"https://horizon-testnet.stellar.org/accounts/${DEPLOYER_PUBLIC}\" | jq .balances"
echo "Setup complete. Next step: scripts/deploy-contracts.sh"
