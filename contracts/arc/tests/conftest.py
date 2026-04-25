"""
Shared Titanoboa fixtures for pay2play-arc Vyper contract tests.

Adapted from vyperlang/vyper-agentic-payments tests/conftest.py:
mock USDC + named accounts + funded balances. Skip-guarded so the
suite is a no-op when titanoboa is not installed (default for our
non-Vyper developer setup).
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


MOCK_USDC_SOURCE = """\
# @version ^0.4.0
event Transfer:
    sender: indexed(address)
    receiver: indexed(address)
    amount: uint256

event Approval:
    owner: indexed(address)
    spender: indexed(address)
    amount: uint256

name: public(String[64])
symbol: public(String[32])
decimals: public(uint8)
totalSupply: public(uint256)
balanceOf: public(HashMap[address, uint256])
allowance: public(HashMap[address, HashMap[address, uint256]])

@deploy
def __init__():
    self.name = "USD Coin"
    self.symbol = "USDC"
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
    if not HAS_BOA:
        pytest.skip("titanoboa not installed")
    return boa.env.generate_address("deployer")


@pytest.fixture
def alice():
    if not HAS_BOA:
        pytest.skip("titanoboa not installed")
    return boa.env.generate_address("alice")


@pytest.fixture
def bob():
    if not HAS_BOA:
        pytest.skip("titanoboa not installed")
    return boa.env.generate_address("bob")


@pytest.fixture
def charlie():
    if not HAS_BOA:
        pytest.skip("titanoboa not installed")
    return boa.env.generate_address("charlie")


@pytest.fixture
def usdc(deployer):
    """Deploy a fresh mock USDC."""
    if not HAS_BOA:
        pytest.skip("titanoboa not installed")
    with boa.env.prank(deployer):
        return boa.loads(MOCK_USDC_SOURCE)


@pytest.fixture
def funded_usdc(usdc, deployer, alice, bob, charlie):
    """Mint 10,000 USDC to each of deployer/alice/bob/charlie."""
    if not HAS_BOA:
        pytest.skip("titanoboa not installed")
    amount = 10_000 * 10**6
    with boa.env.prank(deployer):
        for addr in (deployer, alice, bob, charlie):
            usdc.mint(addr, amount)
    return usdc
