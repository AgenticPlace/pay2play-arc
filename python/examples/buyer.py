"""
Buyer example: pay2play_arc GatewayClient making gasless USDC payments.

Run: python examples/buyer.py
Env: BUYER_PRIVATE_KEY=0x...
"""
import asyncio
import os
import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))

from pay2play_arc import GatewayClient, ARC_TESTNET_CONTRACTS


async def main():
    private_key = os.getenv("BUYER_PRIVATE_KEY")
    if not private_key:
        print("Set BUYER_PRIVATE_KEY env var (fund via https://faucet.circle.com)")
        print("Running in demo mode — showing what would happen\n")
        private_key = None

    client = GatewayClient(chain="arcTestnet", private_key=private_key)

    print("=== pay2play_arc Buyer Demo ===")
    print(f"USDC on Arc: {ARC_TESTNET_CONTRACTS['usdc']}")
    print(f"Gateway:     {ARC_TESTNET_CONTRACTS['gateway_wallet']}\n")

    endpoints = [
        "http://localhost:3001/weather",   # C1 api-meter
        "http://localhost:3007/rows",      # C7 row-meter
        "http://localhost:3009/agent/register",  # C9 agent-identity
    ]

    for url in endpoints:
        print(f"Paying for: {url}")
        if private_key:
            result = await client.pay(url)
            print(f"  status: {result.status_code}, tx: {result.transaction}")
        else:
            print("  [demo mode: would send x402 payment + retry]")
        print()


if __name__ == "__main__":
    asyncio.run(main())
