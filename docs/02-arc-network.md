# Arc — Circle's stablecoin-native L1

Arc is **Circle's** Layer-1 EVM blockchain with USDC as native gas. Testnet-only as of April 2026. Mainnet planned for 2026.

> **IMPORTANT**: "Arc" here is NOT Algorand ARC standards. Ignore `/home/hacker/CLAUDE.md` Algorand guidance for this project.

## Docs index
- Landing: https://www.arc.network/
- Docs root: https://docs.arc.network/
- **LLM-ingestible doc index**: https://docs.arc.network/llms.txt ← grep here first
- Connect to Arc (RPC + chain ID): https://docs.arc.network/arc/references/connect-to-arc
- Contract addresses: https://docs.arc.network/arc/references/contract-addresses
- Gas & fees (USDC-as-gas model): https://docs.arc.network/arc/references/gas-and-fees
- Sample applications: https://docs.arc.network/arc/references/sample-applications
- Deploy walkthrough: https://docs.arc.network/arc/tutorials/deploy-on-arc
- ERC-8004 agent identity: https://docs.arc.network/arc/tutorials/register-your-first-ai-agent
- App-kit (bridge/swap/send SDK): https://docs.arc.network/app-kit
- Send-tokens quickstart: https://docs.arc.network/app-kit/quickstarts/send-tokens-same-chain
- Arc MCP server (for agents): https://docs.arc.network/ai/mcp
- Community: https://community.arc.network/
- Developer Discord: https://discord.com/invite/buildonarc
- Testnet launch blog: https://www.arc.network/blog/circle-launches-arc-public-testnet

## Testnet endpoints
| Resource | Value |
|---|---|
| Network name | Arc Testnet |
| Chain ID | **`5042002`** (confirmed — reference scaffold hard-codes `"eip155:5042002"`) |
| RPC (default) | `https://rpc.testnet.arc.network` |
| RPC (Blockdaemon) | `https://rpc.blockdaemon.testnet.arc.network` |
| RPC (dRPC) | `https://rpc.drpc.testnet.arc.network` |
| RPC (QuickNode) | `https://rpc.quicknode.testnet.arc.network` |
| WS (default) | `wss://rpc.testnet.arc.network` |
| WS (dRPC) | `wss://rpc.drpc.testnet.arc.network` |
| WS (QuickNode) | `wss://rpc.quicknode.testnet.arc.network` |
| Block explorer | https://testnet.arcscan.app |
| Gas tracker | https://testnet.arcscan.app/gas-tracker |
| Faucet (USDC + EURC) | https://faucet.circle.com (Arc Testnet option; 20 USDC / 2h / address) |
| Min gas price | **20 Gwei** (set `maxFeePerGas` ≥ this) |
| Alchemy profile | https://www.alchemy.com/rpc/arc-testnet |
| Thirdweb profile | https://thirdweb.com/arc-testnet |

## Testnet contracts
| Contract | Address |
|---|---|
| USDC | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| USYC | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` |
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| GatewayMinter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |
| CCTP TokenMessengerV2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| CCTP MessageTransmitterV2 | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |
| FxEscrow | `0x867650F5eAe8df91445971f14d89fd84F0C9a9f8` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| ERC-8004 IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ERC-8004 ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |

## Gotchas / red flags
- **USDC is native gas.** No ETH paths anywhere. Faucet USDC suffices.
- **Decimals**: 6 at ERC-20 surface, 18 for internal gas math. Easy bug site — always normalize.
- **Min gas price 20 Gwei** — set `maxFeePerGas ≥ 20e9` or tx won't include.
- **Faucet rate limit**: 1 req/stablecoin/chain/address per 2h, 20 USDC max. Fund multiple wallets early.
- **Gateway deposit is onchain** (not gasless). One tx per wallet at start to fund the batched-settlement balance. Plan for this in Phase 0.
- **Mainnet not live.** README must say "testnet"; don't promise production.
- **Do not confuse** with Algorand ARC standards — completely unrelated.
- **lablab.ai 403s bots** — use `web.archive.org` mirror when re-reading rules.
- **Arc MCP Server** (https://docs.arc.network/ai/mcp) — consider wiring into Claude Code for faster iteration on contract calls/RPC queries.
