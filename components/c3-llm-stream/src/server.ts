/**
 * C3 — streaming per-token paywall (THE WOW DEMO).
 *
 * Architecture:
 *   browser ⇄ /stream  (SSE: chunk events + charge events)
 *   server  ─► Circle Gateway (flush every N vouchers or T seconds)
 *
 * Set OPENAI_API_KEY to stream real GPT-4o-mini tokens.
 * Without it, a synthetic LLM runs the identical metering path — no key needed for demo.
 */
import express, { type Request, type Response } from "express";
import {
  meter,
  ARC_TESTNET,
  Session,
  mkVoucherId,
  type Voucher,
  type UsageSignal,
} from "@pay2play/core";

const PORT = Number(process.env.C3_PORT ?? "4023");

const SELLER_ADDRESS = process.env.SELLER_ADDRESS;
if (!SELLER_ADDRESS) {
  console.warn("[c3] SELLER_ADDRESS not set — using demo placeholder; payments are simulated");
}
const SELLER = SELLER_ADDRESS ?? "0x000000000000000000000000000000000000abcd";

const PRICE_PER_TOKEN = 0.00005;
const TOKENS_PER_VOUCHER = 100;
const VOUCHERS_PER_BATCH = 5;
const MAX_FLUSH_MS = 5000;
const MAX_SSE_SUBS = 50;

const m = meter({
  tokens: (s) => `$${(s.count * PRICE_PER_TOKEN).toFixed(6)}`,
});

// Optional real OpenAI client — loaded once at startup if OPENAI_API_KEY is set.
let openaiClient: import("openai").default | null = null;
if (process.env.OPENAI_API_KEY) {
  const { default: OpenAI } = await import("openai");
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log("[c3] OpenAI client ready — streaming real GPT-4o-mini tokens");
} else {
  console.log("[c3] No OPENAI_API_KEY — using synthetic LLM (demo mode)");
}

// Yield tokens from real OpenAI stream or synthetic fallback.
async function* llmStream(prompt: string): AsyncGenerator<string> {
  if (openaiClient) {
    const stream = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  } else {
    const words = fakeLlm(prompt).split(/(\s+)/).filter(Boolean);
    for (const word of words) {
      await new Promise<void>((r) => setTimeout(r, 15 + Math.random() * 25));
      yield word;
    }
  }
}

function fakeTxHash(): string {
  return "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

// Shared pub/sub for the live-dashboard stats channel
type StatsUpdate = {
  vouchersSigned: number;
  vouchersFlushed: number;
  batchesSettled: number;
  lastTxs: string[];
  mode: "real" | "simulated";
};
let stats: StatsUpdate = {
  vouchersSigned: 0,
  vouchersFlushed: 0,
  batchesSettled: 0,
  lastTxs: [],
  mode: openaiClient ? "real" : "simulated",
};
const statsSubs = new Set<Response>();

function publishStats(): void {
  const data = `data: ${JSON.stringify(stats)}\n\n`;
  for (const r of statsSubs) {
    try { r.write(data); } catch { statsSubs.delete(r); }
  }
}

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// --- Static HTML demo ---------------------------------------------------
app.get("/", (_req, res) => {
  res.type("html").send(HTML);
});

// --- /stats/subscribe (SSE) ---------------------------------------------
app.get("/stats/subscribe", (_req, res) => {
  if (statsSubs.size >= MAX_SSE_SUBS) {
    res.status(503).json({ error: "too many subscribers" });
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify(stats)}\n\n`);
  statsSubs.add(res);
  res.on("close", () => statsSubs.delete(res));
});

// --- /stream (SSE LLM-style response) ------------------------------------
app.post("/stream", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { prompt?: string };
  const prompt = (body.prompt ?? "Tell me a story about Arc nanopayments").slice(0, 500);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const emit = (event: string, data: unknown) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const session = new Session({
    flushEveryN: VOUCHERS_PER_BATCH,
    flushEveryMs: MAX_FLUSH_MS,
    onFlush: async (vs: Voucher[]) => {
      // Simulated Gateway settlement — real path requires browser-signed EIP-3009 vouchers.
      // Structure is identical; swap fakeTxHash() for BatchFacilitatorClient.settle() when live.
      await new Promise<void>((r) => setTimeout(r, 800 + Math.random() * 400));
      const tx = fakeTxHash();
      stats.lastTxs = [tx, ...stats.lastTxs].slice(0, 8);
      emit("settled", { count: vs.length, tx });
      return 1;
    },
    onCounterChange: (c) => {
      stats.vouchersSigned = c.vouchersSigned;
      stats.vouchersFlushed = c.vouchersFlushed;
      stats.batchesSettled = c.batchesSettled;
      emit("counters", c);
      publishStats();
    },
  });

  let tokenCount = 0;
  let since = 0;

  const recordVoucher = async (count: number) => {
    const signal: UsageSignal = { kind: "tokens", count };
    const id = mkVoucherId();
    const price = m.price(signal);
    emit("charge", { id, signal, price });
    await session.record({
      id,
      signal,
      payload: {
        x402Version: 2,
        payload: {
          signature: "0x00" as `0x${string}`,
          authorization: {
            from: "0x0000000000000000000000000000000000000000" as `0x${string}`,
            to: SELLER as `0x${string}`,
            value: (count * Math.round(PRICE_PER_TOKEN * 1e6)).toString(),
            validAfter: "0",
            validBefore: "9999999999",
            nonce: ("0x" + id.replace(/-/g, "").padEnd(64, "0")) as `0x${string}`,
          },
        },
        resource: {
          url: `${req.protocol}://${req.get("host") ?? "localhost"}/stream`,
          description: "Per-token streaming",
          mimeType: "text/event-stream",
        },
      },
      signedAt: Date.now(),
    });
  };

  try {
    for await (const token of llmStream(prompt)) {
      if (res.writableEnded) break;
      emit("chunk", { text: token });
      tokenCount++;
      since++;

      if (since >= TOKENS_PER_VOUCHER) {
        await recordVoucher(since);
        since = 0;
      }
    }

    if (since > 0) {
      await recordVoucher(since);
    }

    await session.close();
    emit("done", { tokens: tokenCount, mode: stats.mode });
  } catch (err) {
    console.error("[c3] stream error:", err);
    try { emit("error", { message: String(err) }); } catch {}
  } finally {
    res.end();
  }
});

// --- Landing HTML --------------------------------------------------------
const HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>pay2play · C3 · per-token streaming</title>
<style>
body { font-family: -apple-system, Segoe UI, sans-serif; margin: 0; background: #0b1120; color: #e2e8f0; }
header { padding: 1.5rem 2rem; border-bottom: 1px solid #1f2937; }
h1 { margin: 0; font-size: 1.2rem; letter-spacing: 0.02em; }
.sub { color: #94a3b8; margin-top: 0.3rem; font-size: 0.9rem; }
main { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1rem; padding: 1.5rem 2rem; }
.panel { background: #111827; border: 1px solid #1f2937; border-radius: 10px; padding: 1rem 1.2rem; }
textarea { width: 100%; height: 4rem; background: #0b1120; color: #e2e8f0; border: 1px solid #1f2937; border-radius: 6px; padding: 0.5rem 0.7rem; font-size: 0.95rem; box-sizing: border-box; }
button { background: #6366f1; color: white; border: 0; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.95rem; cursor: pointer; margin-top: 0.5rem; }
button:disabled { opacity: 0.5; cursor: default; }
#output { white-space: pre-wrap; line-height: 1.5; margin-top: 1rem; font-size: 0.95rem; max-height: 50vh; overflow: auto; }
.counters { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; margin-bottom: 1rem; }
.c { background: #0f172a; padding: 0.8rem; border-radius: 8px; border: 1px solid #1f2937; }
.c .n { font-size: 1.7rem; font-weight: 700; color: #22d3ee; }
.c.settled .n { color: #22c55e; }
.c .lbl { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.07em; }
#txs { font-size: 0.85rem; font-family: ui-monospace, monospace; }
#txs a { color: #a78bfa; text-decoration: none; }
#txs a:hover { text-decoration: underline; }
.pill { display: inline-block; padding: 0.15rem 0.5rem; background: #1f2937; border-radius: 4px; font-size: 0.75rem; color: #94a3b8; }
.err { color: #ef4444; font-size: 0.85rem; margin-top: 0.5rem; }
</style>
</head>
<body>
<header>
  <h1>pay2play · C3 · per-token streaming <span class="pill">Arc Testnet</span></h1>
  <div class="sub">$${PRICE_PER_TOKEN.toFixed(5)} USDC per token · 1 voucher per ${TOKENS_PER_VOUCHER} tokens · batch every ${VOUCHERS_PER_BATCH} vouchers or ${MAX_FLUSH_MS / 1000}s · mode: <b id="mode" style="color:#22d3ee">…</b></div>
</header>
<main>
  <section class="panel">
    <label for="prompt" style="font-size:0.85rem;color:#94a3b8;">Prompt</label>
    <textarea id="prompt" placeholder="Ask anything...">Explain how Circle Gateway batching makes sub-cent nanopayments viable on Arc.</textarea>
    <button id="go">Ask</button>
    <div id="err" class="err"></div>
    <div id="output"></div>
  </section>
  <aside class="panel">
    <div class="counters">
      <div class="c"><div class="lbl">Vouchers signed</div><div class="n" id="signed">0</div></div>
      <div class="c settled"><div class="lbl">On-chain batches</div><div class="n" id="batches">0</div></div>
    </div>
    <div style="font-size:0.85rem;color:#94a3b8;margin-bottom:0.3rem;">Vouchers flushed: <b id="flushed" style="color:#e2e8f0;">0</b></div>
    <div style="font-size:0.85rem;color:#94a3b8;margin-bottom:0.6rem;">Total metered: <b id="total" style="color:#e2e8f0;">$0.000000</b></div>
    <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:0.3rem;">Recent batch settlements</div>
    <div id="txs"></div>
  </aside>
</main>

<script>
const out    = document.getElementById('output');
const errEl  = document.getElementById('err');
const btn    = document.getElementById('go');
const sigEl  = document.getElementById('signed');
const flEl   = document.getElementById('flushed');
const bEl    = document.getElementById('batches');
const totEl  = document.getElementById('total');
const txsEl  = document.getElementById('txs');
const modeEl = document.getElementById('mode');

function updateStats(s) {
  sigEl.textContent = s.vouchersSigned;
  flEl.textContent  = s.vouchersFlushed;
  bEl.textContent   = s.batchesSettled;
  totEl.textContent = '$' + (s.vouchersSigned * ${TOKENS_PER_VOUCHER} * ${PRICE_PER_TOKEN}).toFixed(6);
  if (s.mode) modeEl.textContent = s.mode;
  if (s.lastTxs && s.lastTxs.length) {
    txsEl.innerHTML = s.lastTxs.map(tx =>
      \`<div><a href="https://testnet.arcscan.app/tx/\${tx}" target="_blank">\${tx.slice(0,22)}…</a></div>\`
    ).join('');
  }
}

const evtSrc = new EventSource('/stats/subscribe');
evtSrc.onmessage = (ev) => updateStats(JSON.parse(ev.data));

btn.onclick = async () => {
  btn.disabled = true;
  out.textContent = '';
  errEl.textContent = '';
  const prompt = document.getElementById('prompt').value;
  try {
    const resp = await fetch('/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!resp.ok) { errEl.textContent = 'Server error ' + resp.status; btn.disabled = false; return; }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\\n\\n')) !== -1) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2);
        const nl = frame.indexOf('\\n');
        if (nl === -1) continue;
        const ev = frame.slice(0, nl).replace(/^event:\\s*/, '');
        const d  = JSON.parse(frame.slice(nl + 1).replace(/^data:\\s*/, ''));
        if (ev === 'chunk')   out.textContent += d.text;
        if (ev === 'error')   errEl.textContent = 'Stream error: ' + d.message;
      }
    }
  } catch (e) {
    errEl.textContent = 'Fetch error: ' + e.message;
  } finally {
    btn.disabled = false;
  }
};
</script>
</body>
</html>`;

function fakeLlm(prompt: string): string {
  const base = prompt.toLowerCase().includes("arc")
    ? ARC_STORY
    : prompt.toLowerCase().includes("agent")
      ? AGENT_STORY
      : GENERAL_STORY;
  return base + " " + base;
}

const ARC_STORY = `Circle Gateway on Arc takes a flurry of tiny, signed authorizations from many agents and merges them into a single settlement transaction on-chain. Because USDC itself is the gas token on Arc, the marginal cost of each authorization is effectively zero. A thousand per-token charges of $0.00005 each sum to $0.05 in revenue; the batch costs only a few cents of gas. That is why per-token, per-frame, per-paragraph-dwell pricing — unthinkable on Ethereum or even L2s — becomes viable here. The agent signs EIP-3009 authorizations as easily as it types; the chain only sees the net. This is what makes agentic economies possible: pricing that actually matches what the machine does, settled in dollars that the merchant can bank. Everything that prior winners rebuilt for one vertical is now a library call.`;
const AGENT_STORY = `An autonomous agent exists in the margins of a human economy. It cannot hold a bank account, cannot pass KYC, cannot manage a subscription. The closest it comes to economic agency is signing messages with a private key nobody else holds. On Arc, signing is enough: a signed authorization is legal tender when a facilitator verifies it. An agent can earn, an agent can spend, and another agent can trust what the chain confirms. pay2play gives every agent a meter — per token of output, per frame of analysis, per row of data, per second of attention — and a settlement lane that does not care whether the payer is a human or a neural network somewhere in Santa Clara.`;
const GENERAL_STORY = `Imagine paying a tenth of a cent every time you read a paragraph, a cent for each API call, a dollar for a long-running compute task. Now imagine every one of those charges happens with no credit card, no subscription, no reconciliation team, and no month-end surprise. On Arc, the stablecoin is the gas; on Gateway, the batch is free; in pay2play, the meter is a library. The thousand things we used to hand-wave as "too small to bill for" are now the primitive we bill from.`;

app.listen(PORT, () => {
  console.log(`[c3] on http://localhost:${PORT}`);
  console.log(`[c3] seller: ${SELLER}`);
  console.log(`[c3] llm: ${openaiClient ? "OpenAI gpt-4o-mini (real)" : "synthetic (demo)"}`);
});
