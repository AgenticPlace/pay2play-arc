import type { BridgeEstimate, BridgeResult } from "@pay2play/core";

export type { BridgeEstimate, BridgeResult };

export interface BridgeConfig {
  sourceChain: string;
  destinationChain: string;
  amount: string;
  recipientAddress?: `0x${string}`;
  speed?: "fast" | "standard";
}

export interface SwapConfig {
  chain: string;
  fromToken: string;
  toToken: string;
  amount: string;
  slippageTolerance?: number;
}

export interface SwapEstimate {
  fromAmount: string;
  toAmount: string;
  rate: string;
  fee: string;
  priceImpact: string;
}

export interface SwapResult {
  success: boolean;
  txHash?: string;
  explorerUrl?: string;
  fromAmount: string;
  toAmount: string;
  error?: string;
}

export interface SendConfig {
  chain: string;
  token: string;
  to: `0x${string}`;
  amount: string;
  memo?: string;
}

export interface SendResult {
  success: boolean;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
}

export interface AppKitAdapter {
  bridge(config: BridgeConfig): Promise<BridgeResult>;
  estimateBridge(config: BridgeConfig): Promise<BridgeEstimate>;
  swap(config: SwapConfig): Promise<SwapResult>;
  estimateSwap(config: SwapConfig): Promise<SwapEstimate>;
  send(config: SendConfig): Promise<SendResult>;
}
