# @version ^0.4.0
"""
SubscriptionManager — recurring USDC payments for pay2play-arc.

Supports:
  - Fixed-price subscriptions with auto-renew
  - Pro-rata refunds on cancellation
  - Price-lock: subscribers keep their price for the current period
  - Metered billing: accumulate usage, settle at period end

Sourced/inspired from: https://github.com/vyperlang/vyper-agentic-payments
"""

from contracts.arc.interfaces import IERC20

# ── Events ────────────────────────────────────────────────────────────────────

event Subscribed:
    subscriber: indexed(address)
    plan_id:    indexed(uint256)
    expires_at: uint256
    price:      uint256

event Renewed:
    subscriber: indexed(address)
    plan_id:    indexed(uint256)
    expires_at: uint256

event Cancelled:
    subscriber: indexed(address)
    plan_id:    indexed(uint256)
    refund:     uint256

event PlanCreated:
    plan_id:  indexed(uint256)
    price:    uint256
    interval: uint256

event UsageCharged:
    subscriber: indexed(address)
    plan_id:    indexed(uint256)
    amount:     uint256

# ── Structs ───────────────────────────────────────────────────────────────────

struct Plan:
    price:     uint256   # atomic USDC per interval
    interval:  uint256   # seconds per period (e.g. 30*86400 for monthly)
    active:    bool
    recipient: address

struct Subscription:
    plan_id:   uint256
    starts_at: uint256
    expires_at: uint256
    locked_price: uint256  # price locked at subscription time
    usage_accrued: uint256 # for metered plans

# ── Storage ───────────────────────────────────────────────────────────────────

token:         public(IERC20)
owner:         public(address)

plans:         public(HashMap[uint256, Plan])
plan_count:    public(uint256)

subs:          public(HashMap[address, HashMap[uint256, Subscription]])


@deploy
def __init__(_token: address):
    assert _token != empty(address), "zero token"
    self.token = IERC20(_token)
    self.owner = msg.sender


@external
def createPlan(price: uint256, interval: uint256, recipient: address) -> uint256:
    """Owner creates a subscription plan. Returns plan ID."""
    assert msg.sender  == self.owner,   "only owner"
    assert price        >  0,           "zero price"
    assert interval     >  0,           "zero interval"
    assert recipient   != empty(address), "zero recipient"

    plan_id: uint256 = self.plan_count
    self.plans[plan_id] = Plan(price=price, interval=interval, active=True, recipient=recipient)
    self.plan_count += 1
    log PlanCreated(plan_id, price, interval)
    return plan_id


@external
def subscribe(plan_id: uint256):
    """Subscribe to a plan. Charges one period upfront."""
    plan: Plan = self.plans[plan_id]
    assert plan.active,                "plan not active"
    sub: Subscription = self.subs[msg.sender][plan_id]
    assert sub.expires_at < block.timestamp, "already subscribed"

    assert self.token.transferFrom(msg.sender, plan.recipient, plan.price), "payment failed"

    self.subs[msg.sender][plan_id] = Subscription(
        plan_id=plan_id,
        starts_at=block.timestamp,
        expires_at=block.timestamp + plan.interval,
        locked_price=plan.price,
        usage_accrued=0,
    )
    log Subscribed(msg.sender, plan_id, block.timestamp + plan.interval, plan.price)


@external
def renew(plan_id: uint256):
    """Renew an expiring subscription. Charges locked price for another period."""
    sub: Subscription = self.subs[msg.sender][plan_id]
    plan: Plan = self.plans[plan_id]
    assert sub.expires_at > 0,         "not subscribed"
    assert plan.active,                "plan not active"

    assert self.token.transferFrom(msg.sender, plan.recipient, sub.locked_price), "renewal failed"

    self.subs[msg.sender][plan_id].expires_at += plan.interval
    log Renewed(msg.sender, plan_id, self.subs[msg.sender][plan_id].expires_at)


@external
def cancel(plan_id: uint256):
    """Cancel subscription. Pro-rata refund for unused time."""
    sub: Subscription  = self.subs[msg.sender][plan_id]
    plan: Plan         = self.plans[plan_id]
    assert sub.expires_at > block.timestamp, "subscription already expired"

    remaining: uint256 = sub.expires_at - block.timestamp
    period:    uint256 = plan.interval
    refund:    uint256 = sub.locked_price * remaining / period

    self.subs[msg.sender][plan_id].expires_at = block.timestamp

    if refund > 0:
        assert self.token.transfer(msg.sender, refund), "refund failed"

    log Cancelled(msg.sender, plan_id, refund)


@external
def chargeUsage(subscriber: address, plan_id: uint256, amount: uint256):
    """Owner charges metered usage against a subscriber's active sub."""
    assert msg.sender == self.owner, "only owner"
    sub: Subscription = self.subs[subscriber][plan_id]
    plan: Plan = self.plans[plan_id]
    assert sub.expires_at > block.timestamp, "subscription expired"

    assert self.token.transferFrom(subscriber, plan.recipient, amount), "charge failed"
    self.subs[subscriber][plan_id].usage_accrued += amount
    log UsageCharged(subscriber, plan_id, amount)


@external
@view
def isActive(subscriber: address, plan_id: uint256) -> bool:
    return self.subs[subscriber][plan_id].expires_at > block.timestamp
