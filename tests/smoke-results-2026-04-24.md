# Smoke Test Results — 2026-04-24

**Script**: `tests/smoke-test.sh`  
**Date**: 2026-04-24T21:58Z  
**Component**: C1 api-meter (port 4021)

## Wallet Pair (testnet-only, Arc Testnet)

| Role | Address |
|---|---|
| Seller | `0xa28B679CE29768059706f40733BD28C30356b36B` |
| Buyer | `0x898883A4c4433B1124Bd51A5Ba20875E0a5f18A3` |

Both generated fresh via `scripts/generate-wallets.ts`. Not funded yet.

## Test Results

| Check | Result |
|---|---|
| `GET /` returns service info JSON | PASS |
| `GET /weather` without payment → HTTP 402 | PASS |
| `PAYMENT-REQUIRED` header present (base64 JSON) | PASS |
| `GET /stats` returns settlement counters (free) | PASS |

## PAYMENT-REQUIRED Header (decoded)

```json
{
  "x402Version": 2,
  "error": "payment-signature header is required",
  "resource": {
    "url": "http://localhost:4021/weather",
    "description": "Paid resource ($0.001 USDC)",
    "mimeType": "application/json"
  },
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:5042002",
    "asset": "0x3600000000000000000000000000000000000000",
    "amount": "1000",
    "payTo": "0xa28B679CE29768059706f40733BD28C30356b36B",
    "maxTimeoutSeconds": 345600,
    "extra": {
      "name": "GatewayWalletBatched",
      "version": "1",
      "verifyingContract": "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"
    }
  }]
}
```

Confirms: chain `eip155:5042002`, USDC `0x3600...`, amount `1000` (= $0.001 at 6 decimals), GatewayWallet batched scheme.

## Next Steps

1. Fund buyer at https://faucet.circle.com → Arc Testnet → 20 USDC  
2. Run `pnpm tsx scripts/fund.ts` to deposit buyer USDC into Gateway  
3. Run `pnpm tsx components/c1-api-meter/src/bench.ts` to generate ≥50 on-chain txs
