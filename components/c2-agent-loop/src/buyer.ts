/**
 * C2 buyer — Agent A. Asks Agent B questions on a loop, auto-paying each.
 * Uses GatewayClient.pay() which handles the full x402 flow internally.
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";

const N   = parseInt(process.argv[2] ?? "20", 10);
const URL = process.env.C2_SELLER_URL ?? "http://localhost:4022";
const PK  = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!PK) { console.error("Set BUYER_PRIVATE_KEY in .env"); process.exit(1); }

const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: PK });
const balances = await gateway.getBalances();
console.log(`[buyer] gateway balance: ${balances.gateway?.formattedAvailable ?? "?"} USDC`);
if (Number(balances.gateway?.formattedAvailable ?? "0") < 0.05) {
  console.log("[buyer] depositing 1 USDC to Gateway...");
  const d = await gateway.deposit("1");
  console.log(`[buyer] deposit tx: ${d.depositTxHash}`);
}

const TOPICS = ["weather", "stocks", "crypto", "news"] as const;
console.log(`[buyer] running ${N} paid asks to ${URL} ...`);
let ok = 0, fail = 0, totalUsd = 0;
const t0 = Date.now();

for (let i = 0; i < N; i++) {
  const topic = TOPICS[i % TOPICS.length];
  try {
    const result = await gateway.pay(`${URL}/ask`, {
      method: "POST",
      body: JSON.stringify({ topic }),
      headers: { "Content-Type": "application/json" },
    });
    ok += 1;
    totalUsd += parseFloat(result.formattedAmount ?? "0");
    if ((i + 1) % 5 === 0) {
      console.log(`[buyer] ${i + 1}/${N}  ok=${ok} fail=${fail}  spent=$${totalUsd.toFixed(4)}`);
    }
  } catch (e: unknown) {
    fail += 1;
    if (fail <= 3) console.error("[buyer] error", (e as Error).message ?? e);
  }
}

const dt = Date.now() - t0;
console.log(`[buyer] done ${ok}/${N} in ${dt}ms  ~${((ok / dt) * 1000).toFixed(1)} rps`);
console.log(`[buyer] total spent: $${totalUsd.toFixed(6)} USDC`);
