#!/usr/bin/env bash
# Prepares a fresh Ubuntu host as the secondary reporter (server B):
#   PRIMARY_HOST=root@<A> SECONDARY_HOST=root@<B> bash scripts/setup-secondary.sh
#
# Safe to re-run. B gets the primary's public settings only: no deployer,
# reporter or mock-anchor key ever leaves A. B starts measuring right away
# but writes nothing on-chain until its own reporter keys are authorized
# and SECONDARY_PUBLISH=true is set in its .env (see scripts/collect.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

A="${PRIMARY_HOST:?set PRIMARY_HOST, e.g. root@<primary-host>}"
B="${SECONDARY_HOST:?set SECONDARY_HOST, e.g. root@<secondary-host>}"
REMOTE_DIR=/opt/anchor-status
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15)

echo "1/6 system packages on $B"
ssh "${SSH_OPTS[@]}" "$B" 'set -euo pipefail
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -yq curl rsync cron ca-certificates
  if ! node -v 2>/dev/null | grep -q "^v22"; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -yq nodejs
  fi
  mkdir -p '"$REMOTE_DIR"' /var/lib/anchor-status /var/log/anchor-status'

echo "2/6 .env (public settings from $A, role secondary)"
if ssh "${SSH_OPTS[@]}" "$B" "test -f $REMOTE_DIR/.env"; then
  echo "   $B already has a .env, left as it is"
else
  env_file=$(mktemp)
  trap 'rm -f "$env_file"' EXIT
  ssh "${SSH_OPTS[@]}" "$A" "grep -v -E '^(DEPLOYER_|REPORTER_|MOCK_ANCHOR_|DJANGO_|PROBE_CLIENT_SIGNING|COLLECTOR_ROLE|SECONDARY_PUBLISH)|SECRET' $REMOTE_DIR/.env" > "$env_file"
  printf '\n# Server B: independent second reporter (scripts/collect.sh)\nCOLLECTOR_ROLE=secondary\nSECONDARY_PUBLISH=false\n' >> "$env_file"
  scp -q "${SSH_OPTS[@]}" "$env_file" "$B:$REMOTE_DIR/.env"
  ssh "${SSH_OPTS[@]}" "$B" "chmod 600 $REMOTE_DIR/.env"
fi

echo "3/6 code, dependencies and cron"
COLLECTOR_HOST="$B" bash scripts/deploy-to-server.sh

echo "4/6 headless Chromium for testnet-probe"
ssh "${SSH_OPTS[@]}" "$B" "cd $REMOTE_DIR/services/testnet-probe && npx --yes playwright install --with-deps chromium >/dev/null && echo '   chromium ok'"

echo "5/6 nightly copy of $A's archive to $B (scripts/backup-archive.sh)"
ssh "${SSH_OPTS[@]}" "$A" 'test -f /root/.ssh/backup_push || ssh-keygen -q -t ed25519 -N "" -C backup-push-from-A -f /root/.ssh/backup_push'
pub=$(ssh "${SSH_OPTS[@]}" "$A" 'cat /root/.ssh/backup_push.pub')
# On B this key may only add to incoming/: no reads, no deletes.
ssh "${SSH_OPTS[@]}" "$B" "mkdir -p /var/backups/anchor-status/incoming
  grep -qF '$(echo "$pub" | cut -d' ' -f2)' ~/.ssh/authorized_keys || echo 'command=\"/usr/bin/rrsync -wo -no-del /var/backups/anchor-status/incoming\",restrict $pub' >> ~/.ssh/authorized_keys
  echo '50 3 * * * root $REMOTE_DIR/scripts/backup-archive.sh snapshot >> /var/log/anchor-status/backup.log 2>&1' > /etc/cron.d/anchor-backup
  chmod 644 /etc/cron.d/anchor-backup"
ssh "${SSH_OPTS[@]}" "$A" "grep -q '^BACKUP_HOST=' $REMOTE_DIR/.env || echo 'BACKUP_HOST=$B' >> $REMOTE_DIR/.env
  ssh-keygen -F ${B#*@} >/dev/null 2>&1 || ssh-keyscan -H ${B#*@} >> /root/.ssh/known_hosts 2>/dev/null
  echo '5 3 * * * root $REMOTE_DIR/scripts/backup-archive.sh push >> /var/log/anchor-status/backup.log 2>&1' > /etc/cron.d/anchor-backup
  chmod 644 /etc/cron.d/anchor-backup"

echo "6/6 nginx: B's evidence and shadow cards, read-only"
ssh "${SSH_OPTS[@]}" "$B" 'command -v nginx >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -yq nginx >/dev/null'
scp -q "${SSH_OPTS[@]}" scripts/nginx/secondary.conf "$B:/etc/nginx/sites-available/anchor-status"
ssh "${SSH_OPTS[@]}" "$B" 'mkdir -p /etc/systemd/system/nginx.service.d'
scp -q "${SSH_OPTS[@]}" scripts/nginx/restart.conf "$B:/etc/systemd/system/nginx.service.d/restart.conf"
ssh "${SSH_OPTS[@]}" "$B" 'systemctl daemon-reload
  ln -sfn /etc/nginx/sites-available/anchor-status /etc/nginx/sites-enabled/anchor-status
  rm -f /etc/nginx/sites-enabled/default
  nginx -t -q && systemctl reload nginx'

echo "done: $B measures every 20 minutes; nothing is written on-chain yet"
