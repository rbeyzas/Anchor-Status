"""Creates/updates this instance's Polaris Asset row from environment
variables (ASSET_CODE, ASSET_ISSUER, DISTRIBUTION_SEED). Idempotent — safe
to run on every startup."""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from polaris.models import Asset


class Command(BaseCommand):
    help = "Seed (or update) the Polaris Asset row for this mock anchor instance."

    def handle(self, *args, **options):
        if not settings.ASSET_ISSUER or not settings.DISTRIBUTION_SEED:
            raise CommandError(
                "ASSET_ISSUER and DISTRIBUTION_SEED env vars must be set "
                "(see scripts/bootstrap-issuers.sh)."
            )

        asset, created = Asset.objects.update_or_create(
            code=settings.ASSET_CODE,
            issuer=settings.ASSET_ISSUER,
            defaults={
                "distribution_seed": settings.DISTRIBUTION_SEED,
                "significant_decimals": 2,
                "deposit_enabled": True,
                "withdrawal_enabled": True,
                "sep24_enabled": True,
                "symbol": settings.ASSET_CODE,
            },
        )
        verb = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{verb} asset {asset.code}:{asset.issuer}"))
