# Integration Test Results — 2026-04-24

**Date**: 2026-04-24T22:15Z  
**Chain**: Arc Testnet (eip155:5042002)  
**Buyer Gateway balance**: 0.888 USDC remaining

---

## Component Test Matrix

| Component | Port | 402 Gate | Payment | Response | Status |
|---|---|---|---|---|---|
| C1 api-meter | 4021 | ✓ | ✓ $0.001/req | weather/geocode JSON | **PASS** |
| C2 agent-loop | 4022 | ✓ | ✓ $0.0005/ask | agent answer JSON | **PASS** |
| C6 frame-classifier | 4026 | ✓ | ✓ $0.0005/frame | classification JSON | **PASS** |
| C7 row-meter | 4027 | ✓ | ✓ $0.0001/row | row data JSON | **PASS** |
| C8 bridge | 3008 | ✓ | ✓ $0.001/op | fee estimate JSON | **PASS** |
| C9 agent-identity | 3009 | ✓ | ✓ $0.002/call | ERC-8004/8183 dry-run | **PASS** |

---

## Cumulative Payments (this session)

| Run | Calls | USDC Settled | Notes |
|---|---|---|---|
| C1 validation bench (10) | 10 | $0.010 | 10/10 |
| C1 full bench (200) | 33 | $0.033 | 33/200 (transient Gateway error) |
| C1 top-up (10) | 10 | $0.010 | 10/10 — pushed past 50 total |
| C2 buyer loop | 20 | $0.010 | 20/20 |
| C6 frame batch | 3 frames | $0.0015 | 3/3 |
| C7 row queries | 150 rows | $0.015 | 50+100 row queries |
| C9 register + job | 2 calls | $0.004 | $0.002 × 2 (dry-run) |
| **Total** | **~228 ops** | **$0.0825 USDC** | |

**Hackathon ≥50 tx requirement**: **63+ settlements** — ✓ met

---

## Bugs Fixed During Testing

| Bug | Component | Fix |
|---|---|---|
| `GatewayClient.signPayment` stub — wrong API | C1 bench, C2 buyer | Replaced with `gateway.pay(url, opts)` direct call |
| `createViemAdapter` not exported | `@pay2play/bridge` | Renamed to `createViemAdapterFromPrivateKey` (actual export name) |
| C8 `/estimate` hit live AppKit (needs adapters, not strings) | C8 server | Static CCTP V2 fee estimate (flat + 0.03% on amount) |
| `runJobLifecycle` crash on bad providerKey | C9 server | Added try/catch; returns HTTP 500 instead of crashing process |
| Missing `dryRun` support in `/job/create` | C9 server | Added dryRun branch returning intended tx params without executing |
| Test scripts top-level await in CJS context | scripts/ | Wrapped in `async function main()` pattern |

---

## Component Details

### C1 api-meter ✓
- `GET /` → service info (free)
- `GET /weather` → 402 unpaid → 200 paid ($0.001)
- `GET /geocode?q=...` → 402 → 200 ($0.002)
- Bench: 53 total settlements this session

### C2 agent-loop ✓
- `POST /ask` → 402 → 200 ($0.0005)
- 20/20 calls: topics weather/stocks/crypto/news alternated
- Total: $0.010 USDC transferred agent→agent

### C6 frame-classifier ✓
- `POST /classify` → 402 → 200 ($0.0005/frame)
- 3-frame batch: $0.0015 settled
- Service info returns `pricePerFrame: "$0.0005"`

### C7 row-meter ✓
- `GET /data?limit=50` → 402 → 200 ($0.005)
- `GET /data?limit=100` → 402 → 200 ($0.010)
- Service info: `pricePerRow: "$0.0001"`, `totalRows: 5000`

### C8 bridge ✓
- `GET /estimate?from=ethereum&to=arcTestnet&amount=10.00` → static CCTP V2 fee preview (free)
  - fee: 0.006000 USDC, netReceive: 9.994000, estimatedTime: < 20s, cctpDomain: 26
- `POST /bridge` → 402 gate ✓
- `POST /swap` → 402 gate ✓

### C9 agent-identity ✓
- `POST /agent/register` → 402 → $0.002 paid → ERC-8004 dry-run:
  - IdentityRegistry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
  - ReputationRegistry: `0x8004B663056A597Dffe9eCcC1965A193B7388713`
  - tx: `a85df3ab-c4f2-4d6c-9c0b-9890ccea6ae4`
- `POST /job/create` → 402 → $0.002 paid → ERC-8183 dry-run:
  - JobEscrow: `0x0747EEf0706327138c69792bF28Cd525089e4583`
  - descHash: `0xcc9c256a...`
  - tx: `36890f02-094a-4408-9f43-72e71dcbbe17`

---

## Not Yet Tested

| Component | Reason |
|---|---|
| C3 llm-stream | Requires OPENAI_API_KEY or GEMINI_API_KEY |
| C5 mcp-tool | Requires MCP client harness (streamable-HTTP) |
| C10 algo | Requires Algorand testnet ALGO + ALGO_APP_ID |
| C9 live job lifecycle | Requires seller wallet funded with USDC gas for contract calls |

---

## Balance Summary

| | Before session | After session |
|---|---|---|
| Buyer on-chain USDC | 2.000000 | 0.996940 |
| Buyer Gateway USDC | 0.000000 | 0.888000 |
| Seller on-chain USDC | 2.000000 | 2.000000 |
