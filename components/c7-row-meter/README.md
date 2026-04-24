# C7 · Per-row data query

Paid data endpoint: each returned row costs $0.0001. Open-data-marketplace pattern.

## Run

```bash
pnpm start   # :4027
curl 'http://localhost:4027/data?limit=50'       # → 402 at $0.005 (50 rows × $0.0001)
curl 'http://localhost:4027/data?limit=1000'     # → 402 at $0.10
```

The price is **computed from `limit`** at request time — that's the key trick: `UsageSignal = {kind:"rows", count: limit}`.
