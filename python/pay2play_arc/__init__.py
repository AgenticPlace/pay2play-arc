"""
pay2play_arc — Python SDK layer for pay2play on Circle Arc.

Components:
  - gateway_client   : GatewayClient for gasless USDC payments
  - contracts        : Titanoboa-powered Vyper contract interaction
  - x402             : HTTP 402 protocol helpers
  - middleware        : FastAPI/Flask payment protection middleware

Quick start:
  from pay2play_arc import GatewayClient, load_contract

  client = GatewayClient(chain="arcTestnet", private_key="0x...")
  result = await client.pay("https://api.example.com/premium")

  channel = load_contract("PaymentChannel", usdc, recipient, expiry)
  channel.deposit(1_000_000)  # 1 USDC
"""

from .gateway_client import GatewayClient, GatewayClientSync
from .contracts import load_contract, ContractLoader
from .x402 import (
    X402Challenge,
    X402Payload,
    decode_challenge,
    encode_payload,
    parse_price,
)
from .middleware import create_gateway_middleware, PaymentGate

__all__ = [
    "GatewayClient",
    "GatewayClientSync",
    "load_contract",
    "ContractLoader",
    "X402Challenge",
    "X402Payload",
    "decode_challenge",
    "encode_payload",
    "parse_price",
    "create_gateway_middleware",
    "PaymentGate",
]

# Arc Testnet contract addresses — mirrors packages/core/src/arc.ts
ARC_TESTNET_CONTRACTS = {
    "usdc":               "0x3600000000000000000000000000000000000000",
    "eurc":               "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    "usyc":               "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C",
    "gateway_wallet":     "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    "gateway_minter":     "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
    "cctp_token_messenger":      "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    "cctp_message_transmitter":  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    "fx_escrow":          "0x867650F5eAe8df91445971f14d89fd84F0C9a9f8",
    "memo":               "0x9702466268ccF55eAB64cdf484d272Ac08d3b75b",
    "permit2":            "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    "identity_registry":  "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    "reputation_registry":"0x8004B663056A597Dffe9eCcC1965A193B7388713",
    "validation_registry":"0x8004Cb1BF31DAf7788923b405b754f57acEB4272",
    "job_escrow":         "0x0747EEf0706327138c69792bF28Cd525089e4583",
}

ARC_TESTNET_RPC    = "https://rpc.testnet.arc.network"
ARC_TESTNET_CHAIN  = 5042002
ARC_CCTP_DOMAIN    = 26
ARC_EXPLORER       = "https://testnet.arcscan.app"
ARC_FAUCET         = "https://faucet.circle.com"
