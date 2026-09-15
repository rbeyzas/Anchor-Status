"""
Runs forever, standing in for both Polaris' on-chain settlement machinery
(watch_transactions / poll_pending_deposits) and the real Stellar network
itself. Every `pending_user_transfer_start` transaction is, after a
behavior-profile-driven delay, deterministically marked `completed` or
`error` — no Stellar submission ever happens. This is what makes this
anchor "fully controlled": its reliability is exactly what
behavior_profiles/anchor-N.json says it is, including the day-N degradation
scenario used to demonstrate PerformanceOracle slashing.
"""

import random
import time
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from polaris.models import Transaction

from mockanchor.behavior import BehaviorProfile, get_or_create_anchor_started_at, simulate_observation
from mockanchor.logging_utils import append_log_entry

BASE_DIR = Path(settings.BASE_DIR)


class Command(BaseCommand):
    help = "Simulate settlement of pending SEP-24 transactions per this anchor's behavior profile."

    def add_arguments(self, parser):
        parser.add_argument(
            "--once",
            action="store_true",
            help="Process pending transactions once and exit, instead of looping forever.",
        )

    def handle(self, *args, **options):
        profile = BehaviorProfile.load(settings.BEHAVIOR_PROFILE_PATH)
        anchor_started_at = get_or_create_anchor_started_at(
            str(BASE_DIR / "state" / f"{settings.ANCHOR_ID}-started-at.json")
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"[{settings.ANCHOR_ID}] simulating with profile={settings.BEHAVIOR_PROFILE_PATH} "
                f"started_at={anchor_started_at.isoformat()} time_acceleration={settings.TIME_ACCELERATION}"
            )
        )

        while True:
            self._tick(profile, anchor_started_at)
            if options["once"]:
                break
            time.sleep(settings.SIMULATOR_POLL_INTERVAL_SECONDS)

    def _tick(self, profile: BehaviorProfile, anchor_started_at: datetime):
        now = datetime.now(timezone.utc)
        pending = Transaction.objects.filter(status=Transaction.STATUS.pending_user_transfer_start)

        for txn in pending:
            # Deterministic per-transaction RNG: the same transaction always
            # rolls the same outcome/delay no matter how many times we look
            # at it before its delay has elapsed.
            rng = random.Random(txn.id.int)
            observation = simulate_observation(
                profile, anchor_started_at, now, settings.TIME_ACCELERATION, rng=rng
            )

            if txn.status_eta is None:
                txn.status_eta = int(observation.completion_seconds)
                txn.save(update_fields=["status_eta"])
                continue

            started_at = txn.started_at
            if started_at.tzinfo is None:
                started_at = started_at.replace(tzinfo=timezone.utc)
            elapsed = (now - started_at).total_seconds()
            if elapsed < txn.status_eta:
                continue

            self._finalize(txn, observation, now)

    def _finalize(self, txn: Transaction, observation, now: datetime):
        if observation.success:
            txn.status = Transaction.STATUS.completed
            txn.amount_out = txn.amount_in
        else:
            txn.status = Transaction.STATUS.error
            txn.status_message = (
                f"Simulated failure per behavior profile "
                f"(effective success rate {observation.effective_success_rate_percent:.1f}%)"
            )
        txn.completed_at = now
        txn.save()

        append_log_entry(
            settings.ANCHOR_ID,
            BASE_DIR,
            {
                "anchor_id": settings.ANCHOR_ID,
                "success": observation.success,
                "settlement_seconds": observation.completion_seconds,
                "timestamp": now.isoformat(),
                "source_type": "SimulatedMock",
                "transaction_id": str(txn.id),
                "kind": txn.kind,
                "elapsed_simulated_days": observation.elapsed_days,
            },
        )
        self.stdout.write(
            f"[{settings.ANCHOR_ID}] {txn.id} -> {txn.status} "
            f"(simulated day {observation.elapsed_days:.1f}, "
            f"effective success rate {observation.effective_success_rate_percent:.1f}%)"
        )
