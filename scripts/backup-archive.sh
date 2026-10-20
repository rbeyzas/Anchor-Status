#!/usr/bin/env bash
# Nightly off-host copy of the primary's /var/lib/anchor-status on server B.
#
#   push      (cron on A) sends the data dir to B's incoming/ copy. A's
#             provider resets many inbound SSH handshakes, so A pushes
#             rather than B pulling. On B, A's key may only write into
#             incoming/ and never delete (rrsync -wo -no-del), see
#             scripts/setup-secondary.sh.
#   snapshot  (cron on B) turns incoming/ into a dated directory A cannot
#             reach. Files unchanged since the night before are hardlinks,
#             so a night costs only what changed that day (~50 MB), not a
#             full copy. The last KEEP_DAYS nights are kept.
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="${BACKUP_DIR:-/var/backups/anchor-status}"
KEEP_DAYS="${KEEP_DAYS:-30}"
log() { echo "[backup $(date -u '+%Y-%m-%dT%H:%M:%SZ')] [${1:-}] ${*:2}"; }

push() {
  local dst="${BACKUP_HOST:-$(grep -s '^BACKUP_HOST=' .env | cut -d= -f2)}"
  dst="${dst:?set BACKUP_HOST in .env, e.g. root@<secondary-host>}"
  local key="${BACKUP_KEY:-/root/.ssh/backup_push}"
  for attempt in 1 2 3 4 5 6; do
    # rrsync on B roots every path at incoming/. Copies of .env (env.*)
    # hold the admin and reporter keys and must never leave A.
    if rsync -az --exclude '*.bak' --exclude 'env' --exclude 'env.*' --exclude '.env*' \
        -e "ssh -i $key -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=30" \
        /var/lib/anchor-status/ "$dst:/"; then
      log push "sent to $dst"
      return
    fi
    [ "$attempt" = 6 ] && { log push "failed 6 times"; exit 1; }
    sleep 60
  done
}

snapshot() {
  local in="$DEST/incoming" today work
  [ -d "$in" ] || { log snapshot "nothing received yet in $in"; exit 1; }
  # A push still running would leave a half-updated copy; wait it out.
  for _ in $(seq 1 60); do pgrep -x rsync >/dev/null || break; sleep 60; done
  today=$(date -u +%F)
  work="$DEST/.partial-$today"
  local link=()
  [ -d "$DEST/latest/" ] && link=(--link-dest="$DEST/latest/")
  rsync -a --delete "${link[@]}" "$in/" "$work/"
  rm -rf "${DEST:?}/$today"
  mv "$work" "$DEST/$today"
  ln -sfn "$today" "$DEST/latest"
  # Dated directories sort by name; drop all but the newest KEEP_DAYS.
  ls -1d "$DEST"/20??-??-?? | head -n -"$KEEP_DAYS" | xargs -r rm -rf
  log snapshot "$DEST/$today; $(du -sh "$DEST" | cut -f1) on disk for $(ls -1d "$DEST"/20??-??-?? | wc -l) night(s)"
}

case "${1:-}" in
  push) push ;;
  snapshot) snapshot ;;
  *) echo "usage: $0 push|snapshot" >&2; exit 2 ;;
esac
