# mock-anchors

Python + django-polaris based, fully-controlled 4-instance SEP-24 mock
anchor server. Everything runs on **testnet** (each instance funds its
own testnet issuer account via Friendbot). One Django codebase
(`config/` + `mockanchor/`) runs as 4 separate instances via 4 different
environment-variable sets (port, asset issuer, behavior profile) — see
`scripts/run-all.sh`.

| Anchor | Port | Behavior profile |
|---|---|---|
| mock_anchor_1 | 8001 | `behavior_profiles/anchor-1.json` — reliable, fast |
| mock_anchor_2 | 8002 | `behavior_profiles/anchor-2.json` — decent, slower |
| mock_anchor_3 | 8003 | `behavior_profiles/anchor-3.json` — degrades after simulated day 20 (the slashing demo) |
| mock_anchor_4 | 8004 | `behavior_profiles/anchor-4.json` — unreliable from the start |

Each `behavior_profile.json`:
```json
{
  "avg_completion_seconds": 12,
  "success_rate_percent": 97,
  "degradation": { "after_days": 20, "success_rate_percent": 40 }
}
```

## How it works (no real Stellar submission)

This service runs the SEP-24 interactive deposit/withdraw flow through
real django-polaris integration hooks (`mockanchor/integrations.py`):
real SEP-1/SEP-10/SEP-24 HTTP endpoints, a real transaction state
machine. But what moves a transaction from `pending_user_transfer_start`
to `completed`/`error` is NOT Polaris's own on-chain watcher
(`watch_transactions`) — it's our own `manage.py simulate_transactions`
command (`mockanchor/management/commands/simulate_transactions.py`).
That command decides each transaction's outcome using a deterministic
random generator (seeded on the transaction id) driven by the success
rate / latency / degradation parameters in `behavior_profiles/anchor-N.json`,
and never submits anything to the Stellar network. This serves the
"fully controlled" goal exactly: an anchor's reliability is entirely
whatever `behavior_profile.json` says it is.

Every completed (or failed) transaction is appended, in the normalized
shape the aggregator reads, to `logs/anchor{N}-behavior.json`:
`{anchor_id, success, settlement_seconds, timestamp, source_type: "SimulatedMock", ...}`.

`TIME_ACCELERATION` (default `1440` = 1 real minute = 1 simulated day)
lets scenarios like "degrades after day 20" trigger within minutes
during a demo instead of after 20 real days.

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

bash scripts/bootstrap-issuers.sh   # generate + fund 4 testnet keypairs via Friendbot -> secrets.env
bash scripts/run-all.sh              # migrate + seed_asset + runserver + simulate_transactions (4 anchors, 8001-8004)
bash scripts/stop-all.sh             # stop everything

.venv/bin/pytest                    # network-free unit tests (mockanchor/behavior.py)
```

Verify:
```bash
curl http://localhost:8001/.well-known/stellar.toml
curl http://localhost:8001/sep24/info
```

## Demo traffic (`seed_demo_transactions`)

In real use, transactions are created by a real wallet driving the
SEP-24 interactive flow (this project fully supports that — see above).
To avoid requiring a real wallet integration for a live demo, the
`manage.py seed_demo_transactions` command periodically creates synthetic
`pending_user_transfer_start` transactions directly, so
`simulate_transactions` always has something to process and the
aggregator/dashboard show continuous activity. It has no interaction
with Stellar and is not part of the SEP-24 protocol — it's started
automatically by `scripts/run-all.sh` (disable with
`SEED_DEMO_TRAFFIC=false`).

## Notes

- `manage.py seed_asset`: creates/updates this instance's Polaris `Asset`
  row from the `ASSET_ISSUER`/`DISTRIBUTION_SEED` environment variables
  (idempotent).
- `manage.py simulate_transactions [--once]`: the simulation loop;
  `--once` runs a single pass and exits (for testing/debugging).
- Each anchor has its own SQLite DB (`state/db-mock_anchor_N.sqlite3`)
  and its own "start time" state file
  (`state/mock_anchor_N-started-at.json`) — the degradation scenario is
  computed from the (accelerated) time elapsed since that point.
