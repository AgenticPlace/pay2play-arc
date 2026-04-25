// Arc testnet config — confirmed from _refs/arc-nanopayments/lib/x402.ts,
// _refs/arc-nanopayments/agent.mts, and docs.arc.network/arc/references/contract-addresses

export const ARC_TESTNET = {
  name: "Arc Testnet",
  chainId: 5042002,
  caip2: "eip155:5042002",
  rpcUrl: "https://rpc.testnet.arc.network",
  wsUrl: "wss://rpc.testnet.arc.network",
  explorer: "https://testnet.arcscan.app",
  explorerAddress: (addr: string) => `https://testnet.arcscan.app/address/${addr}`,
  explorerTx: (tx: string) => `https://testnet.arcscan.app/tx/${tx}`,
  minGasPriceGwei: 20n,
  // CCTP v2 domain
  cctpDomain: 26,
  // Native USDC: gas token uses 18 decimals, ERC-20 surface uses 6 decimals
  nativeGasDecimals: 18,
  erc20Decimals: 6,
  contracts: {
    // ── Stablecoins ──────────────────────────────────────────────────────────
    // USDC: native gas token (18-dec on-chain) with ERC-20 surface (6-dec)
    usdc: "0x3600000000000000000000000000000000000000",
    eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    // USYC: yield-bearing treasury-backed token
    usyc: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C",

    // ── Circle Gateway (Domain 26) ────────────────────────────────────────
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",

    // ── CCTP V2 Cross-Chain (Domain 26) ──────────────────────────────────
    cctpTokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    cctpMessageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",

    // ── Auxiliary ─────────────────────────────────────────────────────────
    // FxEscrow: stablecoin FX swap settlement (USDC ↔ EURC)
    fxEscrow: "0x867650F5eAe8df91445971f14d89fd84F0C9a9f8",
    // Memo: attach arbitrary metadata to transactions
    memo: "0x9702466268ccF55eAB64cdf484d272Ac08d3b75b",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",

    // ── ERC-8004: AI Agent Identity & Reputation ─────────────────────────
    // IdentityRegistry: ERC-721 agent registration (register, ownerOf, tokenURI)
    identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    // ReputationRegistry: feedback signals and aggregated on-chain scores
    reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    // ValidationRegistry: validation request/response lifecycle
    validationRegistry: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272",

    // ── ERC-8183: AI Job Escrow ───────────────────────────────────────────
    // JobEscrow: createJob → fund → submit → complete lifecycle
    jobEscrow: "0x0747EEf0706327138c69792bF28Cd525089e4583",
  },
  gatewayApi: {
    balances: "https://gateway-api-testnet.circle.com/v1/balances",
    deposits: "https://gateway-api-testnet.circle.com/v1/deposits",
    withdrawals: "https://gateway-api-testnet.circle.com/v1/withdrawals",
  },
  // Arc MCP server — add to Claude Code via:
  // claude mcp add --transport http arc-docs https://docs.arc.network/mcp
  mcpUrl: "https://docs.arc.network/mcp",
  faucetUrl: "https://faucet.circle.com",
  docsUrl: "https://docs.arc.network",
} as const;

export type ArcConfig = typeof ARC_TESTNET;

// ── Contract ABI fragments ────────────────────────────────────────────────────
// Minimal ABIs for ERC-8004 and ERC-8183 — sufficient for registration + job flows.

export const IDENTITY_REGISTRY_ABI = [
  { name: "register",    type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "metadataURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }] },
  { name: "ownerOf",     type: "function", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }] },
  { name: "tokenURI",    type: "function", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }] },
  { name: "Transfer",    type: "event",
    inputs: [
      { name: "from",    type: "address", indexed: true },
      { name: "to",      type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ] },
] as const;

export const REPUTATION_REGISTRY_ABI = [
  { name: "giveFeedback", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "agentId",      type: "uint256" },
      { name: "score",        type: "uint8"   },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [] },
  { name: "getScore", type: "function", stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "score", type: "uint256" }] },
  { name: "revokeFeedback", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "feedbackId", type: "uint256" }],
    outputs: [] },
] as const;

export const VALIDATION_REGISTRY_ABI = [
  { name: "validationRequest", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "agentId",        type: "uint256" },
      { name: "requestHash",    type: "bytes32" },
      { name: "requestURI",     type: "string"  },
    ],
    outputs: [{ name: "requestId", type: "uint256" }] },
  { name: "validationResponse", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "requestId",     type: "uint256" },
      { name: "responseCode",  type: "uint8"   },
      { name: "responseHash",  type: "bytes32" },
    ],
    outputs: [] },
] as const;

export const JOB_ESCROW_ABI = [
  { name: "createJob", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "provider",    type: "address" },
      { name: "evaluator",   type: "address" },
      { name: "expiry",      type: "uint256" },
      { name: "descHash",    type: "bytes32" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }] },
  { name: "setBudget", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "jobId",  type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [] },
  { name: "fund", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [] },
  { name: "submit", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "jobId",            type: "uint256" },
      { name: "deliverableHash",  type: "bytes32" },
    ],
    outputs: [] },
  { name: "complete", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "jobId",      type: "uint256" },
      { name: "reasonHash", type: "bytes32" },
    ],
    outputs: [] },
  { name: "dispute", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [] },
  { name: "getJob", type: "function", stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      { name: "client",          type: "address" },
      { name: "provider",        type: "address" },
      { name: "evaluator",       type: "address" },
      { name: "amount",          type: "uint256" },
      { name: "expiry",          type: "uint256" },
      { name: "state",           type: "uint8"   },
      { name: "deliverableHash", type: "bytes32" },
    ] },
  { name: "JobCreated",   type: "event",
    inputs: [
      { name: "jobId",    type: "uint256", indexed: true },
      { name: "client",   type: "address", indexed: true },
      { name: "provider", type: "address", indexed: true },
    ] },
  { name: "JobCompleted", type: "event",
    inputs: [
      { name: "jobId",    type: "uint256", indexed: true },
      { name: "payout",   type: "uint256", indexed: false },
    ] },
] as const;

export const ERC20_ABI = [
  { name: "approve",     type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }] },
  { name: "transfer",    type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }] },
  { name: "balanceOf",   type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "allowance",   type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
] as const;

/**
 * Verify the RPC endpoint actually returns the expected chain ID.
 * Call at startup — fails loud if mismatch. Prevents foot-gun where
 * the RPC URL is pointed at a different chain than assumed.
 */
export async function verifyChainId(
  rpcUrl: string = ARC_TESTNET.rpcUrl,
  expected: number = ARC_TESTNET.chainId,
): Promise<number> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: [],
    }),
  });
  if (!res.ok) throw new Error(`RPC ${rpcUrl} returned ${res.status}`);
  const json = (await res.json()) as { result?: string };
  if (!json.result) throw new Error(`RPC ${rpcUrl} missing result`);
  const actual = parseInt(json.result, 16);
  if (actual !== expected) {
    throw new Error(
      `Chain ID mismatch at ${rpcUrl}: expected ${expected}, got ${actual}`,
    );
  }
  return actual;
}

import { parseDecimal, formatDecimal, USDC_DECIMALS } from "./decimal.js";

/** Format a USDC amount (atomic 6-decimal) to human-readable dollars. */
export function formatUsdc(atomic: bigint | number | string): string {
  const n = typeof atomic === "bigint" ? atomic : BigInt(atomic);
  return formatDecimal(n, USDC_DECIMALS);
}

/**
 * Parse a "$0.001" price string to atomic 6-decimal USDC.
 *
 * Backed by the bigint `parseDecimal` engine — no float arithmetic. Rejects
 * inputs with more than 6 fractional digits to prevent silent precision loss.
 * Rejects negative values — meter prices cannot be negative.
 */
export function parseUsdPrice(price: string): bigint {
  const atomic = parseDecimal(price, USDC_DECIMALS);
  if (atomic < 0n) {
    throw new Error(`parseUsdPrice: negative prices not allowed (got "${price}")`);
  }
  return atomic;
}
