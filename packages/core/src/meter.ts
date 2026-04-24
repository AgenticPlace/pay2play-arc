import { ARC_TESTNET, parseUsdPrice } from "./arc.js";
import type {
  PaymentRequirement,
  PaymentRequired,
  PriceRules,
  UsageKind,
  UsageSignal,
} from "./types.js";

export interface MeterOptions {
  /** CAIP-2 network ID. Default: Arc testnet. */
  network?: string;
  /** USDC asset address. Default: Arc testnet USDC. */
  asset?: string;
  /** Gateway Wallet verifying contract. Default: Arc testnet GatewayWallet. */
  verifyingContract?: string;
  /** How long a 402 challenge stays valid (seconds). Default: 4 days. */
  maxTimeoutSeconds?: number;
  /** Scheme name for Circle Gateway batching. Default: "GatewayWalletBatched". */
  schemeName?: string;
}

/**
 * Build a meter from a price-rules dict.
 *
 * ```ts
 * const m = meter({
 *   request:  "$0.001",
 *   tokens:   (s) => `$${(s.count * 0.00005).toFixed(6)}`,
 *   frames:   (s) => `$${(s.count * 0.0005).toFixed(6)}`,
 *   dwell:    (s) => s.ms >= 3000 ? "$0.0001" : "$0",
 * });
 * m.price({ kind: "tokens", count: 100 });     // "$0.005"
 * m.challenge({ kind: "request" }, { payTo, resourceUrl });
 * ```
 */
export function meter(rules: PriceRules, opts: MeterOptions = {}) {
  const network = opts.network ?? ARC_TESTNET.caip2;
  const asset = opts.asset ?? ARC_TESTNET.contracts.usdc;
  const verifyingContract =
    opts.verifyingContract ?? ARC_TESTNET.contracts.gatewayWallet;
  const maxTimeoutSeconds = opts.maxTimeoutSeconds ?? 345_600;
  const schemeName = opts.schemeName ?? "GatewayWalletBatched";

  /** Resolve a UsageSignal to a USD price string like "$0.001". */
  function price(signal: UsageSignal): string {
    const kind = signal.kind;
    const rule = rules[kind] as PriceRules[UsageKind] | undefined;
    if (rule === undefined) {
      throw new Error(`No price rule configured for usage kind "${kind}"`);
    }
    if (typeof rule === "string") return rule;
    // rule is a function — TS can't narrow the function's param to the
    // matching signal variant here, so we cast. The public PriceRules
    // shape guarantees correctness at the call site.
    return (rule as (s: UsageSignal) => string)(signal);
  }

  /** Resolve a UsageSignal to atomic USDC (6-decimal) units. */
  function priceAtomic(signal: UsageSignal): bigint {
    return parseUsdPrice(price(signal));
  }

  /** Build a PaymentRequirement for a signal. */
  function requirement(
    signal: UsageSignal,
    payTo: string,
  ): PaymentRequirement {
    return {
      scheme: "exact",
      network,
      asset,
      amount: priceAtomic(signal).toString(),
      payTo,
      maxTimeoutSeconds,
      extra: {
        name: schemeName,
        version: "1",
        verifyingContract,
      },
    };
  }

  /** Build a full x402 PaymentRequired challenge for a resource. */
  function challenge(
    signal: UsageSignal,
    ctx: { payTo: string; resourceUrl: string; description?: string },
  ): PaymentRequired {
    const p = price(signal);
    return {
      x402Version: 2,
      error: "payment-signature header is required",
      resource: {
        url: ctx.resourceUrl,
        description: ctx.description ?? `Paid resource (${p} USDC)`,
        mimeType: "application/json",
      },
      accepts: [requirement(signal, ctx.payTo)],
    };
  }

  return { price, priceAtomic, requirement, challenge };
}

export type Meter = ReturnType<typeof meter>;
