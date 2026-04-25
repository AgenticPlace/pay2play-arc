# pay2play research index

Reference material gathered during hackathon planning (2026-04-24, target submission 2026-04-25).

Hackathon: **Agentic Economy on Arc** — https://lablab.ai/ai-hackathons/nano-payments-arc

| File | What's in it |
|---|---|
| [01-hackathon-rules.md](./01-hackathon-rules.md) | Dates, prizes, tracks, hard constraints, mentors, judging criteria |
| [02-arc-network.md](./02-arc-network.md) | Arc testnet RPC, chain ID, all 15 contracts, explorer, faucet, docs index |
| [03-circle-nanopayments.md](./03-circle-nanopayments.md) | Gateway + Nanopayments docs, App Kit bridge, thirdweb facilitator, Python SDK |
| [04-x402-protocol.md](./04-x402-protocol.md) | v2 spec, headers, payload shapes, all 3 facilitators, Python x402 helpers |
| [05-repos-to-clone.md](./05-repos-to-clone.md) | Canonical git-clone list; Vyper repos now implemented in contracts/ + python/ |
| [06-architecture.md](./06-architecture.md) | 5-package + 10-component + Vyper + Python architecture + data flows |
| [07-components.md](./07-components.md) | Per-component spec (C1–C10) — what, why, how, accept, cut-priority |
| [08-margin-analysis.md](./08-margin-analysis.md) | Real-number cost comparison Arc vs Base/OP/Ethereum |
| [09-competitive-intel.md](./09-competitive-intel.md) | Prior hackathon (Jan 2026) winners + untouched niches |
| [10-circle-feedback.md](./10-circle-feedback.md) | Live-updated Circle Product Feedback draft — fill during build |
| [11-tool-map.md](./11-tool-map.md) | Comprehensive tool/SDK/contract reference map covering all layers |

## Quick-reference card

| Thing | Value |
|---|---|
| Chain | Arc testnet (Circle's L1; USDC-native gas) |
| Chain ID | `5042002` (confirmed from `_refs/arc-nanopayments/lib/x402.ts`) |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` (20 USDC / 2h / address) |
| USDC | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| GatewayMinter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |
| CCTP TokenMessengerV2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| CCTP MessageTransmitterV2 | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |
| FxEscrow | `0x867650F5eAe8df91445971f14d89fd84F0C9a9f8` |
| Memo | `0x9702466268ccF55eAB64cdf484d272Ac08d3b75b` |
| ERC-8004 IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ERC-8004 ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |
| ERC-8183 JobEscrow | `0x0747EEf0706327138c69792bF28Cd525089e4583` |
| Core SDK | `@circle-fin/x402-batching@^2.0.4` |
| Spec | https://github.com/coinbase/x402/blob/main/specs/transports-v2/x402-specification-v2.md |

## Hard submission rules

1. ≤ $0.01 per action ✓ (range $0.00005–$0.002)
2. ≥ 50 on-chain transactions ✓ (63+ settlements — `tests/integration-results-2026-04-24.md`)
3. Margin analysis ✓ (`docs/08-margin-analysis.md`)
4. Public GitHub + MIT ✓
5. Video showing end-to-end USDC tx + Arcscan verification
6. Track declared + Circle products used + Circle Product Feedback form ✓

## Integration test scripts

| Script | Purpose |
|---|---|
| `bash tests/smoke-test.sh` | Start C1, verify 402 gate + PAYMENT-REQUIRED header |
| `pnpm tsx scripts/gateway-deposit.ts [amount]` | Deposit USDC into Circle Gateway (one-time per wallet) |
| `pnpm tsx scripts/gateway-balance.ts` | Check Gateway available + pending balance |
| `pnpm tsx scripts/fund.ts` | Check on-chain USDC balances for seller + buyer |
| `pnpm tsx components/c1-api-meter/src/bench.ts [N]` | Run N paid calls through C1 (default 200) |
| `pnpm tsx components/c2-agent-loop/src/buyer.ts [N]` | Run N agent-to-agent asks through C2 |
| `pnpm tsx scripts/test-c6.ts` | Test C6 frame-classifier: 402 gate + paid classify |
| `pnpm tsx scripts/test-c7.ts` | Test C7 row-meter: 402 gate + paid row queries |
| `pnpm tsx scripts/test-c9.ts` | Test C9 agent-identity: 402 gate + paid register + job (dry-run) |
