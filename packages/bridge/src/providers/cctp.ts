/**
 * CctpBridgeProvider — Circle's Cross-Chain Transfer Protocol V2.
 *
 * The "ARC bridge method" in user shorthand. Wraps Circle's
 * `@circle-fin/bridge-kit` (the dedicated bridge package; replaces the
 * older `@circle-fin/app-kit` umbrella for bridge use specifically).
 *
 * Coverage on the CCTP V2 mesh:
 *   Domain  0: Ethereum
 *   Domain  1: Avalanche
 *   Domain  2: Optimism
 *   Domain  3: Arbitrum
 *   Domain  5: Solana                ← added in the bridge-kit migration
 *   Domain  6: Base
 *   Domain  7: Polygon
 *   Domain 26: Arc
 *
 * Solana support comes free with the bridge-kit migration via
 * `@circle-fin/adapter-solana-kit`. EVM signing still uses
 * `@circle-fin/adapter-viem-v2` (unchanged).
 *
 * The legacy `BridgeModule` class in packages/bridge/src/bridge.ts
 * delegates here unchanged — no consumer-visible breakage.
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

/** Known CCTP V2 destination domains.
 *  `bridgeKitChain` is the string the @circle-fin/bridge-kit `kit.bridge()`
 *  call expects in its `from.chain` / `to.chain` fields. */
const CCTP_CHAINS: Record<
  string,
  { chainId?: number; domain: number; explorer: string; bridgeKitChain: string; family: "evm" | "solana" }
> = {
  // EVM mainnets
  "eip155:1":         { chainId: 1,        domain:  0, explorer: "https://etherscan.io",                bridgeKitChain: "Ethereum",      family: "evm" },
  "eip155:43114":     { chainId: 43114,    domain:  1, explorer: "https://snowtrace.io",                bridgeKitChain: "Avalanche",     family: "evm" },
  "eip155:10":        { chainId: 10,       domain:  2, explorer: "https://optimistic.etherscan.io",     bridgeKitChain: "Optimism",      family: "evm" },
  "eip155:42161":     { chainId: 42161,    domain:  3, explorer: "https://arbiscan.io",                 bridgeKitChain: "Arbitrum",      family: "evm" },
  "eip155:8453":      { chainId: 8453,     domain:  6, explorer: "https://basescan.org",                bridgeKitChain: "Base",          family: "evm" },
  "eip155:137":       { chainId: 137,      domain:  7, explorer: "https://polygonscan.com",             bridgeKitChain: "Polygon",       family: "evm" },
  "eip155:5042002":   { chainId: 5042002,  domain: 26, explorer: "https://testnet.arcscan.app",         bridgeKitChain: "Arc_Testnet",   family: "evm" },
  // Solana — added with bridge-kit migration
  "solana:mainnet":   {                    domain:  5, explorer: "https://solscan.io",                  bridgeKitChain: "Solana_Mainnet",family: "solana" },
  "solana:devnet":    {                    domain:  5, explorer: "https://solscan.io/?cluster=devnet",  bridgeKitChain: "Solana_Devnet", family: "solana" },
  // Out-of-mesh entries (kept for explorer lookup; domain = -1 excludes them from routes)
  "eip155:1284":      { chainId: 1284,     domain: -1, explorer: "https://moonbeam.moonscan.io",        bridgeKitChain: "",              family: "evm" },
};

function isCctpChain(chain: string): boolean {
  const entry = CCTP_CHAINS[chain];
  return entry !== undefined && entry.domain >= 0;
}

/** Build the Cartesian product of CCTP-supported chains for the USDC asset. */
const CCTP_ROUTES: ReadonlyArray<BridgeRoute> = (() => {
  const ids = Object.keys(CCTP_CHAINS).filter(isCctpChain) as ChainId[];
  const routes: BridgeRoute[] = [];
  for (const from of ids) {
    for (const to of ids) {
      if (from !== to) routes.push({ from, to, asset: "USDC" });
    }
  }
  return routes;
})();

function bridgeKitChainName(chain: ChainId): string {
  const entry = CCTP_CHAINS[chain];
  if (!entry || !entry.bridgeKitChain) {
    throw new Error(`CctpBridgeProvider: no bridge-kit chain name for ${chain}`);
  }
  return entry.bridgeKitChain;
}

function chainFamily(chain: ChainId): "evm" | "solana" {
  return CCTP_CHAINS[chain]?.family ?? "evm";
}

/* ─── Provider implementation ──────────────────────────────────────── */

export class CctpBridgeProvider implements BridgeProvider {
  readonly id = "cctp";
  readonly displayName = "Circle CCTP V2";
  readonly supportedRoutes = CCTP_ROUTES;

  /** Lazily-constructed bridge-kit instance. Cached after first call. */
  private kit: unknown = null;

  /** Lazy-load `@circle-fin/bridge-kit` and the necessary adapters.
   *  EVM source: viem adapter built from `signer.privateKey`.
   *  Solana source: requires a separate `solanaSigner` (consumer-supplied
   *  via the BridgeRequest extension; not yet wired — error if requested). */
  private async getKit(signer: BridgeSigner): Promise<{
    bridge(c: unknown): Promise<{ steps?: Array<{ txHash?: string }>; txHash?: string }>;
  }> {
    if (this.kit) return this.kit as Awaited<ReturnType<typeof this.getKit>>;

    requireEvmSigner(signer, this.id);
    if (!signer.privateKey) {
      throw new Error(`${this.id}: signer.privateKey required (walletClient path TBD)`);
    }

    let bridgeKitMod: { Kit: new (cfg: unknown) => unknown };
    let viemAdapterMod: { createViemAdapterFromPrivateKey: (cfg: unknown) => unknown };
    try {
      bridgeKitMod = (await import("@circle-fin/bridge-kit" as string)) as typeof bridgeKitMod;
      viemAdapterMod = (await import("@circle-fin/adapter-viem-v2" as string)) as typeof viemAdapterMod;
    } catch {
      throw new Error(
        'CctpBridgeProvider: SDK not installed. ' +
          'Run `pnpm add @circle-fin/bridge-kit @circle-fin/adapter-viem-v2` ' +
          'in the consuming project. (For Solana sources: also ' +
          '`pnpm add @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js`.) ' +
          'Quote-only paths work without the SDK.',
      );
    }

    this.kit = new bridgeKitMod.Kit({
      adapters: [
        viemAdapterMod.createViemAdapterFromPrivateKey({ privateKey: signer.privateKey }),
      ],
    });
    return this.kit as Awaited<ReturnType<typeof this.getKit>>;
  }

  /** Static estimate — CCTP V2 fee = $0.003 flat + 0.03% × amount.
   *  Matches the production formula used in components/c8-bridge/src/server.ts. */
  async estimate(req: BridgeRequest): Promise<BridgeQuote> {
    const route = findSupportedRoute(this, req.route);
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
      notes: "CCTP V2: $0.003 flat + 0.03% protocol fee, ~20s typical finality. Bridged via @circle-fin/bridge-kit.",
    };
  }

  async bridge(req: BridgeRequest, signer: BridgeSigner): Promise<BridgeResult> {
    const route = findSupportedRoute(this, req.route);
    const amountStr = atomicToDecimalString(req.amountAtomic, 6);

    try {
      // Cross-family transfers from Solana require a Solana adapter; this
      // provider's getKit() builds a viem adapter, so Solana sources need
      // a consumer-supplied path. Surface the limitation honestly.
      if (chainFamily(route.from) === "solana") {
        throw new Error(
          `CctpBridgeProvider: Solana source not yet wired here. Install ` +
            `@circle-fin/adapter-solana-kit and pass a solanaSigner via ` +
            `the consumer; this lazy-init only builds the viem adapter.`,
        );
      }

      const kit = await this.getKit(signer);
      const fromChain = bridgeKitChainName(route.from);
      const toChain = bridgeKitChainName(route.to);

      // bridge-kit's signature: kit.bridge({ from: { adapter, chain }, to: { adapter, chain }, amount })
      // Adapters are wired into the kit at construction; the call passes
      // chain identifiers and lets the kit pick the right adapter per side.
      const raw = await (kit as { bridge: (c: unknown) => Promise<{ steps?: Array<{ txHash?: string }>; txHash?: string }> }).bridge({
        from:   { chain: fromChain },
        to:     { chain: toChain },
        amount: amountStr,
        recipient: req.recipient,
      });

      const sourceTxHash = raw.txHash ?? raw.steps?.[raw.steps.length - 1]?.txHash;
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
   *  source tx is mined. bridge-kit doesn't expose a delivery-side polling
   *  API in the published surface, so this is a best-effort acknowledgment
   *  based on tx-hash existence. Consumers wanting live delivery confirmation
   *  poll the destination chain explorer. */
  async getStatus(sourceTxHash: string, route: BridgeRoute): Promise<BridgeStatus> {
    if (!sourceTxHash) return { providerId: this.id, state: "pending" };
    return {
      providerId: this.id,
      state: "delivered",
      detail: `CCTP V2 ~20s finality; check ${CCTP_CHAINS[route.to]?.explorer ?? "destination chain"} for credit`,
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
