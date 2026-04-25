"""
GatewayClient — async/sync Circle Gateway client for gasless USDC payments.

Wraps circle-titanoboa-sdk GatewayClient with pay2play-arc config defaults.
Supports both private-key signers and Circle Developer-Controlled Wallets.

References:
  https://github.com/vyperlang/circle-titanoboa-sdk
  https://developers.circle.com/gateway/nanopayments
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class PaymentResult:
    success: bool
    resource_url: str
    status_code: int
    response_body: Optional[bytes] = None
    transaction: Optional[str] = None
    payer: Optional[str] = None
    error: Optional[str] = None


class GatewayClient:
    """
    Async Circle Gateway client for making gasless USDC payments.

    Usage:
        client = GatewayClient(private_key="0x...")
        result = await client.pay("https://api.example.com/premium")
        print(result.status_code, result.transaction)
    """

    def __init__(
        self,
        chain: str = "arcTestnet",
        private_key: Optional[str] = None,
        circle_wallet_id: Optional[str] = None,
        circle_api_key: Optional[str] = None,
    ):
        self.chain             = chain
        self._private_key      = private_key or os.getenv("BUYER_PRIVATE_KEY") or os.getenv("SELLER_PRIVATE_KEY")
        self._circle_wallet_id = circle_wallet_id or os.getenv("CIRCLE_WALLET_ID")
        self._circle_api_key   = circle_api_key   or os.getenv("CIRCLE_API_KEY")
        self._sdk_client       = None

    def _get_sdk(self):
        if self._sdk_client is not None:
            return self._sdk_client
        try:
            from circle_titanoboa_sdk import GatewayClient as _SDK  # type: ignore
            if self._private_key:
                from circle_titanoboa_sdk.signers import PrivateKeySigner  # type: ignore
                signer = PrivateKeySigner(self._private_key)
            elif self._circle_wallet_id:
                from circle_titanoboa_sdk.signers import CircleWalletSigner  # type: ignore
                signer = CircleWalletSigner(
                    api_key=self._circle_api_key,
                    wallet_id=self._circle_wallet_id,
                )
            else:
                raise RuntimeError("Provide private_key or circle_wallet_id")
            self._sdk_client = _SDK(chain=self.chain, signer=signer)
        except ImportError:
            # Fallback: use httpx + manual x402 flow
            self._sdk_client = None
        return self._sdk_client

    async def pay(self, resource_url: str, method: str = "GET", body: Optional[bytes] = None) -> PaymentResult:
        """
        Make a gasless USDC payment for a protected resource.

        Implements x402 client flow:
          1. Send request → get 402 with PAYMENT-REQUIRED header
          2. Sign EIP-3009 authorization (via Circle Gateway)
          3. Retry with payment-signature header
          4. Return response

        Docs: https://developers.circle.com/gateway/nanopayments
        """
        sdk = self._get_sdk()
        if sdk is not None:
            result = await sdk.pay(resource_url)
            return PaymentResult(
                success=True,
                resource_url=resource_url,
                status_code=200,
                response_body=result.content if hasattr(result, "content") else None,
                transaction=getattr(result, "transaction", None),
                payer=getattr(result, "payer", None),
            )

        # Fallback: manual x402 flow via httpx
        import httpx
        from .x402 import decode_challenge, encode_payload, _sign_eip3009

        async with httpx.AsyncClient() as client:
            # Step 1: Probe for 402
            resp = await client.request(method, resource_url, content=body)
            if resp.status_code != 402:
                return PaymentResult(
                    success=resp.status_code < 400,
                    resource_url=resource_url,
                    status_code=resp.status_code,
                    response_body=resp.content,
                )

            # Step 2: Decode challenge + sign
            challenge_b64 = resp.headers.get("PAYMENT-REQUIRED", "")
            if not challenge_b64:
                return PaymentResult(
                    success=False, resource_url=resource_url,
                    status_code=402, error="missing PAYMENT-REQUIRED header",
                )
            challenge = decode_challenge(challenge_b64)
            if not challenge.accepts:
                return PaymentResult(
                    success=False, resource_url=resource_url,
                    status_code=402, error="no payment requirements in challenge",
                )

            requirement = challenge.accepts[0]
            sig_b64 = await _sign_eip3009(requirement, self._private_key or "")
            payload_b64 = encode_payload(sig_b64, requirement, challenge.resource)

            # Step 3: Retry with payment
            paid_resp = await client.request(
                method, resource_url, content=body,
                headers={"payment-signature": payload_b64},
            )
            return PaymentResult(
                success=paid_resp.status_code < 400,
                resource_url=resource_url,
                status_code=paid_resp.status_code,
                response_body=paid_resp.content,
                transaction=paid_resp.headers.get("X-Transaction-Hash"),
            )


class GatewayClientSync:
    """Synchronous wrapper around GatewayClient for scripts and notebooks."""

    def __init__(self, **kwargs):
        self._async = GatewayClient(**kwargs)

    def pay(self, resource_url: str, method: str = "GET") -> PaymentResult:
        return asyncio.run(self._async.pay(resource_url, method))
