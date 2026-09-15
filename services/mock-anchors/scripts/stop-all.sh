#!/usr/bin/env bash
# Stops all processes started by run-all.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f state/pids ]; then
  echo "state/pids not found — nothing to stop."
  exit 0
fi

while read -r pid; do
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" && echo "Stopped PID $pid"
  fi
done < state/pids

rm -f state/pids
