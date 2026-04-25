# C9 · Agent Identity + Job Escrow

Demonstrates the **Agentic Economy** use case on Arc: register an AI agent's on-chain identity (ERC-8004) and run a full job escrow lifecycle (ERC-8183).

## What it demonstrates

| Feature | Detail |
|---------|--------|
| **ERC-8004** | AI agent ERC-721 identity + reputation scoring on Arc testnet |
| **ERC-8183** | Job escrow: createJob → fund → submit → complete |
| **Nanopayment gate** | Each API call costs $0.002 via Circle Gateway x402 |
| **USDC settlement** | Provider receives USDC on job completion |

## ERC-8004 Registries (Arc Testnet)

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |
| JobEscrow (ERC-8183) | `0x0747EEf0706327138c69792bF28Cd525089e4583` |

## Running

```bash
cp ../../.env.example .env
pnpm start        # HTTP server on :3009
pnpm register     # CLI: ERC-8004 agent registration
pnpm job          # CLI: full ERC-8183 job lifecycle
```

## Endpoints

```
GET  /                    — service info + contract addresses
POST /agent/register      { ownerKey, metadataURI, initialScore? }
POST /job/create          { clientKey, providerKey, descText, budgetUsdc, deliverable? }
GET  /job/:id             — read job state (free)
```

## Scripts

```bash
# Dry-run agent registration (no wallet needed)
pnpm tsx src/register.ts --dry-run

# Full registration (needs funded wallet)
SELLER_PRIVATE_KEY=0x... pnpm tsx src/register.ts

# Full job lifecycle (needs two funded wallets)
SELLER_PRIVATE_KEY=0x... BUYER_PRIVATE_KEY=0x... pnpm tsx src/job.ts
```

## References

- [ERC-8004 Standard](https://eips.ethereum.org/EIPS/eip-8004)
- [Register an AI Agent (Arc docs)](https://docs.arc.network/arc/tutorials/register-your-first-ai-agent.md)
- [Create an ERC-8183 Job (Arc docs)](https://docs.arc.network/arc/tutorials/create-your-first-erc-8183-job.md)
- [Vyper ERC-8004 impl](https://github.com/vyperlang/erc-8004-vyper)
