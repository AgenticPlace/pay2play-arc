# C5 · Paid MCP tool

An MCP server that exposes a `web.search` (stubbed) tool at **$0.001/call**, using `@x402/mcp`'s `createPaymentWrapper` + `x402ResourceServer`. The pay2play core's `meter` provides the price.

## Transport

MUST be **streamable-HTTP** (not stdio) — x402 rides HTTP headers.

## Run

```bash
# Terminal 1 — server (streamable-HTTP on :4025)
pnpm server

# Terminal 2 — client demo (60 calls)
pnpm demo
```

## Claude Code integration (if supported)

Add to `.mcp.json`:
```json
{
  "mcpServers": {
    "pay2play-search": {
      "url": "http://localhost:4025/mcp",
      "transport": "streamable-http"
    }
  }
}
```

If Claude Code's MCP client doesn't support `withPayment` yet, drive via the Node client harness in `src/client.ts`.
