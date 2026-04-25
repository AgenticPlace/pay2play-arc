#!/usr/bin/env tsx
/**
 * create-job.ts — ERC-8183 job lifecycle demo on Arc testnet.
 *
 * Usage:
 *   pnpm tsx scripts/create-job.ts
 *
 * Env:
 *   SELLER_PRIVATE_KEY — client wallet (creates + funds the job)
 *   BUYER_PRIVATE_KEY  — provider wallet (submits work; receives USDC)
 *
 * The script runs the full lifecycle: createJob → setBudget → fund → submit → complete.
 * Budget: $0.01 USDC (10_000 atomic units).
 */

import { runJobLifecycle } from "../components/c9-agent-identity/src/job.js";
import { ARC_TESTNET } from "@pay2play/core";

const clientKey   = process.env.SELLER_PRIVATE_KEY as `0x${string}` | undefined;
const providerKey = process.env.BUYER_PRIVATE_KEY  as `0x${string}` | undefined;

if (!clientKey || !providerKey) {
  console.error("[create-job] Set SELLER_PRIVATE_KEY and BUYER_PRIVATE_KEY in .env");
  console.error("[create-job] Fund wallets at:", ARC_TESTNET.faucetUrl);
  process.exit(1);
}

console.log("[create-job] ERC-8183 Job Lifecycle on Arc Testnet");
console.log("[create-job] JobEscrow:", ARC_TESTNET.contracts.jobEscrow);
console.log("[create-job] USDC:     ", ARC_TESTNET.contracts.usdc);
console.log("[create-job] Explorer: ", ARC_TESTNET.explorer, "\n");

runJobLifecycle({
  clientKey,
  providerKey,
  evaluatorKey: clientKey,   // client acts as evaluator in demo
  descText:     "Analyze sentiment of 1000 tweets — pay2play-arc demo job",
  budgetUsdc:   0.01,        // $0.01 USDC
  deliverable:  "Sentiment analysis: 60% positive, 30% neutral, 10% negative",
})
  .then((result) => {
    console.log("\n[create-job] Job lifecycle complete!");
    console.log(JSON.stringify(result, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
    console.log("\nExplorer:", ARC_TESTNET.explorerTx(result.completeTx));
  })
  .catch((err) => {
    console.error("[create-job] Error:", err.message);
    process.exit(1);
  });
