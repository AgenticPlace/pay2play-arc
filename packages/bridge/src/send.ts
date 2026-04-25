/**
 * SendModule — wallet-to-wallet same-chain token transfers.
 *
 * Docs: https://docs.arc.network/app-kit/send.md
 */

import type { SendConfig, SendResult } from "./types.js";
import { ARC_TESTNET } from "@pay2play/core";

export class SendModule {
  private readonly privateKey: `0x${string}`;
  private kit: unknown = null;

  constructor(privateKey: `0x${string}`) {
    this.privateKey = privateKey;
  }

  private async getKit(): Promise<{
    send(c: SendConfig): Promise<{ txHash?: string }>;
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

  /** Send USDC on Arc testnet. */
  async sendUsdc(to: `0x${string}`, amount: string): Promise<SendResult> {
    return this.send({
      chain: "arcTestnet",
      token: ARC_TESTNET.contracts.usdc,
      to,
      amount,
    });
  }

  async send(config: SendConfig): Promise<SendResult> {
    const kit = await this.getKit();
    try {
      const raw = await kit.send(config);
      return {
        success:    true,
        txHash:     raw.txHash,
        explorerUrl: raw.txHash ? `${ARC_TESTNET.explorer}/tx/${raw.txHash}` : undefined,
      };
    } catch (err) {
      return {
        success: false,
        error:   err instanceof Error ? err.message : String(err),
      };
    }
  }
}
