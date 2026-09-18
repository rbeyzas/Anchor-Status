#!/usr/bin/env bash
# One collection round: scan the real sources, submit what's new on-chain,
# then append the resulting on-chain events to the durable history archive.
#
# Run by cron every 20 minutes on the collector host. Deliberately NOT
# `set -e`: one failing collector (a flaky anchor, an RPC hiccup) must not
# stop the others or skip the archive step.
set -uo pipefail
cd "$(dirname "$0")/.."

export AGGREGATOR_SKIP_MOCK="${AGGREGATOR_SKIP_MOCK:-true}"

log() { echo "[collect $(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }

log "mainnet-probe: discover anchors (once a day) and register new ones on-chain"
(cd services/mainnet-probe && npm run --silent discover -- --daily) || log "anchor discovery failed"
(cd services/mainnet-probe && npm run --silent register) || log "anchor registration failed"

log "mainnet-probe (SEP-1/6/10/24 reachability, no funds moved)"
(cd services/mainnet-probe && npm run --silent probe) || log "mainnet-probe failed"

# Kept for the activity dimension (payment volume/recency); no longer
# submitted as a score, since volume is not reliability.
log "passive-monitor (mainnet payment activity, read-only)"
(cd services/passive-monitor && npm run --silent start) || log "passive-monitor failed"

log "testnet-probe (real SEP-10 + SEP-24 deposit)"
(cd services/testnet-probe && npm run --silent probe) || log "testnet-probe reported a failure"

log "aggregator (submit new reports to PerformanceOracle)"
(cd services/aggregator && npm run --silent aggregate) || log "aggregator failed"

# Must run last and always: it is what makes history survive the RPC's
# ~12h event window, so it runs even if a collector above failed.
log "history-archiver (append on-chain events to the durable archive)"
(cd services/history-archiver && npm run --silent archive) || log "history-archiver failed"

log "round complete"

