import { describe, it, expect } from "vitest";
import {
  parseDecimal,
  formatDecimal,
  multiplyByCount,
  applyBps,
  convertDecimals,
  ppmt,
  pow10,
  PPMT_MULT,
  USDC_DECIMALS,
  ETH_DECIMALS,
  ALGO_DECIMALS,
  MAX_DECIMALS,
} from "./decimal.js";

describe("parseDecimal", () => {
  it("parses USDC-style 6-decimal prices", () => {
    expect(parseDecimal("0.001", 6)).toBe(1_000n);
    expect(parseDecimal("$0.001", 6)).toBe(1_000n);
    expect(parseDecimal("$0.000001", 6)).toBe(1n);     // 1 atomic USDC unit
    expect(parseDecimal("1", 6)).toBe(1_000_000n);
    expect(parseDecimal("$1.234567", 6)).toBe(1_234_567n);
  });

  it("parses Algorand microALGO at 6 decimals", () => {
    expect(parseDecimal("0.001", ALGO_DECIMALS)).toBe(1_000n);
    expect(parseDecimal("1000", ALGO_DECIMALS)).toBe(1_000_000_000n);
  });

  it("parses ETH at 18 decimals to one wei precision", () => {
    expect(parseDecimal("0.000000000000000001", ETH_DECIMALS)).toBe(1n);
    expect(parseDecimal("1", ETH_DECIMALS)).toBe(10n ** 18n);
    expect(parseDecimal("1.5", ETH_DECIMALS)).toBe(1_500_000_000_000_000_000n);
    expect(parseDecimal("0.123456789012345678", ETH_DECIMALS))
      .toBe(123_456_789_012_345_678n);
  });

  it("parses 0 decimals correctly", () => {
    expect(parseDecimal("42", 0)).toBe(42n);
    expect(parseDecimal("0", 0)).toBe(0n);
  });

  it("rejects values with more fractional digits than decimals (no silent truncation)", () => {
    expect(() => parseDecimal("0.0000001", 6)).toThrow(/precision/);
    expect(() => parseDecimal("0.1", 0)).toThrow(/precision/);
    expect(() => parseDecimal("1.1234567890123456789", 18)).toThrow(/precision/);
  });

  it("rejects malformed input", () => {
    expect(() => parseDecimal("", 6)).toThrow();
    expect(() => parseDecimal("abc", 6)).toThrow();
    expect(() => parseDecimal("1.2.3", 6)).toThrow();
    expect(() => parseDecimal("--5", 6)).toThrow();
    expect(() => parseDecimal(".5", 6)).toThrow(/format/);
  });

  it("supports negative amounts (for refund/credit math, even if meter doesn't)", () => {
    expect(parseDecimal("-0.001", 6)).toBe(-1_000n);
    expect(parseDecimal("-1", 18)).toBe(-(10n ** 18n));
  });

  it("rejects out-of-range decimals", () => {
    expect(() => parseDecimal("1", -1)).toThrow(RangeError);
    expect(() => parseDecimal("1", MAX_DECIMALS + 1)).toThrow(RangeError);
    expect(() => parseDecimal("1", 1.5)).toThrow(RangeError);
  });
});

describe("formatDecimal", () => {
  it("round-trips through parse → format at every supported precision", () => {
    const cases: Array<[string, number]> = [
      ["0.001", 6],
      ["0.000001", 6],
      ["1234.567890", 6],
      ["0.000000000000000001", 18],
      ["0.123456789012345678", 18],
      ["42", 0],
      ["0", 6],
    ];
    for (const [s, d] of cases) {
      // formatDecimal trims trailing zeros — re-parse, re-format must equal canonical form.
      const a = parseDecimal(s, d);
      const f = formatDecimal(a, d);
      expect(parseDecimal(f, d)).toBe(a);
    }
  });

  it("trims trailing zeros and decimal point", () => {
    expect(formatDecimal(1_000_000n, 6)).toBe("1");
    expect(formatDecimal(0n, 6)).toBe("0");
    expect(formatDecimal(1_500_000n, 6)).toBe("1.5");
  });

  it("preserves full precision at 18 decimals", () => {
    expect(formatDecimal(1n, 18)).toBe("0.000000000000000001");
  });

  it("formats negatives with a leading minus", () => {
    expect(formatDecimal(-1_500n, 6)).toBe("-0.0015");
    expect(formatDecimal(-1n, 18)).toBe("-0.000000000000000001");
  });

  it("formats 0 decimals as a plain integer", () => {
    expect(formatDecimal(42n, 0)).toBe("42");
    expect(formatDecimal(-7n, 0)).toBe("-7");
  });
});

describe("multiplyByCount", () => {
  it("multiplies a unit price by a count exactly", () => {
    expect(multiplyByCount(50n, 100)).toBe(5_000n);                  // $0.00005 x 100 = $0.005
    expect(multiplyByCount(50n, 100n)).toBe(5_000n);
    expect(multiplyByCount(1n, 1_000_000)).toBe(1_000_000n);
  });

  it("does not lose precision at 1M-transaction scale", () => {
    // C3 token price: 50n atomic USDC per token; 1M tokens
    const total = multiplyByCount(50n, 1_000_000);
    expect(total).toBe(50_000_000n);                                  // exactly $50.000000
  });

  it("rejects negative or fractional counts", () => {
    expect(() => multiplyByCount(50n, -1)).toThrow(RangeError);
    expect(() => multiplyByCount(50n, 1.5)).toThrow(RangeError);
    expect(() => multiplyByCount(50n, -1n)).toThrow(RangeError);
  });
});

describe("applyBps", () => {
  it("computes basis points exactly", () => {
    expect(applyBps(1_000_000n, 30)).toBe(3_000n);                    // 0.30% of 1 USDC = $0.003
    expect(applyBps(1_000_000n, 100)).toBe(10_000n);                  // 1% of 1 USDC = $0.01
    expect(applyBps(1_000_000n, 10_000)).toBe(1_000_000n);            // 100%
  });

  it("floor-rounds sub-atomic remainders (merchant keeps the dust)", () => {
    expect(applyBps(99n, 100)).toBe(0n);                              // 1% of 99 atomic floors to 0
    expect(applyBps(199n, 100)).toBe(1n);
  });

  it("rejects out-of-range bps", () => {
    expect(() => applyBps(1n, -1)).toThrow(RangeError);
    expect(() => applyBps(1n, 10_001)).toThrow(RangeError);
    expect(() => applyBps(1n, 1.5)).toThrow(RangeError);
  });
});

describe("convertDecimals", () => {
  it("scales USDC (6) → ETH-style wad (18) losslessly", () => {
    expect(convertDecimals(1_000_000n, USDC_DECIMALS, ETH_DECIMALS))
      .toBe(1_000_000_000_000_000_000n);
  });

  it("scales 18 → 6 when amount is exactly representable", () => {
    expect(convertDecimals(10_000_000_000_000n, 18, 6)).toBe(10n);
  });

  it("refuses lossy down-scaling", () => {
    expect(() => convertDecimals(1n, 18, 6)).toThrow(RangeError);
    expect(() => convertDecimals(123_456_789_012_345_678n, 18, 6)).toThrow(RangeError);
  });

  it("is idempotent when from === to", () => {
    expect(convertDecimals(1234n, 6, 6)).toBe(1234n);
  });
});

describe("ppmt", () => {
  it("multiplies per-tx margin by exactly 1_000_000", () => {
    // Per-tx margin of $0.000970 USDC = 970n atomic
    // PPMT = 970n * 1_000_000n = 970_000_000n atomic = $970.00
    expect(ppmt(970n)).toBe(970_000_000n);
    expect(formatDecimal(ppmt(970n), 6)).toBe("970");
  });

  it("uses the exposed PPMT_MULT constant", () => {
    expect(PPMT_MULT).toBe(1_000_000n);
    expect(ppmt(1n)).toBe(1_000_000n);
  });
});

describe("pow10", () => {
  it("returns exact powers of 10 as bigints", () => {
    expect(pow10(0)).toBe(1n);
    expect(pow10(6)).toBe(1_000_000n);
    expect(pow10(18)).toBe(10n ** 18n);
  });

  it("rejects out-of-range inputs", () => {
    expect(() => pow10(-1)).toThrow();
    expect(() => pow10(MAX_DECIMALS + 2)).toThrow();
  });
});

describe("drift test (1M random transactions, no precision loss)", () => {
  it("sums 1_000_000 paid-token transactions atomically with zero drift", () => {
    // C3 default: $0.00005/token, parsed to 50n atomic USDC at 6 decimals
    const unitPrice = parseDecimal("0.00005", USDC_DECIMALS);
    expect(unitPrice).toBe(50n);

    // Each "transaction" is 1 token → 50n atomic. 1M of them.
    let total = 0n;
    const N = 1_000_000;
    for (let i = 0; i < N; i++) total += unitPrice;

    expect(total).toBe(50n * BigInt(N));
    expect(total).toBe(50_000_000n);                                  // $50.000000 exactly
    expect(formatDecimal(total, USDC_DECIMALS)).toBe("50");
  });

  it("sums 1M variable-count transactions exactly (per-token billing)", () => {
    // 1M txs, each consuming 1..2000 tokens at $0.00005/token
    const unitPrice = parseDecimal("0.00005", USDC_DECIMALS);
    let totalAtomic = 0n;
    let totalCount = 0n;
    let seed = 42;
    const rand = () => {
      // deterministic LCG so the test is reproducible
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed;
    };
    for (let i = 0; i < 1_000_000; i++) {
      const count = (rand() % 2000) + 1;                              // 1..2000 tokens
      totalAtomic += multiplyByCount(unitPrice, count);
      totalCount += BigInt(count);
    }
    // No float anywhere — totalAtomic must equal unitPrice * totalCount exactly.
    expect(totalAtomic).toBe(unitPrice * totalCount);
  });
});
