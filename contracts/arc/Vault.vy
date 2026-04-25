# CONTRACT_SOURCE: github.com/vyperlang/vyper-agentic-payments @ c5f599d25aa8a2bb330682cd23e7dfd28a50d1e8
# CONTRACT_SYNCED_AT: 2026-04-25T18:43Z
# License: MIT (preserved from upstream)
# DO NOT EDIT BY HAND — re-sync via scripts/sync-contracts.sh

# @version ^0.4.0

"""
@title Vault
@notice Minimal USDC deposit/withdraw contract for Arc Testnet.
@dev Track A2 challenge contract. Accepts deposits from any caller,
     stores per-depositor balances, and restricts withdrawals to
     the original depositor.
"""

interface IERC20:
    def transfer(to: address, amount: uint256) -> bool: nonpayable
    def transferFrom(sender: address, recipient: address, amount: uint256) -> bool: nonpayable

event Deposit:
    depositor: indexed(address)
    amount: uint256

event Withdrawal:
    depositor: indexed(address)
    amount: uint256

usdc: public(address)
balances: public(HashMap[address, uint256])

@deploy
def __init__(usdc_address: address):
    """
    @notice Initialize the vault with a USDC token address.
    @param usdc_address Address of the USDC ERC-20 contract.
    """
    assert usdc_address != empty(address), "Vault: zero address"
    self.usdc = usdc_address

@external
def deposit(amount: uint256):
    """
    @notice Deposit USDC into the vault.
    @param amount Amount to deposit (6 decimals).
    @dev Caller must have approved this contract to spend amount.
    """
    assert amount > 0, "Vault: zero amount"

    success: bool = extcall IERC20(self.usdc).transferFrom(msg.sender, self, amount)
    assert success, "Vault: transfer failed"

    self.balances[msg.sender] += amount

    log Deposit(depositor=msg.sender, amount=amount)

@external
def withdraw(amount: uint256):
    """
    @notice Withdraw USDC from the vault. Only the depositor can withdraw.
    @param amount Amount to withdraw (6 decimals).
    """
    assert amount > 0, "Vault: zero amount"
    assert self.balances[msg.sender] >= amount, "Vault: insufficient balance"

    self.balances[msg.sender] -= amount

    success: bool = extcall IERC20(self.usdc).transfer(msg.sender, amount)
    assert success, "Vault: transfer failed"

    log Withdrawal(depositor=msg.sender, amount=amount)
