/**
 * C2 seller — Agent B. Answers questions for $0.0005.
 */
import express from "express";
import { meter, ARC_TESTNET } from "@pay2play/core";
import { createPaidMiddleware, defaultFacilitator } from "@pay2play/server/http";
import { corsForX402 } from "@pay2play/server/middleware";

const PORT = Number(process.env.C2_SELLER_PORT ?? "4022");
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;
if (!SELLER_ADDRESS) {
  console.error("Set SELLER_ADDRESS in .env");
  process.exit(1);
}

const m = meter({ request: "$0.0005" });
const facilitator = await defaultFacilitator();

const app = express();
app.use(corsForX402());
app.use(express.json());

const paid = createPaidMiddleware({
  meter: m,
  payTo: SELLER_ADDRESS,
  facilitator,
  onSettled: (info) =>
    console.log(`[seller] paid $${info.amount} from ${info.payer.slice(0, 10)}… tx=${info.transaction ?? "pending"}`),
});

const QA: Record<string, string> = {
  weather: "Sunny, 22°C, gentle breeze.",
  stocks: "USDC/USDT up 0.01%, BTC flat, ETH -0.2%.",
  crypto: "Tracking 14 major assets; volatility low.",
  news: "Nothing major in the last 10 minutes.",
  default: "I can answer questions about weather, stocks, crypto, or news.",
};

app.post("/ask", paid(), (req, res) => {
  const body = (req.body ?? {}) as { topic?: string };
  const topic = body.topic?.toLowerCase() ?? "default";
  res.json({
    topic,
    answer: QA[topic] ?? QA.default,
    pricedAt: "$0.0005",
    at: new Date().toISOString(),
  });
});

app.get("/", (_req, res) => {
  res.json({
    component: "c2-agent-loop/seller",
    network: ARC_TESTNET.name,
    priceEach: "$0.0005",
    paidRoute: "POST /ask  { topic: 'weather'|'stocks'|'crypto'|'news' }",
    explorer: ARC_TESTNET.explorerAddress(SELLER_ADDRESS),
  });
});

app.listen(PORT, () => {
  console.log(`[c2 seller] on :${PORT}  pay-to=${SELLER_ADDRESS.slice(0, 10)}…`);
});
