#!/usr/bin/env bash
# Deploys the collector host from the tracked branch. Run it by hand on the
# host when you want a push to go live:
#
#   ssh <host> 'cd /opt/anchor-status && scripts/server-autodeploy.sh'
#
# It was on a cron timer, but a deploy queued at the end of a collection
# round inherited cron's lock file descriptor and then waited for the lock
# it was itself holding — the deploys piled up, stuck, and nothing said so.
# Running it deliberately is the honest version until that is fixed.
#
# Incremental by design:
#   * exits immediately when the remote SHA hasn't moved (the common case);
#   * `npm install` runs only for services whose package.json/lock changed;
#   * /var/lib/anchor-status (history, dedup state, probe log) is never
#     touched, and neither is the untracked .env;
#   * holds the collection lock for the whole deploy, so it can never swap
#     files under a running round;
#   * rebuilds the Vercel dashboard only when dashboard/ changed.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/anchor-status}"
LOCK="${ANCHOR_LOCK:-/var/lock/anchor-collect.lock}"

# Hold the collection lock for the whole deploy, not just long enough to
# check it: swapping files halfway through a round is what breaks a round.
# collect.sh runs under the same lock, so one waits for the other. Re-exec
# rather than wrap, so the lock is held until this script exits.
if [ -z "${ANCHOR_DEPLOY_LOCKED:-}" ]; then
  exec env ANCHOR_DEPLOY_LOCKED=1 flock -w 1800 "$LOCK" "$0" "$@"
fi
BRANCH="${DEPLOY_BRANCH:-main}"

cd "$REPO_DIR"
log() { echo "[autodeploy $(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }

git fetch --quiet origin "$BRANCH"
# "none" on a freshly initialised checkout that has no commit yet, so the
# first deploy after bootstrapping works like any other.
local_sha=$(git rev-parse HEAD 2>/dev/null || echo none)
remote_sha=$(git rev-parse "origin/$BRANCH")
if [ "$local_sha" = "$remote_sha" ]; then
  exit 0
fi

log "deploying ${local_sha:0:8} -> ${remote_sha:0:8}"
# Hard reset rather than merge: the host is a deployment target, not a place
# anyone edits. Untracked files (.env, node_modules, .deps.sum) are kept.
# checkout -B also fixes the branch name when the checkout was bootstrapped
# with `git init` (which starts on master with no commits).
# -f: the host may hold untracked copies of tracked files (e.g. a checkout
# bootstrapped from an rsync deploy). Only paths the target commit contains
# are overwritten, so .env, node_modules and .deps.sum are left alone.
git checkout -q -f -B "$BRANCH" "origin/$BRANCH"
git reset --hard --quiet "origin/$BRANCH"

# Read the service list from the tree just checked out, not from this
# script's startup: a service added in the incoming commit must be installed
# by the same deploy that brings it in. (mock-anchors is Python and has no
# package.json, so it is skipped — the collector doesn't run it.)
for pkg in "$REPO_DIR"/services/*/package.json; do
  svc=$(dirname "$pkg")
  d=$(basename "$svc")
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

# The Vercel project is not connected to this Git repo (the repo lives in
# another account), so a push does not rebuild the dashboard on its own.
# Trigger it here instead, and only when dashboard/ actually changed.
if [ -f /etc/anchor-status/vercel.env ] && [ "$local_sha" != "none" ] &&
   ! git diff --quiet "$local_sha" "$remote_sha" -- dashboard/; then
  # shellcheck disable=SC1091
  . /etc/anchor-status/vercel.env
  log "dashboard changed, deploying to Vercel"
  if (cd "$REPO_DIR/dashboard" && vercel deploy --prod --yes --token "$VERCEL_TOKEN" >/dev/null 2>&1); then
    log "Vercel deploy ok"
  else
    log "Vercel deploy FAILED (see: vercel deploy --prod in $REPO_DIR/dashboard)"
  fi
fi

log "deployed ${remote_sha:0:8}"
