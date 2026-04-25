"""
Tests for PaymentChannel.vy using Titanoboa.

Run: pytest tests/test_payment_channel.py -v
"""

import time
import pytest

try:
    import boa  # type: ignore
    BOA_AVAILABLE = True
except ImportError:
    BOA_AVAILABLE = False

pytestmark = pytest.mark.skipif(not BOA_AVAILABLE, reason="titanoboa not installed")


@pytest.fixture
def loader():
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
    from pay2play_arc import ContractLoader
    return ContractLoader()


@pytest.fixture
def usdc(loader):
    return loader.mock_erc20(initial_supply=10 ** 12)


@pytest.fixture
def parties(usdc):
    import boa
    sender    = boa.env.generate_address("sender")
    recipient = boa.env.generate_address("recipient")
    with boa.env.prank(usdc.address):
        usdc.transfer(sender, 1000 * 10**6)  # 1000 USDC
    return sender, recipient


@pytest.fixture
def channel(loader, usdc, parties):
    import boa
    sender, recipient = parties
    expiry = int(time.time()) + 3600
    with boa.env.prank(sender):
        ch = loader.payment_channel(usdc.address, recipient, expiry)
    return ch, sender, recipient


def test_deploy(channel, usdc):
    ch, sender, recipient = channel
    assert ch.sender()    == sender
    assert ch.recipient() == recipient
    assert ch.balance()   == 0
    assert not ch.closed()


def test_deposit(channel, usdc):
    import boa
    ch, sender, recipient = channel
    amount = 100 * 10**6
    with boa.env.prank(sender):
        usdc.approve(ch.address, amount)
        ch.deposit(amount)
    assert ch.balance() == amount
    assert usdc.balanceOf(ch.address) == amount


def test_double_deposit(channel, usdc):
    import boa
    ch, sender, _ = channel
    with boa.env.prank(sender):
        usdc.approve(ch.address, 200 * 10**6)
        ch.deposit(50 * 10**6)
        ch.deposit(50 * 10**6)
    assert ch.balance() == 100 * 10**6


def test_timeout_reclaim(channel, usdc):
    import boa
    ch, sender, _ = channel
    amount = 50 * 10**6
    with boa.env.prank(sender):
        usdc.approve(ch.address, amount)
        ch.deposit(amount)

    # Fast-forward past expiry
    boa.env.time_travel(seconds=3700)

    sender_before = usdc.balanceOf(sender)
    with boa.env.prank(sender):
        ch.timeout()
    assert ch.closed()
    assert usdc.balanceOf(sender) == sender_before + amount


def test_extend_expiry(channel):
    import boa
    ch, sender, _ = channel
    old_expiry = ch.expiry()
    new_expiry = old_expiry + 7200
    with boa.env.prank(sender):
        ch.extend(new_expiry)
    assert ch.expiry() == new_expiry


def test_only_sender_can_deposit(channel, usdc):
    import boa
    ch, sender, recipient = channel
    with boa.env.prank(recipient):
        with pytest.raises(Exception):
            ch.deposit(10 * 10**6)


def test_only_sender_can_extend(channel):
    import boa
    ch, sender, recipient = channel
    with boa.env.prank(recipient):
        with pytest.raises(Exception):
            ch.extend(int(time.time()) + 7200)
