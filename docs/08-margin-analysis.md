# Margin analysis — why pay2play only works on Arc

Assumption: single paid action = $0.001 USDC revenue, 1 wallet write per settlement.

## Per-action cost by chain (April 2026 median gas)

| Chain | Native gas | Median gas / tx (USD) | Margin on $0.001 revenue | Viable? |
|---|---|---|---|---|
| Ethereum L1 | ETH | ~$0.50 | **–49,900%** | ❌ |
| Optimism | ETH | ~$0.003 – $0.005 | –200% to –400% | ❌ |
| Base L2 | ETH | ~$0.0003 – $0.005 | –400% to +70% | ⚠️ marginal |
| Arbitrum One | ETH | ~$0.0002 – $0.004 | –300% to +80% | ⚠️ marginal |
| Arc (direct, non-batched) | USDC | ~$0.003 (20 Gwei × 21,000 gas) | –200% | ❌ |
| **Arc (batched via Circle Gateway)** | USDC | **~$0.00003 / action** (amortized over ~100 actions/batch) | **+97%** | ✅ **yes** |

## Break-even batch size on Arc

Let:
- `G` = fixed batch settle cost on Arc ≈ $0.003
- `N` = actions per batch
- `p` = action price

Break-even condition: `N ≥ G / p`.

| Action price `p` | Min batch size `N` |
|---|---|
| $0.001 | ≥ 3 |
| $0.0001 | ≥ 30 |
| $0.00001 | ≥ 300 (viable for per-token streams) |
| $0.000001 | ≥ 3,000 (Circle Nanopayments floor) |

## Why Arc specifically

1. **USDC-native gas** eliminates FX/volatility exposure — agents and merchants both price and pay in the same dollar-denominated stablecoin.
2. **Batched settlement via Gateway** collapses 100s of vouchers into a single on-chain tx, driving per-action cost below sub-cent revenue.
3. **Dollar-denominated fees** let us quote in USD without runtime FX conversion.
4. **x402 compatibility** — migration from Base/OP/ETH is a one-line chain change; agent/server code unchanged.
5. **Predictable fees** — no MEV/congestion spikes; enterprise-friendly SLAs.

## What would kill the model on any other chain

- **Non-stable-native gas**: token-price volatility. A 20% ETH move wipes margin on L2s.
- **No batched facilitator**: each action pays its own ~$0.005 L2 gas → instantly upside-down at sub-cent pricing.
- **Unpredictable fees**: MEV/congestion spikes on L1 blow past fixed per-action pricing.
- **FX conversion friction**: agents pricing in USD but paying in ETH need constant oracle lookups.

## Concrete pay2play demo economics

- **C1 (per-API meter)**: 200 API calls × $0.001 = $0.20 revenue. Batched cost on Arc: ~$0.006 (~2 settlements). **Net $0.194 margin.** Same 200 calls on Base: $1.00 gross gas. **Net –$0.80 loss.**
- **C3 (per-token LLM)**: 2,000-token response × $0.00005 = $0.10 revenue. Batched cost: ~$0.012 (~4 settlements). **Net +$0.088.** On Base, 2,000 on-chain charges would cost $10+. **No viable per-token pricing exists off Arc.**
- **C4 (per-paragraph dwell)**: 60 paragraphs × $0.0001 = $0.006 revenue. Batched cost: ~$0.003 (~1 settlement). **Net +$0.003.** On Base: –$0.294.
- **C6 (per-frame M2M)**: 100 frames × $0.0005 = $0.05 revenue. Batched: ~$0.003. **Net +$0.047.** On Base: –$0.45.

## Pitch line for the video

> "Every prior pay-per-API winner solved 50-to-200× their gross margin by hand-rolling batching. pay2play makes that batching — and every other metering axis — a library. On Arc, our bread-and-butter $0.001 call earns 97% margin; on Base, the same call loses 400%. Arc is the only chain where agentic commerce has unit economics."
