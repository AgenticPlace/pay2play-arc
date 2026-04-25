import { GatewayClient } from "@circle-fin/x402-batching/client";

async function main() {
  const BASE = process.env.C6_URL ?? "http://localhost:4026";
  const PK   = process.env.BUYER_PRIVATE_KEY as `0x${string}`;
  if (!PK) { console.error("BUYER_PRIVATE_KEY not set"); process.exit(1); }

  const gw  = new GatewayClient({ chain: "arcTestnet", privateKey: PK });
  const bal = await gw.getBalances();
  console.log(`[c6] Gateway balance: ${bal.gateway?.formattedAvailable} USDC`);

  // 402 gate check
  const unauth = await fetch(`${BASE}/classify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frames: [{ id: "f0", data: "dGVzdA==" }] }),
  });
  console.log(`[c6] POST /classify unpaid → HTTP ${unauth.status} (expect 402)`);

  // Pay for 3 frames
  const frames = [
    { id: "f1", data: Buffer.from("frame-data-1").toString("base64") },
    { id: "f2", data: Buffer.from("frame-data-2").toString("base64") },
    { id: "f3", data: Buffer.from("frame-data-3").toString("base64") },
  ];
  const r = await gw.pay(`${BASE}/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frames }),
  });
  console.log(`[c6] 3 frames classified: ${r.formattedAmount} USDC`);

  // Service info (free)
  const info = await (await fetch(`${BASE}/`)).json() as Record<string, unknown>;
  console.log(`[c6] info: pricePerFrame=${info.pricePerFrame}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
