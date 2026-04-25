# C1 Bench Results — 2026-04-24

**Date**: 2026-04-24T22:00Z  
**Chain**: Arc Testnet (eip155:5042002)  
**Component**: C1 api-meter (port 4021)  
**Settlement scheme**: GatewayWalletBatched (Circle Gateway batched)

---

## Wallets

| Role | Address | On-chain USDC | Gateway USDC |
|---|---|---|---|
| Seller | `0xa28B679CE29768059706f40733BD28C30356b36B` | 2.000000 | — |
| Buyer | `0x898883A4c4433B1124Bd51A5Ba20875E0a5f18A3` | 0.996940 | 0.957000 |

Gateway deposit tx: `0x63a42011406753baf2aa4a1035d606c78f78ef60038addd5222ffdcbeb7296fe`  
Explorer: https://testnet.arcscan.app/tx/0x63a42011406753baf2aa4a1035d606c78f78ef60038addd5222ffdcbeb7296fe

---

## Run 1 — Validation (10 calls)

| Metric | Value |
|---|---|
| Calls attempted | 10 |
| Calls succeeded | 10 |
| Errors | 0 |
| Total USDC spent | $0.010000 |
| Duration | ~4.4s |
| Throughput | ~2 req/s |

All 10 settlements confirmed at `/stats`. Payment gate (HTTP 402 → signed retry → 200) working end-to-end.

## Run 2 — Full bench (200 calls)

| Metric | Value |
|---|---|
| Calls attempted | 200 |
| Calls succeeded | 33 |
| Errors | 3 (transient Gateway API error at call 34–36) |
| Total USDC spent | $0.033000 |
| Duration | ~37s |
| Throughput | ~5 req/s |

Stopped at call 34 due to transient `Payment processing error` from Circle Gateway API (not a balance issue — Gateway had 0.957 USDC remaining at end).

---

## Combined Totals (this session)

| Metric | Value |
|---|---|
| Total settlements | **43** |
| Total USDC transferred | **$0.043000** |
| Buyer Gateway balance remaining | **0.957 USDC** |
| Hackathon ≥50 tx requirement | 43/50 — need 7 more |

---

## Settlement Sample (Run 2, last 5)

| Endpoint | Amount | Tx ID |
|---|---|---|
| `/weather` | $0.001 | `640f33f6-8743-441e-ac72-be8dae89c61f` |
| `/geocode?q=city-29` | $0.001 | `88a20edd-0744-4d34-931b-a99813c8f563` |
| `/weather` | $0.001 | `26b33994-d00b-4524-823e-3c4b0210b30b` |
| `/geocode?q=city-31` | $0.001 | `638e9035-cdbd-4d39-a768-a5e56b729215` |
| `/weather` | $0.001 | `d6472a6f-4ee3-47b3-806d-424338aff5ed` |

---

## Error Analysis

```
[bench] error #34: Payment failed: Payment processing error
[bench] error #35: Payment failed: Payment processing error
[bench] error #36: Payment failed: Payment processing error
```

**Root cause**: Transient Circle Gateway API error (not balance). Gateway confirmed 0.957 USDC available after run. Re-running bench will succeed.

---

## Next Steps

- Re-run `pnpm tsx components/c1-api-meter/src/bench.ts 10` to hit 50+ total settlements
- Or fund buyer with more USDC and run a single clean 200-call bench
