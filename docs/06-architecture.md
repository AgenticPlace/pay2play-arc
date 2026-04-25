# pay2play architecture

## Layers

1. **core** (`@pay2play/core`) — `UsageSignal`, `Meter`, `Session`, Arc config (15 contracts + ABIs), x402 types, `AgentIdentity`/`JobState` types.
2. **server** (`@pay2play/server`) — Express/Hono HTTP + MCP (streamable-HTTP) + SSE adapters + pluggable facilitators (Circle/thirdweb/Coinbase).
3. **client** (`@pay2play/client`) — fetch wrapper + OpenAI streaming wrapper + MCP client + browser viewport hook.
4. **bridge** (`@pay2play/bridge`) — BridgeModule + SwapModule + SendModule wrapping `@circle-fin/app-kit` (CCTP V2).
5. **observe** (`@pay2play/observe`) — Arc WS subscription + batched-tx counter for the demo dashboard.
6. **components** (`components/c1..c10/`) — one per hackathon angle.
7. **Vyper contracts** (`contracts/arc/`) — PaymentChannel, AgentEscrow, SpendingLimiter, SubscriptionManager.
8. **Python SDK** (`python/pay2play_arc/`) — GatewayClient, ContractLoader (Titanoboa), x402 helpers, FastAPI middleware.

## Diagram

```
┌───────────────── @pay2play/core ──────────────────────────┐
│  meter()       — UsageSignal → $USDC                      │
│  session()     — voucher accumulator for streams          │
│  arc           — chain config + 15 Arc contracts + ABIs   │
│  types         — x402 v2 shapes + AgentIdentity/JobState  │
└──────────────────┬────────────────┬────────────────────────┘
                   │                │
      ┌────────────▼─────┐  ┌───────▼──────────┐  ┌──────────────────┐
      │ @pay2play/server │  │ @pay2play/client │  │ @pay2play/bridge │
      │  .http (express) │  │  .fetch          │  │  BridgeModule    │
      │  .sse  (stream)  │  │  .openai (stream)│  │  SwapModule      │
      │  .mcp  (paidTool)│  │  .mcp (withPay)  │  │  SendModule      │
      │  .facilitators   │  │  .viewport (dom) │  │  (@circle-fin/   │
      │   circle/thirdweb│  └────────┬─────────┘  │   app-kit)       │
      │   /coinbase      │           │             └────────┬─────────┘
      └─────────┬────────┘           │                      │
                │                   │                       │
       ┌────────▼───────────────────▼───────────────────────▼──┐
       │  components/                                           │
       │  c1 api-meter        ← Track 1 (HTTP 402)             │
       │  c2 agent-loop       ← Track 2 (agent-to-agent)       │
       │  c3 llm-stream   ★   ← Track 3 (per-token SSE)        │
       │  c4 dwell-reader     ← Track 4 (viewport dwell)       │
       │  c5 mcp-tool         bonus (MCP paid tool)            │
       │  c6 frame-classifier bonus (M2M per-frame)            │
       │  c7 row-meter        bonus (per-row data)             │
       │  c8 bridge           bonus (CCTP V2 bridge/swap)      │
       │  c9 agent-identity   bonus (ERC-8004 + ERC-8183)      │
       │  c10 algo            bonus (Algorand AVM microALGO)   │
       └────────────────┬───────────────────────────────────────┘
                        │                     │
           ┌────────────▼──────┐  ┌───────────▼──────────────┐
           │  Arc Testnet L1   │  │  Algorand Testnet (AVM)  │
           │  USDC-gas         │  │  ALGO + PaymentMeter.ts  │
           │  Gateway batch    │  │  vibekit-mcp tools       │
           │  CCTP Domain 26   │  └──────────────────────────┘
           └───────────────────┘
                        │
       ┌────────────────▼────────────────────┐
       │  Vyper contracts (contracts/arc/)    │
       │  PaymentChannel.vy  — EIP-712 chan   │
       │  AgentEscrow.vy     — ERC-8183       │
       │  SpendingLimiter.vy — agent caps     │
       │  SubscriptionManager.vy — recurring  │
       └─────────────────────────────────────┘
                        │
       ┌────────────────▼────────────────────┐
       │  Python SDK (python/pay2play_arc/)   │
       │  GatewayClient — async x402 HTTP     │
       │  ContractLoader — boa.load() Vyper   │
       │  middleware — FastAPI/Flask           │
       └─────────────────────────────────────┘
```

## Dependency graph

```
core ──► server ──► components/c1, c2, c5, c6, c7, c9
core ──► client ──► components/c3 (stream), c4 (viewport)
core ──► bridge ──► components/c8 (bridge/swap)
core ──► observe ─► site/ (live counter)
                    components/c10 (algosdk, vibekit-mcp — independent)
                    python/pay2play_arc/ (independent Python layer)
```

## Data flow — single paid HTTP call

1. Client requests `/paid`.
2. Server middleware (`@pay2play/server/http` → `@circle-fin/x402-batching` `createGatewayMiddleware`) replies **402** + `PAYMENT-REQUIRED` header.
3. Client's fetch wrapper (`@pay2play/client/fetch`) signs EIP-3009, retries with `X-PAYMENT` header.
4. Server validates, **appends to Circle Gateway batch queue**, returns **200** + `PAYMENT-RESPONSE` (may not yet be on-chain).
5. Gateway flushes batch asynchronously → on-chain tx on Arc testnet → `@pay2play/observe` subscription sees event → site counter increments.

## Streaming flow (C3 — per-token LLM)

1. Browser posts prompt → server opens SSE stream to OpenAI/Gemini.
2. For each 100-token window: server emits `{type:"charge", amount:"$0.005"}` SSE frame to browser.
3. Browser's `@pay2play/client/openai` signs voucher, POSTs back to `/meter/voucher`.
4. Server accumulates vouchers; every 500 tokens OR 5s, calls `BatchFacilitatorClient.settle(vouchers[])`.
5. UI displays **two counters**: "Vouchers signed" (client-side, instant) vs "On-chain batches" (server+chain, deferred).

## MCP flow (C5)

1. MCP server exposes `web.search` via `server.paidTool("web.search", { price: "$0.001" }, ...)` from `x402-mcp`.
2. MCP client (Node harness or Claude Code if supported) uses `withPayment(mcpClient, { account })`.
3. Tool invocation triggers x402 payment handshake under the hood (requires streamable-HTTP transport).
4. Server returns tool result on successful settlement.

## Viewport dwell flow (C4)

1. Browser hook (`@pay2play/client/viewport`) uses `IntersectionObserver` on `<p>` elements.
2. On ≥3s dwell, emit `dwell` signal.
3. Signal triggers `meter.dwell(ms)` → $0.0001 voucher.
4. POST voucher to `/meter/voucher`, server accumulates + flushes (same as streaming flow).

## Core abstraction (public API)

Price-first, transport-as-adapter:

```ts
import { meter } from "@pay2play/core";

const m = meter({
  request:  "$0.001",
  tokens:   (n)  => `$${(n * 0.00005).toFixed(6)}`,
  frames:   (n)  => `$${(n * 0.0005 ).toFixed(6)}`,
  bytes:    (n)  => `$${(n * 1e-7  ).toFixed(8)}`,
  rows:     (n)  => `$${(n * 0.0001).toFixed(6)}`,
  dwell:    (ms) => ms >= 3000 ? "$0.0001" : "$0",
  seconds:  (n)  => `$${(n * 0.001 ).toFixed(6)}`,
});

// Transport adapters consume `m`
app.use(m.http({ "GET /weather": "request" }));
mcp.use(m.mcp({ "web.search": "request" }));
openaiStream.pipeThrough(m.sse("tokens"));
viewport.observe(m.browser("dwell"));
```

`UsageSignal` stays as a **private** discriminated union inside `session.ts` — normalizes every axis into one settlement path. Public API keeps `@circle-fin/x402-batching`-style price-first ergonomics.
