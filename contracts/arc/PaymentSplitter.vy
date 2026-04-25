# CONTRACT_SOURCE: github.com/vyperlang/vyper-agentic-payments @ c5f599d25aa8a2bb330682cd23e7dfd28a50d1e8
# CONTRACT_SYNCED_AT: 2026-04-25T18:43Z
# License: MIT (preserved from upstream)
# DO NOT EDIT BY HAND — re-sync via scripts/sync-contracts.sh

# @version ^0.4.0

"""
@title PaymentSplitter - Revenue Distribution for Multi-Agent Collaboration
@author vyper-agentic-payments
@license MIT
@notice Distributes USDC payments among multiple recipients based on shares
@dev Part of the Vyper Agentic Payments governance layer for Circle Arc chain

This contract enables automatic revenue splitting for agent collaborations:
- Create payment pools with defined share allocations
- Accept USDC deposits that are automatically tracked per pool
- Recipients claim their share of accumulated payments
- Supports dynamic share updates (by pool owner)
- Integrates with x402 Batching SDK for agent payment workflows
"""

from ethereum.ercs import IERC20

# ============================================================================
# EVENTS
# ============================================================================

event PoolCreated:
    pool_id: indexed(uint256)
    owner: indexed(address)
    recipient_count: uint256

event SharesUpdated:
    pool_id: indexed(uint256)
    recipient: indexed(address)
    new_shares: uint256

event PaymentReceived:
    pool_id: indexed(uint256)
    amount: uint256
    sender: indexed(address)

event PaymentClaimed:
    pool_id: indexed(uint256)
    recipient: indexed(address)
    amount: uint256

event RecipientAdded:
    pool_id: indexed(uint256)
    recipient: indexed(address)
    shares: uint256

event RecipientRemoved:
    pool_id: indexed(uint256)
    recipient: indexed(address)

# ============================================================================
# CONSTANTS
# ============================================================================

MAX_RECIPIENTS: constant(uint256) = 100
MAX_SHARES: constant(uint256) = 10000  # 100.00% in basis points

# ============================================================================
# STORAGE
# ============================================================================

usdc: public(immutable(address))

# Pool ID counter
next_pool_id: public(uint256)

# Pool owner (can update shares)
pool_owner: public(HashMap[uint256, address])

# Total shares in a pool (should equal MAX_SHARES for proper distribution)
total_shares: public(HashMap[uint256, uint256])

# Shares per recipient in a pool
shares: public(HashMap[uint256, HashMap[address, uint256]])

# Total USDC deposited to a pool (cumulative)
total_received: public(HashMap[uint256, uint256])

# USDC already claimed by recipient from a pool
claimed: public(HashMap[uint256, HashMap[address, uint256]])

# Track if recipient is part of pool (for iteration tracking)
is_recipient: public(HashMap[uint256, HashMap[address, bool]])

# ============================================================================
# CONSTRUCTOR
# ============================================================================

@deploy
def __init__(_usdc: address):
    """
    @notice Deploy PaymentSplitter with USDC address
    @param _usdc USDC token address (0x3600...00 on Arc)
    """
    assert _usdc != empty(address), "zero address"
    usdc = _usdc
    self.next_pool_id = 1

# ============================================================================
# POOL MANAGEMENT
# ============================================================================

@external
def create_pool(
    recipients: DynArray[address, 100],
    share_amounts: DynArray[uint256, 100]
) -> uint256:
    """
    @notice Create a new payment pool with share allocations
    @param recipients List of recipient addresses
    @param share_amounts List of share amounts (in basis points)
    @return Pool ID
    """
    assert len(recipients) > 0, "no recipients"
    assert len(recipients) == len(share_amounts), "length mismatch"
    assert len(recipients) <= MAX_RECIPIENTS, "too many recipients"
    
    pool_id: uint256 = self.next_pool_id
    self.next_pool_id = pool_id + 1
    
    self.pool_owner[pool_id] = msg.sender
    
    total_shares_sum: uint256 = 0
    
    for i: uint256 in range(100):
        if i >= len(recipients):
            break
        
        recipient: address = recipients[i]
        share_amount: uint256 = share_amounts[i]
        
        assert recipient != empty(address), "zero recipient"
        assert share_amount > 0, "zero shares"
        assert not self.is_recipient[pool_id][recipient], "duplicate recipient"
        
        self.shares[pool_id][recipient] = share_amount
        self.is_recipient[pool_id][recipient] = True
        total_shares_sum += share_amount
    
    assert total_shares_sum == MAX_SHARES, "shares must equal 10000"
    self.total_shares[pool_id] = total_shares_sum
    
    log PoolCreated(pool_id=pool_id, owner=msg.sender, recipient_count=len(recipients))
    
    return pool_id

@external
def update_shares(pool_id: uint256, recipient: address, new_shares: uint256):
    """
    @notice Update shares for a recipient (pool owner only)
    @dev This can break the MAX_SHARES invariant - use carefully
    @param pool_id The pool ID
    @param recipient The recipient to update
    @param new_shares New share amount
    """
    assert self.pool_owner[pool_id] == msg.sender, "not pool owner"
    assert self.is_recipient[pool_id][recipient], "not a recipient"
    
    old_shares: uint256 = self.shares[pool_id][recipient]
    self.shares[pool_id][recipient] = new_shares
    self.total_shares[pool_id] = self.total_shares[pool_id] - old_shares + new_shares
    
    log SharesUpdated(pool_id=pool_id, recipient=recipient, new_shares=new_shares)

@external
def add_recipient(pool_id: uint256, recipient: address, share_amount: uint256):
    """
    @notice Add a new recipient to the pool (pool owner only)
    @param pool_id The pool ID
    @param recipient New recipient address
    @param share_amount Share amount for new recipient
    """
    assert self.pool_owner[pool_id] == msg.sender, "not pool owner"
    assert recipient != empty(address), "zero recipient"
    assert not self.is_recipient[pool_id][recipient], "already recipient"
    assert share_amount > 0, "zero shares"
    
    self.shares[pool_id][recipient] = share_amount
    self.is_recipient[pool_id][recipient] = True
    self.total_shares[pool_id] += share_amount
    
    log RecipientAdded(pool_id=pool_id, recipient=recipient, shares=share_amount)

@external
def remove_recipient(pool_id: uint256, recipient: address):
    """
    @notice Remove a recipient from the pool (pool owner only)
    @dev Recipient should claim before removal
    @param pool_id The pool ID
    @param recipient Recipient to remove
    """
    assert self.pool_owner[pool_id] == msg.sender, "not pool owner"
    assert self.is_recipient[pool_id][recipient], "not a recipient"
    
    share_amount: uint256 = self.shares[pool_id][recipient]
    self.total_shares[pool_id] -= share_amount
    self.shares[pool_id][recipient] = 0
    self.is_recipient[pool_id][recipient] = False
    
    log RecipientRemoved(pool_id=pool_id, recipient=recipient)

# ============================================================================
# PAYMENTS
# ============================================================================

@external
def deposit(pool_id: uint256, amount: uint256):
    """
    @notice Deposit USDC to a payment pool
    @param pool_id The pool ID
    @param amount Amount of USDC to deposit
    """
    assert amount > 0, "zero amount"
    assert self.pool_owner[pool_id] != empty(address), "pool not found"
    
    # Transfer USDC from sender to this contract
    success: bool = extcall IERC20(usdc).transferFrom(msg.sender, self, amount)
    assert success, "transfer failed"
    
    self.total_received[pool_id] += amount
    
    log PaymentReceived(pool_id=pool_id, amount=amount, sender=msg.sender)

@external
def claim(pool_id: uint256):
    """
    @notice Claim your share of accumulated payments
    @param pool_id The pool ID
    """
    assert self.is_recipient[pool_id][msg.sender], "not a recipient"
    
    claimable: uint256 = self._pending_payment(pool_id, msg.sender)
    assert claimable > 0, "nothing to claim"
    
    self.claimed[pool_id][msg.sender] += claimable
    
    success: bool = extcall IERC20(usdc).transfer(msg.sender, claimable)
    assert success, "transfer failed"
    
    log PaymentClaimed(pool_id=pool_id, recipient=msg.sender, amount=claimable)

@external
def claim_for(pool_id: uint256, recipient: address):
    """
    @notice Claim on behalf of a recipient (anyone can trigger)
    @param pool_id The pool ID
    @param recipient The recipient to claim for
    """
    assert self.is_recipient[pool_id][recipient], "not a recipient"
    
    claimable: uint256 = self._pending_payment(pool_id, recipient)
    assert claimable > 0, "nothing to claim"
    
    self.claimed[pool_id][recipient] += claimable
    
    success: bool = extcall IERC20(usdc).transfer(recipient, claimable)
    assert success, "transfer failed"
    
    log PaymentClaimed(pool_id=pool_id, recipient=recipient, amount=claimable)

# ============================================================================
# VIEW FUNCTIONS
# ============================================================================

@view
@external
def pending_payment(pool_id: uint256, recipient: address) -> uint256:
    """
    @notice Get pending payment for a recipient
    @param pool_id The pool ID
    @param recipient The recipient address
    @return Amount of USDC claimable
    """
    return self._pending_payment(pool_id, recipient)

@view
@internal
def _pending_payment(pool_id: uint256, recipient: address) -> uint256:
    """
    @notice Internal: Calculate pending payment
    """
    if not self.is_recipient[pool_id][recipient]:
        return 0
    
    if self.total_shares[pool_id] == 0:
        return 0
    
    # Calculate total owed based on shares
    total_owed: uint256 = (self.total_received[pool_id] * self.shares[pool_id][recipient]) // self.total_shares[pool_id]
    
    # Subtract already claimed
    already_claimed: uint256 = self.claimed[pool_id][recipient]
    
    if total_owed <= already_claimed:
        return 0
    
    return total_owed - already_claimed

@view
@external
def get_pool_info(pool_id: uint256) -> (address, uint256, uint256):
    """
    @notice Get pool information
    @param pool_id The pool ID
    @return (owner, total_shares, total_received)
    """
    return (
        self.pool_owner[pool_id],
        self.total_shares[pool_id],
        self.total_received[pool_id]
    )

@view
@external
def get_recipient_info(pool_id: uint256, recipient: address) -> (uint256, uint256, uint256, bool):
    """
    @notice Get recipient information in a pool
    @param pool_id The pool ID
    @param recipient The recipient address
    @return (shares, claimed, pending, is_recipient)
    """
    return (
        self.shares[pool_id][recipient],
        self.claimed[pool_id][recipient],
        self._pending_payment(pool_id, recipient),
        self.is_recipient[pool_id][recipient]
    )

@view
@external
def get_share_percentage(pool_id: uint256, recipient: address) -> uint256:
    """
    @notice Get recipient's share as percentage (basis points)
    @param pool_id The pool ID
    @param recipient The recipient address
    @return Share percentage in basis points (e.g., 5000 = 50%)
    """
    if self.total_shares[pool_id] == 0:
        return 0
    return (self.shares[pool_id][recipient] * MAX_SHARES) // self.total_shares[pool_id]
