/**
 * C1 — Per-API meter. Paid weather/geocode demo.
 *
 * Phase 1 of demo: uses the real @circle-fin/x402-batching BatchFacilitatorClient.
 * Requires SELLER_ADDRESS in env and a deposited Gateway balance on the seller side
 * (the verify/settle calls don't need the seller to sign anything — they just
 * check a buyer's signed authorization).
 */
import express from "express";
import { meter, ARC_TESTNET } from "@pay2play/core";
import { createPaidMiddleware, defaultFacilitator } from "@pay2play/server/http";
import { corsForX402 } from "@pay2play/server/middleware";

const PORT = Number(process.env.C1_PORT ?? "4021");
const MAX_SETTLEMENTS = 1000;
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;
if (!SELLER_ADDRESS) {
  console.error("Set SELLER_ADDRESS in .env (run scripts/generate-wallets.ts first)");
  process.exit(1);
}

const m = meter({
  request: "$0.001",
  bytes: (s) => `$${(s.count * 1e-7).toFixed(8)}`,
});

const app = express();
app.use(corsForX402());
app.use(express.json());

// Settlement log (in-memory ring buffer, capped at MAX_SETTLEMENTS).
const settlements: { endpoint: string; amount: string; payer: string; tx?: string; at: number }[] = [];

const facilitator = await defaultFacilitator();
const paid = createPaidMiddleware({
  meter: m,
  payTo: SELLER_ADDRESS,
  facilitator,
  onSettled: (info) => {
    settlements.push({ ...info, at: Date.now() });
    if (settlements.length > MAX_SETTLEMENTS) settlements.shift();
    console.log(
      `[settle] ${info.endpoint}  $${info.amount}  from ${info.payer.slice(0, 10)}…  tx=${info.transaction ?? "pending"}`,
    );
  },
});

// Unprotected landing
app.get("/", (_req, res) => {
  res.json({
    component: "c1-api-meter",
    network: ARC_TESTNET.name,
    chainId: ARC_TESTNET.chainId,
    seller: SELLER_ADDRESS,
    routes: {
      "GET /weather": "$0.001 / request",
      "GET /geocode?q=...": "$0.002 / request",
      "GET /stats": "free — settlement counters",
    },
    explorer: ARC_TESTNET.explorerAddress(SELLER_ADDRESS),
  });
});

app.get("/stats", (_req, res) => {
  res.json({
    settlements: settlements.length,
    totalUsdc: settlements.reduce((s, x) => s + Number(x.amount), 0).toFixed(6),
    latest: settlements.slice(-5),
  });
});

// Paid routes
app.get("/weather", paid(), (_req, res) => {
  res.json({
    weather: "sunny",
    temperatureC: 22 + Math.floor(Math.random() * 5),
    humidity: 55 + Math.floor(Math.random() * 10),
    windKmh: 8 + Math.floor(Math.random() * 15),
    at: new Date().toISOString(),
  });
});

app.get(
  "/geocode",
  paid({ signal: { kind: "request" }, description: "Geocode: $0.002/query" }),
  (req, res) => {
    const q = String(req.query.q ?? "");
    // Toy geocoding
    const h = [...q].reduce((a, c) => a + c.charCodeAt(0), 0);
    res.json({
      query: q,
      lat: (h % 180) - 90 + (h % 100) / 100,
      lon: (h % 360) - 180 + (h % 100) / 100,
      at: new Date().toISOString(),
    });
  },
);

app.listen(PORT, () => {
  console.log(`[c1] listening on http://localhost:${PORT}`);
  console.log(`[c1] seller = ${SELLER_ADDRESS}`);
  console.log(`[c1] chain  = ${ARC_TESTNET.name} (${ARC_TESTNET.caip2})`);
  console.log(`[c1] try:   curl -i http://localhost:${PORT}/weather`);
});
