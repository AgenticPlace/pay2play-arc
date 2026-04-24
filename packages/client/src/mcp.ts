/**
 * MCP client helper for pay2play. Delegates to @x402/mcp's
 * createX402MCPClient + ExactEvmScheme — we just surface a cleaner
 * constructor that knows about Arc testnet.
 *
 * Shape derived from _refs/coinbase/x402/typescript/packages/mcp/README.md.
 *
 * Actual @x402/mcp wiring lives in consumer code (components/c5-mcp-tool)
 * because of MCP transport choice (SSEClientTransport vs streamable HTTP).
 * This module only exports the config helpers.
 */
import { ARC_TESTNET } from "@pay2play/core";

export interface McpClientConfig {
  name: string;
  version: string;
  /** CAIP-2 network. Default: Arc testnet. */
  network?: string;
  /** Whether payments are auto-approved without human confirmation. */
  autoPayment?: boolean;
  /** Max USD per individual tool call (guardrail). */
  maxAmountPerCall?: string;
  /** Max total USD per session. */
  maxTotalAmount?: string;
}

export function mcpClientDefaults(
  name: string,
  version: string,
): Required<Pick<McpClientConfig, "name" | "version" | "network" | "autoPayment">> & {
  maxAmountPerCall: string;
  maxTotalAmount: string;
} {
  return {
    name,
    version,
    network: ARC_TESTNET.caip2,
    autoPayment: true,
    maxAmountPerCall: "$0.01",
    maxTotalAmount: "$1.00",
  };
}
