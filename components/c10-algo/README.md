# C10 · pay2play-algo (Algorand)

Algorand counterpart to pay2play-arc. Per-request ALGO metering on Algorand AVM — same HTTP API surface as C1/C7 on Arc.

## What it demonstrates

| Feature | Detail |
|---------|--------|
| **AlgoKit TypeScript** | `PaymentMeter.algo.ts` — AVM contract with per-call price enforcement |
| **Atomic group transactions** | Client includes pay txn + app call in same group |
| **pay2play HTTP pattern** | Same `X-Algo-Payment` header pattern as `payment-signature` on Arc |
| **Cross-chain contrast** | Arc uses USDC (EVM) · Algorand uses ALGO (AVM) — both $0.001/call |

## Deploy

```bash
# Via vibekit-mcp tools in Claude Code:
# 1. create_account + fund_account
# 2. app_deploy (PaymentMeter.algo.ts → compiled AVM)
# 3. read_global_state → confirm pricePerCall=1000

# Or via script:
ALGO_MNEMONIC="25 words..." pnpm deploy
```

## Running

```bash
ALGO_APP_ID=<app-id> pnpm start
curl http://localhost:3010/
curl http://localhost:3010/stats
curl http://localhost:3010/data  # → 402
curl -H "X-Algo-Payment: <confirmed-tx-id>" http://localhost:3010/data
```

## Contrast with pay2play-arc

| Feature | pay2play-arc (C1) | pay2play-algo (C10) |
|---------|-------------------|---------------------|
| Chain | Arc Testnet (EVM, chainId 5042002) | Algorand Testnet |
| Token | USDC (ERC-20) | ALGO (native) |
| Protocol | x402 + EIP-3009 | Atomic group txn proof |
| Settlement | Circle Gateway batch | On-chain immediately |
| Price | $0.001/request | 1000 microALGO ≈ $0.001 |

## Contract

`contracts/PaymentMeter.algo.ts` — AlgoKit TypeScript:
- `pay()`: verify group payment, increment counters
- `setPrice(n)`: creator updates price
- `withdraw(n)`: creator withdraws ALGO
- `getStats()`: read pricePerCall, totalReceived, callCount

## References

- [AlgoKit Utils TS](https://github.com/algorandfoundation/algokit-utils-ts)
- [Algorand TypeScript](https://github.com/algorandfoundation/puya-ts)
- [vibekit-mcp tools](available in Claude Code session)
