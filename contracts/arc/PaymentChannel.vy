# @version ^0.4.0
"""
PaymentChannel — off-chain USDC payment channel for pay2play-arc.

Flow:
  1. sender calls deposit(amount) to lock USDC
  2. Off-chain: sender signs vouchers (EIP-712) authorizing partial amounts to recipient
  3. recipient calls close(amount, sig) to settle, remainder returned to sender
  4. After expiry, sender can call timeout() to reclaim locked funds

Integrates with @pay2play/core Voucher type: the off-chain sig is the
same EIP-712 structure used by the session flush path.

Sourced/inspired from: https://github.com/vyperlang/vyper-agentic-payments
"""

from contracts.arc.interfaces import IERC20

# ── Events ────────────────────────────────────────────────────────────────────

event Deposited:
    sender: indexed(address)
    amount: uint256
    expiry: uint256

event Closed:
    recipient: indexed(address)
    amount:    uint256
    remainder: uint256

event Extended:
    new_expiry: uint256

event TimedOut:
    sender:    indexed(address)
    amount:    uint256

# ── EIP-712 domain separator ──────────────────────────────────────────────────

DOMAIN_TYPE_HASH: constant(bytes32) = keccak256(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
)
VOUCHER_TYPE_HASH: constant(bytes32) = keccak256(
    "Voucher(address sender,address recipient,uint256 amount,uint256 validBefore,bytes32 nonce)"
)

# ── Storage ───────────────────────────────────────────────────────────────────

token:     public(IERC20)
sender:    public(address)
recipient: public(address)
balance:   public(uint256)
expiry:    public(uint256)
closed:    public(bool)
domain_separator: public(bytes32)


@deploy
def __init__(_token: address, _recipient: address, _expiry: uint256):
    assert _token     != empty(address), "zero token"
    assert _recipient != empty(address), "zero recipient"
    assert _expiry    >  block.timestamp, "expiry in past"

    self.token     = IERC20(_token)
    self.sender    = msg.sender
    self.recipient = _recipient
    self.expiry    = _expiry

    self.domain_separator = keccak256(
        abi_encode(
            DOMAIN_TYPE_HASH,
            keccak256(b"pay2play PaymentChannel"),
            keccak256(b"1"),
            chain.id,
            self,
        )
    )


@external
def deposit(amount: uint256):
    """Lock USDC into the channel. Sender may top up multiple times."""
    assert not self.closed,              "channel closed"
    assert msg.sender == self.sender,    "only sender"
    assert block.timestamp < self.expiry, "channel expired"
    assert self.token.transferFrom(msg.sender, self, amount), "transfer failed"
    self.balance += amount
    log Deposited(msg.sender, amount, self.expiry)


@external
def close(amount: uint256, sig: Bytes[65], nonce: bytes32, valid_before: uint256):
    """
    Settle the channel. Recipient presents a signed voucher for `amount`.
    The remainder is returned to sender.
    """
    assert not self.closed,                 "already closed"
    assert msg.sender == self.recipient,    "only recipient"
    assert amount     <= self.balance,      "amount exceeds balance"
    assert block.timestamp < valid_before,  "voucher expired"

    # Reconstruct EIP-712 digest
    struct_hash: bytes32 = keccak256(
        abi_encode(
            VOUCHER_TYPE_HASH,
            self.sender,
            self.recipient,
            amount,
            valid_before,
            nonce,
        )
    )
    digest: bytes32 = keccak256(concat(b"\x19\x01", self.domain_separator, struct_hash))

    # Recover signer from compact 65-byte sig (r, s, v)
    r: bytes32 = extract32(sig, 0)
    s: bytes32 = extract32(sig, 32)
    v: uint8   = convert(slice(sig, 64, 1), uint8)
    signer: address = ecrecover(digest, v, r, s)
    assert signer == self.sender, "invalid signature"

    self.closed = True
    remainder: uint256 = self.balance - amount

    if amount > 0:
        assert self.token.transfer(self.recipient, amount), "recipient transfer failed"
    if remainder > 0:
        assert self.token.transfer(self.sender, remainder), "sender refund failed"

    log Closed(self.recipient, amount, remainder)


@external
def extend(new_expiry: uint256):
    """Sender can extend the channel expiry."""
    assert msg.sender == self.sender,   "only sender"
    assert not self.closed,             "channel closed"
    assert new_expiry > self.expiry,    "must extend forward"
    self.expiry = new_expiry
    log Extended(new_expiry)


@external
def timeout():
    """After expiry, sender reclaims all locked funds."""
    assert msg.sender == self.sender,      "only sender"
    assert not self.closed,               "already closed"
    assert block.timestamp >= self.expiry, "not expired yet"
    self.closed = True
    amount: uint256 = self.balance
    self.balance = 0
    assert self.token.transfer(self.sender, amount), "refund failed"
    log TimedOut(self.sender, amount)
