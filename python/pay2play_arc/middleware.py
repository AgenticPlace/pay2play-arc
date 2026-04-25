"""
create_gateway_middleware — FastAPI/Flask payment gate using Circle Gateway x402.

Mirrors the TypeScript createPaidMiddleware() in packages/server/src/http.ts.

Usage with FastAPI:
    from fastapi import FastAPI
    from pay2play_arc.middleware import create_gateway_middleware

    app = FastAPI()
    gate = create_gateway_middleware(
        pay_to="0x...",
        price="$0.001",
        private_key=os.getenv("SELLER_PRIVATE_KEY"),
    )

    @app.get("/weather")
    async def weather(payment: PaymentGate = Depends(gate)):
        return {"temp": 72}

References:
  https://github.com/vyperlang/circle-titanoboa-sdk (create_gateway_middleware)
  https://developers.circle.com/gateway/nanopayments
"""

from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from typing import Callable, Optional

from .x402 import PaymentRequirement, X402Challenge, decode_challenge, parse_price


@dataclass
class PaymentGate:
    """Injected into FastAPI handlers to confirm payment was verified."""
    payer: str
    amount: str
    transaction: Optional[str] = None
    verified: bool = True


def create_gateway_middleware(
    pay_to: str,
    price: str = "$0.001",
    private_key: Optional[str] = None,
    description: Optional[str] = None,
    resource_url: Optional[str] = None,
) -> Callable:
    """
    Returns a FastAPI Depends() factory that enforces x402 payment.

    On 402: raises HTTPException with PAYMENT-REQUIRED header.
    On valid sig: verifies + settles via Circle Gateway, injects PaymentGate.
    """
    private_key = private_key or os.getenv("SELLER_PRIVATE_KEY", "")
    amount_atomic = parse_price(price)

    async def _gate(request=None) -> PaymentGate:
        try:
            from fastapi import HTTPException, Request  # type: ignore
        except ImportError:
            raise ImportError("Install fastapi: pip install fastapi")

        req: Request = request
        sig_b64 = (
            req.headers.get("payment-signature")
            or req.headers.get("PAYMENT-SIGNATURE")
            or req.headers.get("x-payment")
        )

        if not sig_b64:
            # Build and return 402 challenge
            url = resource_url or str(req.url)
            challenge = {
                "x402Version": 2,
                "error": "payment-signature header is required",
                "resource": {
                    "url":         url,
                    "description": description or f"Paid resource ({price} USDC)",
                    "mimeType":    "application/json",
                },
                "accepts": [{
                    "scheme":             "exact",
                    "network":            "eip155:5042002",
                    "asset":              "0x3600000000000000000000000000000000000000",
                    "amount":             str(amount_atomic),
                    "payTo":              pay_to,
                    "maxTimeoutSeconds":  345600,
                    "extra": {
                        "name":              "GatewayWalletBatched",
                        "version":           "1",
                        "verifyingContract": "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
                    },
                }],
            }
            challenge_b64 = base64.b64encode(json.dumps(challenge).encode()).decode()
            from fastapi.responses import JSONResponse  # type: ignore
            raise HTTPException(
                status_code=402,
                detail={},
                headers={"PAYMENT-REQUIRED": challenge_b64},
            )

        # Verify via circle-titanoboa-sdk if available, else accept with warning
        try:
            from circle_titanoboa_sdk import BatchFacilitatorClient  # type: ignore
            fac = BatchFacilitatorClient()
            payload = json.loads(base64.b64decode(sig_b64).decode())
            verify_result = await fac.verify(payload, {
                "scheme":  "exact",
                "network": "eip155:5042002",
                "asset":   "0x3600000000000000000000000000000000000000",
                "amount":  str(amount_atomic),
                "payTo":   pay_to,
                "maxTimeoutSeconds": 345600,
            })
            if not verify_result.get("isValid"):
                from fastapi import HTTPException  # type: ignore
                raise HTTPException(status_code=402, detail={"error": "invalid payment"})

            settle_result = await fac.settle(payload, {
                "scheme":  "exact",
                "network": "eip155:5042002",
                "asset":   "0x3600000000000000000000000000000000000000",
                "amount":  str(amount_atomic),
                "payTo":   pay_to,
                "maxTimeoutSeconds": 345600,
            })
            return PaymentGate(
                payer=settle_result.get("payer", verify_result.get("payer", "unknown")),
                amount=price,
                transaction=settle_result.get("transaction"),
            )
        except ImportError:
            # circle-titanoboa-sdk not installed — accept payment in dev mode
            import warnings
            warnings.warn(
                "circle-titanoboa-sdk not installed: payment NOT verified (dev mode)",
                stacklevel=2,
            )
            return PaymentGate(payer="dev-mode", amount=price, verified=False)

    return _gate
