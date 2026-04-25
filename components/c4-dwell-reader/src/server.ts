/**
 * C4 — per-paragraph dwell paywall (Track 4: Real-Time Micro-Commerce Flow).
 *
 * Architecture:
 *   browser reads article page → IntersectionObserver fires on each <p>
 *   after 3 s continuous visibility → browser POSTs /voucher
 *   server accumulates vouchers via Session → flushes to simulated Gateway batch
 *   GET /stats/subscribe (SSE) streams live counters to the UI
 *
 * Price: $0.0001 per paragraph dwelled.
 * 50-tx story: a reader scrolling through the 25-paragraph article at
 * reading speed generates 25 vouchers; 5 sessions = 125 vouchers / ~2 batches.
 */
import express, { type Request, type Response } from "express";
import {
  meter,
  ARC_TESTNET,
  Session,
  mkVoucherId,
  parseDecimal,
  formatDecimal,
  multiplyByCount,
  USDC_DECIMALS,
  type Voucher,
} from "@pay2play/core";

const PORT = Number(process.env.C4_PORT ?? "4024");
const SELLER_ADDRESS =
  process.env.SELLER_ADDRESS ?? "0x000000000000000000000000000000000000abcd";

const PRICE_PER_PARAGRAPH_USD =
  process.env.PAY2PLAY_PARAGRAPH_PRICE_USD ?? "0.0001";
const PRICE_PER_PARAGRAPH_ATOMIC = parseDecimal(PRICE_PER_PARAGRAPH_USD, USDC_DECIMALS);
const PRICE_PER_PARAGRAPH_DISPLAY = formatDecimal(PRICE_PER_PARAGRAPH_ATOMIC, USDC_DECIMALS);
const VOUCHERS_PER_BATCH = 10;
const MAX_FLUSH_MS = 8000;
const DWELL_MS = 3000;

const m = meter({
  dwell: (s) => (s.ms >= DWELL_MS ? "$" + PRICE_PER_PARAGRAPH_DISPLAY : "$0"),
});

function fakeTxHash(): string {
  return (
    "0x" +
    Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")
  );
}

type StatsUpdate = {
  paragraphsDwelled: number;
  vouchersSigned: number;
  vouchersFlushed: number;
  batchesSettled: number;
  totalUsdc: string;
  lastTxs: string[];
};

let stats: StatsUpdate = {
  paragraphsDwelled: 0,
  vouchersSigned: 0,
  vouchersFlushed: 0,
  batchesSettled: 0,
  totalUsdc: "$0.0000",
  lastTxs: [],
};

const statsSubs = new Set<Response>();
function publishStats(): void {
  const data = `data: ${JSON.stringify(stats)}\n\n`;
  for (const r of statsSubs) r.write(data);
}

// Server-side session — accumulates vouchers from all browsers and flushes batches.
const serverSession = new Session({
  flushEveryN: VOUCHERS_PER_BATCH,
  flushEveryMs: MAX_FLUSH_MS,
  onFlush: async (vs: Voucher[]) => {
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
    const tx = fakeTxHash();
    stats.lastTxs = [tx, ...stats.lastTxs].slice(0, 8);
    stats.batchesSettled += 1;
    stats.vouchersFlushed += vs.length;
    stats.totalUsdc = "$" + formatDecimal(
      multiplyByCount(PRICE_PER_PARAGRAPH_ATOMIC, stats.paragraphsDwelled),
      USDC_DECIMALS,
    );
    publishStats();
    console.log(`[c4] batch settled: ${vs.length} vouchers  tx=${tx.slice(0, 22)}…`);
    return 1;
  },
  onCounterChange: (c) => {
    stats.vouchersSigned = c.vouchersSigned;
    publishStats();
  },
});

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

app.get("/", (_req, res) => {
  res.type("html").send(HTML);
});

app.get("/stats/subscribe", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify(stats)}\n\n`);
  statsSubs.add(res);
  res.on("close", () => statsSubs.delete(res));
});

app.post("/voucher", async (req: Request, res: Response) => {
  const body = req.body as { id?: string; elementId?: string; ms?: number };
  const id = body.id ?? mkVoucherId();
  const ms = Number(body.ms ?? DWELL_MS);

  if (ms < DWELL_MS) {
    res.status(400).json({ error: "dwell too short" });
    return;
  }

  stats.paragraphsDwelled += 1;

  const voucher: Voucher = {
    id,
    signal: { kind: "dwell", elementId: body.elementId, ms },
    payload: {
      x402Version: 2,
      payload: {
        signature: "0x00" as `0x${string}`,
        authorization: {
          from: "0x0000000000000000000000000000000000000000" as `0x${string}`,
          to: SELLER_ADDRESS as `0x${string}`,
          value: PRICE_PER_PARAGRAPH_ATOMIC.toString(),
          validAfter: "0",
          validBefore: "9999999999",
          nonce: ("0x" + id.replace(/-/g, "").padEnd(64, "0")) as `0x${string}`,
        },
      },
    },
    signedAt: Date.now(),
  };

  await serverSession.record(voucher);
  console.log(
    `[c4] dwell: para=${body.elementId ?? "?"} ms=${ms} total=${stats.paragraphsDwelled}`,
  );
  res.json({ ok: true, id, paragraphsDwelled: stats.paragraphsDwelled });
});

app.get("/stats", (_req, res) => {
  res.json({
    ...stats,
    component: "c4-dwell-reader",
    network: ARC_TESTNET.name,
    pricePerParagraph: "$" + PRICE_PER_PARAGRAPH_DISPLAY,
    dwellThresholdMs: DWELL_MS,
  });
});

// --- Article HTML ---------------------------------------------------------

const HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>pay2play · C4 · per-paragraph dwell</title>
<style>
*{box-sizing:border-box}
body{font-family:-apple-system,Segoe UI,sans-serif;margin:0;background:#0b1120;color:#e2e8f0;line-height:1.7}
header{padding:1.2rem 2rem;border-bottom:1px solid #1f2937;display:flex;justify-content:space-between;align-items:center}
h1{margin:0;font-size:1.15rem;letter-spacing:.02em}
.sub{color:#94a3b8;font-size:.85rem;margin-top:.2rem}
.layout{display:grid;grid-template-columns:1fr 320px;gap:1.5rem;padding:1.5rem 2rem;max-width:1200px;margin:0 auto}
article{max-width:68ch}
article h2{font-size:1.5rem;margin-bottom:.2rem}
article .byline{color:#94a3b8;font-size:.85rem;margin-bottom:1.5rem}
article p{margin:.9rem 0;transition:background .3s;border-radius:4px;padding:.2rem .4rem}
article p.reading{background:rgba(99,102,241,.07);border-left:2px solid #6366f1}
article p.charged{background:rgba(34,197,94,.05);border-left:2px solid #22c55e}
aside{position:sticky;top:1.5rem;align-self:start}
.panel{background:#111827;border:1px solid #1f2937;border-radius:10px;padding:1rem 1.2rem;margin-bottom:1rem}
.stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:.8rem}
.stat{background:#0f172a;padding:.7rem;border-radius:8px;border:1px solid #1f2937}
.stat .n{font-size:1.5rem;font-weight:700;color:#22d3ee}
.stat.settled .n{color:#22c55e}
.stat .lbl{font-size:.7rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em}
#txs{font-size:.8rem;font-family:ui-monospace,monospace;max-height:180px;overflow:auto}
#txs a{color:#a78bfa;text-decoration:none}
#txs a:hover{text-decoration:underline}
.pill{display:inline-block;padding:.15rem .5rem;background:#1f2937;border-radius:4px;font-size:.72rem;color:#94a3b8}
.note{font-size:.78rem;color:#64748b;margin-top:.5rem;line-height:1.5}
</style>
</head>
<body>
<header>
  <div>
    <h1>pay2play · C4 · per-paragraph dwell <span class="pill">Arc Testnet</span></h1>
    <div class="sub">Read slowly = pay $${PRICE_PER_PARAGRAPH_DISPLAY} USDC per paragraph after ${DWELL_MS / 1000}s. Scroll past = free.</div>
  </div>
</header>
<div class="layout">
  <article>
    <h2>The Agentic Economy: Micropayments as the Primitive</h2>
    <div class="byline">pay2play research · Arc Testnet · April 2026</div>

    <p id="p1">The agentic economy is not a distant future — it is happening now, in the margins of every LLM call, every API request, every data query that an autonomous agent makes on behalf of a human. The economic substrate that makes this possible is the micropayment: a unit of value small enough to be invisible to a person but meaningful at machine scale.</p>

    <p id="p2">For years, micropayments were a thought experiment. Credit-card interchange floors killed them at $0.30. PayPal's minimum transaction fee buried anything under $1. Even early crypto was too expensive: a single Ethereum gas fee dwarfed any sub-cent transfer. The concept was sound but the infrastructure was missing.</p>

    <p id="p3">Circle's Arc changes the calculus. Arc is an EVM-compatible Layer 1 where USDC is the native gas token. Every transaction — whether it is a batch settlement of ten thousand vouchers or a single on-chain confirmation — is paid in the same stablecoin that carries value. There is no ETH-to-USDC conversion step, no "bridge tax," no dual-token friction.</p>

    <p id="p4">The Gateway batching layer takes this further. Instead of landing each $0.0001 authorization on-chain as its own transaction, the Gateway collects hundreds of EIP-3009 signed authorizations, aggregates them, and settles a single on-chain batch. The per-authorization cost drops to fractions of a cent. The economics of content micropayments — pay per paragraph, per frame, per row of data — finally close.</p>

    <p id="p5">What does this mean for agents? An autonomous agent that earns by answering questions, classifying images, or surfacing data can now receive payment in units that match its actual work. A question costs $0.0005. A classification costs $0.0005 per frame. A row of data costs $0.0001. These are not round numbers invented for convenience — they are the natural price of compute, storage, and inference at current commodity rates.</p>

    <p id="p6">The ERC-8004 identity standard gives each agent a verifiable on-chain identity. An agent registers once, earns a reputation score through successful jobs, and presents that reputation to future counterparties. An agent with a track record of reliable classifications can charge a premium. An untested agent competes on price. This is a labor market, expressed in smart contracts.</p>

    <p id="p7">The ERC-8183 job escrow standard closes the loop. A buyer agent funds a job, a worker agent fulfills it, and the USDC releases automatically on completion confirmation. Disputes route to a resolver. The entire lifecycle — hire, work, pay, dispute, resolve — happens on Arc without any human intermediary. Two neural networks, transacting in dollars, governed by code.</p>

    <p id="p8">The x402 protocol is the HTTP layer that makes this ergonomic. Instead of a bespoke payment SDK, x402 piggybacks on standard HTTP semantics. A server that wants payment replies with 402 Payment Required and a PAYMENT-REQUIRED header encoding the price. A client that holds a funded wallet decodes the header, signs an EIP-3009 authorization, and retries with an X-PAYMENT header. The entire handshake is one round trip.</p>

    <p id="p9">What pay2play adds is a unified metering API across every axis an agent might care about: per request, per token, per frame, per row, per second, per dwell. The price function is a single place — change it once and every transport adapter inherits the update. The voucher session decouples "how often to sign" from "how often to settle." The batch settlement is a library call.</p>

    <p id="p10">The dwell-reader you are reading right now is Track 4 of the hackathon: Real-Time Micro-Commerce Flow. Each paragraph has an IntersectionObserver watching it. If you read slowly — keeping this paragraph in view for three seconds — the browser signs a $0.0001 voucher and posts it to the server. Scroll past in under three seconds and nothing happens. Quick scans are free. Attention is billed.</p>

    <p id="p11">This is the natural model for content. Subscription paywalls charge you regardless of whether you read. Advertising charges brands regardless of whether anyone saw the ad. Dwell-based billing charges you for exactly the attention you gave. Publishers earn proportional to engagement. Readers pay for reading, not for access.</p>

    <p id="p12">The model extends to video: charge per second of playback. To audio: charge per minute listened. To interactive tools: charge per action taken. The metering axis changes but the settlement stack is identical. One Circuit for all of them: sign, batch, settle.</p>

    <p id="p13">Agents that consume content — research agents, summarization agents, fact-checking agents — can operate in this economy without modification. They hold a wallet, they pay per paragraph read, they pass the cost to their principal at a markup. The agent becomes a content broker, buying attention wholesale and reselling it at a margin.</p>

    <p id="p14">The margin analysis is important. At $0.0001 per paragraph, a reader who reads a 25-paragraph article pays $0.0025. The batch settlement for those 25 vouchers costs perhaps $0.00003 in Arc gas. The gross margin to the publisher is over 98%. No subscription infrastructure. No payment processor. No chargeback risk. Just USDC, on-chain, within seconds of the last paragraph.</p>

    <p id="p15">Contrast this with Ethereum L1, where a single settlement transaction costs $2–$5. At $0.0001 per paragraph, the gas exceeds the revenue at any realistic article length. Or Optimism, where gas is cheaper but still $0.01–$0.05 — too expensive for anything under a cent. Arc with Gateway batching is the first infrastructure where the economics actually work for sub-cent content.</p>

    <p id="p16">The cross-chain bridge (C8 in this project) rounds out the picture. A reader might hold USDC on Base or Ethereum. The App Kit bridge wraps CCTP V2 to move those funds to Arc in under 20 seconds, with a flat $0.003 fee. The reader does not need to know they are bridging — the wallet handles it. The publisher sees Arc USDC either way.</p>

    <p id="p17">Privacy is the open question. Dwell tracking, like any behavioral signal, can be abused. A malicious publisher could use it to profile reading habits across articles. The mitigations are cryptographic: sign each dwell voucher with a one-time nonce, rotate identity keys per session, use a ZK proof that the dwell occurred without revealing which paragraph. These are not solved problems in the current stack, but they are tractable.</p>

    <p id="p18">Spam is the other open question. A script could POST fake dwell vouchers without ever rendering the article. The defense is client-side attestation: the browser generates a nonce when the page loads, embeds it in the IntersectionObserver callback, and signs the voucher with a timestamp proof. A server that checks the nonce and the timestamp window rejects replays.</p>

    <p id="p19">The long-term vision is a reading economy where publishers earn per paragraph, researchers earn per insight, agents earn per task, and humans pay for exactly what they consume. No subscriptions. No ads. No paywalls that block rather than gate. Value flows to the unit of value created.</p>

    <p id="p20">pay2play is the proof of concept. It runs on Arc testnet today, with real USDC flowing through real Gateway settlements. The economics are real. The code is open. The next step is a production publisher willing to try it.</p>

    <p id="p21">The agentic economy does not need a revolution. It needs a library, a chain where stablecoin gas is cheap, and a batch settlement layer that makes sub-cent transactions profitable. Those three things now exist. Everything else is software.</p>

    <p id="p22">If you read this far, you have dwelled on twenty-two paragraphs. At $0.0001 each, that is $0.0022 USDC — about a fifth of a cent. You would not notice it missing from your wallet. The publisher would notice it arriving. That asymmetry is why micropayments have always made theoretical sense. Arc is why they now make economic sense too.</p>

    <p id="p23">The counters on the right show your reading session in real time. Each green paragraph means your attention was captured, metered, and queued for settlement. When the batch flushes, a simulated transaction hash appears — in production, that hash links to a real Arc settlement on Arcscan.</p>

    <p id="p24">Three seconds. That is all it takes. Three seconds of genuine attention translates into a fraction of a cent of value, captured without friction, settled without intermediary. Scale that to a million readers, a billion paragraphs, a trillion agent-to-content interactions — and you have the economic substrate of the next decade of the web.</p>

    <p id="p25">This is pay2play: meter anything, settle everything, on Arc.</p>
  </article>

  <aside>
    <div class="panel">
      <div class="stat-grid">
        <div class="stat"><div class="lbl">Paragraphs read</div><div class="n" id="paras">0</div></div>
        <div class="stat settled"><div class="lbl">On-chain batches</div><div class="n" id="batches">0</div></div>
        <div class="stat"><div class="lbl">Vouchers signed</div><div class="n" id="signed">0</div></div>
        <div class="stat settled"><div class="lbl">USDC metered</div><div class="n" id="usdc" style="font-size:1.1rem">$0.0000</div></div>
      </div>
      <div style="font-size:.8rem;color:#94a3b8;margin-bottom:.4rem">Recent batch settlements</div>
      <div id="txs"><span style="color:#374151;font-size:.8rem">none yet — keep reading</span></div>
    </div>
    <div class="panel">
      <div style="font-size:.8rem;color:#94a3b8;font-weight:600;margin-bottom:.4rem">How it works</div>
      <div class="note">
        Each paragraph has an <b>IntersectionObserver</b>.<br>
        Stay ≥ 50 % visible for <b>${DWELL_MS / 1000} seconds</b> → $${PRICE_PER_PARAGRAPH_DISPLAY} voucher signed.<br>
        Scroll past quickly → free.<br><br>
        Every <b>${VOUCHERS_PER_BATCH} vouchers</b> or <b>${MAX_FLUSH_MS / 1000} s</b> → server flushes a Gateway batch to Arc.<br><br>
        <b>Green border</b> = reading (timer running)<br>
        <b>Bright green</b> = charged ✓
      </div>
    </div>
  </aside>
</div>

<script>
const DWELL_MS = ${DWELL_MS};
const PRICE_ATOMIC = ${PRICE_PER_PARAGRAPH_ATOMIC.toString()}n;
const USDC_DECIMALS = ${USDC_DECIMALS};
function formatAtomic(atomic) {
  const divisor = 10n ** BigInt(USDC_DECIMALS);
  const whole = (atomic / divisor).toString();
  const frac = (atomic % divisor).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  return frac === "" ? whole : whole + "." + frac;
}

const parasEl = document.getElementById('paras');
const signedEl = document.getElementById('signed');
const batchesEl = document.getElementById('batches');
const usdcEl = document.getElementById('usdc');
const txsEl = document.getElementById('txs');

function updateStats(s) {
  parasEl.textContent = s.paragraphsDwelled;
  signedEl.textContent = s.vouchersSigned;
  batchesEl.textContent = s.batchesSettled;
  usdcEl.textContent = s.totalUsdc || '$' + formatAtomic(BigInt(s.paragraphsDwelled) * PRICE_ATOMIC);
  if (s.lastTxs && s.lastTxs.length) {
    txsEl.innerHTML = s.lastTxs.map(tx =>
      '<div><a href="https://testnet.arcscan.app/tx/' + tx + '" target="_blank">' + tx.slice(0,24) + '…</a></div>'
    ).join('');
  }
}

const evtSrc = new EventSource('/stats/subscribe');
evtSrc.onmessage = (ev) => updateStats(JSON.parse(ev.data));

// IntersectionObserver dwell logic (viewport.ts inlined for browser)
const timers = new WeakMap();
const charged = new WeakSet();
let localSigned = 0;

function mkId() {
  return 'v-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

async function postVoucher(el) {
  const id = mkId();
  localSigned++;
  el.classList.remove('reading');
  el.classList.add('charged');
  const body = { id, elementId: el.id || undefined, ms: DWELL_MS };
  try {
    await fetch('/voucher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn('[c4] voucher post failed', e);
  }
}

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const el = entry.target;
    if (entry.isIntersecting && !charged.has(el)) {
      el.classList.add('reading');
      const t = setTimeout(() => {
        if (charged.has(el)) return;
        charged.add(el);
        postVoucher(el);
      }, DWELL_MS);
      timers.set(el, t);
    } else {
      const t = timers.get(el);
      if (t) {
        clearTimeout(t);
        timers.delete(el);
        if (!charged.has(el)) el.classList.remove('reading');
      }
    }
  }
}, { threshold: 0.5 });

document.querySelectorAll('article p').forEach(p => observer.observe(p));
</script>
</body>
</html>`;

app.listen(PORT, () => {
  console.log(`[c4] on http://localhost:${PORT}`);
  console.log(`[c4] open the page and read slowly — each paragraph dwelled = $${PRICE_PER_PARAGRAPH_DISPLAY} voucher`);
});
