"""Network-free, Django-free unit tests for mockanchor.behavior. Run with
`pytest` from services/mock-anchors — no database, no server, no testnet."""

import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mockanchor.behavior import (  # noqa: E402
    BehaviorProfile,
    effective_success_rate,
    simulate_observation,
)


def make_profile(**overrides):
    base = dict(avg_completion_seconds=10, success_rate_percent=90)
    base.update(overrides)
    return BehaviorProfile.from_dict(base)


def test_from_dict_without_degradation():
    profile = BehaviorProfile.from_dict({"avg_completion_seconds": 5, "success_rate_percent": 80})
    assert profile.avg_completion_seconds == 5
    assert profile.success_rate_percent == 80
    assert profile.degradation_after_days is None


def test_from_dict_with_degradation():
    profile = BehaviorProfile.from_dict(
        {
            "avg_completion_seconds": 15,
            "success_rate_percent": 92,
            "degradation": {"after_days": 20, "success_rate_percent": 40},
        }
    )
    assert profile.degradation_after_days == 20
    assert profile.degradation_success_rate_percent == 40


def test_effective_success_rate_before_degradation():
    profile = make_profile(degradation={"after_days": 20, "success_rate_percent": 40})
    assert effective_success_rate(profile, elapsed_days=5) == 90


def test_effective_success_rate_after_degradation():
    profile = make_profile(degradation={"after_days": 20, "success_rate_percent": 40})
    assert effective_success_rate(profile, elapsed_days=25) == 40


def test_effective_success_rate_exactly_at_boundary_is_degraded():
    profile = make_profile(degradation={"after_days": 20, "success_rate_percent": 40})
    assert effective_success_rate(profile, elapsed_days=20) == 40


def test_effective_success_rate_without_degradation_is_constant():
    profile = make_profile()
    assert effective_success_rate(profile, elapsed_days=0) == 90
    assert effective_success_rate(profile, elapsed_days=1000) == 90


def test_simulate_observation_success_rate_roughly_matches_profile():
    profile = make_profile(success_rate_percent=90)
    now = datetime.now(timezone.utc)
    rng = random.Random(42)
    successes = sum(
        1 for _ in range(2000) if simulate_observation(profile, now, now, rng=rng).success
    )
    # With n=2000 and p=0.9, a generous +/-5pp band is statistically safe.
    assert 1700 <= successes <= 2000


def test_simulate_observation_always_fails_at_zero_percent():
    profile = make_profile(success_rate_percent=0)
    now = datetime.now(timezone.utc)
    rng = random.Random(1)
    for _ in range(100):
        assert simulate_observation(profile, now, now, rng=rng).success is False


def test_simulate_observation_always_succeeds_at_hundred_percent():
    profile = make_profile(success_rate_percent=100)
    now = datetime.now(timezone.utc)
    rng = random.Random(2)
    for _ in range(100):
        assert simulate_observation(profile, now, now, rng=rng).success is True


def test_simulate_observation_applies_degradation_over_simulated_time():
    profile = make_profile(
        success_rate_percent=100,
        degradation={"after_days": 20, "success_rate_percent": 0},
    )
    started_at = datetime.now(timezone.utc)

    # 10 accelerated days in: still pre-degradation, should always succeed.
    now_before = started_at + timedelta(days=10 / 1440)
    rng = random.Random(3)
    obs_before = simulate_observation(profile, started_at, now_before, time_acceleration=1440, rng=rng)
    assert obs_before.success is True
    assert obs_before.elapsed_days == 10

    # 25 accelerated days in: past degradation threshold, should always fail.
    now_after = started_at + timedelta(days=25 / 1440)
    rng = random.Random(4)
    obs_after = simulate_observation(profile, started_at, now_after, time_acceleration=1440, rng=rng)
    assert obs_after.success is False
    assert obs_after.elapsed_days == 25


def test_simulate_observation_completion_seconds_has_jitter_but_stays_positive():
    profile = make_profile(avg_completion_seconds=10)
    now = datetime.now(timezone.utc)
    rng = random.Random(5)
    values = [simulate_observation(profile, now, now, rng=rng).completion_seconds for _ in range(50)]
    assert all(v > 0 for v in values)
    assert min(values) < 10 < max(values)
