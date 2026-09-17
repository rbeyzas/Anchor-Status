#!/usr/bin/env bash
# Deploys the collector host incrementally. Run from a checkout:
#   COLLECTOR_HOST=root@37.221.76.23 bash scripts/deploy-to-server.sh
#
# Incremental on purpose — it never rebuilds the host from scratch:
#   * rsync without --delete: only changed files are copied.
#   * npm install runs only for services whose package.json/lock changed.
#   * cron, nginx and the results symlink are installed only if missing,
#     so an already-configured host is left exactly as it is.
#   * /var/lib/anchor-status (history, dedup state, probe log) is never
#     touched, so a redeploy cannot reset what has been collected.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${COLLECTOR_HOST:?set COLLECTOR_HOST, e.g. root@37.221.76.23}"
REMOTE_DIR="${REMOTE_DIR:-/opt/anchor-status}"
DATA_DIR="${DATA_DIR:-/var/lib/anchor-status}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15)

# Wait for an in-flight collection round to finish rather than swapping
# files underneath it. -w: give up waiting after 10 minutes and deploy anyway
# (a round takes ~3, and a stuck round must not block deploys forever).
ssh "${SSH_OPTS[@]}" "$HOST" "flock -w 600 /var/lock/anchor-collect.lock -c true" || true

rsync -az \
  --exclude 'node_modules/' --exclude '.next/' --exclude '.venv/' \
  --exclude 'target/' --exclude '.git/' --exclude 'graphify-out/' \
  --exclude '.vercel/' --exclude '*.pdf' \
  --exclude '.env' \
  --exclude 'services/mock-anchors/state/' --exclude 'services/mock-anchors/logs/' \
  --exclude 'services/testnet-probe/results/' \
  --exclude 'services/passive-monitor/output/' \
  -e "ssh ${SSH_OPTS[*]}" \
  ./ "$HOST:$REMOTE_DIR/"

# Only the services the collector actually runs; mock-anchors stays local.
ssh "${SSH_OPTS[@]}" "$HOST" "set -euo pipefail
  for d in passive-monitor testnet-probe aggregator history-archiver; do
    svc=$REMOTE_DIR/services/\$d
    sum=\$(cat \$svc/package.json \$svc/package-lock.json 2>/dev/null | md5sum | cut -d' ' -f1)
    if [ ! -d \$svc/node_modules ] || [ \"\$(cat \$svc/.deps.sum 2>/dev/null)\" != \"\$sum\" ]; then
      echo \"installing deps: \$d\"
      (cd \$svc && npm install --silent --no-audit --no-fund)
      echo \"\$sum\" > \$svc/.deps.sum
    fi
  done

  # Each of these is a no-op on an already-configured host.
  mkdir -p $DATA_DIR/probe-results /var/log/anchor-status
  test -L $REMOTE_DIR/services/testnet-probe/results || {
    rm -rf $REMOTE_DIR/services/testnet-probe/results
    ln -sfn $DATA_DIR/probe-results $REMOTE_DIR/services/testnet-probe/results
  }
  test -f /etc/cron.d/anchor-status || {
    echo 'cron entry missing, reinstalling'
    printf '%s\n' 'SHELL=/bin/bash' 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' \
      '*/20 * * * * root /usr/bin/flock -n /var/lock/anchor-collect.lock $REMOTE_DIR/scripts/collect.sh >> /var/log/anchor-status/collect.log 2>&1' \
      > /etc/cron.d/anchor-status
    chmod 644 /etc/cron.d/anchor-status
    systemctl restart cron
  }
  test -f $REMOTE_DIR/.env || echo 'WARNING: $REMOTE_DIR/.env is missing — collectors cannot sign without it'
  echo 'deploy ok'"
