/**
 * Verify the Arc testnet RPC returns the expected chain ID.
 *
 * Arc docs/aggregators have shown `1244` in some places and `5042002` in
 * others — pin against the value we've confirmed via `eth_chainId`, fail
 * loud if mismatched. Runs before any demo that talks to Arc.
 */
const RPC_URL = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
const EXPECTED = Number(process.env.ARC_CHAIN_ID ?? "5042002");

async function main() {
  console.log(`[chain-id] RPC: ${RPC_URL}`);
  console.log(`[chain-id] expected: ${EXPECTED}`);
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
  });
  if (!res.ok) {
    console.error(`[chain-id] HTTP ${res.status} from ${RPC_URL}`);
    process.exit(1);
  }
  const json = (await res.json()) as { result?: string; error?: unknown };
  if (!json.result) {
    console.error(`[chain-id] no result`, json);
    process.exit(1);
  }
  const actual = parseInt(json.result, 16);
  console.log(`[chain-id] actual:   ${actual}`);
  if (actual !== EXPECTED) {
    console.error(`[chain-id] MISMATCH: expected ${EXPECTED}, got ${actual}`);
    process.exit(1);
  }
  console.log(`[chain-id] ok ✓`);
}

main().catch((e) => {
  console.error(`[chain-id] failed:`, e);
  process.exit(1);
});
