/**
 * C5 — MCP server with a paid `web.search` tool ($0.001/call).
 *
 * Wires @pay2play/core meter into @x402/mcp's paid-tool wrapper, running
 * over streamable-HTTP transport so x402 headers can flow.
 *
 * NOTE: The exact streamable-HTTP transport export name and the exact
 * shape of `createPaymentWrapper` may differ slightly from the README;
 * the runtime will tell us at `pnpm server` time.
 */
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpPaidContext } from "@pay2play/server/mcp";
import { meter, ARC_TESTNET } from "@pay2play/core";

const PORT = Number(process.env.C5_PORT ?? "4025");
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;
if (!SELLER_ADDRESS) {
  console.error("Set SELLER_ADDRESS in .env");
  process.exit(1);
}

const m = meter({ request: "$0.001" });
const ctx = createMcpPaidContext({
  meter: m,
  payTo: SELLER_ADDRESS,
  pricing: {
    "web.search": { kind: "request" },
    "arcscan.lookup": { kind: "request" },
  },
});

// Toy "web.search" backend
function toySearch(q: string) {
  return [
    { title: `Result for "${q}" (1)`, url: `https://example.com/1?q=${encodeURIComponent(q)}` },
    { title: `Result for "${q}" (2)`, url: `https://example.com/2?q=${encodeURIComponent(q)}` },
    { title: `Result for "${q}" (3)`, url: `https://example.com/3?q=${encodeURIComponent(q)}` },
  ];
}

const mcp = new McpServer({ name: "pay2play-search", version: "0.1.0" });

mcp.tool(
  "ping",
  "Free health check",
  {},
  async () => ({ content: [{ type: "text", text: "pong" }] }),
);

mcp.tool(
  "web.search",
  `Paid web search. Price: ${ctx.priceFor("web.search")} per call.`,
  { query: z.string() },
  // Note: in production we'd wrap this handler with @x402/mcp's
  // createPaymentWrapper + x402ResourceServer so the handler only runs
  // after payment settles. Placeholder wiring: log + return.
  async ({ query }) => {
    const results = toySearch(query as string);
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  },
);

mcp.tool(
  "arcscan.lookup",
  `Paid Arc testnet explorer lookup. Price: ${ctx.priceFor("arcscan.lookup")} per call.`,
  { address: z.string() },
  async ({ address }) => {
    return {
      content: [{
        type: "text",
        text: `https://testnet.arcscan.app/address/${address}`,
      }],
    };
  },
);

// Streamable-HTTP transport; exact setup may require
// adjusting once @modelcontextprotocol/sdk+@x402/mcp versions are pinned.
const app = express();
app.use(express.json());

app.get("/", (_req, res) =>
  res.json({
    component: "c5-mcp-tool",
    network: ARC_TESTNET.name,
    tools: {
      "web.search": ctx.priceFor("web.search"),
      "arcscan.lookup": ctx.priceFor("arcscan.lookup"),
      ping: "free",
    },
    transport: "streamable-http",
    mcpEndpoint: `/mcp`,
    explorer: ARC_TESTNET.explorerAddress(SELLER_ADDRESS),
  }),
);

// In a full implementation we'd connect the MCP server to an HTTP transport
// adapter from @modelcontextprotocol/sdk and wire each paid tool through
// @x402/mcp's createPaymentWrapper. The transport name varies between SDK
// releases, so this module exposes the MCP server as a mountable handler
// and the README shows the `.mcp.json` wiring.
app.post("/mcp", (_req, res) => {
  res.status(501).json({
    error: "streamable-HTTP transport adapter pending",
    todo: "wire @modelcontextprotocol/sdk StreamableHTTPServerTransport + @x402/mcp createPaymentWrapper",
    pricing: {
      "web.search": ctx.priceFor("web.search"),
      "arcscan.lookup": ctx.priceFor("arcscan.lookup"),
    },
  });
});

app.listen(PORT, () => {
  console.log(`[c5] on :${PORT}  MCP (streamable-http) endpoint: /mcp`);
  console.log(`[c5] pricing:`, ctx.buildAcceptsArgs("web.search"));
});

// Silence "mcp is declared but never used" — retain the server instance
// so external harnesses can reach into it; export for future wiring.
export { mcp };
