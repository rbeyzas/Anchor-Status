#!/usr/bin/env bash
# Deploys the collector host incrementally. Run from a checkout:
#   COLLECTOR_HOST=root@<collector-host> bash scripts/deploy-to-server.sh
#
# What goes live is what is pushed to main, never a local working tree: the
# host's own checkout (a git clone in REMOTE_DIR) is moved to origin/main by
# scripts/server-autodeploy.sh, so `git rev-parse HEAD` on the host says
# exactly which code runs. Until 24 Oct 2026 this copied the local tree with
# rsync, which could ship unpushed changes and never removed deleted files.
#
# Incremental on purpose — it never rebuilds the host from scratch:
#   * only what changed since the host's commit moves; the .env and the
#     untracked node_modules stay.
#   * npm install runs only for services whose package.json/lock changed.
#   * cron, nginx and the results symlink are installed only if missing,
#     so an already-configured host is left exactly as it is.
#   * /var/lib/anchor-status (history, dedup state, probe log) is never
#     touched, so a redeploy cannot reset what has been collected.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${COLLECTOR_HOST:?set COLLECTOR_HOST, e.g. root@<collector-host>}"
REMOTE_DIR="${REMOTE_DIR:-/opt/anchor-status}"
DATA_DIR="${DATA_DIR:-/var/lib/anchor-status}"
CTL=$(mktemp -u /tmp/deploy-ssh.XXXXXX)
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o ControlPath="$CTL")

# One SSH connection for the whole deploy, shared by every step below. The
# primary's provider resets a share of new SSH handshakes, so only this
# first one has to get through, and it is retried.
for attempt in 1 2 3 4 5 6 7 8; do
  ssh "${SSH_OPTS[@]}" -o ControlMaster=yes -o ControlPersist=600 -fN "$HOST" && break
  [ "$attempt" = 8 ] && { echo "cannot reach $HOST"; exit 1; }
  sleep 5
done
trap 'ssh -o ControlPath="$CTL" -O exit "$HOST" 2>/dev/null' EXIT

# Wait for an in-flight collection round to finish rather than swapping
# files underneath it. -w: give up waiting after 10 minutes and deploy anyway
# (a round takes ~3, and a stuck round must not block deploys forever).
ssh "${SSH_OPTS[@]}" "$HOST" "flock -w 600 /var/lock/anchor-collect.lock -c true" || true

# Says what goes live: origin/main as last fetched here, whatever is on disk.
pushed=$(git rev-parse origin/main 2>/dev/null || true)
[ -n "$(git status --porcelain --untracked-files=no)" ] && echo "note: local changes are not deployed; only origin/main is"
echo "deploying origin/main ${pushed:0:8}"
ssh "${SSH_OPTS[@]}" "$HOST" "cd $REMOTE_DIR && git rev-parse --git-dir >/dev/null && scripts/server-autodeploy.sh && echo \"host now at \$(git rev-parse --short HEAD)\""

# Only the services the collector actually runs.
ssh "${SSH_OPTS[@]}" "$HOST" "set -euo pipefail
  for d in mainnet-probe passive-monitor testnet-probe aggregator history-archiver; do
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
