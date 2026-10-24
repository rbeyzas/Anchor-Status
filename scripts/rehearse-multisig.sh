#!/usr/bin/env bash
# Rehearses handing both contracts to a 2-of-3 multisig admin (sprint items
# 3.4-3.5) on brand-new testnet contracts, before the live pair. Needs no key
# from .env; every key is a throwaway funded by Friendbot.
#
#   scripts/rehearse-multisig.sh
#
#   1. the code both live contracts run today, under new IDs, with a
#      60-second upgrade delay;
#   2. a multisig account: three signers of weight 1, master weight 0,
#      thresholds low 1 / medium 2 / high 2 (the mainnet profile in
#      docs/MAINNET_RUNBOOK.md);
#   3. propose_admin(multisig) on both, by the old one-key admin;
#   4. accept_admin with one signature: refused; with two: accepted;
#   5. the old admin can no longer act;
#   6. an upgrade proposed and executed through scripts/upgrade-contracts.sh
#      with ADMIN=<multisig>: unsigned transaction files, signed by two of the
#      three signers on their own (here, by different keys in turn), sent.
#
# Every transaction hash goes to rehearsal-multisig-<UTC time>.log in the
# directory it is run from.
set -euo pipefail
HERE="$PWD"
cd "$(dirname "$0")/.."
ROOT="$PWD"

LIVE_REGISTRY=CBQGNUIX5ZDQOE6VBDHTF3SSWSCNMYK37ES5CBYUTQAED7NLZOFEE4AB
LIVE_ORACLE=CBDDBO5YU3MERDJ7LFA5RIXFORW5HI3NKMK67TG5TPO5QT64M5GUWGWU
NET=(--network testnet)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="$HERE/rehearsal-multisig-$STAMP.log"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

log() { echo "$*" | tee -a "$LOG"; }
txof() { sed -n -E 's/.*Signing transaction: ([0-9a-f]{64}).*/\1/p' "$1" | tail -1; }
call() {
  local who="$1" label="$2"; shift 2
  local out
  out=$(stellar contract invoke "${NET[@]}" --source "$who" "$@" 2>"$WORK/err") || { cat "$WORK/err" >&2; return 1; }
  log "  $label: tx $(txof "$WORK/err")"
  printf '%s' "$out"
}
refused() {
  local who="$1" label="$2"; shift 2
  if stellar contract invoke "${NET[@]}" --source "$who" "$@" >/dev/null 2>"$WORK/err"; then
    log "  $label: SUCCEEDED, but must be refused"; exit 1
  fi
  # The CLI stops before sending when the contract asks for an
  # authorization the caller cannot give: that is the refusal here.
  log "  $label: refused, $(grep -o -E 'Error\(Contract, #[0-9]+\)|Error\(Auth, [A-Za-z]+\)|Missing signing key for account [A-Z0-9]{8}' "$WORK/err" | sort -u | tr '\n' ' ')"
}
look() { stellar contract invoke "${NET[@]}" --source "$OLD" --send=no "$@" 2>/dev/null; }
addr() { stellar keys address "$1"; }
# A classic transaction (set-options), signed by identity $1.
classic() {
  local who="$1" label="$2"; shift 2
  stellar tx new set-options "${NET[@]}" --source "$who" "$@" >/dev/null 2>"$WORK/err" || { cat "$WORK/err" >&2; return 1; }
  log "  $label: tx $(txof "$WORK/err")"
}
# Signs the transaction file $1 with each identity that follows, in turn,
# the way each signer would on their own machine.
sign_with() {
  local file="$1"; shift
  for key in "$@"; do
    stellar tx sign "${NET[@]}" --sign-with-key "$key" < "$file" > "$file.next" 2>/dev/null
    mv "$file.next" "$file"
  done
}
# Sends a signed file; $2 says whether it must succeed or be refused.
send_file() {
  local file="$1" expect="$2" label="$3" hash
  hash=$(stellar tx hash "${NET[@]}" < "$file")
  if stellar tx send "${NET[@]}" < "$file" >"$WORK/out" 2>"$WORK/err"; then
    [ "$expect" = ok ] || { log "  $label: SUCCEEDED, but must be refused"; exit 1; }
    log "  $label: tx $hash"
  else
    [ "$expect" = refused ] || { cat "$WORK/err" >&2; exit 1; }
    # One signature is under the medium threshold: the network rejects the
    # transaction on submission (OpBadAuth), so it never reaches the ledger
    # and the same transaction can still be sent with enough signatures.
    log "  $label: refused on submission, $(grep -h -o -E 'Tx[A-Z][A-Za-z]+|Op[A-Z][A-Za-z]+' "$WORK/err" "$WORK/out" | sort -u | tr '\n' ' ')(not on the ledger)"
  fi
}
# An unsigned admin transaction for the multisig, built and simulated the
# way scripts/upgrade-contracts.sh builds them.
unsigned() {
  local id="$1" out="$2"; shift 2
  stellar contract invoke "${NET[@]}" --id "$id" --source-account "$MS_ADDR" --build-only -- "$@" \
    | stellar tx simulate "${NET[@]}" --source-account "$MS_ADDR" > "$out"
}

log "== rehearsal of the 2-of-3 multisig admin, $STAMP"
for name in old ms k1 k2 k3; do
  stellar keys generate "ms-$name-$STAMP" "${NET[@]}" --fund >/dev/null 2>&1
done
OLD="ms-old-$STAMP"; MS="ms-ms-$STAMP"; K1="ms-k1-$STAMP"; K2="ms-k2-$STAMP"; K3="ms-k3-$STAMP"
MS_ADDR=$(addr "$MS")

stellar contract fetch "${NET[@]}" --id "$LIVE_REGISTRY" -o "$WORK/registry-live.wasm" >/dev/null 2>&1
stellar contract fetch "${NET[@]}" --id "$LIVE_ORACLE" -o "$WORK/oracle-live.wasm" >/dev/null 2>&1
REG=$(stellar contract deploy "${NET[@]}" --source "$OLD" --wasm "$WORK/registry-live.wasm" 2>/dev/null)
ORA=$(stellar contract deploy "${NET[@]}" --source "$OLD" --wasm "$WORK/oracle-live.wasm" 2>/dev/null)
TOKEN=$(stellar contract id asset --asset native "${NET[@]}")
log "fresh registry $REG (live code $(shasum -a 256 "$WORK/registry-live.wasm" | cut -c1-8))"
log "fresh oracle   $ORA (live code $(shasum -a 256 "$WORK/oracle-live.wasm" | cut -c1-8))"
log "one-key admin  $(addr "$OLD")"
call "$OLD" "registry init" --id "$REG" -- init --admin "$(addr "$OLD")" --oracle_address "$ORA" --token_address "$TOKEN" >/dev/null
call "$OLD" "oracle init" --id "$ORA" -- init --admin "$(addr "$OLD")" --registry_address "$REG" >/dev/null
for c in "$REG registry" "$ORA oracle"; do
  set -- $c
  call "$OLD" "$2 set_upgrade_delay(60)" --id "$1" -- set_upgrade_delay --seconds 60 >/dev/null
done

log "multisig account $MS_ADDR, signers k1 $(addr "$K1" | cut -c1-8) k2 $(addr "$K2" | cut -c1-8) k3 $(addr "$K3" | cut -c1-8):"
for k in "$K1" "$K2" "$K3"; do
  classic "$MS" "add signer $(addr "$k" | cut -c1-8), weight 1" --signer "$(addr "$k")" --signer-weight 1
done
classic "$MS" "master weight 0, thresholds 1/2/2" --master-weight 0 --low-threshold 1 --med-threshold 2 --high-threshold 2
signers=$(curl -s "https://horizon-testnet.stellar.org/accounts/$MS_ADDR" | jq -c '{thresholds, signers: [.signers[] | {k: .key[0:8], w: .weight}]}')
log "  on the ledger: $signers"

log "hand both contracts to the multisig:"
for c in "$REG registry" "$ORA oracle"; do
  set -- $c
  call "$OLD" "$2 propose_admin" --id "$1" -- propose_admin --new_admin "$MS_ADDR" >/dev/null
  unsigned "$1" "$WORK/accept-$2.xdr" accept_admin
  cp "$WORK/accept-$2.xdr" "$WORK/accept-$2-one.xdr"
  sign_with "$WORK/accept-$2-one.xdr" "$K1"
  send_file "$WORK/accept-$2-one.xdr" refused "$2 accept_admin, k1 only"
  sign_with "$WORK/accept-$2.xdr" "$K1" "$K2"
  send_file "$WORK/accept-$2.xdr" ok "$2 accept_admin, k1 + k2"
  admin=$(look --id "$1" -- get_admin | tr -d '"')
  [ "$admin" = "$MS_ADDR" ] || { log "  $2 admin is $admin, not the multisig"; exit 1; }
  log "  $2 admin now the multisig"
  refused "$OLD" "$2 propose_admin by the old admin" --id "$1" -- propose_admin --new_admin "$(addr "$OLD")"
done

log "an upgrade through scripts/upgrade-contracts.sh, signed by k2 then k3 (the offline backup):"
for c in "$REG registry registry-live.wasm" "$ORA oracle oracle-live.wasm"; do
  set -- $c
  hash=$(stellar contract upload "${NET[@]}" --source "$OLD" --wasm "$WORK/$3" 2>/dev/null)
  ids=(ANCHOR_REGISTRY_CONTRACT_ID="$REG" PERFORMANCE_ORACLE_CONTRACT_ID="$ORA" ADMIN="$MS_ADDR" SIGNER=)
  (cd "$WORK" && env "${ids[@]}" DEPLOYER_SECRET_KEY= "$ROOT/scripts/upgrade-contracts.sh" propose "$2" "$hash" >/dev/null)
  sign_with "$WORK/propose-$2.xdr" "$K2" "$K3"
  send_file "$WORK/propose-$2.xdr" ok "$2 propose_upgrade (same code, hash ${hash:0:8})"
done
sleep 65
for c in "$REG registry" "$ORA oracle"; do
  set -- $c
  (cd "$WORK" && env ANCHOR_REGISTRY_CONTRACT_ID="$REG" PERFORMANCE_ORACLE_CONTRACT_ID="$ORA" ADMIN="$MS_ADDR" SIGNER= DEPLOYER_SECRET_KEY= \
    "$ROOT/scripts/upgrade-contracts.sh" execute "$2" >/dev/null)
  sign_with "$WORK/execute-$2.xdr" "$K3" "$K1"
  send_file "$WORK/execute-$2.xdr" ok "$2 execute_upgrade, k3 + k1"
done

log "done: both contracts answer to the multisig only; any two of its three keys act for it"
