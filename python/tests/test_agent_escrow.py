"""
Tests for AgentEscrow.vy using Titanoboa.

Run: pytest tests/test_agent_escrow.py -v
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
def escrow(loader, usdc):
    return loader.agent_escrow(usdc.address)


@pytest.fixture
def parties(usdc):
    import boa
    client    = boa.env.generate_address("client")
    provider  = boa.env.generate_address("provider")
    evaluator = boa.env.generate_address("evaluator")
    with boa.env.prank(usdc.address):
        usdc.transfer(client, 100 * 10**6)
    return client, provider, evaluator


BUDGET = 5 * 10**6  # 5 USDC
DESC_HASH = b"\x01" * 32
DELIVERABLE_HASH = b"\x02" * 32
REASON_HASH = b"\x03" * 32


def test_create_job(escrow, parties):
    import boa
    client, provider, evaluator = parties
    expiry = int(time.time()) + 3600
    with boa.env.prank(client):
        job_id = escrow.createJob(provider, evaluator, expiry, DESC_HASH)
    assert job_id == 0
    assert escrow.job_count() == 1


def test_set_budget(escrow, parties):
    import boa
    client, provider, evaluator = parties
    expiry = int(time.time()) + 3600
    with boa.env.prank(client):
        job_id = escrow.createJob(provider, evaluator, expiry, DESC_HASH)
    with boa.env.prank(provider):
        escrow.setBudget(job_id, BUDGET)
    job = escrow.getJob(job_id)
    assert job[3] == BUDGET  # amount field


def test_full_lifecycle(escrow, usdc, parties):
    import boa
    client, provider, evaluator = parties
    expiry = int(time.time()) + 3600

    # Create
    with boa.env.prank(client):
        job_id = escrow.createJob(provider, evaluator, expiry, DESC_HASH)

    # Set budget
    with boa.env.prank(provider):
        escrow.setBudget(job_id, BUDGET)

    # Approve + Fund
    with boa.env.prank(client):
        usdc.approve(escrow.address, BUDGET)
        escrow.fund(job_id)

    assert usdc.balanceOf(escrow.address) == BUDGET

    # Submit
    with boa.env.prank(provider):
        escrow.submit(job_id, DELIVERABLE_HASH)

    # Complete — USDC should go to provider
    provider_before = usdc.balanceOf(provider)
    with boa.env.prank(evaluator):
        escrow.complete(job_id, REASON_HASH)

    assert usdc.balanceOf(provider) == provider_before + BUDGET
    job = escrow.getJob(job_id)
    assert job[5] == 3  # COMPLETED state


def test_dispute_flow(escrow, usdc, parties):
    import boa
    client, provider, evaluator = parties
    expiry = int(time.time()) + 3600

    with boa.env.prank(client):
        job_id = escrow.createJob(provider, evaluator, expiry, DESC_HASH)
    with boa.env.prank(provider):
        escrow.setBudget(job_id, BUDGET)
    with boa.env.prank(client):
        usdc.approve(escrow.address, BUDGET)
        escrow.fund(job_id)
    with boa.env.prank(provider):
        escrow.submit(job_id, DELIVERABLE_HASH)
    with boa.env.prank(client):
        escrow.dispute(job_id)

    job = escrow.getJob(job_id)
    assert job[5] == 4  # DISPUTED state


def test_reclaim_expired(escrow, usdc, parties):
    import boa
    client, provider, evaluator = parties
    expiry = int(time.time()) + 60  # short expiry

    with boa.env.prank(client):
        job_id = escrow.createJob(provider, evaluator, expiry, DESC_HASH)
    with boa.env.prank(provider):
        escrow.setBudget(job_id, BUDGET)
    with boa.env.prank(client):
        usdc.approve(escrow.address, BUDGET)
        escrow.fund(job_id)

    # Fast-forward past expiry
    boa.env.time_travel(seconds=120)

    client_before = usdc.balanceOf(client)
    with boa.env.prank(client):
        escrow.reclaimExpired(job_id)
    assert usdc.balanceOf(client) == client_before + BUDGET
