import { describe, it, expect } from "vitest";
import {
  feeConfig,
  priceBreakdown,
  ppmt,
  PPMT_MULT,
  type FeeConfig,
} from "./fee.js";
import { USDC_DECIMALS, ETH_DECIMALS } from "./decimal.js";

describe("feeConfig", () => {
  it("builds a USDC fee config from a human price string", () => {
    const c = feeConfig({ basePrice: "$0.001", decimals: USDC_DECIMALS, symbol: "USDC" });
    expect(c.basePriceAtomic).toBe(1_000n);
    expect(c.decimals).toBe(6);
    expect(c.symbol).toBe("USDC");
    expect(c.facilitatorFeeBps).toBeUndefined();
    expect(c.gasOverheadAtomic).toBe(0n);
  });

  it("parses optional gas overhead and bps", () => {
    const c = feeConfig({
      basePrice: "$0.001",
      decimals: USDC_DECIMALS,
      facilitatorFeeBps: 30,
      gasOverhead: "$0.00003",
      network: "eip155:5042002",
    });
    expect(c.basePriceAtomic).toBe(1_000n);
    expect(c.gasOverheadAtomic).toBe(30n);                   // 0.00003 USDC = 30 atomic
    expect(c.facilitatorFeeBps).toBe(30);
    expect(c.network).toBe("eip155:5042002");
  });

  it("works at 18 decimals (ETH-style)", () => {
    const c = feeConfig({ basePrice: "1", decimals: ETH_DECIMALS, symbol: "ETH" });
    expect(c.basePriceAtomic).toBe(10n ** 18n);
  });
});

describe("priceBreakdown", () => {
  const c1 = feeConfig({
    basePrice: "$0.001",
    decimals: USDC_DECIMALS,
    facilitatorFeeBps: 30,                                   // 0.30%
    gasOverhead: "$0.00003",                                 // amortised batched gas
    symbol: "USDC",
    network: "eip155:5042002",
  });

  it("computes per-tx breakdown for a single unit (count=1)", () => {
    const b = priceBreakdown(c1);
    expect(b.totalAtomic).toBe(1_000n);                      // buyer pays $0.001
    expect(b.totalDisplay).toBe("0.001");
    expect(b.components.base.atomic).toBe(1_000n);
    expect(b.components.facilitatorFee.atomic).toBe(3n);     // 0.30% of 1000 = 3
    expect(b.components.gasOverhead.atomic).toBe(30n);
    expect(b.netMarginAtomic).toBe(1_000n - 3n - 30n);       // 967
    expect(b.netMarginDisplay).toBe("0.000967");
    // PPMT = 967 atomic × 1M = 967_000_000 atomic = $967.00 USDC
    expect(b.ppmtAtomic).toBe(967_000_000n);
    expect(b.ppmtDisplay).toBe("967");
    expect(b.netMarginBps).toBe(9670);                       // ~96.70% margin
    expect(b.decimals).toBe(6);
    expect(b.symbol).toBe("USDC");
  });

  it("scales with count linearly (per-token billing)", () => {
    const c3 = feeConfig({
      basePrice: "$0.00005",                                 // C3 per-token
      decimals: USDC_DECIMALS,
      symbol: "USDC",
    });
    const b = priceBreakdown(c3, 1_000_000);                 // 1M tokens
    expect(b.totalAtomic).toBe(50_000_000n);                 // $50.000000 exactly
    expect(b.totalDisplay).toBe("50");
    expect(b.netMarginAtomic).toBe(50_000_000n);             // no fees configured
    expect(b.ppmtAtomic).toBe(50_000_000_000_000n);          // 1M-tx of 1M tokens each
  });

  it("clamps negative margin to zero (loss-making fee config)", () => {
    const lossy = feeConfig({
      basePrice: "$0.001",
      decimals: USDC_DECIMALS,
      facilitatorFeeBps: 5_000,                              // 50% facilitator
      gasOverhead: "$0.001",                                 // gas equals base
    });
    const b = priceBreakdown(lossy);
    expect(b.netMarginAtomic).toBe(0n);
    expect(b.ppmtAtomic).toBe(0n);
    expect(b.netMarginBps).toBe(0);
  });

  it("returns -1 for marginBps when base is zero", () => {
    const free = feeConfig({ basePrice: "0", decimals: USDC_DECIMALS });
    const b = priceBreakdown(free);
    expect(b.totalAtomic).toBe(0n);
    expect(b.netMarginBps).toBe(-1);
  });

  it("counts can be a bigint", () => {
    const c = feeConfig({ basePrice: "$0.001", decimals: USDC_DECIMALS });
    const b = priceBreakdown(c, 12345n);
    // 12_345 × 1000n atomic = 12_345_000n
    expect(b.totalAtomic).toBe(12_345_000n);
    expect(b.totalDisplay).toBe("12.345");
  });

  it("works at ETH-scale precision (18 decimals)", () => {
    const ethCfg = feeConfig({
      basePrice: "0.0001",                                   // 1e-4 ETH per call
      decimals: ETH_DECIMALS,
      symbol: "ETH",
    });
    const b = priceBreakdown(ethCfg, 1_000);
    expect(b.totalAtomic).toBe(100_000_000_000_000_000n);    // 0.1 ETH exactly
    expect(b.totalDisplay).toBe("0.1");
    expect(b.ppmtAtomic).toBe(100_000_000_000_000_000n * PPMT_MULT);
  });
});

describe("ppmt", () => {
  it("multiplies per-tx margin by 1_000_000 exactly", () => {
    expect(ppmt(0n)).toBe(0n);
    expect(ppmt(1n)).toBe(1_000_000n);
    expect(ppmt(967n)).toBe(967_000_000n);
    expect(PPMT_MULT).toBe(1_000_000n);
  });

  it("scales bigint-exact to enormous numbers without overflow", () => {
    const margin = 10n ** 18n;                               // 1 ETH per tx
    expect(ppmt(margin)).toBe(margin * 1_000_000n);
  });
});

describe("integration: 1M txs end-to-end PPMT projection", () => {
  it("matches priceBreakdown PPMT output bit-for-bit", () => {
    const cfg: FeeConfig = feeConfig({
      basePrice: "$0.001",
      decimals: USDC_DECIMALS,
      facilitatorFeeBps: 30,
      gasOverhead: "$0.00003",
    });
    const b = priceBreakdown(cfg);                           // count=1
    const projected = ppmt(b.netMarginAtomic);
    expect(projected).toBe(b.ppmtAtomic);
  });
});
