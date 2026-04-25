# pay2play Tool Map — Complete Circle Arc + Algorand Reference

## Protocol Standards

| Standard | Role in pay2play | Source |
|----------|-----------------|--------|
| **x402 v2** | HTTP 402 payment header spec — challenge + response + payment | [coinbase/x402](https://github.com/coinbase/x402) |
| **EIP-3009** | `transferWithAuthorization` — gasless USDC signing (no on-chain approval) | EIP spec |
| **EIP-712** | Typed structured data signing — used for PaymentChannel vouchers | EIP spec |
| **ERC-8004** | AI agent ERC-721 identity + reputation on Arc testnet | [arc docs](https://docs.arc.network/arc/tutorials/register-your-first-ai-agent.md) |
| **ERC-8183** | Job escrow + escrow lifecycle (OPEN→FUNDED→SUBMITTED→COMPLETED) | [arc docs](https://docs.arc.network/arc/tutorials/create-your-first-erc-8183-job.md) |

---

## Chains

| Chain | Role | Config |
|-------|------|--------|
| **Arc Testnet** | Primary — USDC-native EVM L1, <1s finality, CCTP Domain 26 | chainId `5042002`, RPC `https://rpc.testnet.arc.network` |
| **Algorand Testnet** | Secondary — AVM, microALGO payments, atomic groups | Algod `https://testnet-api.algonode.cloud` |

---

## Circle / Arc SDK Map

### Payment SDKs

| Package | Role | Used by |
|---------|------|---------|
| `@circle-fin/x402-batching` | Circle Gateway BatchFacilitatorClient — verify + batch settle | C1, C2, C3, C5, C6, C7 |
| `@x402/core` | Coinbase x402 canonical types + header helpers | `@pay2play/core/types.ts` |
| `@x402/evm` | EVM-specific x402 signing utilities | `packages/server` |
| `@x402/mcp` | x402 paid tool wrapper for MCP streamable-HTTP | C5 (MCP tool) |
| `circle-titanoboa-sdk` | Python: Gateway + x402 + Vyper contract interaction | `python/` |
| `thirdweb/x402` | Alternative facilitator — 170+ EVM chains | `packages/server/src/facilitators.ts` |

### Bridge / Cross-Chain

| Package | Role | Docs |
|---------|------|------|
| `@circle-fin/app-kit` | Bridge + Swap + Send via CCTP V2 | [docs.arc.network/app-kit](https://docs.arc.network/app-kit.md) |
| `@circle-fin/bridge-kit` | Standalone bridge module | [bridge.md](https://docs.arc.network/app-kit/bridge.md) |
| `@circle-fin/adapter-viem-v2` | EVM adapter for App Kit | [adapter-setups.md](https://docs.arc.network/app-kit/tutorials/adapter-setups.md) |
| `@circle-fin/adapter-solana-kit` | Solana adapter | [adapter-setups.md](https://docs.arc.network/app-kit/tutorials/adapter-setups.md) |
| `@circle-fin/adapter-circle-wallets` | Circle Wallets adapter | [adapter-setups.md](https://docs.arc.network/app-kit/tutorials/adapter-setups.md) |
| CCTP V2 (Domain 26) | Cross-chain USDC canonical transfer | TokenMessengerV2 `0x8FE6B999...` |

### Wallets

| Tool | Role | Docs |
|------|------|------|
| `viem/accounts` | Self-managed EOA (generate + sign) | [viem.sh](https://viem.sh) |
| Circle Dev Wallets | API-managed smart contract accounts | [developers.circle.com](https://developers.circle.com) |
| Circle Gas Station | USDC Paymaster — sponsor gas fees | Circle docs |
| Circle Wallets Skill | LLM-optimized wallet setup guide | `use-circle-wallets` |

---

## Arc Testnet Contract Addresses (all 15)

| Contract | Address | Category |
|----------|---------|----------|
| **USDC** | `0x3600000000000000000000000000000000000000` | Stablecoin (native gas, 18-dec AVM / 6-dec ERC-20) |
| **EURC** | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | Stablecoin (EUR-backed) |
| **USYC** | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` | Yield-bearing (treasury-backed) |
| **GatewayWallet** | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` | Circle Gateway (x402 settlement) |
| **GatewayMinter** | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` | Circle Gateway minting |
| **TokenMessengerV2** | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` | CCTP V2 cross-chain |
| **MessageTransmitterV2** | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` | CCTP V2 attestation |
| **FxEscrow** | `0x867650F5eAe8df91445971f14d89fd84F0C9a9f8` | Stablecoin FX settlement (USDC↔EURC) |
| **Memo** | `0x9702466268ccF55eAB64cdf484d272Ac08d3b75b` | Transaction metadata attachment |
| **Permit2** | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | EIP-2612 token approvals |
| **Multicall3** | `0xcA11bde05977b3631167028862bE2a173976CA11` | Batch read calls |
| **IdentityRegistry** | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | ERC-8004 agent identity (ERC-721) |
| **ReputationRegistry** | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | ERC-8004 reputation scores |
| **ValidationRegistry** | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | ERC-8004 validation requests |
| **JobEscrow** | `0x0747EEf0706327138c69792bF28Cd525089e4583` | ERC-8183 job lifecycle |

All addresses also exported from `packages/core/src/arc.ts` as `ARC_TESTNET.contracts.*`

---

## Vyper Smart Contracts (contracts/arc/)

| Contract | Purpose | Key Functions |
|----------|---------|---------------|
| `interfaces/IERC20.vy` | Standard ERC-20 interface | `transfer`, `transferFrom`, `approve`, `balanceOf` |
| `PaymentChannel.vy` | Off-chain USDC payment channel with EIP-712 vouchers | `deposit`, `close(amount, sig)`, `extend`, `timeout` |
| `AgentEscrow.vy` | ERC-8183-compatible job lifecycle (local deploy) | `createJob`, `setBudget`, `fund`, `submit`, `complete`, `dispute` |
| `SpendingLimiter.vy` | Per-agent USDC spending controls | `spend`, `setLimits`, `pause`, `resume` |
| `SubscriptionManager.vy` | Recurring USDC subscriptions with pro-rata refunds | `createPlan`, `subscribe`, `renew`, `cancel`, `chargeUsage` |

Requires: `vyper ~0.4.3`, tested with `titanoboa >=0.2`

Source inspiration: [github.com/vyperlang/vyper-agentic-payments](https://github.com/vyperlang/vyper-agentic-payments)

---

## Algorand Contracts (components/c10-algo/)

| Contract | Purpose | Key Functions |
|----------|---------|---------------|
| `PaymentMeter.algo.ts` | AlgoKit TypeScript AVM contract — per-call ALGO gate | `pay()`, `setPrice`, `withdraw`, `getStats` |

Requires: `@algorandfoundation/algorand-typescript ^1.0`, `@algorandfoundation/algokit-utils ^7`

---

## pay2play Packages

| Package | Exports | Role |
|---------|---------|------|
| `@pay2play/core` | `ARC_TESTNET`, `meter()`, `Session`, `Voucher`, all ABIs, all types | Shared primitives |
| `@pay2play/server` | `createPaidMiddleware`, `SseMeter`, `createMcpPaidContext`, `circleGatewayFacilitator`, `thirdwebFacilitator` | Server adapters |
| `@pay2play/client` | `wrapFetchWithPayment`, `openStreamingSession`, viewport | Client adapters |
| `@pay2play/bridge` | `BridgeModule`, `SwapModule`, `SendModule` | App Kit bridge wrapper |
| `@pay2play/observe` | (planned) Arc WS event feed | Observability |

---

## Developer Tools

| Tool | Role | Setup |
|------|------|-------|
| **Titanoboa** | Vyper in-process EVM for testing | `pip install titanoboa` |
| **Moccasin** | Vyper build + deploy framework | `pip install moccasin` |
| **AlgoKit CLI** | Algorand build/test/deploy | `pip install algokit` |
| **vibekit-mcp** | Algorand MCP tools (available in Claude Code) | Built-in |
| **Arc Docs MCP** | Live Arc docs search in Claude Code | `claude mcp add --transport http arc-docs https://docs.arc.network/mcp` |
| **Blockscout MCP** | On-chain explorer API for Arc + other EVM chains | Built-in |
| **Arc Explorer** | [testnet.arcscan.app](https://testnet.arcscan.app) | Browser |
| **Arc Faucet** | [faucet.circle.com](https://faucet.circle.com) | Browser |

---

## Use Case Coverage

| Use Case | Components | Standards Used |
|----------|------------|----------------|
| **Agentic Economy** | C9: register agent → create job → settle USDC | ERC-8004, ERC-8183, x402 |
| **Per-API monetization** | C1: weather/geocode at $0.001/req | x402 + Circle Gateway |
| **Agent-to-agent** | C2: buyer agent pays seller agent | x402 + EIP-3009 |
| **LLM streaming** | C3: per-token SSE metering at $0.00005/token | x402 batching + SSE |
| **MCP tool payments** | C5: $0.001/MCP tool call | @x402/mcp |
| **M2M frame metering** | C6: $0.0005/video frame | x402 exact |
| **Per-row data** | C7: $0.0001/database row | x402 exact |
| **Cross-chain bridge** | C8: USDC EVM→Arc via CCTP V2 | CCTP V2, App Kit Bridge |
| **Peer-to-peer** | PaymentChannel.vy off-chain USDC channel | EIP-712, Vyper |
| **Stablecoin FX** | C8 swap: USDC↔EURC on Arc | App Kit Swap, FxEscrow |
| **Spending control** | SpendingLimiter.vy agent wallet guard | Vyper |
| **Subscriptions** | SubscriptionManager.vy recurring billing | Vyper, EIP-3009 |
| **Algorand payments** | C10: per-ALGO-payment API gate on AVM | AlgoKit, atomic groups |

---

## Facilitator Comparison

| Facilitator | Chains | Free Tier | Settlement | Code |
|-------------|--------|-----------|------------|------|
| **Circle Gateway** | Arc testnet + 12 chains | Yes (testnet) | Batched, ~$0.0001/tx | `circleGatewayFacilitator()` |
| **thirdweb** | 170+ EVM | No (API key) | EIP-7702 server wallet | `thirdwebFacilitator()` |
| **Coinbase** | Base, Polygon, Arbitrum, World | 1000/mo free | On-chain | `coinbaseFacilitator()` |

All use the same `Facilitator` interface: `{ verify, settle }` — drop-in for `createPaidMiddleware()`.

---

## Useful Links

| Resource | URL |
|----------|-----|
| Arc Docs | https://docs.arc.network |
| Arc MCP Server | https://docs.arc.network/mcp |
| Arc Explorer (testnet) | https://testnet.arcscan.app |
| Arc Faucet | https://faucet.circle.com |
| Circle Dev Docs | https://developers.circle.com |
| Circle LLMs.txt | https://developers.circle.com/llms.txt |
| Circle Gateway Nanopayments | https://developers.circle.com/gateway/nanopayments |
| x402 Protocol | https://github.com/coinbase/x402 |
| thirdweb x402 Facilitator | https://portal.thirdweb.com/x402/facilitator |
| Vyper ERC-8004 | https://github.com/vyperlang/erc-8004-vyper |
| Vyper Agentic Payments | https://github.com/vyperlang/vyper-agentic-payments |
| Circle Titanoboa SDK | https://github.com/vyperlang/circle-titanoboa-sdk |
| App Kit Bridge | https://docs.arc.network/app-kit/bridge.md |
| AlgoKit Utils TS | https://github.com/algorandfoundation/algokit-utils-ts |
| Hackathon Rules | https://lablab.ai/ai-hackathons/nano-payments-arc |
