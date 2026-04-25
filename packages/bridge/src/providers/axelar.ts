/**
 * AxelarBridgeProvider — Axelar Squid for USDC (axlUSDC) cross-chain.
 *
 * Axelar's wrapped USDC variant is "axlUSDC". Bridging routes through the
 * Axelar Gateway with relayer-paid delivery on the destination, modulated
 * by a gas-multiplier (typical 1.1×–1.5×) the caller funds in advance.
 *
 * SDKs (lazy-imported):
 *   - `@axelar-network/axelarjs-sdk` — gateway / VAA / status
 *   - `@0xsquid/sdk` — quote + route via Squid (Axelar's swap router)
 *
 * Default routes cover the EVM mesh where axlUSDC is supported:
 * Ethereum, Polygon, BSC, Avalanche, Optimism, Arbitrum, Base, Moonbeam,
 * Linea, Filecoin EVM, Sei (Cosmos), Celo, Fantom.
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

const AX_CHAINS: Record<string, { chainId: number; axName: string; explorer: string }> = {
  "eip155:1":         { chainId: 1,        axName: "Ethereum",     explorer: "https://etherscan.io" },
  "eip155:56":        { chainId: 56,       axName: "binance",      explorer: "https://bscscan.com" },
  "eip155:137":       { chainId: 137,      axName: "Polygon",      explorer: "https://polygonscan.com" },
  "eip155:43114":     { chainId: 43114,    axName: "Avalanche",    explorer: "https://snowtrace.io" },
  "eip155:10":        { chainId: 10,       axName: "optimism",     explorer: "https://optimistic.etherscan.io" },
  "eip155:42161":     { chainId: 42161,    axName: "arbitrum",     explorer: "https://arbiscan.io" },
  "eip155:8453":      { chainId: 8453,     axName: "base",         explorer: "https://basescan.org" },
  "eip155:1284":      { chainId: 1284,     axName: "Moonbeam",     explorer: "https://moonbeam.moonscan.io" },
  "eip155:1287":      { chainId: 1287,     axName: "MoonbaseAlpha", explorer: "https://moonbase.moonscan.io" },
  "eip155:59144":     { chainId: 59144,    axName: "linea",        explorer: "https://lineascan.build" },
  "eip155:314":       { chainId: 314,      axName: "filecoin",     explorer: "https://filfox.info" },
  "eip155:42220":     { chainId: 42220,    axName: "celo",         explorer: "https://celoscan.io" },
  "eip155:250":       { chainId: 250,      axName: "Fantom",       explorer: "https://ftmscan.com" },
};

const AX_ROUTES: ReadonlyArray<BridgeRoute> = (() => {
  const ids = Object.keys(AX_CHAINS) as ChainId[];
  const routes: BridgeRoute[] = [];
  for (const from of ids) {
    for (const to of ids) {
      if (from !== to) {
        routes.push({ from, to, asset: "USDC" });
        routes.push({ from, to, asset: "axlUSDC" });
      }
    }
  }
  return routes;
})();

/** Axelar/Squid fee structure (approximation):
 *   - relayer fee: $0.05 base = 50_000n atomic — typical Axelar-relayed cost
 *   - destination gas: scaled by gas-multiplier (1.2× = +20%) — ~$0.02 typical
 *   - source gas: caller pays directly in source-chain native; not modeled
 *   - protocol fee: 0 for plain USDC bridging */
const AX_RELAYER_FEE_ATOMIC = 50_000n;
const AX_DEST_GAS_ATOMIC    = 20_000n;

export class AxelarBridgeProvider implements BridgeProvider {
  readonly id = "axelar";
  readonly displayName = "Axelar / Squid";
  readonly supportedRoutes = AX_ROUTES;

  private squid: unknown = null;

  /** Lazy-load the Squid SDK; throws structured error if not installed. */
  private async getSdk(): Promise<unknown> {
    if (!this.squid) {
      try {
        const mod = (await import("@0xsquid/sdk" as string)) as { Squid: new (cfg: unknown) => unknown };
        this.squid = new mod.Squid({
          baseUrl: "https://api.0xsquid.com",
        });
      } catch {
        throw new Error(
          'AxelarBridgeProvider: SDK not installed. ' +
            'Run `pnpm add @0xsquid/sdk @axelar-network/axelarjs-sdk` ' +
            'in the consuming project to enable live execution. ' +
            'Quote-only paths work without the SDK.',
        );
      }
    }
    return this.squid;
  }

  async estimate(req: BridgeRequest): Promise<BridgeQuote> {
    const route = findSupportedRoute(this, req.route);
    const fees = sumFees({
      relayerAtomic: AX_RELAYER_FEE_ATOMIC,
      destGasAtomic: AX_DEST_GAS_ATOMIC,
    });
    const netReceiveAtomic =
      req.amountAtomic > fees.totalAtomic ? req.amountAtomic - fees.totalAtomic : 0n;
    return {
      providerId: this.id,
      route,
      netReceiveAtomic,
      fees,
      estimatedSeconds: 180, // ~3 minutes typical
      notes:
        "Axelar Gateway via Squid: relayer + destination-gas. Live SDK refines numbers " +
        "and applies a gas-multiplier (default 1.2×) at execute time.",
    };
  }

  async bridge(req: BridgeRequest, signer: BridgeSigner): Promise<BridgeResult> {
    const route = findSupportedRoute(this, req.route);
    try {
      requireEvmSigner(signer, this.id);
      const sdk = await this.getSdk();
      void sdk;
      throw new Error(
        "AxelarBridgeProvider.bridge: live execution requires the consumer to " +
          "configure a Squid route + viem signer. Wire via the SDK once installed.",
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
    if (!sourceTxHash) return { providerId: this.id, state: "pending" };
    void route;
    return {
      providerId: this.id,
      state: "attesting",
      detail:
        "Axelar status requires axelar-cgp-solidity status API (https://api.gmp.axelarscan.io). " +
        "Until the SDK is wired, this is a best-effort acknowledgment.",
    };
  }
}
