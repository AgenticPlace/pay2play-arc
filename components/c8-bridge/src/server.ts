/**
 * C8 · Bridge Demo — cross-chain USDC via Circle App Kit + nanopayment gate.
 *
 * Demonstrates:
 *   - @pay2play/bridge BridgeModule as a standalone modular component
 *   - createPaidMiddleware() metering bridge API calls at $0.001/op
 *   - CCTP V2 cross-chain USDC transfers to/from Arc testnet (Domain 26)
 *
 * Endpoints:
 *   GET  /estimate  — preview fees for a bridge operation (free)
 *   POST /bridge    — execute cross-chain transfer (costs $0.001)
 *   POST /swap      — same-chain USDC/EURC swap on Arc (costs $0.001)
 *
 * Supported chains: ethereum, base, arbitrum, polygon → arcTestnet (and reverse)
 */

import express from "express";
import { meter, ARC_TESTNET } from "@pay2play/core";
import { createPaidMiddleware, defaultFacilitator } from "@pay2play/server/http";
import { BridgeModule, SwapModule } from "@pay2play/bridge";

const PORT       = Number(process.env.PORT       ?? 3008);
const SELLER_KEY = (process.env.SELLER_PRIVATE_KEY ?? "0x0") as `0x${string}`;
const PAY_TO     = process.env.SELLER_ADDRESS ?? ARC_TESTNET.contracts.gatewayWallet;
const BUYER_KEY  = (process.env.BUYER_PRIVATE_KEY ?? "0x0") as `0x${string}`;

const bridgeModule = new BridgeModule(BUYER_KEY);
const swapModule   = new SwapModule(BUYER_KEY);

const m = meter({ request: "$0.001" });

const app = express();
app.use(express.json());

// Health
app.get("/", (_req, res) => {
  res.json({
    service: "c8-bridge",
    description: "Cross-chain USDC bridge + swap via Circle App Kit",
    arc: {
      chainId: ARC_TESTNET.chainId,
      cctpDomain: ARC_TESTNET.cctpDomain,
      usdc: ARC_TESTNET.contracts.usdc,
      cctpTokenMessenger: ARC_TESTNET.contracts.cctpTokenMessenger,
    },
    endpoints: [
      "GET  /estimate?from=ethereum&to=arcTestnet&amount=1.00",
      "POST /bridge   { sourceChain, destinationChain, amount, recipientAddress? }",
      "POST /swap     { chain, fromToken, toToken, amount }",
    ],
  });
});

// Free: fee preview — static estimate based on CCTP V2 known fees
app.get("/estimate", (req, res) => {
  const { from, to, amount } = req.query as Record<string, string>;
  if (!from || !to || !amount) {
    res.status(400).json({ error: "from, to, amount query params required" });
    return;
  }
  const amt = parseFloat(amount) || 0;
  // CCTP V2 fee: ~0.003 USDC flat + 0.03% of amount (testnet approximation)
  const flatFee    = 0.003;
  const pctFee     = amt * 0.0003;
  const totalFee   = (flatFee + pctFee).toFixed(6);
  const netReceive = Math.max(0, amt - parseFloat(totalFee)).toFixed(6);
  res.json({
    estimate: {
      sourceChain:      from,
      destinationChain: to,
      amount,
      fee:              totalFee,
      netReceive,
      estimatedTime:    "< 20s",
      protocol:         "CCTP V2",
      cctpDomainArc:    ARC_TESTNET.cctpDomain,
      tokenMessenger:   ARC_TESTNET.contracts.cctpTokenMessenger,
      note:             "Testnet estimate — fees approximate",
    },
  });
});

// Paid: execute bridge
let paid: ReturnType<ReturnType<typeof createPaidMiddleware>>;

async function startServer() {
  const facilitator = await defaultFacilitator();
  const paidFactory = createPaidMiddleware({ meter: m, payTo: PAY_TO, facilitator,
    onSettled: (info) => console.log("[bridge] settled", info),
  });
  paid = paidFactory({ description: "Cross-chain USDC bridge op ($0.001)" });

  app.post("/bridge", paid, async (req, res) => {
    const { sourceChain, destinationChain, amount, recipientAddress } = req.body as {
      sourceChain: string;
      destinationChain: string;
      amount: string;
      recipientAddress?: `0x${string}`;
    };

    if (!sourceChain || !destinationChain || !amount) {
      res.status(400).json({ error: "sourceChain, destinationChain, amount required" });
      return;
    }

    const result = await bridgeModule.bridge({ sourceChain, destinationChain, amount, recipientAddress });
    res.json({
      result,
      arc: { chainId: ARC_TESTNET.chainId, cctpDomain: ARC_TESTNET.cctpDomain },
    });
  });

  app.post("/swap", paid, async (req, res) => {
    const { chain, fromToken, toToken, amount, slippageTolerance } = req.body as {
      chain: string;
      fromToken: string;
      toToken: string;
      amount: string;
      slippageTolerance?: number;
    };

    if (!chain || !fromToken || !toToken || !amount) {
      res.status(400).json({ error: "chain, fromToken, toToken, amount required" });
      return;
    }

    const result = await swapModule.swap({ chain, fromToken, toToken, amount, slippageTolerance });
    res.json({ result });
  });

  app.listen(PORT, () => {
    console.log(`[c8-bridge] listening on :${PORT}`);
    console.log(`[c8-bridge] Arc CCTP Domain ${ARC_TESTNET.cctpDomain}`);
    console.log(`[c8-bridge] USDC ${ARC_TESTNET.contracts.usdc}`);
    console.log(`[c8-bridge] TokenMessengerV2 ${ARC_TESTNET.contracts.cctpTokenMessenger}`);
    if (SELLER_KEY === "0x0") {
      console.warn("[c8-bridge] SELLER_PRIVATE_KEY not set — bridge ops will fail");
    }
  });
}

startServer().catch(console.error);
