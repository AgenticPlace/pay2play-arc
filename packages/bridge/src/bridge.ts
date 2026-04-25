/**
 * BridgeModule — legacy class-style wrapper over CCTP V2.
 *
 * Kept for backward compatibility with components/c8-bridge. New code
 * should prefer the BridgeProvider interface in `./provider.ts` and the
 * `CctpBridgeProvider` impl in `./providers/cctp.ts`.
 *
 * This class now thinly wraps `CctpBridgeProvider` so there's a single
 * source of truth for the Circle CCTP V2 path.
 */

import type { BridgeConfig, BridgeEstimate, BridgeResult } from "./types.js";
import { CctpBridgeProvider } from "./providers/cctp.js";
import type { ChainId } from "./provider.js";

const CHAIN_NAME_TO_CAIP2: Record<string, ChainId> = {
  ethereum:    "eip155:1",
  avalanche:   "eip155:43114",
  optimism:    "eip155:10",
  arbitrum:    "eip155:42161",
  base:        "eip155:8453",
  polygon:     "eip155:137",
  arcTestnet:  "eip155:5042002",
};

function toCaip2(name: string): ChainId {
  const c = CHAIN_NAME_TO_CAIP2[name];
  if (!c) throw new Error(`BridgeModule: unknown chain name "${name}"`);
  return c;
}

function parseAtomic(amountStr: string, decimals = 6): bigint {
  const [whole, frac = ""] = amountStr.split(".");
  const wholeBig = whole ? BigInt(whole) : 0n;
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return wholeBig * 10n ** BigInt(decimals) + (padded ? BigInt(padded) : 0n);
}

export class BridgeModule {
  private readonly provider: CctpBridgeProvider;
  private readonly privateKey: `0x${string}`;

  constructor(privateKey: `0x${string}`) {
    this.privateKey = privateKey;
    this.provider = new CctpBridgeProvider();
  }

  async estimate(config: BridgeConfig): Promise<BridgeEstimate> {
    const quote = await this.provider.estimate({
      route: {
        from: toCaip2(config.sourceChain),
        to:   toCaip2(config.destinationChain),
        asset: "USDC",
      },
      amountAtomic: parseAtomic(config.amount, 6),
      recipient: config.recipientAddress ?? "0x0000000000000000000000000000000000000000",
    });
    return {
      fee:              (Number(quote.fees.totalAtomic) / 1e6).toFixed(6),
      feeUsdc:          (Number(quote.fees.totalAtomic) / 1e6).toFixed(6),
      estimatedTime:    `< ${quote.estimatedSeconds}s`,
      sourceChain:      config.sourceChain,
      destinationChain: config.destinationChain,
      amount:           config.amount,
    };
  }

  async bridge(config: BridgeConfig): Promise<BridgeResult> {
    const result = await this.provider.bridge(
      {
        route: {
          from: toCaip2(config.sourceChain),
          to:   toCaip2(config.destinationChain),
          asset: "USDC",
        },
        amountAtomic: parseAtomic(config.amount, 6),
        recipient: (config.recipientAddress ?? "0x0000000000000000000000000000000000000000") as string,
      },
      { kind: "evm", privateKey: this.privateKey },
    );
    return {
      success:          result.success,
      txHash:           result.sourceTxHash,
      explorerUrl:      result.sourceExplorerUrl,
      error:            result.error,
      sourceChain:      config.sourceChain,
      destinationChain: config.destinationChain,
      amount:           config.amount,
    };
  }
}
