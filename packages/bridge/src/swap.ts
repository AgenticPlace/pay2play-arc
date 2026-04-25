/**
 * SwapModule — same-chain token swap via @circle-fin/app-kit.
 *
 * Supports USDC ↔ EURC and other stablecoin pairs on Arc.
 * Also supports crosschain swap (bridge + swap in one call).
 *
 * Docs: https://docs.arc.network/app-kit/swap.md
 */

import type { SwapConfig, SwapEstimate, SwapResult } from "./types.js";

export class SwapModule {
  private readonly privateKey: `0x${string}`;
  private kit: unknown = null;

  constructor(privateKey: `0x${string}`) {
    this.privateKey = privateKey;
  }

  private async getKit(): Promise<{
    swap(c: SwapConfig): Promise<{ txHash?: string }>;
    estimateSwap(c: SwapConfig): Promise<{ rate?: string; fee?: string; priceImpact?: string; toAmount?: string }>;
  }> {
    if (!this.kit) {
      const { AppKit } = await import("@circle-fin/app-kit" as string);
      const { createViemAdapterFromPrivateKey } = await import("@circle-fin/adapter-viem-v2" as string);
      this.kit = new (AppKit as new (cfg: unknown) => unknown)({
        adapters: [(createViemAdapterFromPrivateKey as (cfg: unknown) => unknown)({ privateKey: this.privateKey })],
      });
    }
    return this.kit as Awaited<ReturnType<typeof this.getKit>>;
  }

  async estimate(config: SwapConfig): Promise<SwapEstimate> {
    const kit = await this.getKit();
    const raw = await kit.estimateSwap(config);
    return {
      fromAmount:  config.amount,
      toAmount:    raw.toAmount   ?? "0",
      rate:        raw.rate       ?? "1",
      fee:         raw.fee        ?? "0",
      priceImpact: raw.priceImpact ?? "0",
    };
  }

  async swap(config: SwapConfig): Promise<SwapResult> {
    const kit = await this.getKit();
    try {
      const raw = await kit.swap(config);
      return {
        success:    true,
        txHash:     raw.txHash,
        explorerUrl: raw.txHash ? `https://testnet.arcscan.app/tx/${raw.txHash}` : undefined,
        fromAmount: config.amount,
        toAmount:   "0",
      };
    } catch (err) {
      return {
        success:    false,
        error:      err instanceof Error ? err.message : String(err),
        fromAmount: config.amount,
        toAmount:   "0",
      };
    }
  }
}
