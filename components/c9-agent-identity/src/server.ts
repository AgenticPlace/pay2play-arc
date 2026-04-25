/**
 * C9 — Agent Identity + Job Escrow Server (AgenticPlace gateway, Arc Testnet)
 *
 * Mounts the chain-agnostic AgenticPlace router from @pay2play/server with Arc-
 * specific implementations of:
 *   - registerAgent  (ERC-8004 IdentityRegistry + ReputationRegistry)
 *   - runJobLifecycle / getJobInfo  (ERC-8183 JobEscrow)
 *
 * Each paid action gates through Circle Gateway batched USDC at $0.002 / call.
 * Startup health check verifies the three Arc-deployed contracts are reachable.
 */

import express from "express";
import { createPublicClient, http } from "viem";
import {
  meter,
  ARC_TESTNET,
  IDENTITY_REGISTRY_ABI,
  JOB_ESCROW_ABI,
  feeConfig,
  USDC_DECIMALS,
} from "@pay2play/core";
import { defaultFacilitator } from "@pay2play/server/http";
import { corsForX402 } from "@pay2play/server/middleware";
import {
  createAgenticPlaceRouter,
  runHealthChecks,
  type ContractHealthCheck,
} from "@pay2play/server/agenticplace";
import { createFeeAdminRouter } from "@pay2play/server/fee-admin";
import { registerAgent } from "./register.js";
import { runJobLifecycle, getJobInfo } from "./job.js";

const PORT = Number(process.env.PORT ?? 3009);
const PAY_TO = process.env.SELLER_ADDRESS ?? ARC_TESTNET.contracts.gatewayWallet;
if (!process.env.SELLER_ADDRESS) {
  console.warn("[c9] SELLER_ADDRESS not set — using gatewayWallet fallback for PAY_TO");
}

// Fee config sourced from env, with the same default as before.
const ARC_BASE_PRICE_USD = process.env.PAY2PLAY_BASE_PRICE_USD ?? "0.002";
const ARC_FEE_BPS = process.env.PAY2PLAY_FEE_BPS
  ? Number(process.env.PAY2PLAY_FEE_BPS)
  : undefined;
const ARC_GAS_OVERHEAD_USD = process.env.PAY2PLAY_GAS_OVERHEAD_USD;
const arcFeeConfig = feeConfig({
  basePrice: ARC_BASE_PRICE_USD,
  decimals: USDC_DECIMALS,
  facilitatorFeeBps: ARC_FEE_BPS,
  gasOverhead: ARC_GAS_OVERHEAD_USD,
  symbol: "USDC",
  network: ARC_TESTNET.caip2,
  schemeName: "GatewayWalletBatched",
});

const m = meter({ request: "$" + ARC_BASE_PRICE_USD });
const app = express();
app.use(corsForX402());
app.use(express.json());

/* -- Health check probes ------------------------------------------------- */

const arcChain = {
  id: ARC_TESTNET.chainId,
  name: ARC_TESTNET.name,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [ARC_TESTNET.rpcUrl] } },
} as const;
const publicClient = createPublicClient({ chain: arcChain, transport: http(ARC_TESTNET.rpcUrl) });

const contractChecks: ContractHealthCheck[] = [
  {
    name: "IdentityRegistry",
    address: ARC_TESTNET.contracts.identityRegistry,
    probe: async () => {
      const code = await publicClient.getCode({
        address: ARC_TESTNET.contracts.identityRegistry as `0x${string}`,
      });
      return Boolean(code && code.length > 2);
    },
  },
  {
    name: "ReputationRegistry",
    address: ARC_TESTNET.contracts.reputationRegistry,
    probe: async () => {
      const code = await publicClient.getCode({
        address: ARC_TESTNET.contracts.reputationRegistry as `0x${string}`,
      });
      return Boolean(code && code.length > 2);
    },
  },
  {
    name: "JobEscrow",
    address: ARC_TESTNET.contracts.jobEscrow,
    probe: async () => {
      const code = await publicClient.getCode({
        address: ARC_TESTNET.contracts.jobEscrow as `0x${string}`,
      });
      return Boolean(code && code.length > 2);
    },
  },
];

// Touch ABI imports so the build doesn't strip them (used by callers via core).
void IDENTITY_REGISTRY_ABI;
void JOB_ESCROW_ABI;

/* -- Health endpoint at root and via router ------------------------------ */

app.get("/", (_req, res) => {
  res.json({
    service: "c9-agent-identity",
    description: "AgenticPlace gateway — ERC-8004 identity + ERC-8183 job escrow on Arc",
    arc: {
      chainId: ARC_TESTNET.chainId,
      identityRegistry:   ARC_TESTNET.contracts.identityRegistry,
      reputationRegistry: ARC_TESTNET.contracts.reputationRegistry,
      validationRegistry: ARC_TESTNET.contracts.validationRegistry,
      jobEscrow:          ARC_TESTNET.contracts.jobEscrow,
    },
    pricing: {
      perOperation: "$" + arcFeeConfig.basePriceAtomic + " atomic USDC",
      perOperationDisplay: "$" + ARC_BASE_PRICE_USD + " USDC",
      decimals: arcFeeConfig.decimals,
      facilitatorFeeBps: arcFeeConfig.facilitatorFeeBps ?? 0,
      gasOverheadAtomic: (arcFeeConfig.gasOverheadAtomic ?? 0n).toString(),
    },
    endpoints: [
      "GET  /info               — service metadata (free)",
      "GET  /health             — contract reachability (free)",
      "POST /agent/register     — ERC-8004 mint + reputation seed (paid)",
      "POST /job/create         — ERC-8183 full lifecycle (paid)",
      "GET  /job/:id            — read job state (free)",
      "GET  /admin/fees         — current fee config (admin-only)",
      "POST /admin/fees         — update fee config (admin-only)",
    ],
  });
});

/* -- Mount the AgenticPlace router --------------------------------------- */

async function startServer() {
  const facilitator = await defaultFacilitator();

  const router = createAgenticPlaceRouter({
    paidMiddleware: {
      meter: m,
      payTo: PAY_TO,
      facilitator,
      onSettled: (info) => console.log("[c9] settled", info),
    },
    description: "AgenticPlace identity/escrow op ($0.002)",
    registerAgent,
    runJobLifecycle,
    getJobInfo,
    info: () => ({
      service: "c9-agent-identity",
      chain: ARC_TESTNET.name,
      chainId: ARC_TESTNET.chainId,
      contracts: {
        identityRegistry:   ARC_TESTNET.contracts.identityRegistry,
        reputationRegistry: ARC_TESTNET.contracts.reputationRegistry,
        jobEscrow:          ARC_TESTNET.contracts.jobEscrow,
      },
    }),
    healthCheck: () => runHealthChecks(contractChecks),
  });

  app.use(router);

  // Optional fee admin router — enabled only if PAY2PLAY_ADMIN_KEY is set.
  const adminKey = process.env.PAY2PLAY_ADMIN_KEY?.trim();
  if (adminKey) {
    const adminRouter = createFeeAdminRouter({
      secret: adminKey,
      initialConfig: arcFeeConfig,
      configPath: process.env.PAY2PLAY_FEE_CONFIG_PATH ?? undefined,
    });
    app.use(adminRouter);
    console.log("[c9] fee admin enabled at /admin/fees (X-Admin-Key required)");
  } else {
    console.log("[c9] fee admin disabled — set PAY2PLAY_ADMIN_KEY to enable");
  }

  // Run health check at startup — log loudly if any contract is missing
  const startupHealth = await runHealthChecks(contractChecks);
  if (!startupHealth.ok) {
    console.error("[c9] STARTUP HEALTH CHECK FAILED:", JSON.stringify(startupHealth.checks, null, 2));
    console.error("[c9] One or more Arc contracts are unreachable. Continuing — /health endpoint will reflect this.");
  } else {
    console.log("[c9] startup health: all 3 Arc contracts reachable");
  }

  app.listen(PORT, () => {
    console.log(`[c9-agent-identity] listening on :${PORT}`);
    console.log(`[c9] IdentityRegistry:   ${ARC_TESTNET.contracts.identityRegistry}`);
    console.log(`[c9] ReputationRegistry: ${ARC_TESTNET.contracts.reputationRegistry}`);
    console.log(`[c9] JobEscrow:          ${ARC_TESTNET.contracts.jobEscrow}`);
    console.log(`[c9] try: curl http://localhost:${PORT}/health`);
  });
}

startServer().catch((err) => {
  console.error("[c9] fatal startup error:", err);
  process.exit(1);
});
