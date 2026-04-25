"""
Tests for Vault.vy — minimal per-depositor USDC vault.

Verifies the core invariants:
  - deposit() updates per-depositor balance
  - withdraw() returns USDC and zeros (or decrements) the balance
  - Only the original depositor can withdraw their own funds
  - Zero-address constructor fails

Skip-guarded — runs only when titanoboa is installed.
Run from repo root:
    pytest contracts/arc/tests/test_vault.py -v
"""

import pytest

try:
    import boa  # type: ignore
    HAS_BOA = True
except ImportError:
    HAS_BOA = False
    boa = None  # type: ignore

pytestmark = pytest.mark.skipif(
    not HAS_BOA,
    reason="titanoboa not installed (pip install titanoboa to enable)",
)

CONTRACT_PATH = "contracts/arc/Vault.vy"


@pytest.fixture
def vault(funded_usdc, deployer):
    """Deploy a fresh Vault bound to the funded mock USDC."""
    with boa.env.prank(deployer):
        return boa.load(CONTRACT_PATH, funded_usdc.address)


class TestDeployment:
    def test_initial_state(self, vault, funded_usdc):
        assert vault.usdc() == funded_usdc.address

    def test_zero_address_fails(self):
        with pytest.raises(boa.BoaError):
            boa.load(CONTRACT_PATH, "0x0000000000000000000000000000000000000000")


class TestDepositWithdraw:
    def test_deposit_updates_balance(self, vault, funded_usdc, alice):
        amount = 1_000_000  # $1.00 USDC
        with boa.env.prank(alice):
            funded_usdc.approve(vault.address, amount)
            vault.deposit(amount)
        assert vault.balances(alice) == amount

    def test_withdraw_returns_usdc(self, vault, funded_usdc, alice):
        amount = 2_500_000
        with boa.env.prank(alice):
            funded_usdc.approve(vault.address, amount)
            vault.deposit(amount)
            bal_before = funded_usdc.balanceOf(alice)
            vault.withdraw(amount)
            bal_after = funded_usdc.balanceOf(alice)
        assert bal_after - bal_before == amount
        assert vault.balances(alice) == 0

    def test_partial_withdraw(self, vault, funded_usdc, alice):
        with boa.env.prank(alice):
            funded_usdc.approve(vault.address, 5_000_000)
            vault.deposit(5_000_000)
            vault.withdraw(2_000_000)
        assert vault.balances(alice) == 3_000_000

    def test_only_depositor_can_withdraw(
        self, vault, funded_usdc, alice, bob
    ):
        with boa.env.prank(alice):
            funded_usdc.approve(vault.address, 1_000_000)
            vault.deposit(1_000_000)

        # bob has zero balance — withdraw must fail
        with pytest.raises(boa.BoaError):
            with boa.env.prank(bob):
                vault.withdraw(1_000_000)

        # alice can still withdraw her own
        with boa.env.prank(alice):
            vault.withdraw(1_000_000)
        assert vault.balances(alice) == 0

    def test_withdraw_more_than_balance_fails(
        self, vault, funded_usdc, alice
    ):
        with boa.env.prank(alice):
            funded_usdc.approve(vault.address, 500_000)
            vault.deposit(500_000)
            with pytest.raises(boa.BoaError):
                vault.withdraw(600_000)

    def test_zero_amount_deposit_fails(self, vault, alice):
        with pytest.raises(boa.BoaError):
            with boa.env.prank(alice):
                vault.deposit(0)
