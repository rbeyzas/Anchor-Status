#!/usr/bin/env bash
# Rehearses a contract upgrade on brand-new testnet contracts before it runs
# on the live ones (SOW: "every step runs first on freshly deployed testnet
# contracts, then on the live ones"). Needs no key from .env:
#
#   scripts/rehearse-upgrade.sh <registry|oracle> <new.wasm>
#
#   1. a throwaway admin key, funded by Friendbot;
#   2. the wasm both live contracts run today, fetched from the chain and
#      deployed under new IDs, initialised and linked like the live pair;
#   3. the live registry's anchors copied in (ANCHORS=<n> copies fewer);
#   4. a reporter and one report, so a score exists before the upgrade;
#   5. the upgrade the live contract will get, the way it will get it:
#      propose_upgrade + execute_upgrade if the contract has the time lock,
#      the old instant upgrade() if it does not yet;
#   6. if the upgraded contract has the time lock: delay 60 s, propose,
#      execute at once (must fail with TimelockActive, #21), wait, execute
#      again (must succeed), delay back to 0;
#   7. reads back the anchor count, every page, a sample of records and the
#      score, compares them with what was there before, and sends one more
#      report through the upgraded pair.
#
# Every transaction hash goes to rehearsal-<target>-<UTC time>.log in the
# directory it is run from.
set -euo pipefail
HERE="$PWD"
cd "$(dirname "$0")/.."

target="${1:-}"; NEW_WASM="${2:-}"
case "$target" in registry|oracle) ;; *) sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;; esac
[ -f "$NEW_WASM" ] || { echo "no wasm at '$NEW_WASM'"; exit 2; }
command -v jq >/dev/null || { echo "jq is required"; exit 2; }

LIVE_REGISTRY=CBQGNUIX5ZDQOE6VBDHTF3SSWSCNMYK37ES5CBYUTQAED7NLZOFEE4AB
LIVE_ORACLE=CBDDBO5YU3MERDJ7LFA5RIXFORW5HI3NKMK67TG5TPO5QT64M5GUWGWU
NET=(--network testnet)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="$HERE/rehearsal-$target-$STAMP.log"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

log() { echo "$*" | tee -a "$LOG"; }
# Runs a contract call, logs its transaction hash, prints its result.
call() {
  local label="$1"; shift
  local out err
  out=$(stellar contract invoke "${NET[@]}" --source "$KEY" "$@" 2>"$WORK/err") || { cat "$WORK/err" >&2; return 1; }
  err=$(sed -n -E 's/.*Signing transaction: ([0-9a-f]{64}).*/\1/p' "$WORK/err" | tail -1)
  [ -n "$err" ] && log "  $label: tx $err"
  printf '%s' "$out"
}
read_call() { stellar contract invoke "${NET[@]}" --source "$KEY" --send=no "$@" 2>/dev/null; }

log "== rehearsal of the $target upgrade, $STAMP"
log "new wasm: $(shasum -a 256 "$NEW_WASM" | cut -d' ' -f1)"

KEY="rehearsal-$STAMP"
stellar keys generate "$KEY" "${NET[@]}" --fund >/dev/null 2>&1
ADMIN=$(stellar keys address "$KEY")
log "throwaway admin: $ADMIN"

stellar contract fetch "${NET[@]}" --id "$LIVE_REGISTRY" -o "$WORK/registry.wasm" >/dev/null 2>&1
stellar contract fetch "${NET[@]}" --id "$LIVE_ORACLE" -o "$WORK/oracle.wasm" >/dev/null 2>&1
log "live registry wasm: $(shasum -a 256 "$WORK/registry.wasm" | cut -d' ' -f1)"
log "live oracle wasm:   $(shasum -a 256 "$WORK/oracle.wasm" | cut -d' ' -f1)"

REG=$(stellar contract deploy "${NET[@]}" --source "$KEY" --wasm "$WORK/registry.wasm" 2>/dev/null)
ORA=$(stellar contract deploy "${NET[@]}" --source "$KEY" --wasm "$WORK/oracle.wasm" 2>/dev/null)
TOKEN=$(stellar contract id asset --asset native "${NET[@]}")
log "fresh registry: $REG"
log "fresh oracle:   $ORA"
call "registry init" --id "$REG" -- init --admin "$ADMIN" --oracle_address "$ORA" --token_address "$TOKEN" >/dev/null
call "oracle init" --id "$ORA" -- init --admin "$ADMIN" --registry_address "$REG" >/dev/null

# The live registry's anchors, in its order.
count=$(read_call --id "$LIVE_REGISTRY" -- anchor_count)
ids=()
for ((start = 0; start < count; start += 100)); do
  while read -r id; do ids+=("$id"); done < <(read_call --id "$LIVE_REGISTRY" -- list_anchors_page --start "$start" --limit 100 | jq -r '.[]')
done
n=${ANCHORS:-${#ids[@]}}
log "copying $n of the live registry's $count anchors"
for id in "${ids[@]:0:$n}"; do
  info=$(read_call --id "$LIVE_REGISTRY" -- get_anchor_info --anchor_id "$id")
  stellar contract invoke "${NET[@]}" --source "$KEY" --id "$REG" -- register_anchor \
    --operator "$ADMIN" --anchor_id "$id" --name "$(jq -r .name <<<"$info")" \
    --domain "$(jq -r .domain <<<"$info")" --source_type "$(jq -r .source_type <<<"$info")" >/dev/null 2>&1
done

first="${ids[0]}"
first_type=$(read_call --id "$REG" -- get_anchor_info --anchor_id "$first" | jq -r .source_type)
call "authorize reporter" --id "$ORA" -- authorize_reporter --reporter "$ADMIN" --source_type "$first_type" >/dev/null
call "report for $first" --id "$ORA" -- submit_report --reporter "$ADMIN" --anchor_id "$first" \
  --success true --settlement_seconds 1 --timestamp "$(date -u +%s)" --source_type "$first_type" >/dev/null

snapshot() {
  {
    echo "count $(read_call --id "$REG" -- anchor_count)"
    local c; c=$(read_call --id "$REG" -- anchor_count)
    for ((s = 0; s < c; s += 100)); do read_call --id "$REG" -- list_anchors_page --start "$s" --limit 100 | jq -c .; done
    for id in "${ids[@]:0:3}" "${ids[$((n - 1))]}"; do read_call --id "$REG" -- get_anchor_info --anchor_id "$id" | jq -c 'del(.last_updated)'; done
    echo "score $(read_call --id "$ORA" -- get_score --anchor_id "$first")"
  } >"$1"
}
snapshot "$WORK/before"
log "before: $(head -1 "$WORK/before"), score of $first: $(tail -1 "$WORK/before" | cut -d' ' -f2)"

if [ "$target" = registry ]; then ID=$REG; else ID=$ORA; fi
HASH=$(stellar contract upload "${NET[@]}" --source "$KEY" --wasm "$NEW_WASM" 2>/dev/null)
log "uploaded: $HASH"
has_timelock() { read_call --id "$1" -- get_upgrade_delay >/dev/null; }
if has_timelock "$ID"; then
  call "propose_upgrade" --id "$ID" -- propose_upgrade --wasm_hash "$HASH" >/dev/null
  call "execute_upgrade" --id "$ID" -- execute_upgrade >/dev/null
else
  call "instant upgrade" --id "$ID" -- upgrade --new_wasm_hash "$HASH" >/dev/null
fi

snapshot "$WORK/after"
if diff -q "$WORK/before" "$WORK/after" >/dev/null; then
  log "after: state unchanged ($(head -1 "$WORK/after"), every page and sampled record equal, score kept)"
else
  log "after: STATE CHANGED"; diff "$WORK/before" "$WORK/after" | tee -a "$LOG"; exit 1
fi

call "report after the upgrade" --id "$ORA" -- submit_report --reporter "$ADMIN" --anchor_id "$first" \
  --success true --settlement_seconds 1 --timestamp "$(date -u +%s)" --source_type "$first_type" >/dev/null
log "a report after the upgrade is accepted (score of $first: $(read_call --id "$ORA" -- get_score --anchor_id "$first"))"

if has_timelock "$ID"; then
  log "time lock:"
  call "set_upgrade_delay 60" --id "$ID" -- set_upgrade_delay --seconds 60 >/dev/null
  call "propose_upgrade" --id "$ID" -- propose_upgrade --wasm_hash "$HASH" >/dev/null
  if stellar contract invoke "${NET[@]}" --source "$KEY" --id "$ID" -- execute_upgrade >/dev/null 2>"$WORK/early"; then
    log "  execute_upgrade before the delay SUCCEEDED: the time lock does not hold"; exit 1
  fi
  log "  execute_upgrade before the delay refused: $(grep -o -E 'TimelockActive|Error\(Contract, #[0-9]+\)' "$WORK/early" | sort -u | tr '\n' ' ')"
  sleep 65
  call "execute_upgrade after 60 s" --id "$ID" -- execute_upgrade >/dev/null
  # Shortening the delay waits out the current one: 60 s, already passed.
  call "set_upgrade_delay 0" --id "$ID" -- set_upgrade_delay --seconds 0 >/dev/null
fi

log "== rehearsal passed; log: $LOG"
