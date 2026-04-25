/**
 * PPMT calculator — prints a fee breakdown + Profit-Per-Million-Transactions
 * projection for a given fee config. Accepts knobs via env vars (the same
 * ones the components use), so an operator can sanity-check what their
 * deploy will earn before bringing it up.
 *
 * Usage:
 *   PAY2PLAY_BASE_PRICE_USD=0.002 \
 *   PAY2PLAY_FEE_BPS=30 \
 *   PAY2PLAY_GAS_OVERHEAD_USD=0.00003 \
 *   pnpm tsx scripts/ppmt-calculator.ts
 *
 *   # Or: a sweep across all the default component prices
 *   pnpm tsx scripts/ppmt-calculator.ts --sweep
 */
// Relative-path import works regardless of pnpm workspace state.
import {
  feeConfig,
  priceBreakdown,
  USDC_DECIMALS,
  type FeeConfig,
} from "../packages/core/src/index.js";

const argv = process.argv.slice(2);
const sweep = argv.includes("--sweep");

const ENV_BASE = process.env.PAY2PLAY_BASE_PRICE_USD ?? "0.002";
const ENV_BPS = process.env.PAY2PLAY_FEE_BPS
  ? Number(process.env.PAY2PLAY_FEE_BPS)
  : undefined;
const ENV_GAS = process.env.PAY2PLAY_GAS_OVERHEAD_USD;

interface Row {
  label: string;
  basePrice: string;
  bps: number | undefined;
  gas: string | undefined;
}

const ROWS: Row[] = sweep
  ? [
      { label: "C1 weather  ($0.001/req)",       basePrice: "0.001",   bps: ENV_BPS, gas: ENV_GAS },
      { label: "C1 geocode  ($0.002/req)",       basePrice: "0.002",   bps: ENV_BPS, gas: ENV_GAS },
      { label: "C2 ask      ($0.0005/req)",       basePrice: "0.0005",  bps: ENV_BPS, gas: ENV_GAS },
      { label: "C3 token    ($0.00005/tok)",      basePrice: "0.00005", bps: ENV_BPS, gas: ENV_GAS },
      { label: "C4 paragraph($0.0001/dwell)",     basePrice: "0.0001",  bps: ENV_BPS, gas: ENV_GAS },
      { label: "C6 frame    ($0.0005/frame)",     basePrice: "0.0005",  bps: ENV_BPS, gas: ENV_GAS },
      { label: "C7 row      ($0.0001/row)",       basePrice: "0.0001",  bps: ENV_BPS, gas: ENV_GAS },
      { label: "C9 job      ($0.002/op)",         basePrice: "0.002",   bps: ENV_BPS, gas: ENV_GAS },
    ]
  : [{ label: "active config", basePrice: ENV_BASE, bps: ENV_BPS, gas: ENV_GAS }];

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function padRight(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

console.log("");
console.log("pay2play PPMT calculator");
console.log("─".repeat(96));
console.log(
  pad("component", 32) +
    padRight("base", 12) +
    padRight("bps", 6) +
    padRight("gas", 12) +
    padRight("net/tx", 12) +
    padRight("net bps", 8) +
    padRight("PPMT (USDC)", 14),
);
console.log("─".repeat(96));

let totalPpmt = 0n;

for (const row of ROWS) {
  const cfg: FeeConfig = feeConfig({
    basePrice: row.basePrice,
    decimals: USDC_DECIMALS,
    facilitatorFeeBps: row.bps,
    gasOverhead: row.gas,
    symbol: "USDC",
  });
  const b = priceBreakdown(cfg);
  totalPpmt += b.ppmtAtomic;
  const bpsDisp = row.bps === undefined ? "-" : row.bps.toString();
  const gasDisp = row.gas === undefined ? "-" : row.gas;
  console.log(
    pad(row.label, 32) +
      padRight("$" + row.basePrice, 12) +
      padRight(bpsDisp, 6) +
      padRight("$" + gasDisp, 12) +
      padRight("$" + b.netMarginDisplay, 12) +
      padRight(b.netMarginBps === -1 ? "n/a" : b.netMarginBps.toString(), 8) +
      padRight("$" + b.ppmtDisplay, 14),
  );
}
console.log("─".repeat(96));

if (sweep) {
  // total atomic → display at USDC precision
  const totalDisplay = (totalPpmt / 1_000_000n).toString();
  console.log(
    pad("TOTAL across all axes", 32 + 12 + 6 + 12 + 12 + 8) +
      padRight("$" + totalDisplay, 14),
  );
  console.log("");
  console.log(
    "(Sum of PPMT across each axis at the env-configured fees. Each axis is " +
      "independently 1M txs.)",
  );
}

console.log("");
console.log("Definitions:");
console.log("  base    — buyer's gross obligation (basePrice × count)");
console.log("  bps     — facilitator fee (basis points, 30 = 0.30%)");
console.log("  gas     — amortised batch-settlement gas per call");
console.log("  net/tx  — basePrice − facilitatorFee − gas, per single transaction");
console.log("  net bps — net margin in basis points of base (10000 = 100%)");
console.log("  PPMT    — net margin × 1,000,000 (1M-transaction projection)");
console.log("");
console.log(
  "Set knobs via env: PAY2PLAY_BASE_PRICE_USD, PAY2PLAY_FEE_BPS, PAY2PLAY_GAS_OVERHEAD_USD",
);
console.log("Run with --sweep for the full component matrix.");
console.log("");
