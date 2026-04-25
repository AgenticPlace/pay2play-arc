# pay2play architecture

## The 5-layer ladder

Top-to-bottom, every piece of pay2play sits at exactly one layer. The layer
framing is borrowed from
[vyperlang/vyper-agentic-payments docs](https://github.com/vyperlang/vyper-agentic-payments/blob/master/docs/architecture.md)
and mapped onto our codebase paths:

| Layer | What | In this repo |
|---|---|---|
| **L4 — App** | HTTP / MCP / SSE / browser components — buyers and sellers meet here | `components/c1-api-meter`, `c2-agent-loop`, `c3-llm-stream`, `c4-dwell-reader`, `c5-mcp-tool`, `c6-frame-classifier`, `c7-row-meter`, `c8-bridge`, `c9-agent-identity` |
| **L3 — Governance** | On-chain contracts that govern long-lived state (jobs, channels, subscriptions, splits, vaults) | `contracts/arc/{PaymentChannel, AgentEscrow, SpendingLimiter, SubscriptionManager, PaymentSplitter, Vault}.vy` + ERC-8004 / ERC-8183 deployed addresses pinned in `packages/core/src/arc.ts` |
| **L2 — Payment Protocol** | x402 — the HTTP-level payment handshake (`PAYMENT-REQUIRED` 402 ↔ signed `X-PAYMENT` retry) | `packages/core/src/types.ts` (PaymentPayload tagged union), `packages/server/src/http.ts` (`createPaidMiddleware`), `packages/core/src/fee.ts` (PriceBreakdown) |
| **L1 — Settlement** | Circle Gateway batched USDC — gasless, batched, lossless precision via bigint atomic units | `packages/server/src/facilitators.ts`, `scripts/gateway-deposit.ts`, `packages/core/src/decimal.ts` |
| **L0 — Blockchain** | Arc testnet (eip155:5042002) — USDC-native gas, sub-cent finality | `packages/core/src/arc.ts` ARC_TESTNET, RPC `https://rpc.testnet.arc.network`, explorer `testnet.arcscan.app` |

### Where mindX and AgenticPlace fit

- **mindX** (live at `mindx.pythai.net`, source `/home/hacker/mindX/`) is an
  *orchestration layer over L4*. mindX agents invoke L4 metered tools via
  `tools/pay2play_metered_tool.py`; settlements flow back down through L2→L1.
  The autonomous 5-min loop is rate-limited at the wrapper so it doesn't
  burn USDC on idle deliberation cycles.
- **AgenticPlace** (live at `agenticplace.pythai.net`, source
  `/home/hacker/mindX/AgenticPlace/`) is the *marketplace surface* that
  consumes pay2play L1–L3. The mindX FastAPI backend
  (`mindx_backend_service/agenticplace_routes.py`) proxies to the
  pay2play C9 gateway; the React frontend (`AgenticPlace/api/p2p.ts`)
  handles the EIP-3009 retry-after-sign for paid actions. Marketplace
  splits will route through L3 `PaymentSplitter.vy` (provider / platform /
  treasury basis-point shares).

### Sister repo for non-EVM chains

- **pay2play-algo** ([github.com/AgenticPlace/pay2play-algo](https://github.com/AgenticPlace/pay2play-algo))
  vendors the agnostic L1+L2 core (decimal, fee, types, session) and
  ships its own L0/L3 stack (Algorand testnet + AVM `PaymentMeter.algo.ts`).
  The CAIP-2 tagged `PaymentPayload` (EVM | Algorand) is the discriminant
  that lets the same L4 abstractions service either chain.

## Layers (legacy 8-package view, by repo path)

The 5-layer ladder above is the conceptual model. Below is the same surface
expressed as the actual TypeScript packages and component directories on disk:

1. **core** (`@pay2play/core`) — `UsageSignal`, `Meter`, `Session`, decimal+fee math, Arc config (15 contracts + ABIs), x402 types (CAIP-2 tagged PaymentPayload), `AgentIdentity`/`JobState` types.
2. **server** (`@pay2play/server`) — Express HTTP + MCP (streamable-HTTP) + SSE adapters + pluggable facilitators (Circle/thirdweb/Coinbase) + `corsForX402` + `asyncHandler` + AgenticPlace router + fee-admin router.
3. **client** (`@pay2play/client`) — fetch wrapper + OpenAI streaming wrapper + MCP client + browser viewport hook.
4. **bridge** (`@pay2play/bridge`) — BridgeModule + SwapModule + SendModule wrapping `@circle-fin/app-kit` (CCTP V2).
5. **observe** (`@pay2play/observe`) — Arc WS subscription + batched-tx counter for the demo dashboard. _(Documented; not yet implemented.)_
6. **components** (`components/c1..c9/`) — one per hackathon angle (C10 algo lives in the sister `pay2play-algo` repo).
7. **Vyper contracts** (`contracts/arc/`) — PaymentChannel, AgentEscrow, SpendingLimiter, SubscriptionManager (pay2play) + PaymentSplitter, Vault (vendored from vyperlang/vyper-agentic-payments).
8. **Python SDK** (`python/pay2play_arc/`) — GatewayClient, ContractLoader (Titanoboa, supports all 6 contracts), x402 helpers, FastAPI middleware.

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
