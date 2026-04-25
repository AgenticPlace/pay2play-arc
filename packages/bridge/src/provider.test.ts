import { describe, it, expect } from "vitest";
import {
  type BridgeProvider,
  type BridgeRoute,
  type BridgeRequest,
  type BridgeQuote,
  type BridgeResult,
  type BridgeStatus,
  type BridgeSigner,
  findSupportedRoute,
  sumFees,
  requireEvmSigner,
  requireSubstrateSigner,
} from "./provider.js";
import { BridgeRegistry, DEFAULT_PRIORITY } from "./registry.js";
import { CctpBridgeProvider } from "./providers/cctp.js";
import { WormholeBridgeProvider } from "./providers/wormhole.js";
import { AxelarBridgeProvider } from "./providers/axelar.js";
import { XcmBridgeProvider } from "./providers/xcm.js";

/* ─── Synthetic provider for registry tests ───────────────────── */

class StubProvider implements BridgeProvider {
  constructor(
    public readonly id: string,
    public readonly displayName: string,
    public readonly supportedRoutes: ReadonlyArray<BridgeRoute>,
  ) {}

  async estimate(req: BridgeRequest): Promise<BridgeQuote> {
    return {
      providerId: this.id,
      route: req.route,
      netReceiveAtomic: req.amountAtomic,
      fees: { totalAtomic: 0n },
      estimatedSeconds: 60,
    };
  }

  async bridge(req: BridgeRequest, _signer: BridgeSigner): Promise<BridgeResult> {
    return {
      providerId: this.id,
      success: true,
      sourceTxHash: `0x${this.id}-tx`,
      route: req.route,
      amountAtomic: req.amountAtomic,
    };
  }

  async getStatus(_tx: string, _route: BridgeRoute): Promise<BridgeStatus> {
    return { providerId: this.id, state: "delivered" };
  }
}

describe("BridgeRegistry", () => {
  const ARC: BridgeRoute = { from: "eip155:5042002", to: "eip155:8453", asset: "USDC" };
  const POLKADOT: BridgeRoute = { from: "polkadot:moonbeam", to: "polkadot:asset-hub", asset: "USDC" };

  it("registers providers and returns them in priority order", () => {
    const r = new BridgeRegistry([
      new StubProvider("xcm",      "XCM",      [POLKADOT]),
      new StubProvider("cctp",     "CCTP",     [ARC]),
      new StubProvider("wormhole", "Wormhole", [ARC]),
    ]);
    const list = r.list();
    expect(list.map((p) => p.id)).toEqual(["cctp", "wormhole", "xcm"]);
  });

  it("filters by route — only providers that support the pair", () => {
    const r = new BridgeRegistry([
      new StubProvider("cctp",     "CCTP",     [ARC]),
      new StubProvider("wormhole", "Wormhole", [ARC, POLKADOT]),
      new StubProvider("xcm",      "XCM",      [POLKADOT]),
    ]);
    const arc = r.forRoute(ARC).map((p) => p.id);
    expect(arc).toEqual(["cctp", "wormhole"]);

    const polk = r.forRoute(POLKADOT).map((p) => p.id);
    expect(polk).toEqual(["wormhole", "xcm"]);
  });

  it("pickProvider picks the highest-priority match by default", () => {
    const r = new BridgeRegistry([
      new StubProvider("wormhole", "Wormhole", [ARC]),
      new StubProvider("cctp",     "CCTP",     [ARC]),
    ]);
    expect(r.pickProvider(ARC).id).toBe("cctp");           // CCTP beats Wormhole in DEFAULT_PRIORITY
    expect(r.pickProvider(ARC, "wormhole").id).toBe("wormhole"); // explicit override honoured
  });

  it("pickProvider throws when override doesn't support the route", () => {
    const r = new BridgeRegistry([
      new StubProvider("cctp", "CCTP", [ARC]),
      new StubProvider("xcm",  "XCM",  [POLKADOT]),
    ]);
    expect(() => r.pickProvider(ARC, "xcm")).toThrow(/does not support/);
  });

  it("pickProvider throws when no provider supports the route", () => {
    const r = new BridgeRegistry([
      new StubProvider("xcm", "XCM", [POLKADOT]),
    ]);
    expect(() => r.pickProvider(ARC)).toThrow(/no provider supports/);
  });

  it("compareAll quotes every supporting provider", async () => {
    const r = new BridgeRegistry([
      new StubProvider("cctp",     "CCTP",     [ARC]),
      new StubProvider("wormhole", "Wormhole", [ARC]),
      new StubProvider("xcm",      "XCM",      [POLKADOT]),
    ]);
    const quotes = await r.compareAll({
      route: ARC,
      amountAtomic: 1_000_000n,
      recipient: "0xabc",
    });
    expect(quotes.map((q) => q.providerId)).toEqual(["cctp", "wormhole"]);
  });

  it("register is idempotent", () => {
    const r = new BridgeRegistry();
    r.register(new StubProvider("cctp", "CCTP", [ARC]));
    r.register(new StubProvider("cctp", "CCTP-clone", [POLKADOT]));
    expect(r.list().map((p) => p.id)).toEqual(["cctp"]);
    expect(r.get("cctp").displayName).toBe("CCTP");
  });
});

describe("provider helpers", () => {
  it("findSupportedRoute returns the matched route", () => {
    const provider = {
      id: "stub",
      supportedRoutes: [
        { from: "eip155:1" as const, to: "eip155:8453" as const, asset: "USDC" },
      ],
    };
    const r = findSupportedRoute(provider, {
      from: "eip155:1", to: "eip155:8453", asset: "USDC",
    });
    expect(r.asset).toBe("USDC");
  });

  it("findSupportedRoute throws on unknown route", () => {
    const provider = { id: "stub", supportedRoutes: [] as BridgeRoute[] };
    expect(() =>
      findSupportedRoute(provider, { from: "eip155:1", to: "eip155:8453", asset: "USDC" }),
    ).toThrow(/route not supported/);
  });

  it("sumFees totals every populated slot exactly", () => {
    const f = sumFees({ relayerAtomic: 100n, sourceGasAtomic: 50n, destGasAtomic: 30n });
    expect(f.totalAtomic).toBe(180n);
    expect(f.relayerAtomic).toBe(100n);
    expect(f.protocolAtomic).toBeUndefined();
  });

  it("requireEvmSigner accepts EVM, rejects others", () => {
    expect(() => requireEvmSigner({ kind: "evm", privateKey: "0xabc" }, "test")).not.toThrow();
    expect(() => requireEvmSigner({ kind: "substrate", suri: "//Alice" }, "test")).toThrow(/EVM/);
    expect(() => requireEvmSigner({ kind: "evm" } as never, "test")).toThrow(/at least one/);
  });

  it("requireSubstrateSigner accepts substrate, rejects others", () => {
    expect(() => requireSubstrateSigner({ kind: "substrate", suri: "//Alice" }, "test")).not.toThrow();
    expect(() => requireSubstrateSigner({ kind: "evm", privateKey: "0xabc" }, "test")).toThrow(/Substrate/);
    expect(() => requireSubstrateSigner({ kind: "substrate", suri: "" }, "test")).toThrow(/suri/);
  });
});

describe("CctpBridgeProvider", () => {
  const provider = new CctpBridgeProvider();

  it("declares all expected routes", () => {
    expect(provider.id).toBe("cctp");
    // 7 CCTP-active chains (Ethereum, Avalanche, OP, Arbitrum, Base, Polygon, Arc).
    // Pairs = 7 * 6 = 42.
    expect(provider.supportedRoutes.length).toBe(42);
    // Sample a known-supported route
    const has = provider.supportedRoutes.some(
      (r) => r.from === "eip155:5042002" && r.to === "eip155:8453" && r.asset === "USDC",
    );
    expect(has).toBe(true);
  });

  it("estimate computes bigint-correct fee math", async () => {
    // 100 USDC = 100_000_000 atomic (6-dec). 30 bps + $0.003 flat:
    //   pct fee  = 100_000_000 * 30 / 10000 = 300_000 atomic = $0.30
    //   flat fee = 3_000 atomic              = $0.003
    //   total    = 303_000 atomic            = $0.303
    //   net      = 99_697_000 atomic         = $99.697
    const quote = await provider.estimate({
      route: { from: "eip155:5042002", to: "eip155:8453", asset: "USDC" },
      amountAtomic: 100_000_000n,
      recipient: "0xabc",
    });
    expect(quote.fees.totalAtomic).toBe(303_000n);
    expect(quote.netReceiveAtomic).toBe(99_697_000n);
    expect(quote.providerId).toBe("cctp");
    expect(quote.estimatedSeconds).toBe(20);
  });

  it("estimate clamps net to zero on tiny amounts (fee > amount)", async () => {
    const quote = await provider.estimate({
      route: { from: "eip155:5042002", to: "eip155:8453", asset: "USDC" },
      amountAtomic: 100n, // way below the 3000n flat fee
      recipient: "0xabc",
    });
    expect(quote.netReceiveAtomic).toBe(0n);
  });

  it("rejects unknown CCTP routes", async () => {
    await expect(
      provider.estimate({
        route: { from: "polkadot:moonbeam", to: "polkadot:asset-hub", asset: "USDC" },
        amountAtomic: 1_000_000n,
        recipient: "5G...",
      }),
    ).rejects.toThrow(/route not supported/);
  });
});

describe("DEFAULT_PRIORITY", () => {
  it("orders cctp < wormhole < axelar < xcm", () => {
    const stubs = [
      new StubProvider("xcm",      "XCM",      []),
      new StubProvider("axelar",   "Axelar",   []),
      new StubProvider("cctp",     "CCTP",     []),
      new StubProvider("wormhole", "Wormhole", []),
    ];
    const sorted = [...stubs].sort(DEFAULT_PRIORITY);
    expect(sorted.map((p) => p.id)).toEqual(["cctp", "wormhole", "axelar", "xcm"]);
  });
});

describe("WormholeBridgeProvider", () => {
  const provider = new WormholeBridgeProvider();

  it("declares Moonbeam ↔ Ethereum routes for both USDC + USDC.wh", () => {
    expect(provider.id).toBe("wormhole");
    const moonbeamArc = provider.supportedRoutes.find(
      (r) => r.from === "eip155:1284" && r.to === "eip155:1" && r.asset === "USDC.wh",
    );
    expect(moonbeamArc).toBeDefined();
  });

  it("estimate produces bigint-correct fees", async () => {
    const quote = await provider.estimate({
      route: { from: "eip155:1284", to: "eip155:1", asset: "USDC" },
      amountAtomic: 100_000_000n,           // $100
      recipient: "0xabc",
    });
    // 100 USDC - 0.02 relayer fee = 99.98 net = 99_980_000n atomic
    expect(quote.fees.totalAtomic).toBe(20_000n);
    expect(quote.netReceiveAtomic).toBe(99_980_000n);
    expect(quote.providerId).toBe("wormhole");
  });

  it("rejects routes outside the Wormhole mesh", async () => {
    await expect(
      provider.estimate({
        route: { from: "polkadot:asset-hub", to: "polkadot:moonbeam", asset: "xcUSDC" },
        amountAtomic: 1_000_000n,
        recipient: "5G...",
      }),
    ).rejects.toThrow(/route not supported/);
  });
});

describe("AxelarBridgeProvider", () => {
  const provider = new AxelarBridgeProvider();

  it("declares the Axelar EVM mesh including non-CCTP chains (Linea, Filecoin, Celo)", () => {
    expect(provider.id).toBe("axelar");
    expect(
      provider.supportedRoutes.some(
        (r) => r.from === "eip155:1284" && r.to === "eip155:59144" && r.asset === "USDC",
      ),
    ).toBe(true);
  });

  it("estimate sums relayer + dest gas", async () => {
    const quote = await provider.estimate({
      route: { from: "eip155:1284", to: "eip155:8453", asset: "USDC" },
      amountAtomic: 1_000_000n,                // $1.00
      recipient: "0xabc",
    });
    // 0.05 relayer + 0.02 dest gas = 0.07 = 70_000n
    expect(quote.fees.totalAtomic).toBe(70_000n);
    expect(quote.fees.relayerAtomic).toBe(50_000n);
    expect(quote.fees.destGasAtomic).toBe(20_000n);
    expect(quote.netReceiveAtomic).toBe(930_000n);
    expect(quote.estimatedSeconds).toBe(180);
  });
});

describe("XcmBridgeProvider", () => {
  const provider = new XcmBridgeProvider();

  it("declares Polkadot Asset Hub corridors", () => {
    expect(provider.id).toBe("xcm");
    const ahMoonbeam = provider.supportedRoutes.find(
      (r) =>
        r.from === "polkadot:asset-hub" &&
        r.to === "polkadot:moonbeam" &&
        r.asset === "xcUSDC",
    );
    expect(ahMoonbeam).toBeDefined();
  });

  it("estimate computes the weight-fee deduction", async () => {
    const quote = await provider.estimate({
      route: { from: "polkadot:asset-hub", to: "polkadot:moonbeam", asset: "xcUSDC" },
      amountAtomic: 10_000_000n,
      recipient: "5G...",
    });
    expect(quote.fees.totalAtomic).toBe(50_000n);
    expect(quote.netReceiveAtomic).toBe(9_950_000n);
    expect(quote.estimatedSeconds).toBe(30);
  });

  it("requires a Substrate signer (rejects EVM)", async () => {
    const result = await provider.bridge(
      {
        route: { from: "polkadot:asset-hub", to: "polkadot:moonbeam", asset: "xcUSDC" },
        amountAtomic: 10_000_000n,
        recipient: "5G...",
      },
      { kind: "evm", privateKey: "0xabc" },
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Substrate/);
  });

  it("rejects Wormhole-only routes (EVM↔EVM)", async () => {
    await expect(
      provider.estimate({
        route: { from: "eip155:1", to: "eip155:1284", asset: "USDC" },
        amountAtomic: 1_000_000n,
        recipient: "0xabc",
      }),
    ).rejects.toThrow(/route not supported/);
  });
});

describe("Full registry composition (all 4 providers)", () => {
  const registry = new BridgeRegistry([
    new CctpBridgeProvider(),
    new WormholeBridgeProvider(),
    new AxelarBridgeProvider(),
    new XcmBridgeProvider(),
  ]);

  it("Arc → Base USDC: CCTP picked first (highest priority match)", () => {
    const p = registry.pickProvider({
      from: "eip155:5042002", to: "eip155:8453", asset: "USDC",
    });
    expect(p.id).toBe("cctp");
  });

  it("Moonbeam → Ethereum USDC: Wormhole + Axelar match (no CCTP — Moonbeam not in CCTP)", () => {
    const matches = registry.forRoute({
      from: "eip155:1284", to: "eip155:1", asset: "USDC",
    });
    expect(matches.map((p) => p.id)).toEqual(["wormhole", "axelar"]);
  });

  it("Moonbeam → Linea USDC: Axelar only (Wormhole has Moonbeam but not Linea)", () => {
    const matches = registry.forRoute({
      from: "eip155:1284", to: "eip155:59144", asset: "USDC",
    });
    expect(matches.map((p) => p.id)).toEqual(["axelar"]);
  });

  it("Asset Hub → Moonbeam xcUSDC: XCM only", () => {
    const matches = registry.forRoute({
      from: "polkadot:asset-hub", to: "polkadot:moonbeam", asset: "xcUSDC",
    });
    expect(matches.map((p) => p.id)).toEqual(["xcm"]);
  });

  it("compareAll returns one quote per matching provider with consistent shape", async () => {
    const route: BridgeRoute = { from: "eip155:1284", to: "eip155:1", asset: "USDC" };
    const quotes = await registry.compareAll({
      route,
      amountAtomic: 100_000_000n,
      recipient: "0xabc",
    });
    expect(quotes).toHaveLength(2);
    // Wormhole has the lower fee at this size.
    const wh = quotes.find((q) => q.providerId === "wormhole")!;
    const ax = quotes.find((q) => q.providerId === "axelar")!;
    expect(wh.netReceiveAtomic).toBeGreaterThan(ax.netReceiveAtomic);
  });
});
