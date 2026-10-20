#!/usr/bin/env bash
# Rehearses deliverable 3 (operator claims and disputes) end to end on
# brand-new testnet contracts, before the live ones get it. Needs no key
# from .env; every key is a throwaway funded by Friendbot.
#
#   scripts/rehearse-d3.sh <registry.wasm> <oracle.wasm>
#
#   1. the wasm both live contracts run today, under new IDs, upgraded to
#      the given wasm the way the live pair will be (propose + execute);
#   2. a quorum of two reporters (threshold 2, no rounds);
#   3. both reporters read ref1.monarank.xyz's real stellar.toml with
#      `npm run d3 -- attest` and attest its SIGNING_KEY;
#   4. a second anchor whose SIGNING_KEY is a throwaway key: attested,
#      claimed with `npm run d3 -- claim` (a wrong key is refused first),
#      staked, scored by both reporters;
#   5. disputes: one upheld (score withheld, FLAG_DISPUTED), one rejected
#      (cooldown refuses the next), one superseded by a newer card.
#
# Every transaction hash goes to rehearsal-d3-<UTC time>.log in the
# directory it is run from.
set -euo pipefail
HERE="$PWD"
cd "$(dirname "$0")/.."
REG_WASM="${1:?registry wasm}"; ORA_WASM="${2:?oracle wasm}"
for f in "$REG_WASM" "$ORA_WASM"; do [ -f "$f" ] || { echo "no wasm at $f"; exit 2; }; done

LIVE_REGISTRY=CBQGNUIX5ZDQOE6VBDHTF3SSWSCNMYK37ES5CBYUTQAED7NLZOFEE4AB
LIVE_ORACLE=CBDDBO5YU3MERDJ7LFA5RIXFORW5HI3NKMK67TG5TPO5QT64M5GUWGWU
NET=(--network testnet)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="$HERE/rehearsal-d3-$STAMP.log"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

log() { echo "$*" | tee -a "$LOG"; }
txof() { sed -n -E 's/.*Signing transaction: ([0-9a-f]{64}).*/\1/p' "$1" | tail -1; }
# A contract call signed by identity $1; logs its transaction.
call() {
  local who="$1" label="$2"; shift 2
  local out
  out=$(stellar contract invoke "${NET[@]}" --source "$who" "$@" 2>"$WORK/err") || { cat "$WORK/err" >&2; return 1; }
  log "  $label: tx $(txof "$WORK/err")"
  printf '%s' "$out"
}
# A call that must fail; logs the error it fails with.
refused() {
  local who="$1" label="$2"; shift 2
  if stellar contract invoke "${NET[@]}" --source "$who" "$@" >/dev/null 2>"$WORK/err"; then
    log "  $label: SUCCEEDED, but must be refused"; exit 1
  fi
  log "  $label: refused, $(grep -o -E 'Error\(Contract, #[0-9]+\)|WasmVm, InvalidAction|Crypto, InvalidInput|Auth, [A-Za-z]+' "$WORK/err" | sort -u | tr '\n' ' ')"
}
look() { stellar contract invoke "${NET[@]}" --source "$ADMIN" --send=no "$@" 2>/dev/null; }
d3() {
  (cd services/aggregator && env ANCHOR_REGISTRY_CONTRACT_ID="$REG" PERFORMANCE_ORACLE_CONTRACT_ID="$ORA" "$@") 2>&1 | grep -v -i localstorage
}

log "== rehearsal of deliverable 3, $STAMP"
log "registry wasm $(shasum -a 256 "$REG_WASM" | cut -c1-64)"
log "oracle wasm   $(shasum -a 256 "$ORA_WASM" | cut -c1-64)"

for name in admin r1 r2 operator signer impostor; do
  stellar keys generate "d3-$name-$STAMP" "${NET[@]}" --fund >/dev/null 2>&1
done
ADMIN="d3-admin-$STAMP"; R1="d3-r1-$STAMP"; R2="d3-r2-$STAMP"; OP="d3-operator-$STAMP"
SIGNER="d3-signer-$STAMP"; IMPOSTOR="d3-impostor-$STAMP"
addr() { stellar keys address "$1"; }
secret() { stellar keys show "$1"; }
raw() { (cd services/aggregator && node -e "console.log(Buffer.from(require('@stellar/stellar-sdk').StrKey.decodeEd25519PublicKey(process.argv[1])).toString('hex'))" "$1" 2>/dev/null); }

stellar contract fetch "${NET[@]}" --id "$LIVE_REGISTRY" -o "$WORK/registry-live.wasm" >/dev/null 2>&1
stellar contract fetch "${NET[@]}" --id "$LIVE_ORACLE" -o "$WORK/oracle-live.wasm" >/dev/null 2>&1
REG=$(stellar contract deploy "${NET[@]}" --source "$ADMIN" --wasm "$WORK/registry-live.wasm" 2>/dev/null)
ORA=$(stellar contract deploy "${NET[@]}" --source "$ADMIN" --wasm "$WORK/oracle-live.wasm" 2>/dev/null)
TOKEN=$(stellar contract id asset --asset native "${NET[@]}")
log "fresh registry $REG (live code $(shasum -a 256 "$WORK/registry-live.wasm" | cut -c1-8))"
log "fresh oracle   $ORA (live code $(shasum -a 256 "$WORK/oracle-live.wasm" | cut -c1-8))"
call "$ADMIN" "registry init" --id "$REG" -- init --admin "$(addr "$ADMIN")" --oracle_address "$ORA" --token_address "$TOKEN" >/dev/null
call "$ADMIN" "oracle init" --id "$ORA" -- init --admin "$(addr "$ADMIN")" --registry_address "$REG" >/dev/null
for a in "ref1_monarank_xyz_testnet ref1.monarank.xyz" "claim_test claim-test.invalid"; do
  set -- $a
  call "$ADMIN" "register $1" --id "$REG" -- register_anchor --operator "$(addr "$ADMIN")" --anchor_id "$1" \
    --name "$1" --domain "$2" --source_type RealTestnet >/dev/null
done

log "upgrade to the deliverable-3 code, as the live pair will get it:"
for c in "$REG $REG_WASM registry" "$ORA $ORA_WASM oracle"; do
  set -- $c
  hash=$(stellar contract upload "${NET[@]}" --source "$ADMIN" --wasm "$2" 2>/dev/null)
  call "$ADMIN" "$3 propose_upgrade" --id "$1" -- propose_upgrade --wasm_hash "$hash" >/dev/null
  call "$ADMIN" "$3 execute_upgrade" --id "$1" -- execute_upgrade >/dev/null
done

log "quorum of two reporters:"
for r in "$R1" "$R2"; do
  call "$ADMIN" "authorize $(addr "$r" | cut -c1-8)" --id "$ORA" -- authorize_reporter --reporter "$(addr "$r")" --source_type RealTestnet >/dev/null
done
call "$ADMIN" "set_quorum_config(2, 100, 0)" --id "$ORA" -- set_quorum_config --config '{"threshold":2,"max_spread":100,"round_seconds":0}' >/dev/null
call "$ADMIN" "set_dispute_config(10 XLM, 60 s)" --id "$ORA" -- set_dispute_config --config '{"min_stake":"100000000","cooldown_seconds":60}' >/dev/null

log "SIGNING_KEY of ref1.monarank.xyz, read by each reporter from its stellar.toml:"
for r in "$R1" "$R2"; do
  log "  $(d3 REPORTER_TESTNET_SECRET_KEY="$(secret "$r")" npm run --silent d3 -- attest ref1_monarank_xyz_testnet)"
done
log "  registry now holds: $(d3 npm run --silent d3 -- show ref1_monarank_xyz_testnet | head -1)"

log "claim_test, whose SIGNING_KEY is a throwaway key:"
KEYHEX=$(raw "$(addr "$SIGNER")")
for r in "$R1" "$R2"; do
  call "$r" "attest $(addr "$SIGNER" | cut -c1-8) by $(addr "$r" | cut -c1-8)" --id "$ORA" -- attest_signing_key \
    --reporter "$(addr "$r")" --anchor_id claim_test --signing_key "$KEYHEX" >/dev/null
done
log "  wrong key: $(d3 CLAIM_SIGNING_SECRET="$(secret "$IMPOSTOR")" OPERATOR_SECRET="$(secret "$OP")" npm run --silent d3 -- claim claim_test)"
log "  $(d3 CLAIM_SIGNING_SECRET="$(secret "$SIGNER")" OPERATOR_SECRET="$(secret "$OP")" npm run --silent d3 -- claim claim_test)"
call "$OP" "operator stakes 10 XLM" --id "$REG" -- stake --anchor_id claim_test --amount 100000000 >/dev/null

card() { echo "{\"score\":$1,\"availability\":100,\"speed\":90,\"integrity\":83,\"market\":null,\"confidence\":80,\"flags\":0,\"window_end\":$2,\"methodology_version\":2,\"inputs_hash\":\"$(printf '%064x' "$1")\"}"; }
publish() {
  for r in "$R1" "$R2"; do
    call "$r" "card $2 from $(addr "$r" | cut -c1-8)" --id "$ORA" -- publish_score_card --reporter "$(addr "$r")" --anchor_id claim_test --card "$(card "$1" "$2")" >/dev/null
  done
}
EVIDENCE=$(printf 'rehearsal evidence' | shasum -a 256 | cut -c1-64)
W=$(( $(date +%s) - 3600 ))

log "upheld dispute:"
publish 70 $W
refused "$IMPOSTOR" "a stranger opens a dispute" --id "$ORA" -- open_dispute --operator "$(addr "$IMPOSTOR")" --anchor_id claim_test --window_end $W --reason_code 1 --evidence_hash "$EVIDENCE"
log "  $(d3 OPERATOR_SECRET="$(secret "$OP")" npm run --silent d3 -- dispute-open claim_test 1 "$EVIDENCE")"
log "  verdict while open: $(look --id "$ORA" -- get_verdict --anchor_id claim_test)"
for r in "$R1" "$R2"; do log "  $(d3 REPORTER_TESTNET_SECRET_KEY="$(secret "$r")" npm run --silent d3 -- dispute-vote claim_test uphold)"; done
log "  verdict when upheld: $(look --id "$ORA" -- get_verdict --anchor_id claim_test)"
log "  registry score: $(look --id "$REG" -- get_anchor_info --anchor_id claim_test | jq -c .score)"

log "rejected dispute, then the cooldown:"
publish 72 $((W + 60))
log "  $(d3 OPERATOR_SECRET="$(secret "$OP")" npm run --silent d3 -- dispute-open claim_test 2 "$EVIDENCE")"
for r in "$R1" "$R2"; do log "  $(d3 REPORTER_TESTNET_SECRET_KEY="$(secret "$r")" npm run --silent d3 -- dispute-vote claim_test reject)"; done
publish 74 $((W + 120))
refused "$OP" "a new dispute inside the cooldown" --id "$ORA" -- open_dispute --operator "$(addr "$OP")" --anchor_id claim_test --window_end $((W + 120)) --reason_code 3 --evidence_hash "$EVIDENCE"

log "superseded dispute:"
sleep 65
log "  $(d3 OPERATOR_SECRET="$(secret "$OP")" npm run --silent d3 -- dispute-open claim_test 3 "$EVIDENCE")"
publish 76 $((W + 180))
log "  after a newer card: $(look --id "$ORA" -- get_dispute --anchor_id claim_test | jq -c '{status, window_end}')"
log "  verdict: $(look --id "$ORA" -- get_verdict --anchor_id claim_test)"

log "== deliverable 3 rehearsal passed; log: $LOG"
