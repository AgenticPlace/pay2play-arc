# C1 · Per-API meter

Bread-and-butter demo: an HTTP endpoint paywalled at $0.001/request. Corresponds to hackathon **Track 1: Per-API Monetization Engine**.

## What it does

- Starts an Express server on `:4021`.
- Exposes `GET /weather` — returns paid weather data.
- Exposes `GET /geocode?q=...` — returns paid geocode data at $0.002/request.
- Exposes `GET /` — unprotected landing + stats.
- Every request to a paid endpoint without `payment-signature` → `402` + `PAYMENT-REQUIRED` header.
- Paid request → calls `BatchFacilitatorClient.verify + settle` from `@circle-fin/x402-batching/server`, returns 200 + `PAYMENT-RESPONSE`.

## Run it

```bash
# from repo root
pnpm install
pnpm --filter @pay2play/core build
pnpm --filter @pay2play/server build

# from here
cp ../../.env.example ../../.env    # fill in SELLER_ADDRESS, BUYER_PRIVATE_KEY
pnpm dev                             # starts server on :4021

# in another terminal, bench it:
pnpm bench 200                       # loops 200 paid calls → expect ~2 batch txs
```

## Design notes

- Uses `@pay2play/server/http` `createPaidMiddleware`.
- Uses `@pay2play/core` meter with `request` = `$0.001`, and a route-level override for `/geocode` at `$0.002`.
- The bench script uses `@pay2play/client/fetch` `wrapFetchWithPayment` with a `GatewayClient`-backed sign function.
- Observability hook logs each settlement to a CSV (`./out/settlements.csv`) so we can point at real Arcscan tx hashes in the demo video.

## 50-tx story

`pnpm bench 200` → 200 voucher signs → Circle Gateway batches into ~2 on-chain settlements on Arc testnet → Arcscan shows the batch tx(es).
