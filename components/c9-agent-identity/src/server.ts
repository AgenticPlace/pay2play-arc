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
import { meter, ARC_TESTNET, IDENTITY_REGISTRY_ABI, JOB_ESCROW_ABI } from "@pay2play/core";
import { defaultFacilitator } from "@pay2play/server/http";
import { corsForX402 } from "@pay2play/server/middleware";
import {
  createAgenticPlaceRouter,
  runHealthChecks,
  type ContractHealthCheck,
} from "@pay2play/server/agenticplace";
import { registerAgent } from "./register.js";
import { runJobLifecycle, getJobInfo } from "./job.js";

const PORT = Number(process.env.PORT ?? 3009);
const PAY_TO = process.env.SELLER_ADDRESS ?? ARC_TESTNET.contracts.gatewayWallet;
if (!process.env.SELLER_ADDRESS) {
  console.warn("[c9] SELLER_ADDRESS not set — using gatewayWallet fallback for PAY_TO");
}

const m = meter({ request: "$0.002" });
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
    pricing: { perOperation: "$0.002 USDC" },
    endpoints: [
      "GET  /info               — service metadata (free)",
      "GET  /health             — contract reachability (free)",
      "POST /agent/register     — ERC-8004 mint + reputation seed ($0.002)",
      "POST /job/create         — ERC-8183 full lifecycle ($0.002)",
      "GET  /job/:id            — read job state (free)",
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
