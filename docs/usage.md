# pay2play — Usage Guide

Practical walkthrough from zero to live payments on Arc testnet.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | v22+ | required by `@circle-fin/x402-batching` |
| pnpm | v9+ | `npm i -g pnpm` |
| Arc Testnet USDC | ≥ 2 USDC | from https://faucet.circle.com — 20 USDC / 2h / address |

---

## 1. Install

```bash
git clone <repo>
cd pay2play
pnpm install
pnpm --filter @pay2play/core build
pnpm --filter @pay2play/server build
pnpm --filter @pay2play/client build
pnpm --filter @pay2play/bridge build
```

---

## 2. Generate a wallet pair

```bash
pnpm tsx scripts/generate-wallets.ts
```

Outputs two fresh EOAs and an `.env` snippet:

```
SELLER_ADDRESS=0x...
SELLER_PRIVATE_KEY=0x...
BUYER_ADDRESS=0x...
BUYER_PRIVATE_KEY=0x...
```

Copy the snippet to `.env` at repo root. The seller receives payments; the buyer signs and pays.

---

## 3. Fund wallets from faucet

1. Go to https://faucet.circle.com
2. Select **Arc Testnet**
3. Paste **buyer address** → request 20 USDC
4. Paste **seller address** → request 20 USDC (optional — seller only needs gas)

Check balances:

```bash
pnpm tsx scripts/fund.ts
# Seller USDC: 20.00
# Buyer USDC:  20.00
```

---

## 4. Deposit buyer USDC into Circle Gateway (one-time)

The Gateway requires an on-chain deposit before any gasless payments can flow. This is a real EVM transaction (not gasless).

```bash
pnpm tsx scripts/gateway-deposit.ts 1
# Depositing 1 USDC into Circle Gateway...
# deposit tx: 0x63a420...
# Gateway available: 1.000000 USDC

# Verify balance:
pnpm tsx scripts/gateway-balance.ts
# gateway available: 1.000000
# gateway pending:   0.000000
```

You only need to do this once per buyer wallet. The Gateway holds the USDC pool; subsequent payments deduct from it without on-chain transactions.

---

## 5. Run the smoke test

Verifies the HTTP 402 gate is working before running any paid calls:

```bash
bash tests/smoke-test.sh
```

Expected output — four checks, all PASS:

```
[1] GET without payment → expecting 402...  PASS (HTTP 402)
[2] Decoded PAYMENT-REQUIRED header...       PASS (x402Version:2, scheme:exact)
[3] Gateway seller address matches .env...   PASS
[4] Challenge accepts Arc testnet USDC...    PASS
```

---

## 6. Start and test each component

### C1 — Per-API meter (port 4021)

```bash
pnpm --filter c1-api-meter dev
```

Run a quick paid bench (10 calls):

```bash
pnpm tsx components/c1-api-meter/src/bench.ts 10
# 10/10 paid calls OK  $0.010  avg 1.2ms
```

Or a full 200-call run to hit the ≥50 settlement requirement:

```bash
pnpm tsx components/c1-api-meter/src/bench.ts 200
# 200/200 paid calls OK  $0.200  Gateway settlements: 2
```

### C2 — Agent-to-agent payment loop (port 4022)

```bash
# Terminal 1 — start the seller agent
pnpm --filter c2-agent-loop server

# Terminal 2 — run buyer agent (20 rounds)
pnpm tsx components/c2-agent-loop/src/buyer.ts 20
# 20/20 asks answered  $0.010  settlements: 1
```

### C3 — Per-token LLM streaming (port 4023)

Requires `OPENAI_API_KEY` or `GOOGLE_API_KEY` in `.env`.

```bash
pnpm --filter c3-llm-stream start
# Open http://localhost:4023
# Ask a question → watch "Vouchers signed: N" tick up in real time
# "On-chain batches: M" increments every ~500 tokens or 5s
```

### C5 — Paid MCP tool (port 4025)

```bash
pnpm --filter c5-mcp-tool start
# MCP server running at http://localhost:4025/mcp
# Tool: web.search  price: $0.001/call
```

### C6 — Per-frame edge-ML classifier (port 4026)

```bash
pnpm --filter c6-frame-classifier start

# In another terminal:
pnpm tsx scripts/test-c6.ts
# [1] GET /classify without payment → 402 PASS
# [2] Paid classify 3 frames → 200 PASS  $0.0015
```

### C7 — Per-row data query (port 4027)

```bash
pnpm --filter c7-row-meter start

pnpm tsx scripts/test-c7.ts
# [1] GET /data without payment → 402 PASS
# [2] Paid 50 rows → 200 PASS  $0.005
# [3] Paid 100 rows → 200 PASS  $0.010
```

### C8 — Cross-chain bridge demo (port 3008)

```bash
pnpm --filter c8-bridge start

# Free fee estimate (no payment required):
curl "http://localhost:3008/estimate?from=ethereum&to=arcTestnet&amount=10.00"
# {"fee":"0.006000","netReceive":"9.994000","estimatedTime":"< 20s","protocol":"CCTP V2"}

# Paid bridge / swap (requires Gateway deposit):
curl -X POST http://localhost:3008/bridge \
  -H "Content-Type: application/json" \
  -d '{"sourceChain":"ethereum","destinationChain":"arcTestnet","amount":"1.00"}'
```

### C9 — Agent identity + job escrow (port 3009)

```bash
pnpm --filter c9-agent-identity start

pnpm tsx scripts/test-c9.ts
# [1] GET /agent without payment → 402 PASS
# [2] POST /agent/register dryRun → 200 PASS  tx a85df3ab...
# [3] POST /job/create dryRun → 200 PASS  tx 36890f02...
```

Dry-run mode shows the intended contract call without executing — safe for wallets that aren't funded for Arc gas. Remove `dryRun: true` in the request body for live execution.

### C10 — Algorand AVM per-call metering (port 3010)

Requires `ALGO_MNEMONIC` (25-word Algorand account mnemonic) in `.env` and testnet ALGO.

```bash
pnpm --filter c10-algo start
# GET /data → 402 (X-Algo-Payment header required)
# GET /data with payment → 200 (1000 µALGO / call)
```

---

## 7. Full integration test matrix

Run all test scripts against live components:

```bash
bash tests/smoke-test.sh          # C1 HTTP gate
pnpm tsx scripts/test-c6.ts       # C6 frame gate
pnpm tsx scripts/test-c7.ts       # C7 row gate
pnpm tsx scripts/test-c9.ts       # C9 identity gate (dry-run)
pnpm tsx components/c1-api-meter/src/bench.ts 200    # ≥50 settlements
pnpm tsx components/c2-agent-loop/src/buyer.ts 20    # agent-to-agent
```

See `tests/integration-results-2026-04-24.md` for full results (63+ confirmed settlements).

---

## 8. Python layer (optional)

```bash
cd python
pip install -e ".[dev]"

# Start a FastAPI seller protected by Gateway middleware:
python examples/seller.py

# Run a buyer that pays per request:
python examples/buyer.py https://localhost:8000/premium

# Test Vyper contracts with Titanoboa (requires pip install titanoboa):
pytest tests/ -v
```

---

## 9. Environment variables reference

| Variable | Required by | Description |
|---|---|---|
| `SELLER_ADDRESS` | C1–C9 servers | Wallet receiving payments |
| `SELLER_PRIVATE_KEY` | C9, scripts | Signs seller-side transactions |
| `BUYER_ADDRESS` | scripts | Address to check balance |
| `BUYER_PRIVATE_KEY` | C1 bench, C2 buyer, test scripts | Signs payments |
| `OPENAI_API_KEY` | C3 | LLM token streaming |
| `GOOGLE_API_KEY` | C3 | Alternative LLM (Gemini) |
| `THIRDWEB_SECRET_KEY` | server (alt facilitator) | thirdweb x402 facilitator |
| `ALGO_MNEMONIC` | C10 | 25-word Algorand account |

---

## 10. Troubleshooting

**Port already in use (`EADDRINUSE 4021`)**
```bash
kill $(lsof -ti:4021)
```

**`EAI_AGAIN` — Gateway DNS failure**
Transient DNS failure on `gateway-api-testnet.circle.com`. Wait 5s and retry.

**`Payment processing error` mid-bench**
Transient Gateway API error. Not a balance issue. Re-run with a smaller `N` (e.g., 10) to resume.

**Gateway balance shows 0 after faucet**
The faucet sends to your on-chain wallet address, not the Gateway. Run `gateway-deposit.ts` to move funds into the Gateway pool.

**C9 `createJob` reverts**
The job escrow contract requires sufficient USDC for gas on Arc. Use `dryRun: true` for test runs. For live execution, ensure the wallet has ≥0.01 USDC gas.

**`signPayment is not a function`**
Never use `GatewayClient.signPayment` or `.sign` — they are not public exports. Use `gateway.pay(url, opts)` which handles the full 402 challenge/retry cycle.
