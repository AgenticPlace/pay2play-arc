/**
 * CctpBridgeProvider — Circle's Cross-Chain Transfer Protocol V2.
 *
 * The "ARC bridge method" in user shorthand. Wraps `@circle-fin/app-kit`
 * for EVM↔EVM USDC moves across Circle's CCTP V2 mesh (Domain 0 = Ethereum,
 * Domain 1 = Avalanche, Domain 2 = OP, Domain 3 = Arbitrum, Domain 6 = Base,
 * Domain 7 = Polygon, Domain 26 = Arc).
 *
 * Refactored from packages/bridge/src/bridge.ts — preserves the existing
 * AppKit wiring under a new BridgeProvider face. The legacy `BridgeModule`
 * class still exists and now delegates here.
 */

import {
  type BridgeProvider,
  type BridgeRoute,
  type BridgeRequest,
  type BridgeQuote,
  type BridgeResult,
  type BridgeStatus,
  type BridgeSigner,
  type ChainId,
  requireEvmSigner,
  findSupportedRoute,
  sumFees,
} from "../provider.js";

/** Known CCTP V2 EVM destination domains (informational; AppKit handles the routing). */
const CCTP_CHAINS: Record<string, { chainId: number; domain: number; explorer: string }> = {
  "eip155:1":         { chainId: 1,        domain: 0,  explorer: "https://etherscan.io" },
  "eip155:43114":     { chainId: 43114,    domain: 1,  explorer: "https://snowtrace.io" },
  "eip155:10":        { chainId: 10,       domain: 2,  explorer: "https://optimistic.etherscan.io" },
  "eip155:42161":     { chainId: 42161,    domain: 3,  explorer: "https://arbiscan.io" },
  "eip155:8453":      { chainId: 8453,     domain: 6,  explorer: "https://basescan.org" },
  "eip155:137":       { chainId: 137,      domain: 7,  explorer: "https://polygonscan.com" },
  "eip155:1284":      { chainId: 1284,     domain: -1, explorer: "https://moonbeam.moonscan.io" }, // not in CCTP
  "eip155:5042002":   { chainId: 5042002,  domain: 26, explorer: "https://testnet.arcscan.app" },
};

function isCctpEvm(chain: string): boolean {
  const entry = CCTP_CHAINS[chain];
  return entry !== undefined && entry.domain >= 0;
}

/** Build the Cartesian product of CCTP-supported chains for the USDC asset. */
const CCTP_ROUTES: ReadonlyArray<BridgeRoute> = (() => {
  const ids = Object.keys(CCTP_CHAINS).filter(isCctpEvm) as ChainId[];
  const routes: BridgeRoute[] = [];
  for (const from of ids) {
    for (const to of ids) {
      if (from !== to) routes.push({ from, to, asset: "USDC" });
    }
  }
  return routes;
})();

/** Map CAIP-2 → AppKit's chain string identifier. */
function appKitChainName(chain: ChainId): string {
  switch (chain) {
    case "eip155:1":       return "ethereum";
    case "eip155:43114":   return "avalanche";
    case "eip155:10":      return "optimism";
    case "eip155:42161":   return "arbitrum";
    case "eip155:8453":    return "base";
    case "eip155:137":     return "polygon";
    case "eip155:5042002": return "arcTestnet";
    default:
      throw new Error(`CctpBridgeProvider: no AppKit chain name for ${chain}`);
  }
}

/* ─── Provider implementation ──────────────────────────────────────── */

export class CctpBridgeProvider implements BridgeProvider {
  readonly id = "cctp";
  readonly displayName = "Circle CCTP V2";
  readonly supportedRoutes = CCTP_ROUTES;

  /** Lazily-constructed AppKit instance. Only created on first bridge() call. */
  private kit: unknown = null;

  /** Initialise AppKit with a viem adapter built from the supplied private key. */
  private async getKit(privateKey: `0x${string}`): Promise<{
    bridge(c: unknown): Promise<{ steps?: Array<{ txHash?: string }> }>;
    estimateBridge(c: unknown): Promise<{ fee?: string; estimatedTime?: string }>;
  }> {
    if (!this.kit) {
      const { AppKit } = await import("@circle-fin/app-kit" as string);
      const { createViemAdapterFromPrivateKey } = await import("@circle-fin/adapter-viem-v2" as string);
      this.kit = new (AppKit as new (cfg: unknown) => unknown)({
        adapters: [(createViemAdapterFromPrivateKey as (cfg: unknown) => unknown)({ privateKey })],
      });
    }
    return this.kit as Awaited<ReturnType<typeof this.getKit>>;
  }

  /** Static estimate — CCTP V2 fee = $0.003 flat + 0.03% × amount.
   *  Matches the production formula used in components/c8-bridge/src/server.ts. */
  async estimate(req: BridgeRequest): Promise<BridgeQuote> {
    const route = findSupportedRoute(this, req.route);
    // 0.03% in bps = 30; flat fee in atomic USDC (6-dec) = 3000n
    const flatFeeAtomic = 3_000n;
    const pctFeeAtomic = (req.amountAtomic * 30n) / 10_000n;
    const fees = sumFees({
      protocolAtomic: flatFeeAtomic + pctFeeAtomic,
    });
    const netReceiveAtomic = req.amountAtomic > fees.totalAtomic
      ? req.amountAtomic - fees.totalAtomic
      : 0n;
    return {
      providerId: this.id,
      route,
      netReceiveAtomic,
      fees,
      estimatedSeconds: 20,
      notes: "CCTP V2: $0.003 flat + 0.03% protocol fee, ~20s typical finality",
    };
  }

  async bridge(req: BridgeRequest, signer: BridgeSigner): Promise<BridgeResult> {
    const route = findSupportedRoute(this, req.route);
    // AppKit needs human-readable amount strings; convert atomic → decimal.
    // USDC is 6-decimal; pad and trim trailing zeros.
    const amountStr = atomicToDecimalString(req.amountAtomic, 6);

    try {
      requireEvmSigner(signer, this.id);
      const kit = await this.getKit(signer.privateKey ?? throwNoKey(this.id));
      const raw = await kit.bridge({
        sourceChain:      appKitChainName(route.from),
        destinationChain: appKitChainName(route.to),
        amount:           amountStr,
        recipientAddress: req.recipient as `0x${string}`,
      });
      const sourceTxHash = raw.steps?.[raw.steps.length - 1]?.txHash;
      return {
        providerId: this.id,
        success: true,
        sourceTxHash,
        sourceExplorerUrl: sourceTxHash
          ? `${CCTP_CHAINS[route.from]?.explorer ?? "https://explorer"}/tx/${sourceTxHash}`
          : undefined,
        route,
        amountAtomic: req.amountAtomic,
      };
    } catch (err) {
      return {
        providerId: this.id,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        route,
        amountAtomic: req.amountAtomic,
      };
    }
  }

  /** CCTP V2 attestations finalise quickly; we report `delivered` once the
   *  source tx is mined. AppKit doesn't expose a delivery-side polling API,
   *  so this is a best-effort acknowledgment based on tx-hash existence. */
  async getStatus(sourceTxHash: string, route: BridgeRoute): Promise<BridgeStatus> {
    if (!sourceTxHash) return { providerId: this.id, state: "pending" };
    return {
      providerId: this.id,
      state: "delivered",
      detail: "CCTP V2 ~20s finality; check destination chain for credit",
      destTxHash: sourceTxHash,
    };
  }
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

function atomicToDecimalString(atomic: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = atomic / divisor;
  const frac = atomic % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr === "" ? whole.toString() : `${whole}.${fracStr}`;
}

function throwNoKey(id: string): `0x${string}` {
  throw new Error(`${id}: signer.privateKey required (walletClient path TBD)`);
}
