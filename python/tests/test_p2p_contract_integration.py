"""
Integration test: pay2play Python SDK + Vyper contracts in one process.

Pattern adapted from vyperlang/vyper-agentic-payments
tests/test_sdk_contract_integration.py.  Replaces upstream's `circlekit`
import with our `pay2play_arc` SDK and uses our two newly-vendored
contracts (PaymentSplitter, Vault) as the on-chain primitives.

Tests two end-to-end flows:
  1. Vault round-trip — deposit USDC, check balance, withdraw, balance zero.
  2. PaymentSplitter — three-way split, deposit, each recipient claims their
     basis-point share, USDC balance math reconciles.

Both tests run entirely in the boa VM (no network) and verify the contract
public surface that the pay2play Python SDK's ContractLoader exposes.

Skip-guarded — runs only when titanoboa is installed.
Run from repo root:
    pytest python/tests/test_p2p_contract_integration.py -v
"""

from __future__ import annotations

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


# ═════════════════════════════════════════════════════════════════════════════
# FIXTURES — minimal mock USDC + named accounts (mirrors upstream pattern)
# ═════════════════════════════════════════════════════════════════════════════

MOCK_USDC = """\
# @version ^0.4.0
event Transfer:
    sender: indexed(address)
    receiver: indexed(address)
    amount: uint256

event Approval:
    owner: indexed(address)
    spender: indexed(address)
    amount: uint256

balanceOf: public(HashMap[address, uint256])
allowance: public(HashMap[address, HashMap[address, uint256]])
totalSupply: public(uint256)
decimals: public(uint8)

@deploy
def __init__():
    self.decimals = 6
    self.totalSupply = 0

@external
def mint(to: address, amount: uint256):
    self.balanceOf[to] += amount
    self.totalSupply += amount
    log Transfer(sender=empty(address), receiver=to, amount=amount)

@external
def transfer(receiver: address, amount: uint256) -> bool:
    assert self.balanceOf[msg.sender] >= amount, "insufficient balance"
    self.balanceOf[msg.sender] -= amount
    self.balanceOf[receiver] += amount
    log Transfer(sender=msg.sender, receiver=receiver, amount=amount)
    return True

@external
def approve(spender: address, amount: uint256) -> bool:
    self.allowance[msg.sender][spender] = amount
    log Approval(owner=msg.sender, spender=spender, amount=amount)
    return True

@external
def transferFrom(sender: address, receiver: address, amount: uint256) -> bool:
    assert self.balanceOf[sender] >= amount, "insufficient balance"
    assert self.allowance[sender][msg.sender] >= amount, "insufficient allowance"
    self.balanceOf[sender] -= amount
    self.balanceOf[receiver] += amount
    self.allowance[sender][msg.sender] -= amount
    log Transfer(sender=sender, receiver=receiver, amount=amount)
    return True
"""


@pytest.fixture
def deployer():
    return boa.env.generate_address("deployer")


@pytest.fixture
def alice():
    return boa.env.generate_address("alice")


@pytest.fixture
def bob():
    return boa.env.generate_address("bob")


@pytest.fixture
def charlie():
    return boa.env.generate_address("charlie")


@pytest.fixture
def usdc(deployer, alice, bob, charlie):
    """Mock USDC with 10,000 USDC minted to each of the named accounts."""
    with boa.env.prank(deployer):
        token = boa.loads(MOCK_USDC)
        for addr in (deployer, alice, bob, charlie):
            token.mint(addr, 10_000 * 10**6)
    return token


# ═════════════════════════════════════════════════════════════════════════════
# Tests using the pay2play_arc ContractLoader (proves the SDK surface works)
# ═════════════════════════════════════════════════════════════════════════════


def test_contractloader_can_load_vault_via_sdk(usdc, deployer, alice):
    """ContractLoader.vault() returns a deployed Vault bound to USDC."""
    from pay2play_arc.contracts import ContractLoader

    loader = ContractLoader()
    with boa.env.prank(deployer):
        vault = loader.vault(usdc.address)

    assert vault.usdc() == usdc.address

    # Round-trip: alice deposits 5 USDC, withdraws 5 USDC, balance returns to 10k.
    amount = 5 * 10**6
    with boa.env.prank(alice):
        usdc.approve(vault.address, amount)
        vault.deposit(amount)
        assert vault.balances(alice) == amount

        balance_before = usdc.balanceOf(alice)
        vault.withdraw(amount)
        assert usdc.balanceOf(alice) - balance_before == amount
        assert vault.balances(alice) == 0


def test_contractloader_can_load_payment_splitter_via_sdk(
    usdc, deployer, alice, bob, charlie
):
    """ContractLoader.payment_splitter() round-trip with a 70/20/10 share."""
    from pay2play_arc.contracts import ContractLoader

    loader = ContractLoader()
    with boa.env.prank(deployer):
        splitter = loader.payment_splitter(usdc.address)

    assert splitter.usdc() == usdc.address

    with boa.env.prank(alice):
        pool_id = splitter.create_pool([alice, bob, charlie], [7000, 2000, 1000])

    # Deposit $1.00 (1_000_000 atomic) into the pool from deployer.
    deposit_amount = 1_000_000
    with boa.env.prank(deployer):
        usdc.approve(splitter.address, deposit_amount)
        splitter.deposit(pool_id, deposit_amount)

    # Each recipient claims and gets their share-weighted slice exactly.
    expected = {alice: 700_000, bob: 200_000, charlie: 100_000}
    for who, owed in expected.items():
        balance_before = usdc.balanceOf(who)
        with boa.env.prank(who):
            splitter.claim(pool_id)
        delta = usdc.balanceOf(who) - balance_before
        assert delta == owed, (
            f"share math drift: {who.hex() if hasattr(who,'hex') else who} "
            f"expected {owed}, got {delta}"
        )

    # Conservation invariant — splitter's USDC balance is now zero.
    assert usdc.balanceOf(splitter.address) == 0


def test_payment_splitter_is_idempotent_on_double_claim(
    usdc, deployer, alice, bob
):
    """A second claim() with no new deposits must transfer 0 (or revert)."""
    from pay2play_arc.contracts import ContractLoader

    loader = ContractLoader()
    with boa.env.prank(deployer):
        splitter = loader.payment_splitter(usdc.address)
    with boa.env.prank(alice):
        pool_id = splitter.create_pool([alice, bob], [5000, 5000])
    with boa.env.prank(deployer):
        usdc.approve(splitter.address, 1_000_000)
        splitter.deposit(pool_id, 1_000_000)

    with boa.env.prank(bob):
        splitter.claim(pool_id)

    # Second claim — implementation may revert ("nothing to claim") or silently
    # succeed with delta=0. Either is fine; we only require no double-spend.
    balance_before = usdc.balanceOf(bob)
    try:
        with boa.env.prank(bob):
            splitter.claim(pool_id)
    except boa.BoaError:
        pass  # revert is acceptable
    delta = usdc.balanceOf(bob) - balance_before
    assert delta == 0, f"double-claim leaked {delta} atomic USDC"
