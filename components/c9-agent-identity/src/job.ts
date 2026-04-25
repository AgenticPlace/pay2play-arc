/**
 * ERC-8183 Job Lifecycle on Arc Testnet.
 *
 * State machine: OPEN → FUNDED → SUBMITTED → COMPLETED
 *
 * Deployed contract (Arc Testnet): 0x0747EEf0706327138c69792bF28Cd525089e4583
 *
 * Flow:
 *   1. Client: createJob(provider, evaluator, expiry, descHash) → jobId
 *   2. Provider: setBudget(jobId, amount)
 *   3. Client: approve(usdc, jobEscrow, amount)
 *   4. Client: fund(jobId) → locks USDC
 *   5. Provider: submit(jobId, deliverableHash)
 *   6. Evaluator: complete(jobId, reasonHash) → USDC released to provider
 */

import { createWalletClient, createPublicClient, http, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ARC_TESTNET,
  JOB_ESCROW_ABI,
  ERC20_ABI,
  JOB_STATE_MAP,
  type JobInfo,
} from "@pay2play/core";

const arcChain = {
  id:   ARC_TESTNET.chainId,
  name: ARC_TESTNET.name,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [ARC_TESTNET.rpcUrl] } },
} as const;

const JOB_ESCROW_ADDRESS = ARC_TESTNET.contracts.jobEscrow as `0x${string}`;
const USDC_ADDRESS       = ARC_TESTNET.contracts.usdc as `0x${string}`;

export interface JobLifecycleOptions {
  clientKey:    `0x${string}`;
  providerKey:  `0x${string}`;
  evaluatorKey: `0x${string}`;
  descText:     string;
  budgetUsdc:   number;   // in dollars, e.g. 1.00
  expirySeconds?: number; // from now, default 1 hour
  deliverable:  string;
}

export interface JobLifecycleResult {
  jobId:        bigint;
  createTx:     `0x${string}`;
  fundTx:       `0x${string}`;
  submitTx:     `0x${string}`;
  completeTx:   `0x${string}`;
  finalState:   string;
}

/** Run the complete ERC-8183 job lifecycle end-to-end. */
export async function runJobLifecycle(opts: JobLifecycleOptions): Promise<JobLifecycleResult> {
  const clientAccount    = privateKeyToAccount(opts.clientKey);
  const providerAccount  = privateKeyToAccount(opts.providerKey);
  const evaluatorAccount = privateKeyToAccount(opts.evaluatorKey);

  const transport    = http(ARC_TESTNET.rpcUrl);
  const publicClient = createPublicClient({ chain: arcChain, transport });
  const clientWallet    = createWalletClient({ account: clientAccount,    chain: arcChain, transport });
  const providerWallet  = createWalletClient({ account: providerAccount,  chain: arcChain, transport });
  const evaluatorWallet = createWalletClient({ account: evaluatorAccount, chain: arcChain, transport });

  const budgetAtomic = BigInt(Math.round(opts.budgetUsdc * 1_000_000));
  const expiry       = BigInt(Math.floor(Date.now() / 1000) + (opts.expirySeconds ?? 3600));
  const descHash     = keccak256(toHex(opts.descText)) as `0x${string}`;

  // 1. Create job
  console.log("[ERC-8183] Creating job...");
  const createTx = await clientWallet.writeContract({
    address:  JOB_ESCROW_ADDRESS,
    abi:      JOB_ESCROW_ABI,
    functionName: "createJob",
    args:     [providerAccount.address, evaluatorAccount.address, expiry, descHash],
  });
  const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createTx });
  console.log("[ERC-8183] createJob tx:", createTx);

  // Parse jobId from JobCreated event
  const jobCreatedLog = createReceipt.logs.find((l) =>
    l.topics[0] === keccak256(toHex("JobCreated(uint256,address,address)"))
  );
  const jobId = jobCreatedLog?.topics[1] ? BigInt(jobCreatedLog.topics[1]) : 0n;
  console.log("[ERC-8183] jobId:", jobId.toString());

  // 2. Provider sets budget
  console.log("[ERC-8183] Setting budget:", opts.budgetUsdc, "USDC");
  await providerWallet.writeContract({
    address:  JOB_ESCROW_ADDRESS,
    abi:      JOB_ESCROW_ABI,
    functionName: "setBudget",
    args:     [jobId, budgetAtomic],
  });

  // 3. Client approves USDC spend
  console.log("[ERC-8183] Approving USDC...");
  await clientWallet.writeContract({
    address:  USDC_ADDRESS,
    abi:      ERC20_ABI,
    functionName: "approve",
    args:     [JOB_ESCROW_ADDRESS, budgetAtomic],
  });

  // 4. Client funds the job
  console.log("[ERC-8183] Funding job...");
  const fundTx = await clientWallet.writeContract({
    address:  JOB_ESCROW_ADDRESS,
    abi:      JOB_ESCROW_ABI,
    functionName: "fund",
    args:     [jobId],
  });
  await publicClient.waitForTransactionReceipt({ hash: fundTx });
  console.log("[ERC-8183] fund tx:", fundTx);

  // 5. Provider submits work
  const deliverableHash = keccak256(toHex(opts.deliverable)) as `0x${string}`;
  console.log("[ERC-8183] Submitting deliverable...");
  const submitTx = await providerWallet.writeContract({
    address:  JOB_ESCROW_ADDRESS,
    abi:      JOB_ESCROW_ABI,
    functionName: "submit",
    args:     [jobId, deliverableHash],
  });
  await publicClient.waitForTransactionReceipt({ hash: submitTx });
  console.log("[ERC-8183] submit tx:", submitTx);

  // 6. Evaluator completes (releases USDC to provider)
  const reasonHash = keccak256(toHex("work accepted")) as `0x${string}`;
  console.log("[ERC-8183] Completing job — releasing USDC to provider...");
  const completeTx = await evaluatorWallet.writeContract({
    address:  JOB_ESCROW_ADDRESS,
    abi:      JOB_ESCROW_ABI,
    functionName: "complete",
    args:     [jobId, reasonHash],
  });
  await publicClient.waitForTransactionReceipt({ hash: completeTx });
  console.log("[ERC-8183] complete tx:", completeTx);

  // Read final state
  const jobData = await publicClient.readContract({
    address:  JOB_ESCROW_ADDRESS,
    abi:      JOB_ESCROW_ABI,
    functionName: "getJob",
    args:     [jobId],
  }) as [string, string, string, bigint, bigint, number, string];

  const finalState = JOB_STATE_MAP[jobData[5]] ?? "UNKNOWN";
  console.log("[ERC-8183] Final state:", finalState);

  return { jobId, createTx, fundTx, submitTx, completeTx, finalState };
}

/** Read the current state of a job without sending transactions. */
export async function getJobInfo(jobId: bigint): Promise<JobInfo> {
  const transport    = http(ARC_TESTNET.rpcUrl);
  const publicClient = createPublicClient({ chain: arcChain, transport });

  const raw = await publicClient.readContract({
    address:  JOB_ESCROW_ADDRESS,
    abi:      JOB_ESCROW_ABI,
    functionName: "getJob",
    args:     [jobId],
  }) as [string, string, string, bigint, bigint, number, string];

  return {
    jobId,
    client:    raw[0] as `0x${string}`,
    provider:  raw[1] as `0x${string}`,
    evaluator: raw[2] as `0x${string}`,
    amount:    raw[3],
    expiry:    raw[4],
    state:     JOB_STATE_MAP[raw[5]] ?? "OPEN",
    deliverableHash: raw[6] as `0x${string}`,
  };
}

// CLI entry point
if (process.argv[1]?.endsWith("job.ts")) {
  const clientKey    = process.env.SELLER_PRIVATE_KEY as `0x${string}`;
  const providerKey  = process.env.BUYER_PRIVATE_KEY  as `0x${string}`;

  if (!clientKey || !providerKey) {
    console.error("Set SELLER_PRIVATE_KEY and BUYER_PRIVATE_KEY in env");
    process.exit(1);
  }

  runJobLifecycle({
    clientKey,
    providerKey,
    evaluatorKey: clientKey,  // client acts as evaluator in demo
    descText:     "Analyze sentiment of 1000 tweets — pay2play demo job",
    budgetUsdc:   0.01,
    deliverable:  "Sentiment analysis complete: 60% positive, 30% neutral, 10% negative",
  })
    .then((result) => {
      console.log("\n[ERC-8183] Job lifecycle result:");
      console.log(JSON.stringify(result, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
      console.log(`\nExplorer: ${ARC_TESTNET.explorerTx(result.completeTx)}`);
    })
    .catch(console.error);
}
