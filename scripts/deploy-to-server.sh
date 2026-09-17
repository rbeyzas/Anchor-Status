#!/usr/bin/env bash
# Deploys the collector host (services + cron script). Run from a checkout:
#   COLLECTOR_HOST=root@37.221.76.23 bash scripts/deploy-to-server.sh
#
# Never touches /var/lib/anchor-status — the accumulated history, the
# aggregator's dedup state and the probe log live there precisely so a
# redeploy cannot reset them. `results/` on the host is a symlink into that
# directory, so it is excluded here rather than overwritten.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${COLLECTOR_HOST:?set COLLECTOR_HOST, e.g. root@37.221.76.23}"
REMOTE_DIR="${REMOTE_DIR:-/opt/anchor-status}"

rsync -az \
  --exclude 'node_modules/' --exclude '.next/' --exclude '.venv/' \
  --exclude 'target/' --exclude '.git/' --exclude 'graphify-out/' \
  --exclude '.vercel/' --exclude '*.pdf' \
  --exclude '.env' \
  --exclude 'services/mock-anchors/state/' --exclude 'services/mock-anchors/logs/' \
  --exclude 'services/testnet-probe/results/' \
  --exclude 'services/passive-monitor/output/' \
  ./ "$HOST:$REMOTE_DIR/"

# Only the services the collector actually runs; mock-anchors stays local.
ssh "$HOST" "set -e
  for d in passive-monitor testnet-probe aggregator history-archiver; do
    (cd $REMOTE_DIR/services/\$d && npm install --silent --no-audit --no-fund)
  done
  test -L $REMOTE_DIR/services/testnet-probe/results || {
    rm -rf $REMOTE_DIR/services/testnet-probe/results
    ln -sfn /var/lib/anchor-status/probe-results $REMOTE_DIR/services/testnet-probe/results
  }
  echo 'deploy ok'"
