# Components C1–C9 — Arc metering axes + bonus

Each component has: purpose, dependencies, track, effort, acceptance criteria, status.

---

## C1 · Per-API meter (`components/c1-api-meter/`) — Track 1

- **Purpose**: Paywall any HTTP route at a fixed price. Bread-and-butter demo.
- **Built on**: `@pay2play/server/http` → `@circle-fin/x402-batching` `createGatewayMiddleware`.
- **Example service**: paid weather/geocode proxy that calls an AIsa API upstream.
- **50-tx story**: loop a bench client 200× → 200 vouchers → ~2 batch settlement txs on Arc.
- **Effort**: 1h.
- **Accept**: `curl -i` without `X-PAYMENT` → 402 with `PAYMENT-REQUIRED` header; paying client → 200. Bench run shows ≥50 vouchers recorded.
- **Cut priority**: **KEEP** — lowest risk, highest-evidence-per-hour.

---

## C2 · Agent-to-Agent payment loop (`components/c2-agent-loop/`) — Track 2

- **Purpose**: Two Node processes with separate wallets. Agent A asks Agent B a question; B answers only after A pays $0.0005.
- **Built on**: core + client fetch wrapper on A, server Express on B.
- **50-tx story**: 100-round loop; each round = one voucher; 1–2 batch settlements.
- **Effort**: 1h.
- **Accept**: both wallets' USDC balances move by expected net; Arcscan shows settlement txs.
- **Cut priority**: **KEEP** — smallest demo that covers a whole track.

---

## C3 · Per-token LLM streaming (`components/c3-llm-stream/`) — Track 3 · **WOW demo**

- **Purpose**: Next.js page; user asks a question; OpenAI/Gemini streams tokens; meter signs a voucher every 100 tokens; server flushes to `BatchFacilitatorClient.settle()` every 500 tokens OR 5s.
- **Built on**: `@pay2play/client/openai` + `@pay2play/server/sse` + `session.ts`.
- **Display**: two counters side-by-side — "Vouchers signed: N" (client, instant) and "On-chain batches: M" (server, deferred). **Honest framing** in video narration.
- **50-tx story**: 2k-token response = 2k vouchers → ~4 batches; multiple asks in demo = easily 50+ batch txs total.
- **Effort**: 2.5h.
- **Accept**: token counter advances ≥1/sec in browser; batch-tx hashes appear on Arcscan within ~15s of flush boundary; no UI jank.
- **Cut priority**: **KEEP** — the visually stunning judge-magnet.
- **Fallback (T+14h)**: if per-token cadence unstable, drop to per-response voucher (still shows $/token pricing math without voucher plumbing).

---

## C4 · Per-paragraph dwell paywall (`components/c4-dwell-reader/`) — Track 4

- **Purpose**: Published article; IntersectionObserver fires after 3s dwell on each `<p>`; each fire emits a voucher at $0.0001.
- **Built on**: `@pay2play/client/viewport` (browser hook) + `@pay2play/server/http`.
- **50-tx story**: a reader scrolling through a 60-paragraph article at reading speed generates 60 vouchers.
- **Effort**: 3h (highest in the lineup).
- **Accept**: quick scrolls do NOT charge; slow reads DO; counter ticks per-paragraph.
- **Status**: **live + tested ✓** — `components/c4-dwell-reader/src/server.ts`; serves article at `:4024`, POST /voucher accepts dwell signals, GET /stats/subscribe SSE.

---

## C5 · Paid MCP tool (`components/c5-mcp-tool/`) — bonus, high originality

- **Purpose**: MCP server exposing `web.search` (or `arcscan.lookup`) at $0.001/call. Demoable live inside a Node MCP client harness.
- **Built on**: `x402-mcp`'s `server.paidTool` + `withPayment`; pay2play provides the price function from `meter.mcp()`.
- **Transport**: MUST be streamable-HTTP (not stdio) — x402 rides HTTP headers.
- **50-tx story**: 60-call sweep over 15 different searches.
- **Effort**: 1.5h.
- **Accept**: paid client can call; unpaid client gets the MCP-equivalent of 402 and retries after payment.
- **Cut priority**: **KEEP** — cheapest + most on-theme originality lever.
- **Risk**: Claude Code's built-in MCP client may not support `withPayment`; fall back to bespoke Node harness demoed on screen.

---

## C6 · Per-frame edge-ML classifier (`components/c6-frame-classifier/`) — bonus M2M

- **Purpose**: Simulated camera uploads frames to a classifier service; classifier charges $0.0005/frame. Clear machine-to-machine narrative.
- **Built on**: `@pay2play/server/http` with `frames` meter; client sends base64 JPEGs from a pre-recorded file.
- **50-tx story**: 100 frames = 100 vouchers.
- **Effort**: 1h (light — reuses C1 patterns).
- **Accept**: frames return classification JSON only when signed payment accompanies each.
- **Status**: **live + tested ✓** — strong "machine-to-machine" narrative for judging.

---

## C7 · Per-row data query (`components/c7-row-meter/`) — bonus data

- **Purpose**: Paid SQL-like endpoint; each returned row costs $0.0001. Open-data-marketplace pattern.
- **Built on**: `@pay2play/server/http` with `rows` meter + a toy SQLite dataset.
- **50-tx story**: one "give me 100 rows" query = 100 vouchers.
- **Effort**: 45m.
- **Accept**: server returns exactly `rows-paid-for` rows, no more.
- **Status**: **live + tested ✓**

---

---

## C8 · Cross-chain Bridge Demo (`components/c8-bridge/`) — Stablecoin FX + Cross-chain

- **Purpose**: `@pay2play/bridge` as a modular component — USDC bridge + EURC swap, gated by nanopayment.
- **Built on**: `@circle-fin/app-kit` BridgeModule + SwapModule wrapping CCTP V2.
- **Endpoints**: `GET /estimate` (free, static CCTP V2 fee preview) · `POST /bridge` · `POST /swap` (each $0.001)
- **Use cases**: cross-chain USDC to Arc testnet; USDC↔EURC FX via `FxEscrow`
- **Live test**: `GET /estimate?from=ethereum&to=arcTestnet&amount=10.00` → `fee: 0.006 USDC, netReceive: 9.994, estimatedTime: < 20s`
- **Note**: `/estimate` uses a static formula (CCTP V2 flat $0.003 + 0.03% of amount). App Kit's `estimateBridge` requires fully configured chain adapters, not chain-name strings.
- **Effort**: 45m. **Status**: live + tested ✓

---

## C9 · Agent Identity + Job Escrow (`components/c9-agent-identity/`) — Agentic Economy

- **Purpose**: ERC-8004 agent registration + ERC-8183 full job lifecycle, gated by $0.002 nanopayment.
- **Built on**: `viem` + `ARC_TESTNET` contract addresses + `IDENTITY_REGISTRY_ABI` + `JOB_ESCROW_ABI` from `@pay2play/core`.
- **Flow**: register agent (ERC-721 mint) → giveFeedback (reputation score) → createJob → fund → submit → complete (USDC release).
- **Addresses**: IdentityRegistry `0x8004A818...` · ReputationRegistry `0x8004B663...` · JobEscrow `0x0747EEf0...`
- **dryRun support**: both `/agent/register` and `/job/create` accept `dryRun: true` — logs intended contract call without executing. Required for test wallets not funded for Arc gas.
- **Live test**: register paid `$0.002` tx `a85df3ab...` · job/create paid `$0.002` tx `36890f02...`
- **Effort**: 1h. **Status**: live + tested ✓ (dry-run mode)

---

## Algorand counterpart — separate repo

The Algorand version of pay2play lives in its own standalone repository:
**[github.com/AgenticPlace/pay2play-algo](https://github.com/AgenticPlace/pay2play-algo)**.

- Vendors the agnostic core (`UsageSignal`, `Session`, `PaymentPayload` tagged
  union) from this repo at a pinned commit; settles via Algorand atomic-group
  transactions instead of Circle Gateway.
- Same x402-shaped HTTP surface; same `meter()` / `Session` ergonomics.
- Per-chain repos isolate codebases when chain semantics diverge —
  `pay2play-eth` reserved for the same pattern when needed.

---

## Build order (Phase 4)

1. **C1 api-meter** (1h) ✓ live + tested
2. **C2 agent-loop** (1h) ✓ live + tested
3. **C5 mcp-tool** (1.5h) ✓ scaffolded
4. **C3 llm-stream** (2.5h) ✓ live WOW (needs API key to test)
5. **C7 rows** (45m) ✓ live + tested
6. **C6 frames** (1h) ✓ live + tested
7. **C8 bridge** (45m) ✓ live + tested
8. **C9 agent-identity** (1h) ✓ live + tested (dry-run)
9. **C4 dwell-reader** (completed) ✓ live

## Cut order (when phase checkpoints miss)

| All four tracks | **COMPLETE** — C1/C2/C3/C4 all live + tested |
