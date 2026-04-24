/**
 * Generate two fresh EOAs (seller + buyer) and print an .env snippet.
 *
 * These are testnet-only wallets. Never reuse on mainnet. The private keys
 * are printed to stdout; copy them into .env and keep them out of git.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const sellerKey = generatePrivateKey();
const buyerKey = generatePrivateKey();
const seller = privateKeyToAccount(sellerKey);
const buyer = privateKeyToAccount(buyerKey);

const snippet = `
# Paste into .env (testnet-only; never commit)
SELLER_ADDRESS=${seller.address}
SELLER_PRIVATE_KEY=${sellerKey}
BUYER_ADDRESS=${buyer.address}
BUYER_PRIVATE_KEY=${buyerKey}
`.trim();

console.log(snippet);
console.log("");
console.log("Next: fund the buyer at https://faucet.circle.com → Arc Testnet → 20 USDC.");
