# Fees, precision, PPMT — pay2play-arc

This document is the source of truth for the math and economics of pay2play-arc.
It mirrors [pay2play-algo's `docs/fees.md`](https://github.com/AgenticPlace/pay2play-algo/blob/main/docs/fees.md);
the API is symmetric across both chains.

- [Precision guarantees](#precision-guarantees)
- [Default fee table per component](#default-fee-table-per-component)
- [Fee breakdown formula](#fee-breakdown-formula)
- [PPMT — Profit Per Million Transactions](#ppmt--profit-per-million-transactions)
- [Worked examples](#worked-examples)
- [How to change fees](#how-to-change-fees)
- [Margin analysis vs other chains](#margin-analysis-vs-other-chains)

---

## Precision guarantees

**Zero floating-point arithmetic on money.** Every price, every fee, every
total runs through bigint atomic units. A `Number` appears in the math path
only as the basis-point integer in `applyBps(amount, bps)`, where
`bps ∈ [0, 10000]`.

Supported precision range:

| Token | Decimals | Atomic unit | Smallest billable amount |
|---|---|---|---|
| USDC (Arc, Base, Polygon, Arb, OP) | **6** | 10⁻⁶ USDC | $0.000001 |
| EURC | 6 | 10⁻⁶ EURC | €0.000001 |
| WETH / DAI | **18** | wei | 10⁻¹⁸ ETH |
| Generic ERC-20 | 0–18 | per-token | per-token |

Up to **18 fractional decimals** are supported (the canonical EVM ceiling).
The `parseDecimal` engine **refuses** input with more fractional digits than
the declared precision — no silent truncation:

```ts
import { parseDecimal, ETH_DECIMALS } from "@pay2play/core";

parseDecimal("0.0000001",            6)  // throws — too many decimals for USDC
parseDecimal("0.000001",             6)  // 1n  (1 atomic USDC = $0.000001)
parseDecimal("0.000000000000000001", 18) // 1n  (1 wei in 18-decimal space)
parseDecimal("0.123456789012345678", 18) // 123_456_789_012_345_678n exactly
```

The drift test in `packages/core/src/decimal.test.ts` sums **1,000,000 random
transactions** and asserts the bigint total equals `unitPrice × totalCount`
exactly — verifying zero drift at million-tx scale.

---

## Default fee table per component

These are the defaults shipped in each component's `src/server.ts`. Every
component reads its base price from a `PAY2PLAY_<axis>_PRICE_USD` env var so
operators can change pricing without rebuilding. Atomic values are at
USDC precision (6 decimals).

| Component | Axis | Env var | Default | Atomic | Per-1M revenue (gross) |
|---|---|---|---|---|---|
| C1 api-meter (`/weather`) | request | `PAY2PLAY_BASE_PRICE_USD` | `$0.001`  | `1_000n` | $1,000.00 |
| C1 api-meter (`/geocode`) | request | (route default) | `$0.002`  | `2_000n` | $2,000.00 |
| C2 agent-loop (`/ask`) | request | (route default) | `$0.0005` | `500n`   | $500.00 |
| C3 llm-stream | tokens | `PAY2PLAY_TOKEN_PRICE_USD` | `$0.00005`/token | `50n` | $50.00 |
| C4 dwell-reader | dwell | `PAY2PLAY_PARAGRAPH_PRICE_USD` | `$0.0001`/paragraph | `100n` | $100.00 |
| C5 mcp-tool | request | (default) | `$0.001`/call | `1_000n` | $1,000.00 |
| C6 frame-classifier | frames | `PAY2PLAY_FRAME_PRICE_USD` | `$0.0005`/frame | `500n` | $500.00 |
| C7 row-meter | rows | `PAY2PLAY_ROW_PRICE_USD` | `$0.0001`/row | `100n` | $100.00 |
| C9 agent-identity | request | `PAY2PLAY_BASE_PRICE_USD` | `$0.002`/op | `2_000n` | $2,000.00 |

Optional knobs (apply to any component that uses `feeConfig`):

| Env var | Meaning | Default |
|---|---|---|
| `PAY2PLAY_FEE_BPS` | facilitator fee in basis points (1 bp = 0.01%) | unset (0) |
| `PAY2PLAY_GAS_OVERHEAD_USD` | amortised batch-settlement gas per call, in USD | unset (0) |
| `PAY2PLAY_ADMIN_KEY` | enables `/admin/fees` router on C9 | unset (router off) |
| `PAY2PLAY_FEE_CONFIG_PATH` | persistent JSON path for admin POSTs | unset (in-memory only) |

---

## Fee breakdown formula

Every paid response (and the `/admin/fees` GET, when enabled) returns a
`PriceBreakdown` shaped like this:

```ts
{
  totalAtomic, totalDisplay,
  components: {
    base:           { atomic, display },   // basePriceAtomic × count
    facilitatorFee: { atomic, display },   // applyBps(base, bps)
    gasOverhead:    { atomic, display },   // gasOverheadAtomic × count
  },
  netMarginAtomic, netMarginDisplay,        // base − fees − gas (clamped ≥ 0)
  ppmtAtomic, ppmtDisplay,                   // netMargin × 1_000_000
  netMarginBps,                              // floor((netMargin / base) × 10000)
  decimals, symbol,
}
```

Order of operations (all bigint, in this exact order):

1. **`base = basePriceAtomic × count`** — buyer's gross obligation.
2. **`facilitatorFee = (base × bps) / 10000`** — floor-rounded; merchant absorbs the remainder.
3. **`gasOverhead = gasOverheadAtomic × count`** — amortised per priced unit (batch gas / batch size).
4. **`netMargin = max(base − facilitatorFee − gasOverhead, 0)`** — clamped to zero on loss-making configs.
5. **`ppmt = netMargin × 1_000_000`** — Profit Per Million Transactions.
6. **`netMarginBps = floor((netMargin / base) × 10000)`** — effective margin in bps; `-1` if `base = 0`.

Total paid by the buyer is `base` (gross). Fees come out of the merchant's net.

---

## PPMT — Profit Per Million Transactions

**PPMT = `netMarginAtomic × 1_000_000n`**

It's a sizing metric: how much net revenue does **1 million repetitions of
this priced unit** generate, after facilitator fee and gas? Use it for capacity
planning, margin tier comparisons, and benchmarking against other settlement networks.

Exact bigint multiplication ensures no rounding drift even at extreme scale —
1M × any 60-bit integer fits comfortably in a JS bigint.

`ppmtDisplay` formats the result at the token's full precision. Examples below.

---

## Worked examples

### Example 1: C1 default — single API call

```
basePriceAtomic   = 1_000n     ($0.001)
facilitatorFeeBps = 0
gasOverheadAtomic = 0n
count             = 1
```

- base           = 1_000n
- facilitatorFee = 0n
- gasOverhead    = 0n
- **netMargin    = 1_000n**     →  $0.001 USDC
- **ppmt         = 1_000_000_000n** →  **$1,000.00 / 1M txs**
- netMarginBps   = 10_000        →  100% margin (no fees)

### Example 2: C1 with 30 bps + amortised batch gas

```
basePriceAtomic   = 1_000n
facilitatorFeeBps = 30                     (PAY2PLAY_FEE_BPS=30)
gasOverheadAtomic = 30n                    (PAY2PLAY_GAS_OVERHEAD_USD=0.00003)
count             = 1
```

- base           = 1_000n
- facilitatorFee = (1_000 × 30) / 10000 = **3n**
- gasOverhead    = 30n
- netMargin      = 1_000 − 3 − 30 = **967n**           →  $0.000967
- ppmt           = 967n × 1_000_000 = **967_000_000n** →  **$967.00 / 1M txs**
- netMarginBps   = (967 × 10_000) / 1_000 = **9_670**  →  96.70% margin

### Example 3: C3 LLM stream — 1M tokens served

C3's metering is per-token. The interesting question: how much does a long
session earn?

```
basePriceAtomic = 50n      ($0.00005/token)
count           = 1_000_000   (1M tokens streamed)
```

- base           = 50_000_000n   →  $50.00 USDC gross
- netMargin      = 50_000_000n   →  $50.00 (no fees)
- ppmt           = 50_000_000_000_000n → 50,000,000 USDC

(PPMT at count=N means "1M repetitions of this batch of N tokens" — so for
count=1M tokens that's 1M batches × 1M tokens = 1 trillion tokens total, an
astronomical number. For the realistic million-tx PPMT, set count=1.)

### Example 4: C4 dwell-reader — slow reader

```
basePriceAtomic = 100n     ($0.0001/paragraph)
count           = 25       (one full article)
```

- base           = 2_500n        →  $0.0025 per article
- netMargin      = 2_500n        →  $0.0025
- ppmt           = 2_500_000_000n → $2,500.00 (revenue at 1M articles fully read)

### Example 5: C9 AgenticPlace job — full ERC-8183 lifecycle

```
basePriceAtomic   = 2_000n   ($0.002/job)
facilitatorFeeBps = 30
gasOverheadAtomic = 30n
count             = 1
```

- base           = 2_000n
- facilitatorFee = (2_000 × 30) / 10_000 = **6n**
- gasOverhead    = 30n
- netMargin      = 2_000 − 6 − 30 = **1_964n**  →  $0.001964
- ppmt           = 1_964n × 1_000_000 = **1_964_000_000n** →  **$1,964.00 / 1M jobs**
- netMarginBps   = (1_964 × 10_000) / 2_000 = **9_820** → 98.20% margin

This is what `GET /admin/fees` returns when C9 is started with
`PAY2PLAY_BASE_PRICE_USD=0.002 PAY2PLAY_FEE_BPS=30 PAY2PLAY_GAS_OVERHEAD_USD=0.00003`.

---

## How to change fees

Three layers, each appropriate for different operational modes:

### Layer 1: env vars (canonical, restart-required)

Set before starting the component:

```bash
PAY2PLAY_BASE_PRICE_USD=0.002    \
PAY2PLAY_FEE_BPS=30              \
PAY2PLAY_GAS_OVERHEAD_USD=0.00003 \
PORT=3009 SELLER_ADDRESS=0x...   \
pnpm --filter @pay2play/c9-agent-identity start
```

Each component logs its effective price on startup. `GET /` returns the
current pricing block.

### Layer 2: HTTP admin endpoint (live + persisted)

Enable on C9 by setting `PAY2PLAY_ADMIN_KEY`:

```bash
PAY2PLAY_ADMIN_KEY=$(openssl rand -hex 32) \
PAY2PLAY_FEE_CONFIG_PATH=/var/p2p/fees.json \
... pnpm --filter @pay2play/c9-agent-identity start
```

Then:

```bash
# Read current effective config
curl -H "X-Admin-Key: $KEY" http://localhost:3009/admin/fees

# Update — partial bodies preserve un-touched fields
curl -X POST -H "X-Admin-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"basePrice": "0.005"}' \
  http://localhost:3009/admin/fees
```

Response includes `applied.{persisted, live, restartRequired}`. Today
`restartRequired=true` because the meter closure captures price at startup;
the persisted JSON applies on next process boot. (See plan: a follow-up will
hot-reload via `setLiveConfig`.)

### Layer 3: on-chain (Algorand only — see [pay2play-algo](https://github.com/AgenticPlace/pay2play-algo))

Arc has no per-component on-chain fee setter today. ERC-8004 / ERC-8183 fees
are implicit in the ERC-20 `value` field of each settlement, and that's
controlled by the server's fee config. A `FeeRegistry.vy` contract is
reserved for a future release; for now, env or admin-endpoint changes
are the path.

---

## Margin analysis vs other chains

Same single-tx breakdown ($0.001 USDC per call, 100-tx batch, default config)
across L2s. Net margin per tx:

| Chain | Gas / tx (median) | Per-tx margin | Verdict |
|---|---|---|---|
| Ethereum L1 | ~$0.50  | **−$0.499** | ❌ −49,900% |
| Optimism    | ~$0.004 | **−$0.003** | ❌ −300% |
| Base L2     | ~$0.001 | **±$0**     | ⚠️ break-even |
| Arbitrum    | ~$0.0008 | **+$0.0002** | ⚠️ thin |
| **Arc + Gateway batched** | **~$0.00003** | **+$0.000967** | ✅ **+96.70%** |

Full breakdown in [`docs/08-margin-analysis.md`](./08-margin-analysis.md). The
single-line takeaway: pay2play's $0.001 call earns **97% net margin on Arc**;
on Base it earns nothing; on Ethereum L1 it loses a dollar per request.

PPMT projections at default 30 bps + $0.00003 gas:

| Chain | PPMT (1M txs) |
|---|---|
| Ethereum L1 | **−$498,800,000** |
| Optimism | −$3,000,000 |
| Base L2 | $0 |
| Arbitrum | +$200,000 |
| **Arc + Gateway** | **+$967,000** |

The PPMT calculator script outputs this table for any fee config:

```bash
PAY2PLAY_BASE_PRICE_USD=0.001 \
PAY2PLAY_FEE_BPS=30           \
PAY2PLAY_GAS_OVERHEAD_USD=0.00003 \
pnpm tsx scripts/ppmt-calculator.ts
```
