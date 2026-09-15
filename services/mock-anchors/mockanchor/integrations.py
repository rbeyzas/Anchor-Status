"""
Polaris integration hooks for a mock anchor. Deliberately minimal: we collect
just an amount (no real KYC) and, once collected, let Polaris move the
transaction to `pending_user_transfer_start`. From that point on, the
`simulate_transactions` management command — not Polaris' own on-chain
rails/custody machinery — decides whether/when each transaction completes,
driven entirely by `behavior_profiles/anchor-N.json` — see
`services/mock-anchors/README.md`. This mock never actually submits
anything to the Stellar network; that's the point of it being "fully
controlled".
"""

from decimal import Decimal
from typing import Dict, Optional

from django.conf import settings
from polaris.integrations import DepositIntegration, WithdrawalIntegration
from polaris.integrations.forms import TransactionForm
from polaris.models import Transaction
from polaris.templates import Template


class MockDepositIntegration(DepositIntegration):
    def form_for_transaction(
        self, request, transaction: Transaction, post_data=None, amount=None, *args, **kwargs
    ) -> Optional[TransactionForm]:
        if transaction.amount_in:
            return None
        if post_data:
            return TransactionForm(transaction, post_data)
        return TransactionForm(transaction, initial={"amount": amount or Decimal(10)})

    def after_form_validation(self, request, form: TransactionForm, transaction: Transaction, *args, **kwargs):
        transaction.amount_in = form.cleaned_data["amount"]
        transaction.amount_fee = Decimal(0)
        transaction.save()

    def content_for_template(
        self, request, template, form=None, transaction: Optional[Transaction] = None, *args, **kwargs
    ) -> Optional[Dict]:
        if template == Template.DEPOSIT:
            if form is None:
                # Signals to Polaris that we're done collecting info; it will
                # move the transaction to pending_user_transfer_start.
                return None
            return {
                "title": f"{settings.ANCHOR_NAME} — Simulated Deposit",
                "guidance": (
                    "This is a SimulatedMock anchor (Anchor Oracle Network, Layer 3). "
                    "No real funds move; submit any amount to continue."
                ),
            }
        if template == Template.MORE_INFO:
            return {"title": f"{settings.ANCHOR_NAME} — Transaction Details"}
        return None


class MockWithdrawalIntegration(WithdrawalIntegration):
    def form_for_transaction(
        self, request, transaction: Transaction, post_data=None, amount=None, *args, **kwargs
    ) -> Optional[TransactionForm]:
        if transaction.amount_in:
            return None
        if post_data:
            return TransactionForm(transaction, post_data)
        return TransactionForm(transaction, initial={"amount": amount or Decimal(10)})

    def after_form_validation(self, request, form: TransactionForm, transaction: Transaction, *args, **kwargs):
        transaction.amount_in = form.cleaned_data["amount"]
        transaction.amount_fee = Decimal(0)
        transaction.save()

    def content_for_template(
        self, request, template, form=None, transaction: Optional[Transaction] = None, *args, **kwargs
    ) -> Optional[Dict]:
        if template == Template.WITHDRAW:
            if form is None:
                return None
            return {
                "title": f"{settings.ANCHOR_NAME} — Simulated Withdrawal",
                "guidance": (
                    "This is a SimulatedMock anchor (Anchor Oracle Network, Layer 3). "
                    "No real funds move; submit any amount to continue."
                ),
            }
        if template == Template.MORE_INFO:
            return {"title": f"{settings.ANCHOR_NAME} — Transaction Details"}
        return None
