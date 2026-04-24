/**
 * C5 client harness — drives the MCP server with a paid MCP client.
 *
 * Placeholder: real wiring uses @x402/mcp's createX402MCPClient +
 * SSEClientTransport/StreamableHTTPClientTransport + ExactEvmScheme from
 * @x402/evm/exact/client. Pinned once SDK versions confirm at runtime.
 */
import { mcpClientDefaults } from "@pay2play/client/mcp";

const N = parseInt(process.argv[2] ?? "60", 10);
const SERVER_URL = process.env.C5_SERVER_URL ?? "http://localhost:4025/mcp";

console.log(`[c5 client] would dispatch ${N} paid tool calls to ${SERVER_URL}`);
console.log(`[c5 client] config:`, mcpClientDefaults("c5-demo", "0.1.0"));
console.log(`[c5 client] NOTE: x402-mcp streamable-HTTP wiring pending — see README.`);
