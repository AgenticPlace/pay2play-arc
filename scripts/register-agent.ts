#!/usr/bin/env tsx
/**
 * register-agent.ts — ERC-8004 AI agent registration on Arc testnet.
 *
 * Usage:
 *   pnpm tsx scripts/register-agent.ts [--dry-run]
 *
 * Env:
 *   SELLER_PRIVATE_KEY  — owner wallet (earns the ERC-721 identity token)
 *   BUYER_PRIVATE_KEY   — optional validator (gives initial reputation feedback)
 *   METADATA_URI        — IPFS or HTTPS URI for agent metadata JSON
 */

import { registerAgent } from "../components/c9-agent-identity/src/register.js";
import { ARC_TESTNET } from "@pay2play/core";

const dryRun      = process.argv.includes("--dry-run");
const ownerKey    = process.env.SELLER_PRIVATE_KEY as `0x${string}` | undefined;
const validatorKey = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;

if (!ownerKey && !dryRun) {
  console.error("[register-agent] Set SELLER_PRIVATE_KEY in .env (or use --dry-run)");
  console.error("[register-agent] Fund wallet at:", ARC_TESTNET.faucetUrl);
  process.exit(1);
}

console.log("[register-agent] Arc Testnet Agent Registration");
console.log("[register-agent] IdentityRegistry:  ", ARC_TESTNET.contracts.identityRegistry);
console.log("[register-agent] ReputationRegistry:", ARC_TESTNET.contracts.reputationRegistry);
console.log("[register-agent] ValidationRegistry:", ARC_TESTNET.contracts.validationRegistry);
if (dryRun) console.log("[register-agent] DRY RUN — no transactions will be sent\n");

registerAgent({
  ownerKey:    ownerKey ?? "0x0000000000000000000000000000000000000000000000000000000000000001",
  validatorKey,
  metadataURI: process.env.METADATA_URI ?? "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  initialScore: 80,
  dryRun,
})
  .then((result) => {
    console.log("\n[register-agent] Result:");
    console.log(JSON.stringify(result, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
    if (result.registerTx) {
      console.log("\nExplorer:", ARC_TESTNET.explorerTx(result.registerTx));
    }
  })
  .catch((err) => {
    console.error("[register-agent] Error:", err.message);
    process.exit(1);
  });
