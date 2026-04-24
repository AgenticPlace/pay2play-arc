/**
 * C2 buyer — Agent A. Asks Agent B questions on a loop, auto-paying each.
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { wrapFetchWithPayment } from "@pay2play/client/fetch";

const N = parseInt(process.argv[2] ?? "100", 10);
const URL = process.env.C2_SELLER_URL ?? "http://localhost:4022";
const PK = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!PK) {
  console.error("Set BUYER_PRIVATE_KEY in .env");
  process.exit(1);
}

const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: PK });
const balances = await gateway.getBalances();
console.log(
  `[buyer] gateway balance: ${balances.gateway.formattedAvailable} USDC available`,
);
if (Number(balances.gateway.formattedAvailable ?? "0") < 0.1) {
  console.log("[buyer] depositing 1 USDC to Gateway...");
  const d = await gateway.deposit("1");
  console.log(`[buyer] deposit tx: ${d.depositTxHash}`);
}

const payingFetch = wrapFetchWithPayment(fetch, {
  payment: async (challenge, _url) => {
    // See c1/bench.ts note — GatewayClient exact sign API TBD on public surface.
    const anyGw = gateway as unknown as {
      signPayment?: (c: unknown) => Promise<string>;
      sign?: (c: unknown) => Promise<string>;
    };
    if (anyGw.signPayment) return anyGw.signPayment(challenge);
    if (anyGw.sign) return anyGw.sign(challenge);
    throw new Error("GatewayClient sign API not found; update once SDK public-exports are confirmed");
  },
});

const TOPICS = ["weather", "stocks", "crypto", "news"] as const;
console.log(`[buyer] running ${N} paid asks to ${URL} ...`);
let ok = 0, fail = 0;
const t0 = Date.now();

for (let i = 0; i < N; i++) {
  const topic = TOPICS[i % TOPICS.length];
  try {
    const r = await payingFetch(`${URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });
    if (r.response.status === 200) ok += 1;
    else fail += 1;
    if ((i + 1) % 10 === 0) {
      console.log(`[buyer] ${i + 1}/${N}  ok=${ok} fail=${fail}  last tx=${r.receipt?.transaction ?? "-"}`);
    }
  } catch (e) {
    fail += 1;
    if (fail < 3) console.error("[buyer] error", e);
  }
}

const dt = Date.now() - t0;
console.log(`[buyer] done ${ok}/${N} in ${dt}ms  ~${((ok / dt) * 1000).toFixed(1)} rps`);
