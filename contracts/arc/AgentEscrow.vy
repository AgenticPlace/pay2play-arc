# @version ^0.4.0
"""
AgentEscrow — ERC-8183-compatible job lifecycle contract for pay2play-arc.

State machine: OPEN → FUNDED → SUBMITTED → COMPLETED (or DISPUTED)

The deployed Arc testnet instance is at 0x0747EEf0706327138c69792bF28Cd525089e4583.
This contract can be deployed locally for testing or as a custom escrow.

Sourced/inspired from: https://github.com/vyperlang/vyper-agentic-payments
"""

from contracts.arc.interfaces import IERC20

# ── Constants / enums ─────────────────────────────────────────────────────────

OPEN:      constant(uint8) = 0
FUNDED:    constant(uint8) = 1
SUBMITTED: constant(uint8) = 2
COMPLETED: constant(uint8) = 3
DISPUTED:  constant(uint8) = 4

MAX_JOBS: constant(uint256) = 2**32

# ── Events ────────────────────────────────────────────────────────────────────

event JobCreated:
    job_id:   indexed(uint256)
    client:   indexed(address)
    provider: indexed(address)

event BudgetSet:
    job_id: indexed(uint256)
    amount: uint256

event JobFunded:
    job_id: indexed(uint256)
    amount: uint256

event JobSubmitted:
    job_id:           indexed(uint256)
    deliverable_hash: bytes32

event JobCompleted:
    job_id:  indexed(uint256)
    payout:  uint256

event JobDisputed:
    job_id: indexed(uint256)
    by:     address

# ── Structs ───────────────────────────────────────────────────────────────────

struct Job:
    client:           address
    provider:         address
    evaluator:        address
    amount:           uint256
    expiry:           uint256
    state:            uint8
    desc_hash:        bytes32
    deliverable_hash: bytes32

# ── Storage ───────────────────────────────────────────────────────────────────

token:     public(IERC20)
jobs:      public(HashMap[uint256, Job])
job_count: public(uint256)
owner:     public(address)


@deploy
def __init__(_token: address):
    assert _token != empty(address), "zero token"
    self.token = IERC20(_token)
    self.owner = msg.sender


@external
def createJob(
    provider:  address,
    evaluator: address,
    expiry:    uint256,
    desc_hash: bytes32,
) -> uint256:
    """Client creates a job opening. Returns the new job ID."""
    assert provider  != empty(address), "zero provider"
    assert evaluator != empty(address), "zero evaluator"
    assert expiry    >  block.timestamp, "expiry in past"

    job_id: uint256 = self.job_count
    self.jobs[job_id] = Job(
        client=msg.sender,
        provider=provider,
        evaluator=evaluator,
        amount=0,
        expiry=expiry,
        state=OPEN,
        desc_hash=desc_hash,
        deliverable_hash=empty(bytes32),
    )
    self.job_count += 1
    log JobCreated(job_id, msg.sender, provider)
    return job_id


@external
def setBudget(job_id: uint256, amount: uint256):
    """Provider sets their requested budget for the job."""
    job: Job = self.jobs[job_id]
    assert msg.sender == job.provider, "only provider"
    assert job.state == OPEN,          "job not open"
    assert amount > 0,                 "zero amount"
    self.jobs[job_id].amount = amount
    log BudgetSet(job_id, amount)


@external
def fund(job_id: uint256):
    """Client funds the job by transferring USDC. Job moves to FUNDED."""
    job: Job = self.jobs[job_id]
    assert msg.sender == job.client,     "only client"
    assert job.state  == OPEN,           "job not open"
    assert job.amount >  0,              "budget not set"
    assert block.timestamp < job.expiry, "job expired"
    assert self.token.transferFrom(msg.sender, self, job.amount), "transfer failed"
    self.jobs[job_id].state = FUNDED
    log JobFunded(job_id, job.amount)


@external
def submit(job_id: uint256, deliverable_hash: bytes32):
    """Provider submits work. Job moves to SUBMITTED."""
    job: Job = self.jobs[job_id]
    assert msg.sender         == job.provider, "only provider"
    assert job.state          == FUNDED,       "job not funded"
    assert block.timestamp    <  job.expiry,   "job expired"
    assert deliverable_hash   != empty(bytes32), "zero hash"
    self.jobs[job_id].state            = SUBMITTED
    self.jobs[job_id].deliverable_hash = deliverable_hash
    log JobSubmitted(job_id, deliverable_hash)


@external
def complete(job_id: uint256, reason_hash: bytes32):
    """Evaluator approves work. USDC released to provider. Job moves to COMPLETED."""
    job: Job = self.jobs[job_id]
    assert msg.sender == job.evaluator,  "only evaluator"
    assert job.state  == SUBMITTED,      "job not submitted"
    self.jobs[job_id].state = COMPLETED
    assert self.token.transfer(job.provider, job.amount), "payout failed"
    log JobCompleted(job_id, job.amount)


@external
def dispute(job_id: uint256):
    """Client or evaluator can dispute a submitted job. Moves to DISPUTED."""
    job: Job = self.jobs[job_id]
    assert msg.sender == job.client or msg.sender == job.evaluator, "not authorized"
    assert job.state  == SUBMITTED,  "can only dispute submitted jobs"
    self.jobs[job_id].state = DISPUTED
    log JobDisputed(job_id, msg.sender)


@external
def resolveDispute(job_id: uint256, pay_provider: bool):
    """Owner (arbiter) resolves a disputed job."""
    job: Job = self.jobs[job_id]
    assert msg.sender == self.owner, "only arbiter"
    assert job.state  == DISPUTED,   "not disputed"
    self.jobs[job_id].state = COMPLETED
    if pay_provider:
        assert self.token.transfer(job.provider, job.amount), "payout failed"
    else:
        assert self.token.transfer(job.client, job.amount),   "refund failed"


@external
def reclaimExpired(job_id: uint256):
    """Client reclaims USDC from a funded-but-expired job."""
    job: Job = self.jobs[job_id]
    assert msg.sender        == job.client, "only client"
    assert job.state         == FUNDED,     "must be funded"
    assert block.timestamp   >= job.expiry, "not expired yet"
    self.jobs[job_id].state = OPEN
    assert self.token.transfer(job.client, job.amount), "refund failed"


@external
@view
def getJob(job_id: uint256) -> Job:
    return self.jobs[job_id]
