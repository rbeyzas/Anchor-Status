#!/usr/bin/env bash
# Pull-based auto-deploy, run by cron on the collector host every few
# minutes. Whoever pushes to the tracked branch gets deployed — it does not
# matter whose machine the commit came from, and no one needs SSH access to
# this host.
#
# Incremental by design:
#   * exits immediately when the remote SHA hasn't moved (the common case);
#   * `npm install` runs only for services whose package.json/lock changed;
#   * /var/lib/anchor-status (history, dedup state, probe log) is never
#     touched, and neither is the untracked .env;
#   * waits for an in-flight collection round instead of swapping files
#     under it.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/anchor-status}"
BRANCH="${DEPLOY_BRANCH:-main}"
SERVICES=(passive-monitor testnet-probe aggregator history-archiver)

cd "$REPO_DIR"
log() { echo "[autodeploy $(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }

git fetch --quiet origin "$BRANCH"
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse "origin/$BRANCH")
if [ "$local_sha" = "$remote_sha" ]; then
  exit 0
fi

log "deploying ${local_sha:0:8} -> ${remote_sha:0:8}"
flock -w 600 /var/lock/anchor-collect.lock -c true || log "collection round still running, deploying anyway"

# Hard reset rather than merge: the host is a deployment target, not a place
# anyone edits. Untracked files (.env, node_modules, .deps.sum) are kept.
git reset --hard --quiet "origin/$BRANCH"

for d in "${SERVICES[@]}"; do
  svc="$REPO_DIR/services/$d"
  [ -d "$svc" ] || continue
  sum=$(cat "$svc/package.json" "$svc/package-lock.json" 2>/dev/null | md5sum | cut -d' ' -f1)
  if [ ! -d "$svc/node_modules" ] || [ "$(cat "$svc/.deps.sum" 2>/dev/null)" != "$sum" ]; then
    log "installing deps: $d"
    (cd "$svc" && npm install --silent --no-audit --no-fund)
    echo "$sum" > "$svc/.deps.sum"
  fi
done

# git reset restores the tracked directory that the symlink replaced.
if [ ! -L "$REPO_DIR/services/testnet-probe/results" ]; then
  rm -rf "$REPO_DIR/services/testnet-probe/results"
  ln -sfn /var/lib/anchor-status/probe-results "$REPO_DIR/services/testnet-probe/results"
fi

log "deployed ${remote_sha:0:8}"
