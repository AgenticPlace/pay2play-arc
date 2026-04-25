# pay2play

**Meter anything on Arc. HTTP, MCP, stream, or pixel — settled gaslessly in USDC.**

An agnostic nanopayment infrastructure built on Circle's Arc L1. Submission for the [Agentic Economy on Arc hackathon](https://lablab.ai/ai-hackathons/nano-payments-arc) (Apr 2026).

## Honest framing

pay2play is a **thin composition** over:
- [`@circle-fin/x402-batching`](https://www.npmjs.com/package/@circle-fin/x402-batching) · Circle's Gateway-backed x402 middleware (`BatchFacilitatorClient` + `GatewayClient`)
- [`@x402/mcp`](https://www.npmjs.com/package/@x402/mcp) · Vercel/Coinbase's `paidTool` + `withPayment` for MCP
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) · streamable-HTTP MCP transport (required for x402 headers)
- [`viem`](https://viem.sh/) · `arcTestnet` chain already exported

What we **add**:
- Unified `UsageSignal` meter — one price function covers every metering axis
- Voucher `Session` — client accumulates, server flushes, clean for streaming
- Per-angle modular components (C1–C9 on Arc) — 4 tracks + 5 bonus components
- Honest observability — distinguishes signed vouchers from settled on-chain batches

## Coverage matrix

| Dimension | Modes |
|---|---|
| **Transport** | HTTP · MCP (streamable-HTTP) · SSE · viewport (browser) |
| **Metering axis** | `request` · `tokens` · `frames` · `bytes` · `rows` · `dwell` · `seconds` |
| **Settlement** | Circle Gateway batched (default) · thirdweb · Coinbase public · Algorand AVM |
| **Actor modes** | human↔agent · agent↔agent · agent↔API · machine↔machine |
| **Cross-chain** | USDC bridge (CCTP V2) · EURC swap (FxEscrow) · same-chain send |
| **Agent identity** | ERC-8004 register + reputation · ERC-8183 job escrow lifecycle |
| **Smart contracts** | Vyper (PaymentChannel, AgentEscrow, SpendingLimiter, SubscriptionManager) |
| **Languages** | TypeScript (primary) · Python (GatewayClient + Titanoboa + FastAPI) |

## Components

| # | Component | Track / Bonus | Price | Status |
|---|---|---|---|---|
| C1 | `api-meter` | Track 1: Per-API Monetization | $0.001/request | **live + tested ✓** |
| C2 | `agent-loop` | Track 2: Agent-to-Agent | $0.0005/ask | **live + tested ✓** |
| C3 | `llm-stream` · **WOW** | Track 3: Usage-Based Compute | $0.00005/token | **live SSE ✓** |
| C4 | `dwell-reader` | Track 4: Real-Time Micro-Commerce | $0.0001/paragraph | **live + tested ✓** |
| C5 | `mcp-tool` | bonus — MCP paid tools | $0.001/call | scaffolded |
| C6 | `frame-classifier` | bonus — M2M | $0.0005/frame | **live + tested ✓** |
| C7 | `row-meter` | bonus — data | $0.0001/row | **live + tested ✓** |
| C8 | `bridge` | bonus — Stablecoin FX / Cross-chain | $0.001/op | **live + tested ✓** |
| C9 | `agent-identity` | bonus — Agentic Economy (ERC-8004/8183) | $0.002/call | **live + tested ✓** |
| C10 | `algo` | bonus — Algorand AVM | 1000 µALGO/call | **typecheck ✓ / needs ALGO** |

Full specs: [`docs/07-components.md`](./docs/07-components.md)

## Why Arc? (margin analysis)

| Chain | $0.001 call margin | Verdict |
|---|---|---|
| Ethereum L1 | **–49,900%** | ❌ |
| Optimism | –200% to –400% | ❌ |
| Base L2 | –400% to +70% | ⚠️ marginal |
| Arbitrum One | –300% to +80% | ⚠️ marginal |
| Arc direct | –200% | ❌ |
| **Arc + Gateway (batched)** | **+97%** | ✅ |

Full analysis with break-even formulas: [`docs/08-margin-analysis.md`](./docs/08-margin-analysis.md)

## Quick start

```bash
git clone <repo>
cd pay2play
pnpm install
pnpm --filter @pay2play/core build
pnpm --filter @pay2play/server build
pnpm --filter @pay2play/client build
pnpm --filter @pay2play/bridge build

cp .env.example .env
# Edit .env: set SELLER_ADDRESS + BUYER_PRIVATE_KEY (via scripts/generate-wallets.ts)
# Fund buyer at https://faucet.circle.com/ → Arc Testnet → 20 USDC

# Run the WOW demo:
pnpm --filter c3-llm-stream start       # → http://localhost:4023/

# Original components:
pnpm --filter c1-api-meter dev          # :4021  paid weather/geocode
pnpm --filter c2-agent-loop server      # :4022  paid agent-to-agent
pnpm --filter c4-dwell-reader start     # :4024  dwell-based article paywall
pnpm --filter c6-frame-classifier start # :4026  paid frame classification
pnpm --filter c7-row-meter start        # :4027  paid data rows

# New components:
pnpm --filter c8-bridge start           # :3008  cross-chain bridge (CCTP V2)
pnpm --filter c9-agent-identity start   # :3009  ERC-8004 register + ERC-8183 jobs
pnpm --filter c10-algo start            # :3010  Algorand AVM per-call metering

# Agent identity flows:
pnpm tsx scripts/register-agent.ts --dry-run
pnpm tsx scripts/create-job.ts --dry-run

# Gateway setup (run once per buyer wallet):
pnpm tsx scripts/gateway-deposit.ts 1   # deposit 1 USDC into Circle Gateway
pnpm tsx scripts/gateway-balance.ts     # check gateway + wallet balances

# Integration smoke tests:
bash tests/smoke-test.sh
pnpm tsx scripts/test-c6.ts
pnpm tsx scripts/test-c7.ts
pnpm tsx scripts/test-c9.ts
```

## Architecture

```
┌──────── @pay2play/core ─────────────────────────┐
│  meter · session · arc (15 contracts) · types    │
│  AgentIdentity · JobState · ABIs                │
└──────┬────────────────────────────────┬──────────┘
       │                                │
 ┌─────▼──────┐  ┌───────────────┐  ┌──▼───────────┐
 │@p2p/server │  │ @p2p/client   │  │ @p2p/bridge  │
 │ http/sse   │  │ fetch/openai  │  │ Bridge/Swap   │
 │ mcp        │  │ mcp/viewport  │  │ Send (CCTP)   │
 │ facilitators│  └───────┬───────┘  └──────┬────────┘
 │ circle/3web│          │                   │
 └──────┬─────┘          │                   │
        └────────┬────────┘                   │
                 ▼                            ▼
   ┌─────────────────────────┐  ┌─────────────────────┐
   │  components/ (C1..C9)   │  │  components/c8-bridge│
   └──────────┬──────────────┘  └──────────────────────┘
              │
    ┌─────────▼──────────────────────────┐
    │  Arc Testnet · Algorand Testnet    │
    │  USDC-gas + Gateway + CCTP V2      │
    │  ERC-8004/8183 · AVM (C10)         │
    └────────────────────────────────────┘
```

## Research index

11 docs in [`./docs/`](./docs/):
- [`01-hackathon-rules.md`](./docs/01-hackathon-rules.md) — rules, prizes, judging
- [`02-arc-network.md`](./docs/02-arc-network.md) — Arc testnet config (chain 5042002) + all 15 contracts
- [`03-circle-nanopayments.md`](./docs/03-circle-nanopayments.md) — Gateway SDK, App Kit bridge, thirdweb, Python SDK
- [`04-x402-protocol.md`](./docs/04-x402-protocol.md) — v2 spec + header format + 3 facilitators + Python
- [`05-repos-to-clone.md`](./docs/05-repos-to-clone.md) — reference repos; Vyper repos now implemented
- [`06-architecture.md`](./docs/06-architecture.md) — 5-package + 10-component + Vyper + Python layers
- [`07-components.md`](./docs/07-components.md) — C1–C10 specs + build order
- [`08-margin-analysis.md`](./docs/08-margin-analysis.md) — chain economics
- [`09-competitive-intel.md`](./docs/09-competitive-intel.md) — prior-winners analysis
- [`10-circle-feedback.md`](./docs/10-circle-feedback.md) — Circle Product Feedback draft
- [`11-tool-map.md`](./docs/11-tool-map.md) — comprehensive tool/SDK/contract reference map

## Hackathon metadata

- **Primary track**: Per-API Monetization Engine (C1)
- **Coverage**: all 4 tracks via C1/C2/C3/C4 + 6 bonus components
- **Circle products used**: Nanopayments · Gateway (batched settlement) · x402 (on Arc) · Arc testnet · Circle Faucet · App Kit Bridge · CCTP V2 · ERC-8004/8183 identities · Circle Titanoboa SDK (Python)
- **Hard rules met**:
  - ≤$0.01/action ✓ (range: $0.00005 to $0.002)
  - ≥50 on-chain txs ✓ (63+ settlements confirmed — see `tests/`)
  - Margin analysis ✓ (`docs/08-margin-analysis.md`)
  - Public GitHub + MIT ✓
  - Circle Product Feedback draft ✓ (`docs/10-circle-feedback.md`)
- **Integration tested**: C1/C2/C3/C4/C6/C7/C8/C9 live on Arc testnet (see `tests/integration-results-2026-04-24.md`)

## Testnet facts (from `_refs/arc-nanopayments`)

| | |
|---|---|
| Chain ID | `5042002` |
| CAIP-2 | `eip155:5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` |
| USDC | `0x3600000000000000000000000000000000000000` |
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| GatewayMinter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |
| Scheme `extra.name` | `GatewayWalletBatched` |

## License

MIT — see [LICENSE](./LICENSE).

---

_Testnet-only. Arc mainnet is not yet live as of April 2026. "Arc" here = **Circle's** stablecoin-native L1, NOT Algorand ARC standards._
