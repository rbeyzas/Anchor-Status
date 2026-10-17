#!/usr/bin/env bash
# One collection round: scan the real sources, submit what's new on-chain,
# then append the resulting on-chain events to the durable history archive.
#
# Run by cron every 20 minutes on each collector host. Deliberately NOT
# `set -e`: one failing collector (a flaky anchor, an RPC hiccup) must not
# stop the others or skip the archive step.
#
# COLLECTOR_ROLE (in the host's .env):
#   primary   (default) discovers anchors, registers them on-chain, measures,
#             submits, and keeps the history archive.
#   secondary an independent second reporter. It measures the anchors the
#             on-chain registry holds and never registers anything. Until
#             its reporter keys are authorized (SECONDARY_PUBLISH=true) it
#             writes nothing on-chain at all, only its own evidence.
set -uo pipefail
cd "$(dirname "$0")/.."

ROLE="${COLLECTOR_ROLE:-$(grep -s '^COLLECTOR_ROLE=' .env | cut -d= -f2)}"
ROLE="${ROLE:-primary}"
SECONDARY_PUBLISH="${SECONDARY_PUBLISH:-$(grep -s '^SECONDARY_PUBLISH=' .env | cut -d= -f2)}"

log() { echo "[collect $(date -u '+%Y-%m-%dT%H:%M:%SZ')] [$ROLE] $*"; }

if [ "$ROLE" = "primary" ]; then
  log "mainnet-probe: discover anchors (once a day), admit applicants, register new ones on-chain"
  (cd services/mainnet-probe && npm run --silent discover -- --daily) || log "anchor discovery failed"
  # Applications from the dashboard's "Add your anchor" page: the ones that
  # qualify join anchors.json, so the register step right after puts them
  # on-chain and this same round starts measuring them.
  (cd services/mainnet-probe && npm run --silent onboard) || log "anchor onboarding failed"
  (cd services/mainnet-probe && npm run --silent register) || log "anchor registration failed"
else
  # Discovery is read-only and decides which anchors are dormant; the list
  # itself then comes from the registry, so both reporters score the same ids.
  log "mainnet-probe: discover liveness (once a day), then take the anchor list from the registry"
  (cd services/mainnet-probe && npm run --silent discover -- --daily) || log "anchor discovery failed"
  (cd services/mainnet-probe && npm run --silent sync-from-chain) || log "registry sync failed, keeping the last list"
fi

log "mainnet-probe (SEP-1/6/10/24 reachability, no funds moved)"
(cd services/mainnet-probe && npm run --silent probe) || log "mainnet-probe failed"

# Kept for the activity dimension (payment volume/recency); no longer
# submitted as a score, since volume is not reliability.
log "passive-monitor (mainnet payment activity, read-only)"
(cd services/passive-monitor && npm run --silent start) || log "passive-monitor failed"

# Testnet, kept apart from mainnet: its own applications queue, its own
# anchor list, and a real money flow instead of a read-only check.
if [ "$ROLE" = "primary" ]; then
  log "testnet-probe: admit testnet applicants, register them on-chain (RealTestnet)"
  (cd services/testnet-probe && npm run --silent onboard) || log "testnet onboarding failed"
  (cd services/testnet-probe && npm run --silent register) || log "testnet registration failed"
fi

log "testnet-probe (money flow: SEP-10, deposit and withdrawal, every payment checked on the ledger)"
(cd services/testnet-probe && npm run --silent probe) || log "testnet-probe reported a failure"

if [ "$ROLE" = "primary" ] || [ "$SECONDARY_PUBLISH" = "true" ]; then
  log "aggregator (submit new reports to PerformanceOracle)"
  (cd services/aggregator && npm run --silent aggregate) || log "aggregator failed"
else
  log "aggregator skipped: secondary not publishing yet (SECONDARY_PUBLISH unset)"
fi

if [ "$ROLE" = "primary" ]; then
  # Must run last and always: it is what makes history survive the RPC's
  # ~12h event window, so it runs even if a collector above failed.
  log "history-archiver (append on-chain events to the durable archive)"
  (cd services/history-archiver && npm run --silent archive) || log "history-archiver failed"
fi

log "round complete"
