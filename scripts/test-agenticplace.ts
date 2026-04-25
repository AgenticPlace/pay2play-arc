/**
 * Smoke test for the AgenticPlace gateway (C9).
 *
 * Verifies free + paid endpoints:
 *   GET  /          → service banner
 *   GET  /info      → contract addresses
 *   GET  /health    → all 3 Arc contracts reachable (REAL on-chain probe)
 *   POST /agent/register without payment → 402 with PAYMENT-REQUIRED
 *   POST /job/create without payment     → 402 with PAYMENT-REQUIRED
 *
 * Usage:
 *   PORT=3009 SELLER_ADDRESS=0x... pnpm --filter @pay2play/c9-agent-identity start &
 *   pnpm tsx scripts/test-agenticplace.ts
 */

const BASE = process.env.AGENTICPLACE_GATEWAY ?? "http://localhost:3009";

interface Check {
  name: string;
  expectStatus: number;
  ok: boolean;
  detail?: string;
}

const results: Check[] = [];

async function check(
  name: string,
  url: string,
  init: RequestInit,
  expectStatus: number,
  validate?: (body: unknown) => boolean,
): Promise<void> {
  try {
    const r = await fetch(url, init);
    let body: unknown = null;
    try {
      body = await r.json();
    } catch {
      body = null;
    }
    const statusOk = r.status === expectStatus;
    const validateOk = validate ? validate(body) : true;
    results.push({
      name,
      expectStatus,
      ok: statusOk && validateOk,
      detail: statusOk
        ? validateOk
          ? `200 ${JSON.stringify(body).slice(0, 80)}`
          : `validation failed: ${JSON.stringify(body).slice(0, 120)}`
        : `expected ${expectStatus}, got ${r.status}`,
    });
  } catch (err) {
    results.push({
      name,
      expectStatus,
      ok: false,
      detail: `fetch error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function main() {
  console.log(`[test-agenticplace] hitting ${BASE}\n`);

  await check(
    "GET /",
    `${BASE}/`,
    { method: "GET" },
    200,
    (b: any) => b?.service === "c9-agent-identity",
  );

  await check(
    "GET /info",
    `${BASE}/info`,
    { method: "GET" },
    200,
    (b: any) => b?.contracts?.jobEscrow?.startsWith("0x"),
  );

  await check(
    "GET /health (probes Arc contracts)",
    `${BASE}/health`,
    { method: "GET" },
    200,
    (b: any) => b?.ok === true && Object.keys(b?.checks ?? {}).length === 3,
  );

  await check(
    "POST /agent/register without payment → 402",
    `${BASE}/agent/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerKey: "0xaaaa", metadataURI: "ipfs://test" }),
    },
    402,
    () => true,
  );

  await check(
    "POST /job/create without payment → 402",
    `${BASE}/job/create`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientKey: "0xaaaa",
        providerKey: "0xbbbb",
        descText: "test",
        budgetUsdc: 0.01,
      }),
    },
    402,
    () => true,
  );

  await check(
    "GET /job/abc → 400 (invalid id)",
    `${BASE}/job/abc`,
    { method: "GET" },
    400,
    () => true,
  );

  // --- Print report
  let pass = 0;
  let fail = 0;
  for (const r of results) {
    const tag = r.ok ? "PASS" : "FAIL";
    console.log(`  [${tag}] ${r.name}`);
    if (!r.ok) console.log(`         → ${r.detail}`);
    r.ok ? pass++ : fail++;
  }
  console.log(`\n${pass}/${results.length} checks passed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[test-agenticplace] fatal:", err);
  process.exit(1);
});
