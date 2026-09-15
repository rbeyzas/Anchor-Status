"""
Pure, Django/network-free simulation logic for a mock anchor's behavior.
Kept separate from any Django/Polaris imports so it can be unit tested with
plain pytest (see tests/test_behavior.py) without a database or event loop.
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class BehaviorProfile:
    avg_completion_seconds: float
    success_rate_percent: float
    degradation_after_days: Optional[float] = None
    degradation_success_rate_percent: Optional[float] = None

    @staticmethod
    def from_dict(data: dict) -> "BehaviorProfile":
        degradation = data.get("degradation") or {}
        return BehaviorProfile(
            avg_completion_seconds=float(data["avg_completion_seconds"]),
            success_rate_percent=float(data["success_rate_percent"]),
            degradation_after_days=(
                float(degradation["after_days"]) if "after_days" in degradation else None
            ),
            degradation_success_rate_percent=(
                float(degradation["success_rate_percent"])
                if "success_rate_percent" in degradation
                else None
            ),
        )

    @staticmethod
    def load(path: str) -> "BehaviorProfile":
        with open(path, "r", encoding="utf-8") as fh:
            return BehaviorProfile.from_dict(json.load(fh))


@dataclass(frozen=True)
class Observation:
    success: bool
    completion_seconds: float
    elapsed_days: float
    effective_success_rate_percent: float


def effective_success_rate(profile: BehaviorProfile, elapsed_days: float) -> float:
    """The success rate currently in effect, accounting for the profile's
    optional degradation-after-N-days scenario."""
    if (
        profile.degradation_after_days is not None
        and profile.degradation_success_rate_percent is not None
        and elapsed_days >= profile.degradation_after_days
    ):
        return profile.degradation_success_rate_percent
    return profile.success_rate_percent


def simulate_observation(
    profile: BehaviorProfile,
    anchor_started_at: datetime,
    now: datetime,
    time_acceleration: float = 1.0,
    rng: Optional[random.Random] = None,
) -> Observation:
    """Rolls a single simulated transaction outcome for `now`, given how long
    (in accelerated simulated days) the anchor has been "running" since
    `anchor_started_at`."""
    rng = rng or random.Random()
    elapsed_real_seconds = (now - anchor_started_at).total_seconds()
    elapsed_days = elapsed_real_seconds / 86400 * time_acceleration

    rate = effective_success_rate(profile, elapsed_days)
    success = rng.uniform(0, 100) < rate
    # +/-30% jitter around the configured average completion time so
    # settlement_seconds isn't perfectly constant.
    completion_seconds = max(1.0, profile.avg_completion_seconds * rng.uniform(0.7, 1.3))

    return Observation(
        success=success,
        completion_seconds=completion_seconds,
        elapsed_days=elapsed_days,
        effective_success_rate_percent=rate,
    )


def get_or_create_anchor_started_at(state_path: str) -> datetime:
    """The reference point elapsed_days is measured from — persisted to disk
    so it survives restarts of the mock anchor process."""
    p = Path(state_path)
    if p.exists():
        data = json.loads(p.read_text(encoding="utf-8"))
        return datetime.fromisoformat(data["started_at"])

    now = datetime.now(timezone.utc)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"started_at": now.isoformat()}), encoding="utf-8")
    return now
