import { GatewayClient } from "@circle-fin/x402-batching/client";

async function main() {
  const BASE = process.env.C7_URL ?? "http://localhost:4027";
  const PK   = process.env.BUYER_PRIVATE_KEY as `0x${string}`;
  if (!PK) { console.error("BUYER_PRIVATE_KEY not set"); process.exit(1); }

  const gw  = new GatewayClient({ chain: "arcTestnet", privateKey: PK });
  const bal = await gw.getBalances();
  console.log(`[c7] Gateway balance: ${bal.gateway?.formattedAvailable} USDC`);

  // 402 gate check
  const unauth = await fetch(`${BASE}/data?limit=10`);
  console.log(`[c7] GET /data?limit=10 unpaid → HTTP ${unauth.status} (expect 402)`);

  // Buy 50 rows
  const r1 = await gw.pay(`${BASE}/data?limit=50`, { method: "GET" });
  console.log(`[c7] 50 rows  paid: ${r1.formattedAmount} USDC`);

  // Buy 100 rows
  const r2 = await gw.pay(`${BASE}/data?limit=100`, { method: "GET" });
  console.log(`[c7] 100 rows paid: ${r2.formattedAmount} USDC`);

  // Service info (free)
  const info = await (await fetch(`${BASE}/`)).json() as Record<string, unknown>;
  console.log(`[c7] info: pricePerRow=${info.pricePerRow}  totalRows=${info.totalRows}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
