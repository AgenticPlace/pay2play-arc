"""
x402 protocol helpers for pay2play-arc Python SDK.

Implements the x402 v2 spec client side:
  - Parse PAYMENT-REQUIRED challenge from response headers
  - Build and sign payment-signature headers for Arc testnet
  - EIP-3009 transferWithAuthorization signing for USDC

References:
  https://github.com/coinbase/x402
  https://developers.circle.com/gateway/nanopayments
"""

from __future__ import annotations

import base64
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class PaymentResource:
    url:         str
    description: str
    mime_type:   str = "application/json"


@dataclass
class PaymentRequirement:
    scheme:               str
    network:              str
    asset:                str
    amount:               str
    pay_to:               str
    max_timeout_seconds:  int
    extra:                Dict[str, Any] = field(default_factory=dict)


@dataclass
class X402Challenge:
    x402_version: int
    resource:     PaymentResource
    accepts:      List[PaymentRequirement]
    error:        Optional[str] = None


@dataclass
class X402Payload:
    x402_version: int
    resource:     Optional[PaymentResource]
    accepted:     Optional[Dict[str, Any]]
    payload: Dict[str, Any]


def decode_challenge(b64: str) -> X402Challenge:
    """Decode base64 PAYMENT-REQUIRED header into an X402Challenge."""
    data = json.loads(base64.b64decode(b64).decode())
    resource = PaymentResource(
        url=data["resource"]["url"],
        description=data["resource"]["description"],
        mime_type=data["resource"].get("mimeType", "application/json"),
    )
    accepts = [
        PaymentRequirement(
            scheme=r["scheme"],
            network=r["network"],
            asset=r["asset"],
            amount=r["amount"],
            pay_to=r["payTo"],
            max_timeout_seconds=r["maxTimeoutSeconds"],
            extra=r.get("extra", {}),
        )
        for r in data.get("accepts", [])
    ]
    return X402Challenge(
        x402_version=data.get("x402Version", 2),
        resource=resource,
        accepts=accepts,
        error=data.get("error"),
    )


def encode_payload(
    sig_b64: str,
    requirement: PaymentRequirement,
    resource: Optional[PaymentResource] = None,
) -> str:
    """Encode a payment-signature header (base64 JSON)."""
    payload = {
        "x402Version": 2,
        "payload": {"signature": sig_b64},
        "accepted": {
            "scheme":  requirement.scheme,
            "network": requirement.network,
            "asset":   requirement.asset,
            "amount":  requirement.amount,
        },
    }
    if resource:
        payload["resource"] = {
            "url":         resource.url,
            "description": resource.description,
            "mimeType":    resource.mime_type,
        }
    return base64.b64encode(json.dumps(payload).encode()).decode()


def parse_price(price_str: str) -> int:
    """Convert '$0.001' → atomic USDC (6-decimal int)."""
    cleaned = price_str.lstrip("$").strip()
    return round(float(cleaned) * 1_000_000)


async def _sign_eip3009(requirement: PaymentRequirement, private_key: str) -> str:
    """
    Sign an EIP-3009 transferWithAuthorization for the given payment requirement.
    Returns base64-encoded signature.

    Uses eth-account for signing. In production, use circle-titanoboa-sdk signers.
    """
    from eth_account import Account  # type: ignore
    from eth_account.messages import encode_structured_data  # type: ignore

    now        = int(time.time())
    valid_after  = str(now - 60)
    valid_before = str(now + int(requirement.max_timeout_seconds))
    # Random 32-byte nonce as hex
    import secrets
    nonce_hex = "0x" + secrets.token_hex(32)

    # EIP-712 structured data for ERC-3009 transferWithAuthorization
    typed_data = {
        "types": {
            "EIP712Domain": [
                {"name": "name",              "type": "string"},
                {"name": "version",           "type": "string"},
                {"name": "chainId",           "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "TransferWithAuthorization": [
                {"name": "from",         "type": "address"},
                {"name": "to",           "type": "address"},
                {"name": "value",        "type": "uint256"},
                {"name": "validAfter",   "type": "uint256"},
                {"name": "validBefore",  "type": "uint256"},
                {"name": "nonce",        "type": "bytes32"},
            ],
        },
        "primaryType": "TransferWithAuthorization",
        "domain": {
            "name":              requirement.extra.get("name", "USD Coin"),
            "version":           requirement.extra.get("version", "1"),
            "chainId":           5042002,
            "verifyingContract": requirement.asset,
        },
        "message": {
            "from":        Account.from_key(private_key).address,
            "to":          requirement.extra.get("verifyingContract", requirement.pay_to),
            "value":       int(requirement.amount),
            "validAfter":  int(valid_after),
            "validBefore": int(valid_before),
            "nonce":       bytes.fromhex(nonce_hex[2:]),
        },
    }

    signed = Account.sign_typed_data(private_key, full_message=typed_data)
    sig_bytes = signed.signature
    return base64.b64encode(sig_bytes).decode()
