import { GatewayClient } from "@circle-fin/x402-batching/client";

async function main() {
  const pk = process.env.BUYER_PRIVATE_KEY as `0x${string}`;
  if (!pk) { console.error("BUYER_PRIVATE_KEY not set"); process.exit(1); }
  const gw = new GatewayClient({ chain: "arcTestnet", privateKey: pk });
  const b = await gw.getBalances();
  console.log(`Gateway available : ${b.gateway?.formattedAvailable ?? "?"} USDC`);
  console.log(`Gateway pending   : ${b.gateway?.formattedPending ?? "0"} USDC`);
  console.log(`Wallet balance    : ${b.wallet?.formattedAvailable ?? "?"} USDC`);
}
main().catch(console.error);
