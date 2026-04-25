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
