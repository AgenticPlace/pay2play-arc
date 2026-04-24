/**
 * MCP paid-tool wrapper for pay2play. Delegates to @x402/mcp (if installed)
 * and sources the per-tool price from a @pay2play/core Meter. The price
 * lookup allows a single meter to power both HTTP routes and MCP tools.
 *
 * Note: @x402/mcp requires streamable-HTTP MCP transport (NOT stdio), because
 * x402 payments ride on HTTP headers.
 *
 * Shape derived from _refs/coinbase/x402/typescript/packages/mcp/README.md.
 */
import type { Meter, UsageSignal } from "@pay2play/core";

export interface McpPaidToolsOptions {
  meter: Meter;
  payTo: string;
  /** CAIP-2 network e.g. "eip155:5042002". Default: Arc testnet via meter config. */
  network?: string;
  /**
   * Coinbase-hosted facilitator URL. Use https://x402.org/facilitator for Base,
   * or embed Circle Gateway for Arc by running a local facilitator bridge.
   */
  facilitatorUrl?: string;
  /** Per-tool price map: { "web.search": { kind: "request" } }. */
  pricing: Record<string, UsageSignal>;
}

export interface McpPaidContext {
  /** Returns a per-tool price in USD string. */
  priceFor: (toolName: string) => string;
  /**
   * Returns the pieces needed by @x402/mcp's `resourceServer.buildPaymentRequirements`.
   * Callers pass this into `createPaymentWrapper`.
   */
  buildAcceptsArgs: (toolName: string) => {
    scheme: "exact";
    network: string;
    payTo: string;
    price: string;
  };
}

/**
 * Build a pay2play MCP context that @x402/mcp's `resourceServer` can consume.
 *
 * Usage inside an MCP server:
 * ```ts
 * import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
 * import { createPaymentWrapper, x402ResourceServer } from "@x402/mcp";
 * import { HTTPFacilitatorClient } from "@x402/core/server";
 * import { ExactEvmScheme } from "@x402/evm/exact/server";
 * import { createMcpPaidContext } from "@pay2play/server/mcp";
 *
 * const ctx = createMcpPaidContext({
 *   meter, payTo,
 *   pricing: { "web.search": { kind: "request" } },
 * });
 *
 * const facilitator = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
 * const resourceServer = new x402ResourceServer(facilitator);
 * resourceServer.register("eip155:5042002", new ExactEvmScheme());
 * await resourceServer.initialize();
 *
 * const accepts = await resourceServer.buildPaymentRequirements(ctx.buildAcceptsArgs("web.search"));
 * const paid = createPaymentWrapper(resourceServer, { accepts });
 *
 * mcpServer.tool("web.search", "Paid search", schema, paid(handler));
 * ```
 */
export function createMcpPaidContext(
  opts: McpPaidToolsOptions,
): McpPaidContext {
  const network = opts.network ?? "eip155:5042002";

  const priceFor = (toolName: string): string => {
    const signal = opts.pricing[toolName];
    if (!signal) throw new Error(`No pricing rule for MCP tool "${toolName}"`);
    return opts.meter.price(signal);
  };

  const buildAcceptsArgs = (toolName: string) => ({
    scheme: "exact" as const,
    network,
    payTo: opts.payTo,
    price: priceFor(toolName),
  });

  return { priceFor, buildAcceptsArgs };
}
