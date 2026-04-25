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

## Vyper (fully implemented — contracts + Python layer)

These live directly in `contracts/arc/` and `python/` rather than cloned at runtime:

| Artifact | Lineage |
|---|---|
| `contracts/arc/PaymentChannel.vy` | pay2play; EIP-712 off-chain USDC channel (close/timeout) |
| `contracts/arc/AgentEscrow.vy` | pay2play; ERC-8183 job lifecycle (OPEN→FUNDED→SUBMITTED→COMPLETED) |
| `contracts/arc/SpendingLimiter.vy` | pay2play; per-agent daily/per-tx/total USDC caps + recipient allowlist |
| `contracts/arc/SubscriptionManager.vy` | pay2play; recurring USDC subscriptions with pro-rata refunds |
| `contracts/arc/PaymentSplitter.vy` | **vendored** from [vyperlang/vyper-agentic-payments](https://github.com/vyperlang/vyper-agentic-payments) — multi-recipient revenue distribution by basis-point shares |
| `contracts/arc/Vault.vy` | **vendored** from [vyperlang/vyper-agentic-payments](https://github.com/vyperlang/vyper-agentic-payments) — per-depositor USDC vault (depositor-only withdraw) |
| `python/pay2play_arc/` | GatewayClient, ContractLoader (Titanoboa, supports all 6 contracts), x402 helpers, FastAPI middleware |
| `python/tests/` | Titanoboa pytest suite (skip-guarded without titanoboa installed) |
| `contracts/arc/tests/` | Per-contract Titanoboa tests (skip-guarded) |

**Drift policy for vendored Vyper:** files carry a `CONTRACT_SOURCE` header
pinning the upstream commit. CI runs `bash scripts/check-contract-drift.sh`
to catch silent edits. Re-pin against newer upstream commits via the same
script with `--pin <commit-sha>`.

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
