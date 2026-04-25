/**
 * WormholeBridgeProvider — Wormhole NTT (Native Token Transfer) for USDC.
 *
 * Wormhole's flagship USDC variant is "USDC.wh" — a wrapped 6-decimal token
 * minted on every Wormhole-supported chain. Bridging routes through
 * Wormhole's guardian network with relayer-paid delivery on the destination.
 *
 * SDK: `@wormhole-foundation/sdk` (lazy-imported; not a build-time dep).
 *
 * Default routes cover the EVM chains where USDC.wh is mainstream:
 * Ethereum, Polygon, BSC, Avalanche, Optimism, Arbitrum, Base, Moonbeam.
 * Solana and Sui are reachable through the same SDK but require a different
 * signer adapter — left for follow-up.
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

/** Wormhole-supported EVM chains and their explorers (informational). */
const WH_CHAINS: Record<string, { chainId: number; whName: string; explorer: string }> = {
  "eip155:1":         { chainId: 1,        whName: "Ethereum",  explorer: "https://etherscan.io" },
  "eip155:56":        { chainId: 56,       whName: "Bsc",       explorer: "https://bscscan.com" },
  "eip155:137":       { chainId: 137,      whName: "Polygon",   explorer: "https://polygonscan.com" },
  "eip155:43114":     { chainId: 43114,    whName: "Avalanche", explorer: "https://snowtrace.io" },
  "eip155:10":        { chainId: 10,       whName: "Optimism",  explorer: "https://optimistic.etherscan.io" },
  "eip155:42161":     { chainId: 42161,    whName: "Arbitrum",  explorer: "https://arbiscan.io" },
  "eip155:8453":      { chainId: 8453,     whName: "Base",      explorer: "https://basescan.org" },
  "eip155:1284":      { chainId: 1284,     whName: "Moonbeam",  explorer: "https://moonbeam.moonscan.io" },
  "eip155:1287":      { chainId: 1287,     whName: "MoonbaseAlpha", explorer: "https://moonbase.moonscan.io" },
};

const WH_ROUTES: ReadonlyArray<BridgeRoute> = (() => {
  const ids = Object.keys(WH_CHAINS) as ChainId[];
  const routes: BridgeRoute[] = [];
  for (const from of ids) {
    for (const to of ids) {
      if (from !== to) {
        routes.push({ from, to, asset: "USDC" });
        routes.push({ from, to, asset: "USDC.wh" });
      }
    }
  }
  return routes;
})();

/** Wormhole NTT fee structure (approximation, refined by SDK at execute time):
 *   - relayer fee: ~$0.01–0.05 depending on dest chain (we model $0.02 = 20_000n atomic)
 *   - protocol fee: 0 for USDC.wh on supported routes
 *   - source-gas dominates on Ethereum mainnet but is tiny on L2s; we ignore */
const WH_RELAYER_FEE_ATOMIC = 20_000n;

export class WormholeBridgeProvider implements BridgeProvider {
  readonly id = "wormhole";
  readonly displayName = "Wormhole NTT";
  readonly supportedRoutes = WH_ROUTES;

  private wh: unknown = null;

  /** Lazy-load the Wormhole SDK; throws a structured error if not installed. */
  private async getSdk(): Promise<{
    wormhole(env: string, platforms: unknown[]): Promise<unknown>;
  }> {
    if (!this.wh) {
      try {
        const mod = (await import("@wormhole-foundation/sdk" as string)) as {
          wormhole: (env: string, platforms: unknown[]) => Promise<unknown>;
        };
        this.wh = mod;
      } catch {
        throw new Error(
          'WormholeBridgeProvider: SDK not installed. ' +
            'Run `pnpm add @wormhole-foundation/sdk @wormhole-foundation/sdk-evm` ' +
            'in the consuming project to enable live bridge calls. ' +
            'Quote-only paths work without the SDK.',
        );
      }
    }
    return this.wh as Awaited<ReturnType<typeof this.getSdk>>;
  }

  async estimate(req: BridgeRequest): Promise<BridgeQuote> {
    const route = findSupportedRoute(this, req.route);
    const fees = sumFees({
      relayerAtomic: WH_RELAYER_FEE_ATOMIC,
    });
    const netReceiveAtomic =
      req.amountAtomic > fees.totalAtomic ? req.amountAtomic - fees.totalAtomic : 0n;
    return {
      providerId: this.id,
      route,
      netReceiveAtomic,
      fees,
      estimatedSeconds: 600, // ~10 minutes typical NTT finalization
      notes:
        "Wormhole NTT: relayer-paid delivery. Fee is approximated; SDK refines at execute. " +
        "Manual claim may be required if relayer doesn't pick up the VAA.",
    };
  }

  async bridge(req: BridgeRequest, signer: BridgeSigner): Promise<BridgeResult> {
    const route = findSupportedRoute(this, req.route);
    try {
      requireEvmSigner(signer, this.id);
      const sdk = await this.getSdk();
      // The actual Wormhole NTT call requires building a context with platforms,
      // resolving the chain, and submitting via a Signer abstraction. The SDK
      // surface is too large to inline here — this is the integration anchor.
      // Consumers who need live execution should pass a configured `wormhole()`
      // context via the constructor (override hook) once they've built one.
      void sdk;
      throw new Error(
        "WormholeBridgeProvider.bridge: live execution requires consumer-built " +
          "wormhole context (see @wormhole-foundation/sdk docs). Quote works.",
      );
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

  async getStatus(sourceTxHash: string, route: BridgeRoute): Promise<BridgeStatus> {
    if (!sourceTxHash) {
      return { providerId: this.id, state: "pending" };
    }
    // Wormhole status query goes through the guardian VAA service.
    // Without the SDK the status is "best-effort attesting" until consumer wires up the live path.
    void route;
    return {
      providerId: this.id,
      state: "attesting",
      detail:
        "Wormhole VAA query requires the SDK. Until the SDK is wired, " +
        "consider this a best-effort acknowledgment of the source tx.",
    };
  }
}
