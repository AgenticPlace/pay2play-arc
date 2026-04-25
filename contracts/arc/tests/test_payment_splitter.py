"""
Tests for PaymentSplitter.vy — revenue distribution for multi-agent collab.

Adapted from vyperlang/vyper-agentic-payments tests/test_payment_splitter.py.
Subset covering the AgenticPlace-relevant flows:
  - Deploy / initial state
  - create_pool (single + multi recipient)
  - deposit + claim (per-recipient share math)
  - Reverts: zero address, invalid shares, non-recipient claim

Skip-guarded — runs only when titanoboa is installed.
Run from repo root:
    pytest contracts/arc/tests/test_payment_splitter.py -v
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

CONTRACT_PATH = "contracts/arc/PaymentSplitter.vy"


@pytest.fixture
def payment_splitter(funded_usdc, deployer):
    """Deploy a fresh PaymentSplitter bound to the funded mock USDC."""
    with boa.env.prank(deployer):
        return boa.load(CONTRACT_PATH, funded_usdc.address)


class TestDeployment:
    def test_initial_state(self, payment_splitter, funded_usdc):
        assert payment_splitter.usdc() == funded_usdc.address
        # The next_pool_id starts at 1 in the upstream contract; we don't
        # assert the exact getter name beyond what the contract exposes.

    def test_zero_address_fails(self):
        with pytest.raises(boa.BoaError):
            boa.load(CONTRACT_PATH, "0x0000000000000000000000000000000000000000")


class TestPoolCreation:
    def test_create_pool_single_recipient(self, payment_splitter, alice, bob):
        with boa.env.prank(alice):
            pool_id = payment_splitter.create_pool([bob], [10000])
        assert pool_id == 1
        assert payment_splitter.pool_owner(pool_id) == alice
        assert payment_splitter.total_shares(pool_id) == 10000
        assert payment_splitter.shares(pool_id, bob) == 10000
        assert payment_splitter.is_recipient(pool_id, bob) is True

    def test_create_pool_three_way_split(
        self, payment_splitter, alice, bob, charlie
    ):
        # 60% / 30% / 10% — typical AgenticPlace split
        with boa.env.prank(alice):
            pool_id = payment_splitter.create_pool(
                [alice, bob, charlie],
                [6000, 3000, 1000],
            )
        assert payment_splitter.total_shares(pool_id) == 10000
        assert payment_splitter.shares(pool_id, alice) == 6000
        assert payment_splitter.shares(pool_id, bob) == 3000
        assert payment_splitter.shares(pool_id, charlie) == 1000

    def test_invalid_share_total_fails(self, payment_splitter, alice, bob):
        with pytest.raises(boa.BoaError):
            with boa.env.prank(alice):
                payment_splitter.create_pool([alice, bob], [5000, 4000])  # != 10000


class TestDepositAndClaim:
    def test_deposit_routes_to_pool(
        self, payment_splitter, funded_usdc, deployer, alice, bob, charlie
    ):
        # alice creates a 60/30/10 pool
        with boa.env.prank(alice):
            pool_id = payment_splitter.create_pool(
                [alice, bob, charlie], [6000, 3000, 1000],
            )

        # deployer deposits 1_000_000 atomic USDC ($1.00) into the pool
        amount = 1_000_000
        with boa.env.prank(deployer):
            funded_usdc.approve(payment_splitter.address, amount)
            payment_splitter.deposit(pool_id, amount)

        # Each claimable() should reflect the share-weighted slice
        # (we don't hard-code the exact getter name beyond the upstream
        # contract's public mapping; share math is asserted on actual claim).
        bal_before = funded_usdc.balanceOf(bob)
        with boa.env.prank(bob):
            payment_splitter.claim(pool_id)
        bal_after = funded_usdc.balanceOf(bob)
        # Bob holds 3000 / 10000 of $1.00 = $0.30 = 300_000 atomic
        assert bal_after - bal_before == 300_000

        bal_before = funded_usdc.balanceOf(charlie)
        with boa.env.prank(charlie):
            payment_splitter.claim(pool_id)
        bal_after = funded_usdc.balanceOf(charlie)
        # Charlie: 1000 / 10000 of $1.00 = $0.10 = 100_000 atomic
        assert bal_after - bal_before == 100_000

    def test_non_recipient_claim_fails(
        self, payment_splitter, funded_usdc, deployer, alice, bob, charlie
    ):
        with boa.env.prank(alice):
            pool_id = payment_splitter.create_pool([alice, bob], [5000, 5000])
        with boa.env.prank(deployer):
            funded_usdc.approve(payment_splitter.address, 1_000_000)
            payment_splitter.deposit(pool_id, 1_000_000)

        with pytest.raises(boa.BoaError):
            with boa.env.prank(charlie):  # charlie isn't in the pool
                payment_splitter.claim(pool_id)
