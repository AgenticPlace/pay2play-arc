/**
 * C7 — pay-per-row data query. Price scales with `?limit=`.
 */
import express, { type Request } from "express";
import { meter, ARC_TESTNET } from "@pay2play/core";
import { createPaidMiddleware, defaultFacilitator } from "@pay2play/server/http";
import { corsForX402 } from "@pay2play/server/middleware";

const PORT = Number(process.env.C7_PORT ?? "4027");
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;
if (!SELLER_ADDRESS) {
  console.error("Set SELLER_ADDRESS in .env");
  process.exit(1);
}

// Toy dataset — a few thousand synthetic "transactions"
const DATASET = Array.from({ length: 5000 }, (_, i) => ({
  id: i + 1,
  type: ["buy", "sell", "transfer", "mint"][i % 4],
  asset: ["USDC", "EURC", "USYC"][i % 3],
  amount: Math.round(Math.random() * 10000) / 100,
  ts: new Date(Date.now() - i * 1000).toISOString(),
}));

const PRICE_PER_ROW = 0.0001;
const m = meter({
  rows: (s) => `$${(s.count * PRICE_PER_ROW).toFixed(6)}`,
});

const facilitator = await defaultFacilitator();
const paid = createPaidMiddleware({
  meter: m,
  payTo: SELLER_ADDRESS,
  facilitator,
  onSettled: (info) =>
    console.log(`[c7] paid $${info.amount} from ${info.payer.slice(0, 10)}… tx=${info.transaction ?? "pending"}`),
});

const app = express();
app.use(corsForX402());
app.use(express.json());

app.get("/", (_req, res) =>
  res.json({
    component: "c7-row-meter",
    network: ARC_TESTNET.name,
    pricePerRow: `$${PRICE_PER_ROW.toFixed(4)}`,
    totalRows: DATASET.length,
    example: "GET /data?limit=50  (→ 402 for $0.005)",
    explorer: ARC_TESTNET.explorerAddress(SELLER_ADDRESS),
  }),
);

// Paid route — signal computed from `limit` query param
app.get(
  "/data",
  paid({
    signal: (req: Request) => {
      const limit = Math.max(1, Math.min(1000, Number(req.query.limit ?? 10)));
      return { kind: "rows", count: limit };
    },
    description: "Data query: $0.0001 per row",
  }),
  (req, res) => {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit ?? 10)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    res.json({
      rows: DATASET.slice(offset, offset + limit),
      count: limit,
      offset,
      totalRows: DATASET.length,
    });
  },
);

app.listen(PORT, () => {
  console.log(`[c7] on :${PORT}  $${PRICE_PER_ROW}/row`);
});
