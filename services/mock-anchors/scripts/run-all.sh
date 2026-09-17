#!/usr/bin/env bash
# Starts all 4 mock anchors (ports 8001-8004): runs migrations, seeds each
# instance's Asset row, then launches both `runserver` (the SEP-1/10/24 HTTP
# API) and `simulate_transactions` (the behavior-profile-driven settlement
# simulator) per anchor, all in the background. PIDs are written to
# state/pids so scripts/stop-all.sh can clean them up.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d .venv ]; then
  echo ".venv not found. Run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi
if [ ! -f secrets.env ]; then
  echo "secrets.env not found. Run scripts/bootstrap-issuers.sh first (requires Friendbot network access)."
  exit 1
fi
source secrets.env

mkdir -p state
: > state/pids

PY="$(pwd)/.venv/bin/python3"
# Captured once: start_anchor exports DJANGO_SECRET_KEY, so reading it inside
# the function would leak anchor 1's fallback key into anchors 2-4.
BASE_DJANGO_SECRET_KEY="${DJANGO_SECRET_KEY:-}"

start_anchor() {
  local idx="$1" port="$2"
  local issuer_var="MOCK_ANCHOR_${idx}_ISSUER_PUBLIC"
  local secret_var="MOCK_ANCHOR_${idx}_ISSUER_SECRET"

  export ANCHOR_ID="mock_anchor_${idx}"
  export ANCHOR_NAME="Mock Anchor ${idx}"
  export ANCHOR_PORT="${port}"
  export ANCHOR_HOST="localhost:${port}"
  export ASSET_CODE="${ASSET_CODE:-SRT}"
  export ASSET_ISSUER="${!issuer_var}"
  export DISTRIBUTION_SEED="${!secret_var}"
  export BEHAVIOR_PROFILE_PATH="$(pwd)/behavior_profiles/anchor-${idx}.json"
  export DJANGO_SECRET_KEY="${BASE_DJANGO_SECRET_KEY:-dev-insecure-mock-anchor-${idx}}"
  export HORIZON_TESTNET_URL="${HORIZON_TESTNET_URL:-https://horizon-testnet.stellar.org}"
  export STELLAR_NETWORK_PASSPHRASE="${STELLAR_NETWORK_PASSPHRASE:-Test SDF Network ; September 2015}"
  export TIME_ACCELERATION="${TIME_ACCELERATION:-1440}"
  export DEBUG="false"

  echo "== mock_anchor_${idx} (port ${port}, issuer ${!issuer_var}) =="
  "$PY" manage.py migrate --noinput
  "$PY" manage.py seed_asset
  "$PY" manage.py collectstatic --noinput >/dev/null

  nohup "$PY" manage.py runserver "127.0.0.1:${port}" --noreload \
    > "state/anchor${idx}-server.log" 2>&1 &
  echo $! >> state/pids

  nohup "$PY" manage.py simulate_transactions \
    > "state/anchor${idx}-simulator.log" 2>&1 &
  echo $! >> state/pids

  # Demo-only synthetic traffic generator — see the command's docstring.
  # Skip with SEED_DEMO_TRAFFIC=false if you'll drive real SEP-24 deposits
  # yourself (e.g. via testnet-probe pointed at this anchor).
  if [ "${SEED_DEMO_TRAFFIC:-true}" = "true" ]; then
    nohup "$PY" manage.py seed_demo_transactions --interval-seconds "${DEMO_TRAFFIC_INTERVAL_SECONDS:-15}" \
      > "state/anchor${idx}-traffic.log" 2>&1 &
    echo $! >> state/pids
  fi
}

start_anchor 1 "${MOCK_ANCHOR_1_PORT:-8001}"
start_anchor 2 "${MOCK_ANCHOR_2_PORT:-8002}"
start_anchor 3 "${MOCK_ANCHOR_3_PORT:-8003}"
start_anchor 4 "${MOCK_ANCHOR_4_PORT:-8004}"

echo ""
echo "All 4 mock anchors started. Logs: state/anchor{1..4}-{server,simulator}.log"
echo "Stellar.toml check: curl http://localhost:8001/.well-known/stellar.toml"
echo "Stop with: scripts/stop-all.sh"
