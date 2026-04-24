# x402 v2 protocol notes

Canonical spec lives in `_refs/coinbase/x402/specs/transports-v2/`. Check that for exact byte-level header formats.

- Landing: https://www.x402.org/
- Whitepaper: https://x402.org/x402-whitepaper.pdf
- Spec repo: https://github.com/coinbase/x402
- HTTP transport v2 spec: https://github.com/coinbase/x402/blob/main/specs/transports-v2/x402-specification-v2.md
- CDP docs: https://docs.cdp.coinbase.com/x402/welcome
- Issue #447 "x402 × Circle Gateway": https://github.com/coinbase/x402/issues/447

## 10-bullet protocol TL;DR
1. Client GETs a resource; server returns **402** with `PAYMENT-REQUIRED` response header (base64 JSON).
2. Client constructs `PaymentPayload`, signs EIP-712 typed-data (EIP-3009 `TransferWithAuthorization` semantics on EVM), retries with `PAYMENT-SIGNATURE` / `X-PAYMENT` request header.
3. Resource server settles directly OR POSTs the payload to a facilitator's `/verify` + `/settle` endpoints. On success returns **200** + `PAYMENT-RESPONSE` header (base64 JSON `SettlementResponse`).
4. Canonical EVM scheme: `"exact"` — one-shot fixed-amount EIP-3009 transfer. Other schemes exist (`svm`, `stellar`).
5. Networks use CAIP-2: **`eip155:5042002`** Arc testnet (confirmed), `eip155:84532` Base Sepolia, `eip155:8453` Base mainnet, etc.
6. Replay protection: 32-byte `nonce` + `validAfter` + `validBefore` unix ts. `maxTimeoutSeconds` bounds challenge lifetime.
7. Status codes: **402** challenge · **400** invalid/expired · **200** paid · **500** facilitator/settlement error.
8. All JSON payloads carry `x402Version: 2`.
9. Stateless per request — agent-friendly; no API keys, sessions, or OAuth.
10. Facilitator economics: Coinbase-hosted facilitator free ≤ 1,000 tx/month, then $0.001/tx. Circle Gateway for Arc is a separate facilitator embedded in `@circle-fin/x402-batching`.

## Header format
- **Request** (paying): `PAYMENT-SIGNATURE` aka `X-PAYMENT` = base64(JSON `PaymentPayload`)
- **Response** (challenge): `PAYMENT-REQUIRED` = base64(JSON `PaymentRequired`)
- **Response** (receipt): `PAYMENT-RESPONSE` = base64(JSON `SettlementResponse`)

## PaymentRequired JSON
```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "...",
    "description": "Current weather data",
    "mimeType": "application/json"
  },
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:5042002",
    "amount": "10000",
    "asset": "0x3600000000000000000000000000000000000000",
    "payTo": "0x...",
    "maxTimeoutSeconds": 60,
    "extra": { "name": "USDC", "version": "2" }
  }]
}
```

## PaymentPayload JSON
```json
{
  "x402Version": 2,
  "resource": { "...": "..." },
  "accepted": { "...": "..." },
  "payload": {
    "signature": "0x2d6a7588...",
    "authorization": {
      "from": "0x857b0651...",
      "to":   "0x209693Bc...",
      "value": "10000",
      "validAfter":  "1740672089",
      "validBefore": "1740672154",
      "nonce": "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480"
    }
  }
}
```

## SettlementResponse JSON
```json
{
  "success": true,
  "transaction": "0x...",
  "network": "eip155:5042002",
  "payer": "0x857b..."
}
```

## TypeScript packages (confirmed from arc-nanopayments scaffold)

| Package | Role |
|---|---|
| `@circle-fin/x402-batching@^2.0.4` | **Use for Arc** — Circle Gateway-backed batched settlement |
| `@x402/core@^2.6.0` | Types + signer |
| `@x402/evm@^2.6.0` | EVM scheme implementation |
| `@x402/express` / `x402-express` | Express server middleware |
| `@x402/fetch` / `x402-fetch` | Fetch wrapper for clients |
| `@x402/hono` / `@x402/next` / `@x402/fastify` | Alt server frameworks |
| `@x402/paywall` | UI paywall |
| `@x402/extensions` | Extension registry |
| `x402-mcp` | MCP `paidTool` + `withPayment` |

## x402 repo structure (in `_refs/coinbase/x402/`)

```
contracts/evm/          — Solidity settlement helpers
docs/
e2e/                    — end-to-end test harnesses
examples/               — runnable server + client pairs per chain
foundation/
go/                     — Go SDK
java/                   — Java SDK
python/                 — Python SDK
specs/
  transports-v1/        — legacy
  transports-v2/        — current
  schemes/              — "exact", etc.
  extensions/
typescript/
  packages/
    core/               — types + facilitator client
    extensions/
    http/               — transport
    legacy/
    mcp/                — x402-mcp (paidTool / withPayment)
    mechanisms/
```

## MCP + x402

- `x402-mcp` (at `_refs/coinbase/x402/typescript/packages/mcp/`) requires **streamable-HTTP** MCP transport. NOT stdio — stdio can't carry HTTP headers.
- Server: `server.paidTool(name, { price }, schema, handler)`
- Client: `const paid = await withPayment(mcpClient, { account })`
- Claude Code's MCP client support for `withPayment` is unverified — plan to demo via a Node MCP harness if Claude Code doesn't cooperate.

## SSE / streaming

**Not native to x402 v2 spec.** Our approach: client-side voucher accumulator (per-N-tokens signing) + server-side batch flush (`BatchFacilitatorClient.settle()` every N vouchers OR every T seconds).

Design UI to show two counters: "Vouchers signed" (instant, client) vs "On-chain batches" (deferred, server+chain).

## Facilitators

| Facilitator | URL | Use |
|---|---|---|
| Coinbase public | https://x402.org/facilitator | Base/Polygon/Arbitrum/World/Solana |
| Circle Gateway (Arc) | embedded in `@circle-fin/x402-batching` | Arc testnet (via `settle-x402payment` API) |

## Ecosystem / third-party integrations
- **xpay.sh** — hosted x402-monetized MCP proxy; useful reference for MCP+402.
- **LangChain / CrewAI / LlamaIndex / Pydantic AI / Vercel AI SDK / OpenAI Agents SDK / Google ADK** — community adapters wrap tool calls in x402 challenges.
- **Anthropic SDK** integrates via MCP: any x402-gated MCP server is callable by Claude.
- **Cloudflare** — native x402 support in Workers / AI Gateway.
