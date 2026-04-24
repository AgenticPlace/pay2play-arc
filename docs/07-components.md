# Components C1–C7 — one per hackathon angle

Each component has: purpose, dependencies, track, effort, acceptance criteria, cut priority.

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
- **Cut priority**: **CUT FIRST** if slipping at T+10h. Reframe Track 4 coverage as "dwell primitive lives in `packages/client/src/viewport.ts` (unit-tested); no shipped app". Judges reward scope honesty over coverage theater.

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
- **Cut priority**: **CUT-SECOND** after C4. Narratively strong for "machine-to-machine" judging pitch.

---

## C7 · Per-row data query (`components/c7-row-meter/`) — bonus data

- **Purpose**: Paid SQL-like endpoint; each returned row costs $0.0001. Open-data-marketplace pattern.
- **Built on**: `@pay2play/server/http` with `rows` meter + a toy SQLite dataset.
- **50-tx story**: one "give me 100 rows" query = 100 vouchers.
- **Effort**: 45m.
- **Accept**: server returns exactly `rows-paid-for` rows, no more.
- **Cut priority**: **CUT-THIRD**. Low-drama but trivial to ship.

---

## Build order (Phase 4)

1. **C1 api-meter** (1h)
2. **C2 agent-loop** (1h)
3. **C5 mcp-tool** (1.5h)
4. **C3 llm-stream** (2.5h) ← WOW
5. **C7 rows** (45m — fold into C1 test harness if time-boxed)
6. **C6 frames** (1h — cut at T+17h)
7. **C4 dwell-reader** (3h — **CUT FIRST** at T+10h)

## Cut order (when phase checkpoints miss)

| Checkpoint | If behind: cut |
|---|---|
| T+7h (core SDK round-trips one real Arc settlement) | drop client polish (OpenAI wrapper + viewport) |
| T+10h | cut **C4 dwell-reader** |
| T+14h (C3 streaming stable?) | fall back C3 to per-response (not per-token) |
| T+17h | cut **C6 frame-classifier** then **C7 rows** |
| T+20h (HARD STOP) | ship margin + video + feedback form only |
