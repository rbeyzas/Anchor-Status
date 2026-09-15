#!/usr/bin/env bash
# Generates 4 fresh testnet keypairs (one per mock anchor), funds each via
# Friendbot, and writes them to services/mock-anchors/secrets.env (gitignored).
# Each anchor uses the SAME account as both its asset issuer and its SEP-10
# signing key / distribution account (a common simplification for test
# assets).
#
# REQUIRES NETWORK ACCESS (Friendbot).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d .venv ]; then
  echo ".venv not found. Run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

FRIENDBOT_URL="${FRIENDBOT_URL:-https://friendbot.stellar.org}"

.venv/bin/python <<PYEOF
import os
import urllib.request
from stellar_sdk import Keypair

friendbot_url = "${FRIENDBOT_URL}"
lines = []
for i in range(1, 5):
    kp = Keypair.random()
    url = f"{friendbot_url}/?addr={kp.public_key}"
    print(f"Funding mock_anchor_{i}: {kp.public_key}")
    # Friendbot 403s a bare urllib request (its default "Python-urllib/x.y"
    # User-Agent gets blocked) even though the exact same URL works fine
    # from curl or a browser — set a normal-looking UA to get past that.
    req = urllib.request.Request(url, headers={"User-Agent": "anchor-oracle-bootstrap/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status != 200:
            raise SystemExit(f"Friendbot funding failed for {kp.public_key}: HTTP {resp.status}")
    lines.append(f"MOCK_ANCHOR_{i}_ISSUER_PUBLIC={kp.public_key}")
    lines.append(f"MOCK_ANCHOR_{i}_ISSUER_SECRET={kp.secret}")

with open("secrets.env", "w") as f:
    f.write("\n".join(lines) + "\n")
print("Wrote secrets.env")
PYEOF

echo "Done. secrets.env contains 4 funded testnet keypairs (gitignored, never commit this file)."
