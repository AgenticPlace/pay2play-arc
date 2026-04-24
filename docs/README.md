# pay2play research index

Reference material gathered during hackathon planning (2026-04-24, target submission 2026-04-25).

Hackathon: **Agentic Economy on Arc** — https://lablab.ai/ai-hackathons/nano-payments-arc

| File | What's in it |
|---|---|
| [01-hackathon-rules.md](./01-hackathon-rules.md) | Dates, prizes, tracks, hard constraints, mentors, judging criteria |
| [02-arc-network.md](./02-arc-network.md) | Arc testnet RPC, chain ID, contracts, explorer, faucet, docs index |
| [03-circle-nanopayments.md](./03-circle-nanopayments.md) | Gateway + Nanopayments docs, confirmed SDK versions, supported chains, quickstarts |
| [04-x402-protocol.md](./04-x402-protocol.md) | v2 spec, headers, payload shapes, facilitator, TS packages |
| [05-repos-to-clone.md](./05-repos-to-clone.md) | Canonical git-clone list with purpose per repo |
| [06-architecture.md](./06-architecture.md) | pay2play core/server/client/components architecture + data flows |
| [07-components.md](./07-components.md) | Per-component spec (C1–C7) — what, why, how, accept, cut-priority |
| [08-margin-analysis.md](./08-margin-analysis.md) | Real-number cost comparison Arc vs Base/OP/Ethereum |
| [09-competitive-intel.md](./09-competitive-intel.md) | Prior hackathon (Jan 2026) winners + untouched niches |
| [10-circle-feedback.md](./10-circle-feedback.md) | Live-updated Circle Product Feedback draft — fill during build |

## Quick-reference card

| Thing | Value |
|---|---|
| Chain | Arc testnet (Circle's L1; USDC-native gas) |
| Chain ID | `5042002` (confirmed from `_refs/arc-nanopayments/lib/x402.ts`) |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` (20 USDC / 2h / address) |
| USDC | `0x3600000000000000000000000000000000000000` |
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| GatewayMinter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |
| Core SDK | `@circle-fin/x402-batching@^2.0.4` |
| Spec | https://github.com/coinbase/x402/blob/main/specs/transports-v2/x402-specification-v2.md |

## Hard submission rules (don't forget)

1. ≤ $0.01 per action
2. ≥ 50 on-chain transactions in demo
3. Margin analysis (why fails on other chains)
4. Public GitHub + MIT
5. Video showing end-to-end USDC tx + Arcscan verification
6. Track declared + Circle products used + Circle Product Feedback form
