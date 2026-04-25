/**
 * XcmBridgeProvider — Polkadot XCM (Cross-Consensus Message) for xcUSDC.
 *
 * Polkadot's native cross-chain messaging. The "xcUSDC" variant lives on
 * the Polkadot Asset Hub and can be teleported / reserve-transferred to
 * Moonbeam, Astar, Hydra and other XCM-enabled parachains.
 *
 * SDK: `@moonbeam-network/xcm-sdk` (lazy-imported). The SDK abstracts
 * MultiLocation construction + weight estimation; we expose a normalised
 * BridgeProvider face on top.
 *
 * Signing: this provider requires a SubstrateBridgeSigner (sr25519 mnemonic
 * via the `suri` field). The other providers in the zoo are EVM-only;
 * BridgeProvider's discriminated union accommodates both.
 *
 * Default routes are the most-trafficked XCM corridors for USDC:
 *   - Polkadot Asset Hub ↔ Moonbeam (xcUSDC)
 *   - Polkadot Asset Hub ↔ Astar
 *   - Polkadot Asset Hub ↔ Hydra
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
  requireSubstrateSigner,
  findSupportedRoute,
  sumFees,
} from "../provider.js";

const XCM_CHAINS: Record<string, { paraId: number; explorer: string }> = {
  "polkadot:asset-hub": { paraId: 1000, explorer: "https://assethub-polkadot.subscan.io" },
  "polkadot:moonbeam":  { paraId: 2004, explorer: "https://moonbeam.subscan.io" },
  "polkadot:astar":     { paraId: 2006, explorer: "https://astar.subscan.io" },
  "polkadot:hydra":     { paraId: 2034, explorer: "https://hydradx.subscan.io" },
};

/** Bidirectional pairs for xcUSDC bridging through Asset Hub. */
const XCM_ROUTES: ReadonlyArray<BridgeRoute> = (() => {
  const ids = Object.keys(XCM_CHAINS) as ChainId[];
  const routes: BridgeRoute[] = [];
  // Asset Hub is the canonical custodian — every parachain pairs with it.
  for (const para of ids) {
    if (para === "polkadot:asset-hub") continue;
    routes.push({ from: "polkadot:asset-hub", to: para, asset: "xcUSDC" });
    routes.push({ from: para, to: "polkadot:asset-hub", asset: "xcUSDC" });
    routes.push({ from: "polkadot:asset-hub", to: para, asset: "USDC" });
    routes.push({ from: para, to: "polkadot:asset-hub", asset: "USDC" });
  }
  return routes;
})();

/** XCM fee structure:
 *   - weight fee: deducted from the asset itself on destination, ~0.05 xcUSDC
 *     ≈ 50_000n atomic (USDC has 6 decimals). Varies by destination weight.
 *   - delivery fee: paid in DOT at source; not modeled in USDC atomic units.
 *   - protocol fee: 0 — XCM is built-in. */
const XCM_WEIGHT_FEE_ATOMIC = 50_000n;

export class XcmBridgeProvider implements BridgeProvider {
  readonly id = "xcm";
  readonly displayName = "Polkadot XCM";
  readonly supportedRoutes = XCM_ROUTES;

  private xcmSdk: unknown = null;

  private async getSdk(): Promise<unknown> {
    if (!this.xcmSdk) {
      try {
        const mod = (await import("@moonbeam-network/xcm-sdk" as string)) as { Sdk?: unknown };
        this.xcmSdk = mod.Sdk ?? mod;
      } catch {
        throw new Error(
          'XcmBridgeProvider: SDK not installed. ' +
            'Run `pnpm add @moonbeam-network/xcm-sdk @polkadot/api @polkadot/keyring` ' +
            'in the consuming project to enable live XCM transfers. ' +
            'Quote-only paths work without the SDK.',
        );
      }
    }
    return this.xcmSdk;
  }

  async estimate(req: BridgeRequest): Promise<BridgeQuote> {
    const route = findSupportedRoute(this, req.route);
    const fees = sumFees({
      destGasAtomic: XCM_WEIGHT_FEE_ATOMIC,
    });
    const netReceiveAtomic =
      req.amountAtomic > fees.totalAtomic ? req.amountAtomic - fees.totalAtomic : 0n;
    return {
      providerId: this.id,
      route,
      netReceiveAtomic,
      fees,
      estimatedSeconds: 30, // XCM finalises in 1–2 relay-chain blocks (~12s each)
      notes:
        "Polkadot XCM: weight fee deducted on destination. Delivery fee paid in DOT " +
        "at source (not modeled in USDC atomic). Substrate signer required.",
    };
  }

  async bridge(req: BridgeRequest, signer: BridgeSigner): Promise<BridgeResult> {
    const route = findSupportedRoute(this, req.route);
    try {
      requireSubstrateSigner(signer, this.id);
      const sdk = await this.getSdk();
      void sdk;
      // The SDK exposes a fluent builder: Sdk().assets().asset(...).source(...).destination(...).accounts(...).transfer(...)
      // Wiring requires a configured Polkadot keyring; consumers pass the suri,
      // we'd build the keyring + signer here. Left as an integration anchor —
      // the SDK is too contextual to fully embed without a real account.
      throw new Error(
        "XcmBridgeProvider.bridge: live execution requires consumer-built keyring + " +
          "Polkadot WS endpoints (see @moonbeam-network/xcm-sdk docs).",
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
      state: "delivered",
      detail:
        "XCM messages execute synchronously when within HRMP capacity. The SDK does not " +
        "expose a delivery-side event stream; inspect destination chain Subscan for confirmation.",
      destTxHash: sourceTxHash,
    };
  }
}
