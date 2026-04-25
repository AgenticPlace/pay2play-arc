"""
ContractLoader — load and interact with Vyper contracts via Titanoboa.

Provides both in-process testing (Titanoboa) and mainnet interaction
via viem-compatible ABI calls.

References:
  https://github.com/vyperlang/titanoboa
  https://github.com/vyperlang/circle-titanoboa-sdk
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

# Root of the monorepo contracts directory
_CONTRACTS_DIR = Path(__file__).parent.parent.parent / "contracts" / "arc"


def load_contract(
    name: str,
    *constructor_args: Any,
    fork_url: Optional[str] = None,
    at_address: Optional[str] = None,
) -> Any:
    """
    Load a Vyper contract by name using Titanoboa.

    Args:
        name:            Contract filename without .vy (e.g. "PaymentChannel")
        constructor_args: Arguments forwarded to the contract constructor
        fork_url:        RPC URL to fork from (default: ARC_TESTNET_RPC)
        at_address:      Interact with already-deployed contract at this address

    Returns:
        Titanoboa contract instance

    Examples:
        usdc_mock = load_contract("interfaces/IERC20")
        channel   = load_contract("PaymentChannel", usdc.address, recipient, expiry)
        escrow    = load_contract("AgentEscrow", usdc.address)

        # Fork Arc testnet
        channel = load_contract(
            "PaymentChannel",
            usdc, recipient, expiry,
            fork_url="https://rpc.testnet.arc.network",
        )
    """
    import boa  # type: ignore

    contract_path = _CONTRACTS_DIR / f"{name}.vy"
    if not contract_path.exists():
        raise FileNotFoundError(f"Contract not found: {contract_path}")

    if fork_url or at_address:
        rpc = fork_url or os.getenv("ARC_RPC_URL", "https://rpc.testnet.arc.network")
        with boa.fork(rpc):
            if at_address:
                return boa.load_partial(str(contract_path)).at(at_address)
            return boa.load(str(contract_path), *constructor_args)

    if at_address:
        return boa.load_partial(str(contract_path)).at(at_address)
    return boa.load(str(contract_path), *constructor_args)


class ContractLoader:
    """
    Convenience class for loading the pay2play-arc Vyper contract suite.
    Useful in test fixtures and notebooks.

    Usage:
        loader  = ContractLoader()
        usdc    = loader.mock_erc20(initial_supply=10**18)
        channel = loader.payment_channel(usdc.address, recipient, expiry)
        escrow  = loader.agent_escrow(usdc.address)
    """

    def __init__(self, fork_url: Optional[str] = None):
        self.fork_url = fork_url

    def _load(self, name: str, *args: Any) -> Any:
        return load_contract(name, *args, fork_url=self.fork_url)

    def payment_channel(self, token: str, recipient: str, expiry: int) -> Any:
        """Load PaymentChannel.vy with the given USDC token, recipient, and expiry."""
        return self._load("PaymentChannel", token, recipient, expiry)

    def agent_escrow(self, token: str) -> Any:
        """Load AgentEscrow.vy — ERC-8183-compatible job escrow."""
        return self._load("AgentEscrow", token)

    def spending_limiter(self, token: str, per_tx: int, daily: int, total_cap: int) -> Any:
        """Load SpendingLimiter.vy with USDC + limit config."""
        return self._load("SpendingLimiter", token, per_tx, daily, total_cap)

    def subscription_manager(self, token: str) -> Any:
        """Load SubscriptionManager.vy."""
        return self._load("SubscriptionManager", token)

    def payment_splitter(self, token: str) -> Any:
        """Load PaymentSplitter.vy — multi-recipient revenue distribution
        by basis-point shares. Useful for AgenticPlace marketplace splits
        (provider / platform / treasury). Vendored from
        vyperlang/vyper-agentic-payments.
        """
        return self._load("PaymentSplitter", token)

    def vault(self, token: str) -> Any:
        """Load Vault.vy — minimal per-depositor USDC vault. Useful as a
        per-agent treasury primitive (each mindX agent gets a vault entry
        as it earns; only the depositor can withdraw). Vendored from
        vyperlang/vyper-agentic-payments.
        """
        return self._load("Vault", token)

    def mock_erc20(self, initial_supply: int = 10**24) -> Any:
        """Deploy a minimal ERC-20 mock for testing. Requires snekmate."""
        try:
            import boa  # type: ignore
            src = """
# @version ^0.4.0
from ethereum.ercs import IERC20

name: public(String[32])
symbol: public(String[8])
decimals: public(uint8)
totalSupply: public(uint256)
balanceOf: public(HashMap[address, uint256])
allowance: public(HashMap[address, HashMap[address, uint256]])

@deploy
def __init__(supply: uint256):
    self.name = "Mock USDC"
    self.symbol = "mUSDC"
    self.decimals = 6
    self.totalSupply = supply
    self.balanceOf[msg.sender] = supply

@external
def transfer(to: address, amount: uint256) -> bool:
    self.balanceOf[msg.sender] -= amount
    self.balanceOf[to] += amount
    return True

@external
def transferFrom(frm: address, to: address, amount: uint256) -> bool:
    self.allowance[frm][msg.sender] -= amount
    self.balanceOf[frm] -= amount
    self.balanceOf[to] += amount
    return True

@external
def approve(spender: address, amount: uint256) -> bool:
    self.allowance[msg.sender][spender] = amount
    return True
"""
            return boa.loads(src, initial_supply)
        except ImportError as e:
            raise ImportError("Install titanoboa: pip install titanoboa") from e
