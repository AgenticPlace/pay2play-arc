# @version ^0.4.0
"""
SpendingLimiter — per-agent USDC spending controls for pay2play-arc.

Guards an AI agent's wallet against runaway spend. Configurable limits:
  - per-transaction cap
  - daily rolling cap
  - total lifetime cap
  - per-recipient allowlist

Designed to wrap an agent's spend() calls before forwarding to x402 payment.

Sourced/inspired from: https://github.com/vyperlang/vyper-agentic-payments
"""

from contracts.arc.interfaces import IERC20

# ── Events ────────────────────────────────────────────────────────────────────

event SpendExecuted:
    recipient: indexed(address)
    amount:    uint256
    daily_remaining: uint256

event LimitsUpdated:
    per_tx:    uint256
    daily:     uint256
    total_cap: uint256

event Paused:
    by: address

event Resumed:
    by: address

event AllowlistUpdated:
    recipient: indexed(address)
    allowed:   bool

# ── Storage ───────────────────────────────────────────────────────────────────

token:         public(IERC20)
owner:         public(address)
paused:        public(bool)

# Limits (all in atomic USDC, 6 decimals)
per_tx_limit:  public(uint256)   # max per single transaction
daily_limit:   public(uint256)   # max per rolling 24h window
total_cap:     public(uint256)   # lifetime maximum (0 = unlimited)

# Spend tracking
daily_spent:   public(uint256)
day_start:     public(uint256)   # timestamp of current day window
total_spent:   public(uint256)

# Allowlist — if non-empty, only listed addresses may receive spend()
allowlist_enabled: public(bool)
allowlist:     public(HashMap[address, bool])

DAY: constant(uint256) = 86400  # seconds in a day


@deploy
def __init__(
    _token:      address,
    _per_tx:     uint256,
    _daily:      uint256,
    _total_cap:  uint256,
):
    assert _token   != empty(address), "zero token"
    assert _per_tx  >  0,              "per_tx must be > 0"
    assert _daily   >= _per_tx,        "daily must be >= per_tx"

    self.token        = IERC20(_token)
    self.owner        = msg.sender
    self.per_tx_limit = _per_tx
    self.daily_limit  = _daily
    self.total_cap    = _total_cap
    self.day_start    = block.timestamp


@external
def spend(recipient: address, amount: uint256):
    """Execute a guarded USDC spend. Enforces all configured limits."""
    assert not self.paused,             "spending paused"
    assert recipient != empty(address), "zero recipient"
    assert amount    >  0,              "zero amount"
    assert amount    <= self.per_tx_limit, "exceeds per-tx limit"

    if self.allowlist_enabled:
        assert self.allowlist[recipient], "recipient not allowlisted"

    # Roll daily window if 24h have passed
    if block.timestamp >= self.day_start + DAY:
        self.daily_spent = 0
        self.day_start   = block.timestamp

    assert self.daily_spent + amount <= self.daily_limit, "exceeds daily limit"

    if self.total_cap > 0:
        assert self.total_spent + amount <= self.total_cap, "exceeds total cap"

    self.daily_spent += amount
    self.total_spent += amount

    assert self.token.transfer(recipient, amount), "transfer failed"
    log SpendExecuted(recipient, amount, self.daily_limit - self.daily_spent)


@external
def setLimits(per_tx: uint256, daily: uint256, total_cap: uint256):
    assert msg.sender == self.owner, "only owner"
    assert per_tx     >  0,          "per_tx must be > 0"
    assert daily      >= per_tx,     "daily must be >= per_tx"
    self.per_tx_limit = per_tx
    self.daily_limit  = daily
    self.total_cap    = total_cap
    log LimitsUpdated(per_tx, daily, total_cap)


@external
def setAllowlist(recipient: address, allowed: bool):
    assert msg.sender == self.owner, "only owner"
    self.allowlist[recipient] = allowed
    log AllowlistUpdated(recipient, allowed)


@external
def setAllowlistEnabled(enabled: bool):
    assert msg.sender == self.owner, "only owner"
    self.allowlist_enabled = enabled


@external
def pause():
    assert msg.sender == self.owner, "only owner"
    self.paused = True
    log Paused(msg.sender)


@external
def resume():
    assert msg.sender == self.owner, "only owner"
    self.paused = False
    log Resumed(msg.sender)


@external
def deposit(amount: uint256):
    """Deposit USDC into this limiter for future spending."""
    assert self.token.transferFrom(msg.sender, self, amount), "deposit failed"


@external
def withdraw(amount: uint256):
    """Owner withdraws USDC from the limiter."""
    assert msg.sender == self.owner, "only owner"
    assert self.token.transfer(self.owner, amount), "withdraw failed"


@external
@view
def dailyRemaining() -> uint256:
    if block.timestamp >= self.day_start + DAY:
        return self.daily_limit
    return self.daily_limit - self.daily_spent
