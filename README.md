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
- Per-angle modular components (C1–C7) — one per hackathon track
- Honest observability — distinguishes signed vouchers from settled on-chain batches

## Coverage matrix

| Dimension | Modes |
|---|---|
| **Transport** | HTTP · MCP (streamable-HTTP) · SSE · viewport (browser) |
| **Metering axis** | `request` · `tokens` · `frames` · `bytes` · `rows` · `dwell` · `seconds` |
| **Settlement** | Circle Gateway batched (default) |
| **Actor modes** | human↔agent · agent↔agent · agent↔API · machine↔machine |

## Components

| # | Component | Track | Price | Status |
|---|---|---|---|---|
| C1 | `api-meter` | Track 1: Per-API Monetization | $0.001/request | **live 402 ✓** |
| C2 | `agent-loop` | Track 2: Agent-to-Agent | $0.0005/ask | **live 402 ✓** |
| C3 | `llm-stream` · **WOW** | Track 3: Usage-Based Compute | $0.00005/token | **live SSE ✓** |
| C4 | `dwell-reader` | Track 4: Real-Time Micro-Commerce | $0.0001/paragraph | cut (primitive ships) |
| C5 | `mcp-tool` | bonus — MCP paid tools | $0.001/call | scaffolded |
| C6 | `frame-classifier` | bonus — M2M | $0.0005/frame | **typecheck ✓** |
| C7 | `row-meter` | bonus — data | $0.0001/row | **live 402 ✓** |

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

cp .env.example .env
# Edit .env: set SELLER_ADDRESS + BUYER_PRIVATE_KEY (via scripts/generate-wallets.ts)
# Fund buyer at https://faucet.circle.com/ → Arc Testnet → 20 USDC

# Run the WOW demo:
pnpm --filter c3-llm-stream start     # → http://localhost:4023/

# Other components:
pnpm --filter c1-api-meter dev        # :4021  paid weather/geocode
pnpm --filter c2-agent-loop server    # :4022  paid agent-to-agent
pnpm --filter c6-frame-classifier start  # :4026  paid frame classification
pnpm --filter c7-row-meter start      # :4027  paid data rows
```

## Architecture

```
┌──────── @pay2play/core ────────┐
│  meter · session · arc · types │
└────────────┬───────────────────┘
             │
   ┌─────────┴─────────┬──────────┐
   │                   │          │
 @pay2play/server  @pay2play/client  @pay2play/observe
  http/sse/mcp     fetch/openai/    arc WS feed
                   mcp/viewport
             │
   ┌─────────┴──────────────┐
   │  components/ (C1..C7)  │
   └────────┬───────────────┘
            ▼
    Arc Testnet (USDC-gas + Gateway + Nanopayments)
```

## Research index

10 docs in [`./docs/`](./docs/):
- [`01-hackathon-rules.md`](./docs/01-hackathon-rules.md) — rules, prizes, judging
- [`02-arc-network.md`](./docs/02-arc-network.md) — Arc testnet config (chain 5042002) + contracts
- [`03-circle-nanopayments.md`](./docs/03-circle-nanopayments.md) — Gateway SDK, confirmed API
- [`04-x402-protocol.md`](./docs/04-x402-protocol.md) — v2 spec + header format
- [`05-repos-to-clone.md`](./docs/05-repos-to-clone.md) — reference repos in `_refs/`
- [`06-architecture.md`](./docs/06-architecture.md) — layers + data flows
- [`07-components.md`](./docs/07-components.md) — C1–C7 specs
- [`08-margin-analysis.md`](./docs/08-margin-analysis.md) — chain economics
- [`09-competitive-intel.md`](./docs/09-competitive-intel.md) — prior-winners analysis
- [`10-circle-feedback.md`](./docs/10-circle-feedback.md) — Circle Product Feedback draft

## Hackathon metadata

- **Primary track**: Per-API Monetization Engine (C1)
- **Coverage**: all 4 tracks via C1/C2/C3/(C4 cut)
- **Circle products used**: Nanopayments · Gateway (batched settlement) · x402 (on Arc) · Arc testnet · Circle Faucet
- **Hard rules met**:
  - ≤$0.01/action ✓ (range: $0.00005 to $0.002)
  - ≥50 on-chain txs (planned via bench scripts)
  - Margin analysis ✓ (`docs/08-margin-analysis.md`)
  - Public GitHub + MIT ✓
  - Circle Product Feedback draft ✓ (`docs/10-circle-feedback.md`)

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
