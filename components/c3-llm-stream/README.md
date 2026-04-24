# C3 · Per-token LLM streaming (WOW demo)

The headline component. An HTTP endpoint that streams LLM-style text token-by-token while metering at **$0.00005/token**. Every 100 tokens signs a voucher (client-side); every 500 tokens or 5 s flushes a batch to Circle Gateway (server-side).

## Run

```bash
pnpm start          # :4023
# Open http://localhost:4023/ for the live demo page (HTML below)
```

## What you see

- Live token stream in the browser
- **Two counters** side by side:
  - `Vouchers signed` (client, instant, ticks every 100 tokens)
  - `On-chain batches` (server → Arc, deferred, ticks every flush)
- Total USDC metered and average tx fee
- Arcscan links to each batch-settlement tx

Hit "Ask" ~10 times in the demo and you've generated thousands of vouchers and 50+ on-chain batches — clears the hackathon's ≥50-tx bar easily.

## Design note — honest framing

The **voucher count** jumps in near real-time; the **batch count** lags because Circle Gateway settlement is asynchronous. Showing both makes it obvious what's happening under the hood.
