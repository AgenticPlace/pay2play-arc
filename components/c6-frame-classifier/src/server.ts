/**
 * C6 — per-frame edge-ML classifier. Pure M2M demo.
 * Price scales with frames.length (from request body).
 */
import express, { type Request } from "express";
import { meter, ARC_TESTNET, type UsageSignal } from "@pay2play/core";
import { createPaidMiddleware, defaultFacilitator } from "@pay2play/server/http";
import { corsForX402 } from "@pay2play/server/middleware";

const PORT = Number(process.env.C6_PORT ?? "4026");
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;
if (!SELLER_ADDRESS) {
  console.error("Set SELLER_ADDRESS in .env");
  process.exit(1);
}

const PRICE_PER_FRAME = 0.0005;
const m = meter({
  frames: (s) => `$${(s.count * PRICE_PER_FRAME).toFixed(6)}`,
});

const facilitator = await defaultFacilitator();
const paid = createPaidMiddleware({
  meter: m,
  payTo: SELLER_ADDRESS,
  facilitator,
  onSettled: (info) =>
    console.log(`[c6] paid $${info.amount} from ${info.payer.slice(0, 10)}… tx=${info.transaction ?? "pending"}`),
});

const app = express();
app.use(corsForX402());
app.use(express.json({ limit: "10mb" }));

app.get("/", (_req, res) =>
  res.json({
    component: "c6-frame-classifier",
    network: ARC_TESTNET.name,
    pricePerFrame: `$${PRICE_PER_FRAME.toFixed(4)}`,
    route: "POST /classify  body: { frames: [{id, data, model?}] }",
    explorer: ARC_TESTNET.explorerAddress(SELLER_ADDRESS),
  }),
);

// Peek the body to compute signal count. We register a small pre-parser:
// because paid middleware runs BEFORE handler, we read req.body that
// express.json() already parsed upstream.
app.post(
  "/classify",
  paid({
    signal: (req: Request): UsageSignal => {
      const body = (req.body ?? {}) as { frames?: unknown[] };
      const n = Array.isArray(body.frames) ? body.frames.length : 1;
      return { kind: "frames", count: Math.max(1, n) };
    },
    description: "Frame classification: $0.0005 per frame",
  }),
  (req, res) => {
    const body = (req.body ?? {}) as { frames?: Array<{ id: string; data: string; model?: string }> };
    const frames = body.frames ?? [];
    // Toy "classifier" — hashes the base64 payload and returns a synthetic label
    const results = frames.map((f) => {
      const h = [...f.data.slice(0, 256)].reduce((a, c) => a + c.charCodeAt(0), 0);
      const labels = ["cat", "dog", "car", "pedestrian", "traffic-sign", "bee", "varroa-mite"];
      return {
        id: f.id,
        model: f.model ?? "toy-v1",
        label: labels[h % labels.length],
        confidence: 0.7 + ((h % 30) / 100),
      };
    });
    res.json({ results, count: frames.length, pricedAt: `$${(frames.length * PRICE_PER_FRAME).toFixed(6)}` });
  },
);

app.listen(PORT, () => {
  console.log(`[c6] on :${PORT}  $${PRICE_PER_FRAME}/frame`);
});
