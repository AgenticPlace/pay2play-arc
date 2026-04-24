import { describe, it, expect } from "vitest";
import { meter } from "./meter.js";
import { parseUsdPrice, formatUsdc } from "./arc.js";

describe("meter", () => {
  const m = meter({
    request: "$0.001",
    tokens:  (s) => `$${(s.count * 0.00005).toFixed(6)}`,
    frames:  (s) => `$${(s.count * 0.0005).toFixed(6)}`,
    dwell:   (s) => (s.ms >= 3000 ? "$0.0001" : "$0"),
    rows:    (s) => `$${(s.count * 0.0001).toFixed(6)}`,
  });

  it("returns fixed price for request", () => {
    expect(m.price({ kind: "request" })).toBe("$0.001");
  });

  it("scales tokens linearly", () => {
    expect(m.price({ kind: "tokens", count: 100 })).toBe("$0.005000");
  });

  it("scales frames", () => {
    expect(m.price({ kind: "frames", count: 10 })).toBe("$0.005000");
  });

  it("enforces dwell threshold", () => {
    expect(m.price({ kind: "dwell", ms: 1000 })).toBe("$0");
    expect(m.price({ kind: "dwell", ms: 3500 })).toBe("$0.0001");
  });

  it("converts prices to atomic USDC (6-decimal) bigints", () => {
    expect(m.priceAtomic({ kind: "request" })).toBe(1000n); // $0.001 * 1e6
    expect(m.priceAtomic({ kind: "tokens", count: 200 })).toBe(10000n); // $0.01 * 1e6
  });

  it("builds a payment requirement with GatewayWalletBatched extras", () => {
    const req = m.requirement(
      { kind: "request" },
      "0xabc000000000000000000000000000000000abc0",
    );
    expect(req.scheme).toBe("exact");
    expect(req.network).toBe("eip155:5042002");
    expect(req.asset).toBe("0x3600000000000000000000000000000000000000");
    expect(req.amount).toBe("1000");
    expect(req.extra?.name).toBe("GatewayWalletBatched");
    expect(req.extra?.verifyingContract).toBe(
      "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    );
  });

  it("builds a PaymentRequired challenge", () => {
    const ch = m.challenge(
      { kind: "request" },
      { payTo: "0xabc", resourceUrl: "http://x/y" },
    );
    expect(ch.x402Version).toBe(2);
    expect(ch.resource.url).toBe("http://x/y");
    expect(ch.accepts).toHaveLength(1);
  });

  it("throws if no rule configured", () => {
    expect(() => m.price({ kind: "bytes", count: 1 } as never)).toThrow(
      /No price rule/,
    );
  });
});

describe("parseUsdPrice / formatUsdc", () => {
  it("round-trips common amounts", () => {
    const cases = ["0", "0.000001", "0.001", "0.01", "1", "123.456"];
    for (const c of cases) {
      const atomic = parseUsdPrice(`$${c}`);
      const formatted = formatUsdc(atomic);
      // parseFloat to compare since trailing-zero formatting differs
      expect(parseFloat(formatted)).toBeCloseTo(parseFloat(c), 6);
    }
  });

  it("rejects negative and NaN", () => {
    expect(() => parseUsdPrice("$-1")).toThrow();
    expect(() => parseUsdPrice("$abc")).toThrow();
  });
});
