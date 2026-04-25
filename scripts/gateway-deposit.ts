/**
 * Deposit buyer's USDC into Circle Gateway for batched settlement.
 * This is the one required on-chain tx before x402 pay loop works.
 *
 * Usage: pnpm tsx scripts/gateway-deposit.ts [amount]
 * Default amount: 1 USDC
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";

async function main() {
  const amount = process.argv[2] ?? "1";

  const buyerKey  = process.env.BUYER_PRIVATE_KEY;
  const buyerAddr = process.env.BUYER_ADDRESS;

  if (!buyerKey || !buyerAddr) {
    console.error("[deposit] BUYER_PRIVATE_KEY and BUYER_ADDRESS must be set in .env");
    process.exit(1);
  }

  console.log(`[deposit] Depositing ${amount} USDC into Circle Gateway...`);
  console.log(`[deposit] Buyer: ${buyerAddr}`);

  const client = new GatewayClient({
    chain:      "arcTestnet",
    privateKey: buyerKey as `0x${string}`,
  });

  // Check balance before
  const before = await client.getBalances();
  console.log(`[deposit] Gateway balance before: ${before.gateway?.formattedAvailable ?? "0"} USDC`);

  // Deposit
  const result = await client.deposit(amount);
  console.log(`[deposit] Deposit tx: ${result.depositTxHash}`);
  console.log(`[deposit] Explorer:   https://testnet.arcscan.app/tx/${result.depositTxHash}`);

  // Check balance after
  const after = await client.getBalances();
  console.log(`[deposit] Gateway balance after:  ${after.gateway?.formattedAvailable ?? "?"} USDC`);
  console.log(`[deposit] Done — buyer is ready to pay via x402.`);
}

main().catch((e) => {
  console.error("[deposit] failed:", e);
  process.exit(1);
});
