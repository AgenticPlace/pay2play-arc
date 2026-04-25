/**
 * BridgeRegistry — composable lookup over the bridge zoo.
 *
 * Consumers build a registry, register one or more BridgeProvider instances,
 * and ask "who can bridge USDC from X to Y?". The registry returns matching
 * providers in priority order so callers can pick by fee, latency, or just
 * always-prefer-CCTP-when-available.
 *
 * The registry never instantiates SDKs of unrequested providers — heavy
 * deps load only when their provider is actually used.
 */

import type {
  BridgeProvider,
  BridgeRoute,
  BridgeQuote,
  BridgeRequest,
  BridgeResult,
  BridgeSigner,
} from "./provider.js";

/** Provider sort priority — registry returns providers in this order
 *  unless the caller overrides via `pickProvider`. */
export type ProviderPriority = (a: BridgeProvider, b: BridgeProvider) => number;

/** Default priority: CCTP first (Circle-native, lowest fees on its mesh),
 *  Wormhole next (broadest chain coverage), Axelar third (gas-flexible),
 *  XCM last (Polkadot-only). Callers can replace freely. */
export const DEFAULT_PRIORITY: ProviderPriority = (a, b) => {
  const order: Record<string, number> = { cctp: 0, wormhole: 1, axelar: 2, xcm: 3 };
  const ai = order[a.id] ?? 99;
  const bi = order[b.id] ?? 99;
  return ai - bi;
};

export class BridgeRegistry {
  private readonly providers: BridgeProvider[] = [];

  constructor(
    initial: BridgeProvider[] = [],
    private priority: ProviderPriority = DEFAULT_PRIORITY,
  ) {
    for (const p of initial) this.register(p);
  }

  /** Add a provider. Idempotent — re-registering the same id is a noop. */
  register(provider: BridgeProvider): this {
    if (!this.providers.some((p) => p.id === provider.id)) {
      this.providers.push(provider);
    }
    return this;
  }

  /** All registered providers, in priority order. */
  list(): ReadonlyArray<BridgeProvider> {
    return [...this.providers].sort(this.priority);
  }

  /** Find a provider by id; throws if missing. */
  get(id: string): BridgeProvider {
    const found = this.providers.find((p) => p.id === id);
    if (!found) {
      throw new Error(`BridgeRegistry: no provider with id "${id}". Registered: ${this.providers.map((p) => p.id).join(", ") || "(none)"}`);
    }
    return found;
  }

  /** Find every provider that supports a given route. Returns priority-sorted. */
  forRoute(route: BridgeRoute): BridgeProvider[] {
    return this.providers
      .filter((p) =>
        p.supportedRoutes.some(
          (r) => r.from === route.from && r.to === route.to && r.asset === route.asset,
        ),
      )
      .sort(this.priority);
  }

  /** Pick one provider for a route. Defaults to highest-priority match.
   *  Pass `preferId` to override (e.g. "wormhole" to force a specific provider). */
  pickProvider(route: BridgeRoute, preferId?: string): BridgeProvider {
    if (preferId) {
      const p = this.get(preferId);
      if (!p.supportedRoutes.some(
        (r) => r.from === route.from && r.to === route.to && r.asset === route.asset,
      )) {
        throw new Error(`BridgeRegistry: provider "${preferId}" does not support ${route.from} → ${route.to} (${route.asset})`);
      }
      return p;
    }
    const candidates = this.forRoute(route);
    if (candidates.length === 0) {
      throw new Error(`BridgeRegistry: no provider supports ${route.from} → ${route.to} (${route.asset})`);
    }
    return candidates[0]!;
  }

  /** Convenience: estimate via the best-matching provider. */
  async estimate(req: BridgeRequest, preferId?: string): Promise<BridgeQuote> {
    return this.pickProvider(req.route, preferId).estimate(req);
  }

  /** Convenience: bridge via the best-matching provider. */
  async bridge(req: BridgeRequest, signer: BridgeSigner, preferId?: string): Promise<BridgeResult> {
    return this.pickProvider(req.route, preferId).bridge(req, signer);
  }

  /** Quote every provider that supports the route, returning a comparison
   *  array. Useful for UIs that show "best fee" / "fastest" trade-offs. */
  async compareAll(req: BridgeRequest): Promise<BridgeQuote[]> {
    const candidates = this.forRoute(req.route);
    return Promise.all(candidates.map((p) => p.estimate(req)));
  }
}
