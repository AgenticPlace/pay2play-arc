/**
 * C1 bench — generate N paid calls to a running c1 server.
 *
 * Uses GatewayClient.pay(url) which handles the full x402 flow:
 * GET → 402 challenge → sign EIP-712 → retry with payment-signature → 200.
 * Produces settlement txs on Arc testnet visible at /stats and Arcscan.
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";

const N      = parseInt(process.argv[2] ?? "200", 10);
const BASE   = process.env.C1_URL ?? "http://localhost:4021";
const BUYER_PK = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!BUYER_PK) {
  console.error("Set BUYER_PRIVATE_KEY in .env");
  process.exit(1);
}

const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: BUYER_PK });

// Check Gateway balance; auto-deposit if dry
const balances = await gateway.getBalances();
const available = Number(balances.gateway?.formattedAvailable ?? "0");
console.log(`[bench] Gateway balance: ${available} USDC`);
if (available < 0.05) {
  console.log("[bench] Low balance — depositing 1 USDC ...");
  const dep = await gateway.deposit("1");
  console.log(`[bench] deposit tx: ${dep.depositTxHash}`);
}

console.log(`[bench] hammering ${BASE} with ${N} paid calls...`);
const t0 = Date.now();
let ok = 0;
let err = 0;
let totalUsd = 0;

for (let i = 0; i < N; i++) {
  try {
    const url = i % 2 === 0
      ? `${BASE}/weather`
      : `${BASE}/geocode?q=${encodeURIComponent(`city-${i}`)}`;

    const result = await gateway.pay(url, { method: "GET" });
    ok += 1;
    totalUsd += parseFloat(result.formattedAmount ?? "0");

    if ((i + 1) % 25 === 0) {
      console.log(`[bench] ${i + 1}/${N} — ok=${ok} err=${err} spent=$${totalUsd.toFixed(4)}`);
    }
  } catch (e: unknown) {
    err += 1;
    if (err <= 3) console.error(`[bench] error #${i + 1}:`, (e as Error).message ?? e);
  }
}

const dt = Date.now() - t0;
console.log(`[bench] done ${ok}/${N} in ${dt}ms — ~${Math.round((N / dt) * 1000)} req/s`);
console.log(`[bench] total spent: $${totalUsd.toFixed(6)} USDC`);
console.log(`[bench] check settlements: curl http://localhost:4021/stats`);
