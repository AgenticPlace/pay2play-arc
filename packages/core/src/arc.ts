// Arc testnet config — confirmed from _refs/arc-nanopayments/lib/x402.ts
// and _refs/arc-nanopayments/agent.mts

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
    usdc: "0x3600000000000000000000000000000000000000",
    eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    usyc: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C",
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
    cctpTokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    cctpMessageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  },
  gatewayApi: {
    balances: "https://gateway-api-testnet.circle.com/v1/balances",
  },
} as const;

export type ArcConfig = typeof ARC_TESTNET;

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

/** Format a USDC amount (atomic 6-decimal) to human-readable dollars. */
export function formatUsdc(atomic: bigint | number | string): string {
  const n = typeof atomic === "bigint" ? atomic : BigInt(atomic);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

/** Parse a "$0.001" price string to atomic 6-decimal USDC. */
export function parseUsdPrice(price: string): bigint {
  const cleaned = price.replace("$", "").trim();
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid price: ${price}`);
  }
  // Multiply via string to avoid float precision loss at 6 decimals
  return BigInt(Math.round(n * 1_000_000));
}
