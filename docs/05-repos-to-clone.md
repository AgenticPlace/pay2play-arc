# Repos to clone into `_refs/`

## Already cloned in Phase 0

```bash
cd /home/hacker/circlenano/_refs
git clone --depth 1 https://github.com/circlefin/arc-nanopayments.git       # PRIMARY SCAFFOLD
git clone --depth 1 https://github.com/coinbase/x402.git                    # protocol + TS packages + spec
git clone --depth 1 https://github.com/cutepawss/arcent.git                 # prior-winner reference pattern
```

Status: all 3 successfully cloned 2026-04-24.

## Optional secondary (clone if time permits for pattern-mining)

```bash
cd /home/hacker/circlenano/_refs
git clone --depth 1 https://github.com/circlefin/arc-p2p-payments.git       # gasless P2P
git clone --depth 1 https://github.com/circlefin/arc-commerce.git           # Next.js + Supabase credit purchase
git clone --depth 1 https://github.com/circlefin/arc-escrow.git             # AI-validated escrow (Next + OpenAI + DCW)
git clone --depth 1 https://github.com/circlefin/arc-multichain-wallet.git  # Gateway unified balance UX
git clone --depth 1 https://github.com/circlefin/arc-fintech.git            # multi-chain treasury
git clone --depth 1 https://github.com/nativ3ai/hermes-payguard.git         # safe x402 plugin for agents
```

## Reference-only (don't need to open unless digging into USDC/CCTP internals)

```bash
git clone --depth 1 https://github.com/circlefin/stablecoin-evm.git         # USDC contract source
git clone --depth 1 https://github.com/circlefin/evm-cctp-contracts.git     # CCTP contracts
```

## Vyper bonus (skip unless specifically pursuing Vyper originality points)

```bash
# git clone https://github.com/circlefin/Circle-titanoboa-sdk.git
# git clone https://github.com/circlefin/Vyper-agentic-payments.git
# git clone https://github.com/circlefin/ERC-8004-vyper.git
```

## Critical paths inside cloned repos

### `_refs/coinbase/x402/`
- `specs/transports-v2/x402-specification-v2.md` — **canonical spec** (read first)
- `specs/schemes/` — scheme implementations (exact, etc.)
- `typescript/packages/core/` — types + facilitator client
- `typescript/packages/http/` — HTTP transport
- `typescript/packages/mcp/` — **x402-mcp paidTool + withPayment** (reference for our c5)
- `examples/` — runnable per-chain examples (copy patterns)

### `_refs/circlefin/arc-nanopayments/` (Next.js + LangChain scaffold)
- `README.md` — authoritative install + usage
- `package.json` — confirms `@circle-fin/x402-batching@^2.0.4`, `@x402/core@^2.6.0`, `@x402/evm@^2.6.0`, `viem@^2.47.1`
- `agent.mts` — LangChain buyer agent (reference pattern)
- `generate-wallets.mts` — wallet generation script
- `proxy.ts` — proxy (reference for middleware wiring)
- `app/` — Next.js routes with x402-protected endpoints (reference for server side)

### `_refs/cutepawss/arcent/` (prior hackathon winner)
- `README.md` — positioning, "Pay-on-Success" pattern
- `frontend/` — Gemini-driven buyer UI
- `gateway/` — seller/middleware implementation
- `PRESENTATION.md` — winning pitch structure

## `.gitignore` note

Add `_refs/` to `.gitignore` — we do not ship forks, just reference them during the build.
