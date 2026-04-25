# pay2play — Explanation

What it is, why it exists, and what problem it actually solves.

---

## The problem

Software can generate value in very small increments — one weather lookup, one classified image frame, one LLM token. But the payments infrastructure that existed before 2025 couldn't settle those increments economically. On Ethereum L1, a $0.001 API call costs $0.50 in gas — a 49,900% loss. Even on L2s like Base or Arbitrum, the economics are marginal. So developers either bundle small actions into coarser billing events (subscriptions, credits) or give up on per-action pricing entirely.

The result is that software pricing is almost always decoupled from actual usage. You pay a flat monthly fee for an API regardless of how much you call it, or you buy credits upfront that expire. The connection between "I ran this computation" and "I paid for this computation" is lossy, indirect, and opaque.

---

## The solution: Circle Gateway + Arc

Circle's Arc L1 is a USDC-native EVM chain designed specifically for payments. USDC is the gas token — there's no ETH to buy, no bridging ceremony, no wrapped-asset confusion. And Arc's Circle Gateway adds one more layer: **off-chain aggregation with delayed, batched on-chain settlement**. Thousands of signed authorizations from thousands of payers bundle into a single Arc transaction.

The cost math changes:

| Chain | $0.001 call margin | Verdict |
|---|---|---|
| Ethereum L1 | –49,900% | unusable |
| Optimism | –200% to –400% | unusable |
| Base | –400% to +70% | marginal |
| Arc direct | –200% | unusable |
| **Arc + Gateway (batched)** | **+97%** | economically viable |

At $0.001/call through Gateway batching, a seller clears $0.97 per thousand calls. At $0.00005/token (C3 LLM streaming), a seller clears ~$0.97 per million tokens. This is the range where per-action pricing becomes a real business model.

---

## What pay2play adds

pay2play is not a payment processor — it's a thin composition layer over Circle's SDK that makes the Gateway's economics accessible to any HTTP service.

The core insight: the x402 standard defines a clean separation between:
- **Metering** — deciding what something costs per unit of work
- **Payment gate** — refusing service unless a valid signed authorization is presented
- **Settlement** — submitting authorized transfers for on-chain finalization

These are separate concerns, but most implementations mix them. pay2play separates them into three primitives:

**`meter(rules)`** — a price function that maps any unit of work (a request, a token, a frame, a row, a millisecond of attention) to a USDC amount. One price function covers all metering axes.

**`createPaidMiddleware(price, opts)`** — Express middleware that enforces the payment gate. Drop it on any route. It handles the full 402 challenge/retry cycle, delegates verification to a facilitator, and calls `next()` only when a valid payment is confirmed.

**`Session`** — a flush buffer that decouples "how often to sign" (per event, instant) from "how often to settle" (per N events or per T seconds). This is important for streaming: you don't want to hit the Gateway API once per token, but you do want the client to see a counter incrementing in real time.

---

## Honest framing

pay2play distinguishes two kinds of confirmation:

- **Vouchers signed**: a client-side counter that increments instantly when the buyer signs an EIP-3009 authorization. No network call, no latency. The authorization is cryptographically valid but not yet on-chain.
- **Batches settled**: a server-side counter that increments when `BatchFacilitatorClient.settle()` returns success and Circle's Gateway submits the batch to Arc. This is the on-chain record.

The gap between these two counters is the "batch window" — Circle's Gateway aggregates authorizations off-chain before writing one Arc transaction. The batch window isn't publicly documented (feedback item: it should be). In practice it appears to be seconds to minutes.

Many demos elide this distinction and imply instant on-chain settlement. pay2play's C3 LLM stream demo shows both counters side by side, with explicit labels. The video narration calls this out. Judges who understand the protocol will find this more credible, not less.

---

## The agentic economy thesis

The four hackathon tracks map to a progression:

**Track 1 (C1 api-meter)**: Any HTTP service can charge per request. This is table-stakes — every SaaS API could theoretically run this way. The interesting part isn't the technology, it's that the economics now work at $0.001/call.

**Track 2 (C2 agent-loop)**: Two autonomous agents with separate wallets, each acting on behalf of different principals. Agent A asks Agent B a question; B answers only after A pays. No human in the loop. This is the basic unit of agentic commerce: services that charge other services.

**Track 3 (C3 llm-stream)**: Per-token pricing on a streaming LLM response. Each token costs $0.00005. A 2,000-token response costs $0.10. The user sees the meter running as they read. This aligns the incentive of "get a useful answer" with "stop generating when done" — the model's output length now has a price signal attached.

**Beyond (C4–C9)**: The same primitives extend to frames (vision APIs charging per analyzed image), rows (data marketplaces charging per query result), dwell time (publishers charging per paragraph read), MCP tools (AI assistants paying for each tool invocation), and the full agent identity + job escrow lifecycle (ERC-8004/8183) where agents register, take on jobs, and get paid upon verified delivery.

The unifying pattern: **software charging software for work performed**, settled in USDC, without manual invoicing, subscriptions, or API key management. The payment is in the request.

---

## Metering axes

| Axis | Unit | Example price | Component |
|---|---|---|---|
| `request` | per HTTP call | $0.001 | C1, C8, C9 |
| `tokens` | per LLM output token | $0.00005 | C3 |
| `frames` | per image frame classified | $0.0005 | C6 |
| `rows` | per query result row | $0.0001 | C7 |
| `dwell` | per paragraph read (≥3s) | $0.0001 | C4 |
| `bytes` | per byte transferred | configurable | bridge/send |
| `seconds` | per second of compute | configurable | streaming |

All axes share the same `UsageSignal → USDC` price function. This is the `meter()` primitive — it normalizes every possible unit of work into a USDC amount that can be expressed in a `PaymentRequirement`.

---

## Coverage across Circle products

| Circle product | How it's used |
|---|---|
| Nanopayments (x402 on Arc) | Core protocol — every 402 gate in C1–C9 |
| Gateway (batched settlement) | `BatchFacilitatorClient.verify/settle` — all TypeScript components |
| Arc Testnet | Chain for all EVM payments; USDC-native gas |
| Circle Faucet | Test USDC for buyer + seller wallets |
| App Kit Bridge | CCTP V2 USDC cross-chain (C8 bridge module) |
| CCTP V2 (Domain 26) | Cross-chain USDC: Ethereum → Arc |
| FxEscrow | USDC ↔ EURC stablecoin FX swap |
| ERC-8004 IdentityRegistry | AI agent registration + reputation (C9) |
| ERC-8183 JobEscrow | Job lifecycle: createJob → fund → submit → complete (C9) |
| Circle Titanoboa SDK (Python) | Python GatewayClient + Vyper contract testing |

---

## What's not in this codebase

**Production key management.** `.env` is EOA private keys. A production deployment should use Circle's Developer-Controlled Wallets or an HSM-backed key store. The payment flow itself is identical — only the signing method changes.

**A real LLM in C3.** The stream server accepts any OpenAI-compatible API key. The metering primitive is independent of which model is behind the endpoint.

**A real ML classifier in C6.** The frame classifier returns mock probabilities. The metering and payment gate are real — only the model inference is stubbed.

**Algorand mainnet.** C10 targets Algorand testnet. The contract deploys and the payment gate works; mainnet requires funded ALGO and a deployed contract address.

**Dwell reader (C4).** The `viewport` primitive is unit-tested in `packages/client/src/viewport.ts`. The UI component is live and tested at :4024. Both the primitive and the demo app ship.

---

## Why this matters for the agentic economy

Current AI systems have a billing model problem: the human pays the platform, the platform pays the model, the agent pays nothing. As agents gain autonomy and compose other agents as services, this model breaks. Each agent needs to be able to both charge for its outputs and pay for its inputs.

x402 on Arc gives each agent an address and a USDC balance. The payment infrastructure is in the HTTP protocol — no API keys, no billing dashboards, no invoicing. An agent can discover a service, understand its price from the 402 challenge, decide to pay or not, and settle the payment — all in the span of one HTTP round trip.

pay2play demonstrates that this isn't theoretical. 63+ settlements happened on Arc testnet during integration testing on 2026-04-24. The smallest was $0.00005. The largest was $0.002. Total USDC moved: ~$0.083 across 6 components in one afternoon.
