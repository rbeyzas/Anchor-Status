"""Builds the frozen mock-anchor data: fixtures/mock_anchor_N-behavior.json.

No randomness and no clock: every outcome is a pure function of (anchor, day,
slot), so re-running this reproduces the committed files byte for byte. The
files are in the shape services/aggregator reads (MockAnchorLogEntry).
Scenarios per anchor are listed in fixtures/README.md.

    python3 fixtures/build.py
"""
import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

START = datetime(2026, 8, 21, tzinfo=timezone.utc)  # day 0 (30 days: 21 Aug - 19 Sep)
DAYS = 30
SLOTS = (2, 6, 10, 14, 18, 22)  # hours; 6 transactions a day per anchor


def outcome(anchor: int, day: int, slot: int):
    """(success, base_seconds) for one transaction."""
    n = day * len(SLOTS) + slot
    if anchor == 1:  # steady and fast; one latency-spike day, still all successful
        return True, 60 if day == 12 else 8
    if anchor == 2:  # slow, ~10% failures; a full-day outage on day 15
        if day == 15:
            return False, 45
        return n % 10 != 7, 45
    if anchor == 3:  # ~8% failures, then a collapse to 40% from day 20
        if day < 20:
            return n % 12 != 5, 15
        return n % 5 in (0, 1), 15
    if anchor == 4:  # chronic: 35% success, slow; better and faster in the last 6 days
        if day >= 24:
            return n % 10 != 9, 40
        return n % 20 < 7, 120
    raise ValueError(anchor)


def build(anchor: int):
    anchor_id = f"mock_anchor_{anchor}"
    entries = []
    for day in range(DAYS):
        for slot, hour in enumerate(SLOTS):
            ok, base = outcome(anchor, day, slot)
            seconds = round(base * (1 + ((day * 7 + slot * 13) % 9 - 4) / 20), 2)  # +/-20%, fixed pattern
            ts = (START + timedelta(days=day, hours=hour)).isoformat()
            entries.append(
                {
                    "anchor_id": anchor_id,
                    "success": ok,
                    "settlement_seconds": seconds,
                    "timestamp": ts,
                    "source_type": "SimulatedMock",
                    "transaction_id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{anchor_id}/{ts}")),
                    "kind": "deposit",
                    "elapsed_simulated_days": day,
                }
            )
    return anchor_id, entries


if __name__ == "__main__":
    out = Path(__file__).parent
    for a in (1, 2, 3, 4):
        anchor_id, entries = build(a)
        (out / f"{anchor_id}-behavior.json").write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
        ok = sum(e["success"] for e in entries)
        print(f"{anchor_id}: {len(entries)} transactions, {ok} ok ({100 * ok // len(entries)}%)")
