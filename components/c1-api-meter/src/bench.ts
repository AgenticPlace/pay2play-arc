/**
 * C1 bench — generate N paid calls to a running c1 server.
 *
 * Uses @circle-fin/x402-batching/client `GatewayClient` to sign authorizations.
 * Produces settlement txs on Arc testnet; hashes appear in the server log
 * and on https://testnet.arcscan.app/address/<SELLER>.
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { wrapFetchWithPayment } from "@pay2play/client/fetch";

const N = parseInt(process.argv[2] ?? "200", 10);
const BASE = process.env.C1_URL ?? "http://localhost:4021";
const BUYER_PK = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!BUYER_PK) {
  console.error("Set BUYER_PRIVATE_KEY in .env");
  process.exit(1);
}

// Create GatewayClient scoped to Arc testnet; SDK handles EIP-712 signing
const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: BUYER_PK });

// Ensure a Gateway deposit exists before spending (one-time onchain tx)
const balances = await gateway.getBalances();
const available = Number(balances.gateway.formattedAvailable ?? "0");
if (available < 0.1) {
  console.log(`Gateway balance is ${available} USDC — depositing 1 USDC ...`);
  const dep = await gateway.deposit("1");
  console.log(`deposit tx: ${dep.depositTxHash}`);
}

// Build our paying fetch
const payingFetch = wrapFetchWithPayment(fetch, {
  payment: async (challenge, resourceUrl) => {
    // GatewayClient exposes a pay(url) convenience in the reference agent.
    // For library purity we use its sign API; fallback to pay(url) if needed.
    if (typeof (gateway as unknown as { signPayment?: Function }).signPayment === "function") {
      return await (gateway as unknown as { signPayment: (c: unknown, u: string) => Promise<string> }).signPayment(challenge, resourceUrl);
    }
    // The reference uses gateway.pay(url) which handles the 402 retry itself.
    // Since our wrapFetchWithPayment already handles retry, we need just the
    // signature. This helper wraps gateway.pay() to extract the header.
    throw new Error(
      "GatewayClient sign API not exposed in public SDK — use gateway.pay() directly in bench. Update this module once SDK exports are confirmed.",
    );
  },
});

console.log(`[bench] hammering ${BASE} with ${N} paid calls...`);
const t0 = Date.now();
let ok = 0;
let err = 0;
for (let i = 0; i < N; i++) {
  try {
    // Alternate endpoints
    const url =
      i % 2 === 0
        ? `${BASE}/weather`
        : `${BASE}/geocode?q=${encodeURIComponent(`city-${i}`)}`;
    const r = await payingFetch(url);
    if (r.response.status === 200) ok += 1;
    else {
      err += 1;
      if (err < 5) console.error(`[bench] fail ${r.response.status}`);
    }
    if ((i + 1) % 25 === 0) {
      console.log(`[bench] ${i + 1}/${N} — ok=${ok} err=${err}`);
    }
  } catch (e) {
    err += 1;
    if (err < 5) console.error(`[bench] error`, e);
  }
}
const dt = Date.now() - t0;
console.log(`[bench] done ${ok}/${N} in ${dt}ms — ~${Math.round((N / dt) * 1000)} req/s`);
console.log(`[bench] check settlements at the server's /stats`);
