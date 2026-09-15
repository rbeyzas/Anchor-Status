"""
Demo-only traffic generator. In real usage, transactions enter
`pending_user_transfer_start` because an actual wallet drove the SEP-24
interactive deposit/withdraw flow (which this project's endpoints fully
support — see services/mock-anchors/README.md). For Faz 8's demo, rather
than requiring a real wallet integration, this command periodically creates
synthetic deposit transactions directly, so `simulate_transactions` always
has something to process and the aggregator/dashboard have continuous
activity to show. It never touches Stellar and is not part of the SEP-24
protocol surface.
"""

import random
import time
import uuid

from django.conf import settings
from django.core.management.base import BaseCommand
from polaris.models import Asset, Transaction


class Command(BaseCommand):
    help = "Periodically creates synthetic pending deposit transactions for demo traffic."

    def add_arguments(self, parser):
        parser.add_argument("--interval-seconds", type=float, default=15.0)
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        asset = Asset.objects.get(code=settings.ASSET_CODE)
        interval = options["interval_seconds"]

        while True:
            self._create_one(asset)
            if options["once"]:
                break
            time.sleep(interval)

    def _create_one(self, asset: Asset):
        amount = random.choice([10, 25, 50, 100, 250])
        txn = Transaction.objects.create(
            id=uuid.uuid4(),
            asset=asset,
            kind="deposit",
            status=Transaction.STATUS.pending_user_transfer_start,
            stellar_account=asset.issuer,  # demo-only stand-in; not a real depositor account
            amount_in=amount,
            protocol="sep24",
        )
        self.stdout.write(f"[{settings.ANCHOR_ID}] seeded demo transaction {txn.id} (amount={amount})")
