from django.apps import AppConfig


class MockAnchorConfig(AppConfig):
    name = "mockanchor"
    verbose_name = "Anchor Oracle Mock Anchor"
    default_auto_field = "django.db.models.AutoField"

    def ready(self):
        from polaris.integrations import register_integrations

        from mockanchor.integrations import MockDepositIntegration, MockWithdrawalIntegration

        register_integrations(
            deposit=MockDepositIntegration(),
            withdrawal=MockWithdrawalIntegration(),
        )
