/**
 * C9 test — ERC-8004 agent registration + ERC-8183 job lifecycle (dry-run).
 * Uses SELLER_PRIVATE_KEY as the agent owner / job client.
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";

async function main() {
  const BASE       = process.env.C9_URL ?? "http://localhost:3009";
  const BUYER_PK   = process.env.BUYER_PRIVATE_KEY as `0x${string}`;
  const SELLER_PK  = process.env.SELLER_PRIVATE_KEY as `0x${string}`;
  const SELLER_ADDR = process.env.SELLER_ADDRESS;
  if (!BUYER_PK || !SELLER_PK) { console.error("Keys not set"); process.exit(1); }

  const gw  = new GatewayClient({ chain: "arcTestnet", privateKey: BUYER_PK });
  const bal = await gw.getBalances();
  console.log(`[c9] Gateway balance: ${bal.gateway?.formattedAvailable} USDC`);

  // 402 gate checks (free probe)
  const r1 = await fetch(`${BASE}/agent/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerKey: "0x0", metadataURI: "ipfs://test" }),
  });
  console.log(`[c9] POST /agent/register unpaid → HTTP ${r1.status} (expect 402)`);

  const r2 = await fetch(`${BASE}/job/create`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  console.log(`[c9] POST /job/create unpaid → HTTP ${r2.status} (expect 402)`);

  // Paid: register agent (dry-run — uses seller key, no real wallet funded for gas)
  console.log(`\n[c9] Paying $0.002 to register agent (ERC-8004 dry-run)...`);
  const reg = await gw.pay(`${BASE}/agent/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ownerKey:      SELLER_PK,
      metadataURI:   "ipfs://QmPay2PlayAgentV1/metadata.json",
      initialScore:  85,
      dryRun:        true,
    }),
  });
  console.log(`[c9] register paid: ${reg.formattedAmount} USDC`);
  try {
    const body = JSON.parse(reg.body as string ?? "{}");
    console.log(`[c9] register response:`, JSON.stringify(body).slice(0, 300));
  } catch { console.log(`[c9] response body raw:`, String(reg.body).slice(0, 200)); }

  // Paid: create job (dry-run)
  console.log(`\n[c9] Paying $0.002 to create job (ERC-8183 dry-run)...`);
  const job = await gw.pay(`${BASE}/job/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey:    SELLER_PK,
      providerKey:  BUYER_PK,
      descText:     "Classify image batch #42",
      budgetUsdc:   "0.01",
      dryRun:       true,
    }),
  });
  console.log(`[c9] create job paid: ${job.formattedAmount} USDC`);
  try {
    const body = JSON.parse(job.body as string ?? "{}");
    console.log(`[c9] job response:`, JSON.stringify(body).slice(0, 300));
  } catch { console.log(`[c9] response body raw:`, String(job.body).slice(0, 200)); }
}

main().catch((e) => { console.error(e); process.exit(1); });
