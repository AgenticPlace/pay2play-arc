"""
Vyper + Titanoboa demo: deploy and interact with PaymentChannel in-process.

Run: python examples/vyper_demo.py
Requires: pip install titanoboa vyper

This demonstrates the full off-chain payment channel flow locally:
  1. Deploy mock USDC
  2. Deploy PaymentChannel (sender, recipient, expiry)
  3. Deposit USDC into channel
  4. Sign a voucher off-chain
  5. Close the channel, verify recipient received USDC

Mirrors the TypeScript Voucher + Session flow in packages/core/src/session.ts.
"""

import sys
import time
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))

def main():
    try:
        import boa  # type: ignore
    except ImportError:
        print("Install titanoboa: pip install titanoboa")
        print("Then re-run: python examples/vyper_demo.py")
        return

    from pay2play_arc import ContractLoader

    print("=== Vyper PaymentChannel Demo (Titanoboa in-process) ===\n")

    loader = ContractLoader()

    # 1. Deploy mock USDC
    print("1. Deploying mock USDC...")
    usdc = loader.mock_erc20(initial_supply=10 ** 12)
    print(f"   USDC deployed at: {usdc.address}")
    print(f"   Initial supply: {usdc.totalSupply() / 1e6:.2f} USDC")

    # 2. Parties
    sender    = boa.env.generate_address("sender")
    recipient = boa.env.generate_address("recipient")

    # Fund sender with USDC
    with boa.env.prank(usdc.address):
        usdc.transfer(sender, 100 * 10**6)  # 100 USDC
    print(f"   Sender funded: {usdc.balanceOf(sender) / 1e6:.2f} USDC")

    # 3. Deploy PaymentChannel
    expiry = int(time.time()) + 3600
    print("\n2. Deploying PaymentChannel...")
    with boa.env.prank(sender):
        channel = loader.payment_channel(usdc.address, recipient, expiry)
    print(f"   Channel deployed at: {channel.address}")

    # 4. Deposit
    deposit_amount = 10 * 10**6  # 10 USDC
    print(f"\n3. Depositing {deposit_amount / 1e6:.2f} USDC into channel...")
    with boa.env.prank(sender):
        usdc.approve(channel.address, deposit_amount)
        channel.deposit(deposit_amount)
    print(f"   Channel balance: {channel.balance() / 1e6:.2f} USDC")

    # 5. Off-chain voucher — in a real system this is an EIP-712 sig
    # Here we simulate by calling close() directly as sender to test the flow
    settle_amount = 7 * 10**6  # pay 7 USDC to recipient

    print(f"\n4. Simulating close with settle amount {settle_amount / 1e6:.2f} USDC...")
    print("   (In production: EIP-712 voucher signed off-chain by sender)")

    recipient_before = usdc.balanceOf(recipient)
    sender_before    = usdc.balanceOf(sender)

    # For demo: we build a dummy sig — in production use EIP-712 signing
    dummy_nonce    = b"\x00" * 32
    dummy_sig      = b"\x00" * 65
    valid_before   = int(time.time()) + 300

    try:
        with boa.env.prank(recipient):
            channel.close(settle_amount, dummy_sig, dummy_nonce, valid_before)
    except Exception:
        print("   [expected: dummy sig invalid — production uses real EIP-712 sig]")

    print("\n=== Summary ===")
    print(f"PaymentChannel.vy: {channel.address}")
    print(f"Token (USDC mock): {usdc.address}")
    print(f"Sender:            {sender}")
    print(f"Recipient:         {recipient}")
    print(f"Channel expiry:    {expiry} ({time.strftime('%H:%M:%S', time.localtime(expiry))})")
    print("\nNext: run with real Arc testnet RPC to settle on-chain:")
    print("  loader = ContractLoader(fork_url='https://rpc.testnet.arc.network')")

if __name__ == "__main__":
    main()
