"""Builds the frozen mock-anchor data: fixtures/mock_anchor_N-behavior.json.

No randomness and no clock: every outcome is a pure function of (anchor, day,
slot), so re-running this reproduces the committed files byte for byte. The
files are in the shape services/aggregator reads (MockAnchorLogEntry).
Scenarios per anchor are listed in fixtures/README.md.

    python3 fixtures/build.py

Also writes dashboard/data/mock-demo.json: the score card, health, latest
check and daily score history the dashboard shows for these four anchors,
derived from the same transactions with the constants of docs/SCORING.md.
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


# --- dashboard demo cards ----------------------------------------------------
UPTIME_CURVE = [(0, 0), (80, 10), (90, 35), (95, 60), (97, 75), (99, 90), (99.5, 100), (100, 100)]
SPEED_CURVE = [(0.75, 100), (5.0, 40)]
MARKET_CURVE = [(0, 100), (25, 100), (50, 90), (100, 70), (200, 45), (300, 25), (500, 0)]
WEIGHTS = {"availability": 450, "speed": 200, "integrity": 200, "market": 150}
CAPS = {"OUTAGE": 50, "LOW_UPTIME": 60, "DEPEG": 50}
WINDOW_END = datetime(2026, 9, 20, tzinfo=timezone.utc)

# What the transactions cannot say: how fast a stage answers (p95, seconds),
# the integrity checklist score, how far the asset sits from its peg (bps),
# how much of the flow a check can reach, and the flags that are not derived.
FACTS = {
    1: dict(p95=0.6, integrity=100, market_bps=10, coverage=1.0, extra=[], assets=["SRT"], market_na=None),
    2: dict(p95=3.2, integrity=92, market_bps=None, coverage=0.8, extra=["NO_MARKET"], assets=[], market_na="not_issuer"),
    3: dict(p95=1.4, integrity=100, market_bps=350, coverage=1.0, extra=["DEPEG"], assets=["SRT"], market_na=None),
    4: dict(p95=4.4, integrity=70, market_bps=None, coverage=0.5, extra=["LOW_COVERAGE", "NO_MARKET"], assets=[], market_na="no_market"),
}


def curve(points, x):
    if x <= points[0][0]:
        return points[0][1]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return points[-1][1]


def rate(entries):
    return 100 * sum(e["success"] for e in entries) / len(entries)


def card_at(anchor: int, entries, day: int):
    """The card as it would read at the end of `day` (0-based)."""
    f = FACTS[anchor]
    upto = [e for e in entries if e["elapsed_simulated_days"] <= day]
    week = [e for e in upto if e["elapsed_simulated_days"] > day - 7]
    up7, up30 = rate(week), rate(upto)
    availability = 0.5 * curve(UPTIME_CURVE, up7) + 0.5 * curve(UPTIME_CURVE, up30)
    speed = curve(SPEED_CURVE, f["p95"])
    market = None if f["market_bps"] is None else curve(MARKET_CURVE, f["market_bps"])
    pillars = {"availability": availability, "speed": speed, "integrity": f["integrity"], "market": market}
    flags = list(f["extra"])
    if not any(e["success"] for e in upto[-3:]):
        flags.append("OUTAGE")
    if len(week) >= 20 and up7 < 90:
        flags.append("LOW_UPTIME")
    weights = {k: w for k, w in WEIGHTS.items() if pillars[k] is not None}
    total = sum(weights.values())
    raw = sum(pillars[k] * w for k, w in weights.items()) / total
    monitored = day + 1
    confidence = round(100 * min(1, monitored / 14) * min(1, len(upto) / 100) * (0.5 + 0.5 * f["coverage"]))
    shrunk = (confidence * raw + (100 - confidence) * 50) / 100
    score = round(min([shrunk] + [CAPS[g] for g in flags if g in CAPS]))
    return dict(
        score=score, confidence=confidence, flags=flags, monitored=monitored, checks=len(upto),
        availability=round(availability), speed=round(speed), integrity=f["integrity"],
        market=None if market is None else round(market),
    )


def demo(anchor: int, entries):
    f = FACTS[anchor]
    anchor_id = f"mock_anchor_{anchor}"
    last = entries[-1]
    end = card_at(anchor, entries, DAYS - 1)
    history = []
    for d in range(1, DAYS):  # from day 2 on: day 1 alone says too little
        c = card_at(anchor, entries, d)
        ts = (START + timedelta(days=d, hours=23, minutes=40)).isoformat()
        history.append({"timestamp": ts, "score": c["score"]})
    recent = entries[-20:]
    streak = 0
    for e in reversed(entries):
        if e["success"]:
            break
        streak += 1
    w = rate(entries[-42:])
    stage_ms = {"toml": 180, "info": 240, "challenge": 320, "token": 410, "initiate": int(last["settlement_seconds"] * 40)}
    stages = [{"stage": k, "ok": True, "ms": v} for k, v in stage_ms.items()]
    if not last["success"]:
        stages[-1] = {"stage": "initiate", "ok": False}
    return anchor_id, dict(
        score=end["score"],
        scoreHistory=history,
        lastUpdated=WINDOW_END.isoformat(),
        health=dict(
            trend="Degrading" if anchor == 3 else "Improving" if anchor == 4 else "Stable",
            riskReason="LowSuccessRate" if rate(recent) < 50 else "ConsecutiveFailures" if streak >= 3 else "None",
            consecutiveFailures=streak,
            recentSuccessPercent=int(rate(recent)),
            recentCount=len(recent),
            observations=len(entries),
        ),
        status=dict(
            dormant=False,
            checkedAt=last["timestamp"],
            reachable=last["success"],
            **({} if last["success"] else {"problem": "the deposit could not be started"}),
            issuedAssets=f["assets"],
            lastProbe=dict(at=last["timestamp"], success=last["success"], stages=stages,
                           expected=list(stage_ms), seconds=round(last["settlement_seconds"], 1)),
        ),
        card=dict(
            score=end["score"], availability=end["availability"], speed=end["speed"], integrity=end["integrity"],
            market=end["market"], confidence=end["confidence"], flags=end["flags"],
            windowEnd=WINDOW_END.isoformat(), methodologyVersion=1, inputsHash="0" * 64,
            publishedAt=WINDOW_END.isoformat(),
        ),
        cardContext=dict(
            inputsHash="0" * 64, monitoredDays=end["monitored"], checks30d=end["checks"], coverage=f["coverage"],
            **({"marketNa": f["market_na"]} if f["market_na"] else {}),
        ),
    )


if __name__ == "__main__":
    out = Path(__file__).parent
    demo_cards = {}
    for a in (1, 2, 3, 4):
        anchor_id, entries = build(a)
        (out / f"{anchor_id}-behavior.json").write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
        ok = sum(e["success"] for e in entries)
        _, demo_cards[anchor_id] = demo(a, entries)
        c = demo_cards[anchor_id]["card"]
        print(f"{anchor_id}: {len(entries)} transactions, {ok} ok ({100 * ok // len(entries)}%); card {c['score']} conf {c['confidence']} {c['flags']}")
    target = out.parents[2] / "dashboard" / "data" / "mock-demo.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(demo_cards, indent=2) + "\n", encoding="utf-8")
