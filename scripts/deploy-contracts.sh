#!/usr/bin/env bash
# Anchor Oracle — contract deploy script (TESTNET).
#
# REQUIRES NETWORK ACCESS. scripts/setup-env.sh must have run first
# (the deployer account must be funded).
#
# Does:
#   1) Compiles the anchor-registry and performance-oracle contracts to wasm.
#   2) Deploys both to testnet.
#   3) Points each contract at the other (via each contract's admin init).
#   4) Authorizes the three reporter keys, one per source type.
#   5) Registers every anchor listed in contracts/registered-anchors.json.
#   6) Writes the contract IDs into .env.
#
# Signs with DEPLOYER_SECRET_KEY from .env, never with a named stellar-cli
# identity: an identity called "deployer" on one machine is not the same key
# as on another, and a mismatch makes `init` fail on admin auth.
set -euo pipefail
cd "$(dirname "$0")/.."
source .env

if [ -z "${DEPLOYER_SECRET_KEY:-}" ]; then
  echo "DEPLOYER_SECRET_KEY is empty in .env. Run scripts/setup-env.sh first."
  exit 1
fi
# stellar-cli reads the signing key from here, which keeps the secret out of
# the process list (unlike --source <secret>).
export STELLAR_ACCOUNT="$DEPLOYER_SECRET_KEY"
NETWORK_ARGS=(--network testnet)

# Derives a public key from a secret using the SDK the services already ship.
pubkey_of() {
  (cd services/aggregator && S="$1" node -e \
    "console.log(require('@stellar/stellar-sdk').Keypair.fromSecret(process.env.S).publicKey())")
}

DEPLOYER_DERIVED=$(pubkey_of "$DEPLOYER_SECRET_KEY")
if [ "$DEPLOYER_DERIVED" != "${DEPLOYER_PUBLIC_KEY:-}" ]; then
  echo "DEPLOYER_SECRET_KEY belongs to $DEPLOYER_DERIVED, but .env says DEPLOYER_PUBLIC_KEY=${DEPLOYER_PUBLIC_KEY:-<empty>}."
  exit 1
fi

echo "== 1) Build the contracts =="
(cd contracts/anchor-registry && cargo build --target wasm32v1-none --release)
(cd contracts/performance-oracle && cargo build --target wasm32v1-none --release)

REGISTRY_WASM="contracts/anchor-registry/target/wasm32v1-none/release/anchor_registry.wasm"
ORACLE_WASM="contracts/performance-oracle/target/wasm32v1-none/release/performance_oracle.wasm"

echo "== 2) Deploy anchor-registry =="
REGISTRY_ID=$(stellar contract deploy --wasm "$REGISTRY_WASM" "${NETWORK_ARGS[@]}")
echo "AnchorRegistry contract ID: ${REGISTRY_ID}"

echo "== 3) Deploy performance-oracle =="
ORACLE_ID=$(stellar contract deploy --wasm "$ORACLE_WASM" "${NETWORK_ARGS[@]}")
echo "PerformanceOracle contract ID: ${ORACLE_ID}"

echo "== 4) Find the native XLM SAC (stake token) address =="
NATIVE_TOKEN_ID=$(stellar contract id asset --asset native "${NETWORK_ARGS[@]}")
echo "Native XLM SAC: ${NATIVE_TOKEN_ID}"

echo "== 5) anchor-registry init (authorize the oracle to write scores, set the stake token) =="
stellar contract invoke --id "$REGISTRY_ID" "${NETWORK_ARGS[@]}" -- init \
  --admin "$DEPLOYER_PUBLIC_KEY" \
  --oracle_address "$ORACLE_ID" \
  --token_address "$NATIVE_TOKEN_ID"

echo "== 6) performance-oracle init (set the registry address) =="
stellar contract invoke --id "$ORACLE_ID" "${NETWORK_ARGS[@]}" -- init \
  --admin "$DEPLOYER_PUBLIC_KEY" \
  --registry_address "$REGISTRY_ID"

echo "== 7) Authorize one reporter per source type =="
for pair in "RealMainnet:${REPORTER_MAINNET_SECRET_KEY:-}" \
            "RealTestnet:${REPORTER_TESTNET_SECRET_KEY:-}" \
            "SimulatedMock:${REPORTER_MOCK_SECRET_KEY:-}"; do
  source_type="${pair%%:*}"
  secret="${pair#*:}"
  if [ -z "$secret" ]; then
    echo "  skipping $source_type: no reporter secret in .env"
    continue
  fi
  reporter=$(pubkey_of "$secret")
  stellar contract invoke --id "$ORACLE_ID" "${NETWORK_ARGS[@]}" -- authorize_reporter \
    --reporter "$reporter" --source_type "$source_type" >/dev/null
  echo "  $source_type -> $reporter"
done

echo "== 8) Register anchors from contracts/registered-anchors.json =="
jq -c '.anchors[]' contracts/registered-anchors.json | while read -r anchor; do
  id=$(jq -r '.anchor_id' <<<"$anchor")
  stellar contract invoke --id "$REGISTRY_ID" "${NETWORK_ARGS[@]}" -- register_anchor \
    --operator "$DEPLOYER_PUBLIC_KEY" \
    --anchor_id "$id" \
    --name "$(jq -r '.name' <<<"$anchor")" \
    --domain "$(jq -r '.domain' <<<"$anchor")" \
    --source_type "$(jq -r '.source_type' <<<"$anchor")" >/dev/null
  echo "  registered $id"
done

echo "== 9) Update .env =="
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
