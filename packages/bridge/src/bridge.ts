/**
 * BridgeModule — modular wrapper over @circle-fin/app-kit bridge capability.
 *
 * Supports EVM→EVM cross-chain USDC transfers via CCTP V2.
 * Arc testnet is Domain 26 in CCTP routing.
 *
 * Quickstart: https://docs.arc.network/app-kit/quickstarts/bridge-between-evm-chains.md
 * SDK ref:    https://docs.arc.network/app-kit/references/sdk-reference.md
 */

import type { BridgeConfig, BridgeEstimate, BridgeResult } from "./types.js";

export class BridgeModule {
  private readonly privateKey: `0x${string}`;
  private kit: unknown = null;

  constructor(privateKey: `0x${string}`) {
    this.privateKey = privateKey;
  }

  /** Lazy-init AppKit so the module can be imported without Circle credentials. */
  private async getKit(): Promise<{
    bridge(c: BridgeConfig): Promise<{ steps?: unknown[] }>;
    estimateBridge(c: BridgeConfig): Promise<{ fee?: string; estimatedTime?: string }>;
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

  async estimate(config: BridgeConfig): Promise<BridgeEstimate> {
    const kit = await this.getKit();
    const raw = await kit.estimateBridge(config);
    return {
      fee:              raw.fee       ?? "unknown",
      feeUsdc:          raw.fee       ?? "unknown",
      estimatedTime:    raw.estimatedTime ?? "< 20s",
      sourceChain:      config.sourceChain,
      destinationChain: config.destinationChain,
      amount:           config.amount,
    };
  }

  async bridge(config: BridgeConfig): Promise<BridgeResult> {
    const kit = await this.getKit();
    try {
      const raw = await kit.bridge(config);
      const steps = raw.steps as Array<{ txHash?: string }> | undefined;
      const txHash = steps?.[steps.length - 1]?.txHash;
      return {
        success:          true,
        txHash,
        explorerUrl:      txHash ? `https://testnet.arcscan.app/tx/${txHash}` : undefined,
        sourceChain:      config.sourceChain,
        destinationChain: config.destinationChain,
        amount:           config.amount,
      };
    } catch (err) {
      return {
        success:          false,
        error:            err instanceof Error ? err.message : String(err),
        sourceChain:      config.sourceChain,
        destinationChain: config.destinationChain,
        amount:           config.amount,
      };
    }
  }
}
