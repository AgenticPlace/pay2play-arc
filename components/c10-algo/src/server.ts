/**
 * C10 · pay2play-algo — per-request ALGO metering on Algorand testnet.
 *
 * Mirrors the C1 api-meter pattern but settles on Algorand AVM instead of Arc.
 * Clients must include a pay transaction proving ALGO payment before receiving data.
 *
 * Architecture:
 *   - HTTP server exposes paid endpoints
 *   - Client includes signed group transaction proof in X-Algo-Payment header
 *   - Server verifies: tx_id → algod confirms it's a payment to app address
 *   - Price: 1000 microALGO (0.001 ALGO ≈ $0.001) per request
 *
 * Endpoints:
 *   GET  /          — service info + app address
 *   GET  /stats     — payment stats (free)
 *   GET  /data      — paid endpoint (requires X-Algo-Payment: <signed-group-txn-b64>)
 */

import express from "express";
import algosdk from "algosdk";
import { ARC_TESTNET } from "@pay2play/core";

const PORT       = Number(process.env.PORT    ?? 3010);
const APP_ID     = BigInt(process.env.ALGO_APP_ID ?? "0");
const ALGOD_URL  = process.env.ALGOD_SERVER   ?? "https://testnet-api.algonode.cloud";
const ALGOD_TOKEN = process.env.ALGOD_TOKEN   ?? "";
const PRICE_MICRO = 1_000n; // 0.001 ALGO

const algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_URL, 443);

const app = express();
app.use(express.json());

// In-memory payment log (production: use a DB or on-chain state)
const paymentLog: Array<{ txId: string; sender: string; amount: number; timestamp: number }> = [];

app.get("/", (_req, res) => {
  const appAddr = APP_ID > 0n ? algosdk.getApplicationAddress(APP_ID) : "not deployed";
  res.json({
    service: "c10-algo — pay2play Algorand",
    description: "Per-request ALGO metering on Algorand testnet",
    appId:    APP_ID.toString(),
    appAddr,
    pricePerCall: `${Number(PRICE_MICRO)} microALGO (${Number(PRICE_MICRO) / 1e6} ALGO)`,
    endpoints: [
      "GET /        — info (free)",
      "GET /stats   — payment stats (free)",
      "GET /data    — paid (X-Algo-Payment: <tx-id>)",
    ],
    note: "Arc uses USDC (EVM) · Algo uses ALGO (AVM) — same HTTP API surface",
    arcContrast: {
      arcChainId:  ARC_TESTNET.chainId,
      arcUsdc:     ARC_TESTNET.contracts.usdc,
      arcGateway:  ARC_TESTNET.contracts.gatewayWallet,
    },
  });
});

app.get("/stats", async (_req, res) => {
  if (APP_ID === 0n) {
    res.json({ error: "ALGO_APP_ID not set — run pnpm deploy first", paymentLog });
    return;
  }
  try {
    const info = await algod.getApplicationByID(Number(APP_ID)).do();
    // algosdk v3: params.globalState is the camelCase property
    const gs   = (info.params.globalState ?? []) as Array<{ key: Uint8Array; value: { uint: bigint } }>;
    const get  = (k: string) => {
      const kBytes = new TextEncoder().encode(k);
      const entry  = gs.find((s) => Buffer.from(s.key).toString() === k);
      return entry ? Number(entry.value.uint) : 0;
    };
    res.json({
      appId:         APP_ID.toString(),
      pricePerCall:  get("pricePerCall"),
      totalReceived: get("totalReceived"),
      callCount:     get("callCount"),
      paymentLog,
    });
  } catch (err) {
    res.json({ error: String(err), paymentLog });
  }
});

// Paid endpoint — requires confirmed ALGO payment transaction in X-Algo-Payment header
app.get("/data", async (req, res) => {
  const txId = req.header("X-Algo-Payment") ?? req.header("payment-signature");

  if (!txId) {
    res.status(402).json({
      error: "Payment required",
      x402Version: 2,
      paymentInstructions: {
        protocol:    "algorand-pay",
        receiver:    APP_ID > 0n ? algosdk.getApplicationAddress(APP_ID).toString() : "<deploy first>",
        amount:      Number(PRICE_MICRO),
        unit:        "microALGO",
        note:        "pay2play-algo",
        header:      "X-Algo-Payment: <confirmed-tx-id>",
        priceUsd:    `~$${(Number(PRICE_MICRO) / 1e6 * 0.001).toFixed(6)}`,
      },
    });
    return;
  }

  // Verify payment transaction via indexer-style lookup
  try {
    const txInfo = await algod.pendingTransactionInformation(txId).do();
    // algosdk v3: confirmedRound is camelCase
    const confirmed = (txInfo as { confirmedRound?: bigint }).confirmedRound;

    if (!confirmed) {
      res.status(402).json({ error: "Transaction not yet confirmed", txId });
      return;
    }

    const appAddr = algosdk.getApplicationAddress(APP_ID).toString();

    // algosdk v3: access transaction fields via .txn property (inner Transaction object)
    // Use type assertion to access the raw transaction fields
    const rawTxn  = (txInfo as { txn?: { txn?: { rcv?: unknown; amt?: bigint; snd?: unknown } } }).txn?.txn;
    const receiver = rawTxn?.rcv ? algosdk.encodeAddress(rawTxn.rcv as Uint8Array) : "";
    const amount   = rawTxn?.amt ?? 0n;
    const sender   = rawTxn?.snd ? algosdk.encodeAddress(rawTxn.snd as Uint8Array) : "unknown";

    if (receiver !== appAddr) {
      res.status(402).json({ error: "Payment must be sent to app address", expected: appAddr, got: receiver });
      return;
    }

    if (BigInt(amount) < PRICE_MICRO) {
      res.status(402).json({ error: "Insufficient payment", required: Number(PRICE_MICRO), got: Number(amount) });
      return;
    }

    // Check for replay — each tx can only be used once
    if (paymentLog.some((p) => p.txId === txId)) {
      res.status(402).json({ error: "Payment already used", txId });
      return;
    }

    paymentLog.push({ txId, sender, amount: Number(amount), timestamp: Date.now() });

    res.json({
      data:    { weather: "sunny", temperature: 72, forecast: "clear skies" },
      payment: { txId, sender, amount: Number(amount), confirmedRound: confirmed.toString() },
      note:    "Algorand pay2play — same API surface as pay2play-arc (C1)",
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`[c10-algo] listening on :${PORT}`);
  console.log(`[c10-algo] App ID: ${APP_ID.toString() || "not set (run pnpm deploy)"}`);
  console.log(`[c10-algo] Price: ${Number(PRICE_MICRO)} microALGO per call`);
  console.log(`[c10-algo] Algod: ${ALGOD_URL}`);
});
