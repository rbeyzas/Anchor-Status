#!/usr/bin/env bash
# Upgrades the deployed contracts IN PLACE (TESTNET): same contract IDs, same
# stored state, new code. Use this for every change after the first deploy —
# scripts/deploy-contracts.sh creates brand-new contracts with new IDs and
# empty state, which means re-pointing every service and the dashboard.
#
# A storage-layout change must stay compatible with what is already stored;
# new fields need a migration, not just new code.
#
#   scripts/upgrade-contracts.sh <command> <registry|oracle> [arg]
#
#   upload   build and upload the contract's wasm, print its hash. Uploading
#            changes nothing; any funded key can pay for it.
#   propose  <hash>  ask the contract to switch to that wasm once its upgrade
#            delay has passed (prints when). Publish the hash, so anyone can
#            check what is coming.
#   execute  switch to the proposed wasm, after the delay.
#   cancel   withdraw the proposal.
#   status   admin, delay and pending upgrade. Read-only, nothing is signed.
#   instant  <hash>  oracle only, while it still has the old instant
#            upgrade(); goes away once it gets the same time lock.
#   send     <file>  submit a transaction the admin's signers have signed.
#
# Signing:
#   SIGNER=<identity|secret>  a one-key admin (testnet today): the command is
#                             signed and sent.
#   ADMIN=<G...>, no SIGNER   a multisig admin: propose/execute/cancel/instant
#                             write the transaction, unsigned but simulated,
#                             to ./<command>-<contract>.xdr. Each signer adds
#                             a signature on their own machine:
#       stellar tx sign --sign-with-key <key> --network testnet < f > f.1
#       (or --sign-with-ledger / --sign-with-lab), passing the file on;
#     then: scripts/upgrade-contracts.sh send <signed file>
set -euo pipefail
HERE="$PWD"
cd "$(dirname "$0")/.."
[ -f .env ] && source .env

NETWORK=(--network testnet)
cmd="${1:-}"
target="${2:-}"
arg="${3:-}"

usage() { sed -n '10,34p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

if [ "$cmd" = send ]; then
  cd "$HERE"
  [ -f "$target" ] || usage
  stellar tx send "${NETWORK[@]}" < "$target"
  exit
fi

case "$target" in
  registry)
    ID="${ANCHOR_REGISTRY_CONTRACT_ID:?no ANCHOR_REGISTRY_CONTRACT_ID in .env or the environment}"
    CRATE=anchor-registry WASM=contracts/anchor-registry/target/wasm32v1-none/release/anchor_registry.wasm ;;
  oracle)
    ID="${PERFORMANCE_ORACLE_CONTRACT_ID:?no PERFORMANCE_ORACLE_CONTRACT_ID in .env or the environment}"
    CRATE=performance-oracle WASM=contracts/performance-oracle/target/wasm32v1-none/release/performance_oracle.wasm ;;
  *) usage ;;
esac

SIGNER="${SIGNER:-${DEPLOYER_SECRET_KEY:-}}"
ADMIN="${ADMIN:-}"
# Who the transaction is from: the signer, or the multisig admin's address.
SOURCE="${SIGNER:-${ADMIN:?set SIGNER (one-key admin) or ADMIN=G... (multisig admin)}}"

read_only() { stellar contract invoke --id "$ID" --source-account "$SOURCE" "${NETWORK[@]}" --send=no -- "$@"; }

# An admin call: signed and sent with SIGNER, or written out for the
# multisig signers when only ADMIN is given.
admin_call() {
  if [ -n "$SIGNER" ]; then
    stellar contract invoke --id "$ID" --source-account "$SIGNER" "${NETWORK[@]}" -- "$@"
  else
    local out="$HERE/$cmd-$target.xdr"
    # A call that would fail (nothing to cancel, delay not passed) fails in
    # simulation; no file is left for the signers then.
    if ! stellar contract invoke --id "$ID" --source-account "$ADMIN" "${NETWORK[@]}" --build-only -- "$@" \
      | stellar tx simulate --source-account "$ADMIN" "${NETWORK[@]}" > "$out"; then
      rm -f "$out"
      echo "simulation failed: $cmd would not succeed now" >&2
      exit 1
    fi
    echo "unsigned transaction: $out"
    echo "each signer: stellar tx sign --sign-with-key <key> ${NETWORK[*]} < $out > $out.1   (then pass it on)"
    echo "then: scripts/upgrade-contracts.sh send <signed file>"
  fi
}

case "$cmd" in
  upload)
    : "${SIGNER:?upload needs SIGNER: any funded key pays for it}"
    stellar contract build --manifest-path "contracts/$CRATE/Cargo.toml" >/dev/null
    hash=$(stellar contract upload --wasm "$WASM" --source-account "$SIGNER" "${NETWORK[@]}")
    echo "$target wasm $hash (sha256 $(shasum -a 256 "$WASM" | cut -c1-64))"
    ;;
  propose)
    [ -n "$arg" ] || usage
    admin_call propose_upgrade --wasm_hash "$arg"
    ;;
  execute) admin_call execute_upgrade ;;
  cancel) admin_call cancel_upgrade ;;
  instant)
    [ "$target" = oracle ] && [ -n "$arg" ] || usage
    admin_call upgrade --new_wasm_hash "$arg"
    ;;
  status)
    echo "admin:   $(read_only get_admin 2>/dev/null || echo '(no get_admin: older code)')"
    echo "delay:   $(read_only get_upgrade_delay 2>/dev/null || echo '(no time lock: older code)') s"
    echo "pending: $(read_only get_pending_upgrade 2>/dev/null || echo '-')"
    ;;
  *) usage ;;
esac
