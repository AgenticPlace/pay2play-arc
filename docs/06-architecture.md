# pay2play architecture

## Layers

1. **core** (`@pay2play/core`) — `UsageSignal`, `Meter`, `Session`, Arc config, x402 types.
2. **server** (`@pay2play/server`) — Express/Hono HTTP + MCP (streamable-HTTP) + SSE adapters.
3. **client** (`@pay2play/client`) — fetch wrapper + OpenAI streaming wrapper + MCP client + browser viewport hook.
4. **observe** (`@pay2play/observe`) — Arc WS subscription + batched-tx counter for the demo dashboard.
5. **components** (`components/c1..c7/`) — one per hackathon angle.

## Diagram

```
┌───────────────── @pay2play/core ──────────────────┐
│  meter()       — UsageSignal → $USDC              │
│  session()     — voucher accumulator for streams  │
│  arc           — chain config + eth_chainId check │
│  types         — x402 v2 shapes                   │
└──────────────────┬───────────────┬────────────────┘
                   │               │
      ┌────────────▼─────┐ ┌───────▼──────────┐
      │ @pay2play/server │ │ @pay2play/client │
      │  .http (express) │ │  .fetch          │
      │  .sse  (stream)  │ │  .openai (stream)│
      │  .mcp  (paidTool)│ │  .mcp (withPay)  │
      │  .hono (optional)│ │  .viewport (dom) │
      └─────────┬────────┘ └────────┬─────────┘
                │                   │
       ┌────────▼───────────────────▼──────┐
       │  components/                      │
       │  c1 api-meter        ← Track 1    │
       │  c2 agent-loop       ← Track 2    │
       │  c3 llm-stream   🌟  ← Track 3    │
       │  c4 dwell-reader     ← Track 4    │
       │  c5 mcp-tool         bonus        │
       │  c6 frame-classifier bonus M2M    │
       │  c7 row-meter        bonus data   │
       └────────────────┬──────────────────┘
                        │
                        ▼
                 Arc Testnet L1
         (USDC-gas + Gateway + Nanopayments)
```

## Dependency graph

```
core ──► server ──► components/c1, c2, c5, c6, c7
core ──► client ──► components/c3 (stream), c4 (viewport)
core ──► observe ─► site/ (live counter)
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
