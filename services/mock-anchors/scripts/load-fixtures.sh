#!/usr/bin/env bash
# Installs the frozen data (fixtures/) as the mock anchors' logs, which is
# where the aggregator reads them. Overwrites logs/*-behavior.json. Do not run
# the live simulator (run-all.sh) at the same time: it appends to the same files.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
cp fixtures/mock_anchor_*-behavior.json logs/
echo "Loaded $(ls fixtures/mock_anchor_*-behavior.json | wc -l | tr -d ' ') fixture files into logs/"
