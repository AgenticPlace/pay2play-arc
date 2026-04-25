/**
 * C9 · Agent Identity + Job Escrow Server
 *
 * Exposes ERC-8004 agent registration and ERC-8183 job lifecycle via REST.
 * Each endpoint is gated by a $0.002 nanopayment via Circle Gateway.
 *
 * Demonstrates the full "Agentic Economy" use case:
 *   - AI agent registers on-chain identity (ERC-8004)
 *   - Client creates and funds a job (ERC-8183)
 *   - Provider submits work; evaluator settles USDC payment
 */

import express from "express";
import { keccak256, toHex } from "viem";
import { meter, ARC_TESTNET } from "@pay2play/core";
import { createPaidMiddleware, defaultFacilitator } from "@pay2play/server/http";
import { registerAgent } from "./register.js";
import { runJobLifecycle, getJobInfo } from "./job.js";

const PORT    = Number(process.env.PORT ?? 3009);
const PAY_TO  = process.env.SELLER_ADDRESS ?? ARC_TESTNET.contracts.gatewayWallet;

const m = meter({ request: "$0.002" });
const app = express();
app.use(express.json());

// Health
app.get("/", (_req, res) => {
  res.json({
    service: "c9-agent-identity",
    description: "ERC-8004 agent registration + ERC-8183 job lifecycle",
    arc: {
      chainId: ARC_TESTNET.chainId,
      identityRegistry:   ARC_TESTNET.contracts.identityRegistry,
      reputationRegistry: ARC_TESTNET.contracts.reputationRegistry,
      validationRegistry: ARC_TESTNET.contracts.validationRegistry,
      jobEscrow:          ARC_TESTNET.contracts.jobEscrow,
    },
    endpoints: [
      "POST /agent/register  { ownerKey, metadataURI, initialScore? }",
      "POST /job/create      { clientKey, providerKey, descText, budgetUsdc }",
      "GET  /job/:id         — read job state",
    ],
  });
});

async function startServer() {
  const facilitator = await defaultFacilitator();
  const paidFactory = createPaidMiddleware({
    meter: m,
    payTo: PAY_TO,
    facilitator,
    onSettled: (info) => console.log("[c9] settled", info),
  });
  const paid = paidFactory({ description: "Agentic identity/escrow op ($0.002)" });

  // ERC-8004: Register agent identity
  app.post("/agent/register", paid, async (req, res) => {
    const { ownerKey, metadataURI, initialScore, dryRun } = req.body as {
      ownerKey:    `0x${string}`;
      metadataURI: string;
      initialScore?: number;
      dryRun?: boolean;
    };

    if (!ownerKey || !metadataURI) {
      res.status(400).json({ error: "ownerKey and metadataURI required" });
      return;
    }

    const result = await registerAgent({
      ownerKey,
      metadataURI,
      initialScore,
      dryRun: dryRun ?? false,
    });

    res.json({
      result: { ...result, agentId: result.agentId?.toString() },
      registries: {
        identity:   ARC_TESTNET.contracts.identityRegistry,
        reputation: ARC_TESTNET.contracts.reputationRegistry,
        validation: ARC_TESTNET.contracts.validationRegistry,
      },
    });
  });

  // ERC-8183: Create + fund + submit + complete a job
  app.post("/job/create", paid, async (req, res) => {
    const { clientKey, providerKey, evaluatorKey, descText, budgetUsdc, deliverable, dryRun } = req.body as {
      clientKey:    `0x${string}`;
      providerKey:  `0x${string}`;
      evaluatorKey?: `0x${string}`;
      descText:     string;
      budgetUsdc:   number;
      deliverable?: string;
      dryRun?:      boolean;
    };

    if (!clientKey || !providerKey || !descText || !budgetUsdc) {
      res.status(400).json({ error: "clientKey, providerKey, descText, budgetUsdc required" });
      return;
    }

    if (dryRun) {
      const { privateKeyToAccount } = await import("viem/accounts");
      const client   = privateKeyToAccount(clientKey);
      const provider = privateKeyToAccount(providerKey);
      const expiry   = Math.floor(Date.now() / 1000) + 3600;
      const descHash = keccak256(toHex(descText));
      console.log(`[ERC-8183] DRY RUN — would createJob with:
  client:   ${client.address}
  provider: ${provider.address}
  budgetUsdc: ${budgetUsdc}
  expiry:   ${expiry}
  descHash: ${descHash}
  JobEscrow: ${ARC_TESTNET.contracts.jobEscrow}`);
      res.json({
        dryRun: true,
        wouldCall: {
          contract: ARC_TESTNET.contracts.jobEscrow,
          function: "createJob",
          args: { provider: provider.address, evaluator: client.address, expiry, descHash },
          usdcBudget: budgetUsdc,
        },
      });
      return;
    }

    let result;
    try {
      result = await runJobLifecycle({
        clientKey,
        providerKey,
        evaluatorKey: evaluatorKey ?? clientKey,
        descText,
        budgetUsdc,
        deliverable: deliverable ?? "work delivered",
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
      return;
    }

    res.json({
      result: {
        jobId:      result.jobId.toString(),
        createTx:   result.createTx,
        fundTx:     result.fundTx,
        submitTx:   result.submitTx,
        completeTx: result.completeTx,
        finalState: result.finalState,
      },
      jobEscrow: ARC_TESTNET.contracts.jobEscrow,
      explorer:  ARC_TESTNET.explorerTx(result.completeTx),
    });
  });

  // Read job state (free)
  app.get("/job/:id", async (req, res) => {
    const jobId = BigInt(req.params.id);
    const info  = await getJobInfo(jobId);
    res.json({
      job: {
        ...info,
        jobId:  info.jobId.toString(),
        amount: info.amount.toString(),
        expiry: info.expiry.toString(),
      },
      explorer: ARC_TESTNET.explorerAddress(ARC_TESTNET.contracts.jobEscrow),
    });
  });

  app.listen(PORT, () => {
    console.log(`[c9-agent-identity] listening on :${PORT}`);
    console.log(`[c9] IdentityRegistry:   ${ARC_TESTNET.contracts.identityRegistry}`);
    console.log(`[c9] ReputationRegistry: ${ARC_TESTNET.contracts.reputationRegistry}`);
    console.log(`[c9] ValidationRegistry: ${ARC_TESTNET.contracts.validationRegistry}`);
    console.log(`[c9] JobEscrow:          ${ARC_TESTNET.contracts.jobEscrow}`);
  });
}

startServer().catch(console.error);
