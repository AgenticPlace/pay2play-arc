# C2 · Agent-to-Agent payment loop

Two Node processes with separate wallets. **Agent A** (buyer) asks **Agent B** (seller) a question. Agent B answers only after A pays $0.0005 on Arc. Corresponds to hackathon **Track 2: Agent-to-Agent Payment Loop**.

## Run it

```bash
# Terminal 1 — seller
pnpm server   # Express on :4022, exposes POST /ask at $0.0005

# Terminal 2 — buyer loop (100 rounds)
pnpm demo 100
```

## 50-tx story

100 rounds × $0.0005 = $0.05 total cost → Circle Gateway batches into ~1 settlement every 100 vouchers → at least one on-chain batch settlement. Bump to `pnpm demo 500` for guaranteed 5+ batches.
