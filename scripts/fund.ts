/**
 * Balance-check helper. Prints USDC balances for the seller and buyer
 * addresses on Arc Testnet and points the user at the Circle faucet if
 * the buyer is empty.
 *
 * The Circle faucet is browser-gated, so this script can't pull funds
 * itself — it surfaces the URL + expected flow.
 */
import { createPublicClient, http, getContract } from "viem";

const RPC_URL = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
const CHAIN_ID = Number(process.env.ARC_CHAIN_ID ?? "5042002");
const USDC = (process.env.ARC_USDC_ADDRESS ??
  "0x3600000000000000000000000000000000000000") as `0x${string}`;
const SELLER = process.env.SELLER_ADDRESS as `0x${string}` | undefined;
const BUYER = process.env.BUYER_ADDRESS as `0x${string}` | undefined;

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

async function main() {
  if (!SELLER || !BUYER) {
    console.error("[fund] SELLER_ADDRESS and BUYER_ADDRESS must be set in .env");
    console.error("[fund] Run: pnpm generate-wallets");
    process.exit(1);
  }
  const client = createPublicClient({
    transport: http(RPC_URL),
    chain: {
      id: CHAIN_ID,
      name: "Arc Testnet",
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
      rpcUrls: { default: { http: [RPC_URL] } },
    },
  });

  const usdc = getContract({ address: USDC, abi: ERC20_ABI, client });
  const [sellerBal, buyerBal] = await Promise.all([
    usdc.read.balanceOf([SELLER]),
    usdc.read.balanceOf([BUYER]),
  ]);

  const fmt = (n: bigint) => (Number(n) / 1e6).toFixed(6);
  console.log(`[fund] seller ${SELLER}: ${fmt(sellerBal)} USDC`);
  console.log(`[fund] buyer  ${BUYER}: ${fmt(buyerBal)} USDC`);

  if (buyerBal < 1_000_000n) {
    console.log("");
    console.log("[fund] buyer balance below 1 USDC. Fund at:");
    console.log("       https://faucet.circle.com  →  Arc Testnet  →  20 USDC");
    console.log("       (rate limit: 20 USDC / 2h / addr)");
  } else {
    console.log("[fund] buyer is funded — good to go.");
  }
}

main().catch((e) => {
  console.error("[fund] failed:", e);
  process.exit(1);
});
