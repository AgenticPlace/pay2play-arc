/**
 * ERC-8004 Agent Registration on Arc Testnet.
 *
 * Flow:
 *   1. Owner wallet calls IdentityRegistry.register(metadataURI) → agentId (ERC-721)
 *   2. Validator wallet calls ReputationRegistry.giveFeedback(agentId, score, hash)
 *   3. (Optional) ValidationRegistry.validationRequest / validationResponse
 *
 * Deployed registry contracts (Arc Testnet):
 *   IdentityRegistry:   0x8004A818BFB912233c491871b3d84c89A494BD9e
 *   ReputationRegistry: 0x8004B663056A597Dffe9eCcC1965A193B7388713
 *   ValidationRegistry: 0x8004Cb1BF31DAf7788923b405b754f57acEB4272
 *
 * Gas: ~0.006 USDC-TESTNET per tx (sponsored by Circle Gas Station on testnet)
 */

import { createWalletClient, createPublicClient, http, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ARC_TESTNET,
  IDENTITY_REGISTRY_ABI,
  REPUTATION_REGISTRY_ABI,
  VALIDATION_REGISTRY_ABI,
  type AgentIdentity,
} from "@pay2play/core";

const arcChain = {
  id:   ARC_TESTNET.chainId,
  name: ARC_TESTNET.name,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [ARC_TESTNET.rpcUrl] } },
} as const;

export interface RegisterOptions {
  ownerKey:      `0x${string}`;
  validatorKey?: `0x${string}`;
  metadataURI:   string;
  initialScore?: number;
  dryRun?:       boolean;
}

export interface RegisterResult {
  agentId?: bigint;
  owner:    `0x${string}`;
  registerTx?:  `0x${string}`;
  feedbackTx?:  `0x${string}`;
  reputationScore?: number;
  dryRun: boolean;
}

/**
 * Register an AI agent on-chain with ERC-8004.
 * Returns the agentId and all transaction hashes.
 */
export async function registerAgent(opts: RegisterOptions): Promise<RegisterResult> {
  const ownerAccount     = privateKeyToAccount(opts.ownerKey);
  const validatorAccount = opts.validatorKey ? privateKeyToAccount(opts.validatorKey) : ownerAccount;

  if (opts.dryRun) {
    console.log("[ERC-8004] DRY RUN — would register agent with:");
    console.log("  owner:       ", ownerAccount.address);
    console.log("  validator:   ", validatorAccount.address);
    console.log("  metadataURI: ", opts.metadataURI);
    console.log("  IdentityRegistry: ", ARC_TESTNET.contracts.identityRegistry);
    console.log("  ReputationRegistry:", ARC_TESTNET.contracts.reputationRegistry);
    return { owner: ownerAccount.address, dryRun: true };
  }

  const transport   = http(ARC_TESTNET.rpcUrl);
  const publicClient = createPublicClient({ chain: arcChain, transport });
  const ownerWallet  = createWalletClient({ account: ownerAccount, chain: arcChain, transport });
  const validatorWallet = createWalletClient({ account: validatorAccount, chain: arcChain, transport });

  // Step 1: Register identity (owner)
  console.log("[ERC-8004] Registering agent identity...");
  const registerTx = await ownerWallet.writeContract({
    address: ARC_TESTNET.contracts.identityRegistry as `0x${string}`,
    abi:     IDENTITY_REGISTRY_ABI,
    functionName: "register",
    args: [opts.metadataURI],
  });
  const registerReceipt = await publicClient.waitForTransactionReceipt({ hash: registerTx });
  console.log("[ERC-8004] register tx:", registerTx);

  // Parse agentId from Transfer event (tokenId field)
  const transferLog = registerReceipt.logs.find((l) =>
    l.topics[0] === keccak256(toHex("Transfer(address,address,uint256)"))
  );
  const agentId = transferLog?.topics[3]
    ? BigInt(transferLog.topics[3])
    : undefined;

  console.log("[ERC-8004] agentId:", agentId?.toString() ?? "unknown (check tx logs)");

  // Step 2: Give initial reputation feedback (validator)
  let feedbackTx: `0x${string}` | undefined;
  const score = opts.initialScore ?? 75;

  if (agentId !== undefined) {
    const feedbackData = `initial registration feedback for agent ${agentId}`;
    const feedbackHash = keccak256(toHex(feedbackData)) as `0x${string}`;

    console.log("[ERC-8004] Recording initial reputation score:", score);
    feedbackTx = await validatorWallet.writeContract({
      address: ARC_TESTNET.contracts.reputationRegistry as `0x${string}`,
      abi:     REPUTATION_REGISTRY_ABI,
      functionName: "giveFeedback",
      args: [agentId, score, feedbackHash],
    });
    await publicClient.waitForTransactionReceipt({ hash: feedbackTx });
    console.log("[ERC-8004] feedback tx:", feedbackTx);
  }

  // Step 3: Read current reputation score
  let reputationScore: number | undefined;
  if (agentId !== undefined) {
    const raw = await publicClient.readContract({
      address: ARC_TESTNET.contracts.reputationRegistry as `0x${string}`,
      abi:     REPUTATION_REGISTRY_ABI,
      functionName: "getScore",
      args: [agentId],
    });
    reputationScore = Number(raw as bigint);
    console.log("[ERC-8004] reputation score:", reputationScore);
  }

  return {
    agentId,
    owner: ownerAccount.address,
    registerTx,
    feedbackTx,
    reputationScore,
    dryRun: false,
  };
}

// CLI entry point
if (process.argv[1]?.endsWith("register.ts")) {
  const ownerKey    = process.env.SELLER_PRIVATE_KEY as `0x${string}`;
  const validatorKey = process.env.BUYER_PRIVATE_KEY as `0x${string}`;
  const dryRun      = process.argv.includes("--dry-run");

  if (!ownerKey && !dryRun) {
    console.error("Set SELLER_PRIVATE_KEY in env (or use --dry-run)");
    process.exit(1);
  }

  registerAgent({
    ownerKey:    ownerKey ?? "0x0000000000000000000000000000000000000000000000000000000000000001",
    validatorKey,
    metadataURI: process.env.METADATA_URI ?? "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    initialScore: 80,
    dryRun,
  })
    .then((result) => {
      console.log("\n[ERC-8004] Registration result:");
      console.log(JSON.stringify(result, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
      console.log(`\n[ERC-8004] Explorer: ${ARC_TESTNET.explorerAddress(ARC_TESTNET.contracts.identityRegistry)}`);
    })
    .catch(console.error);
}
