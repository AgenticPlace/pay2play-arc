# Circle Nanopayments + Gateway

> **Confirmed** from `_refs/arc-nanopayments/package.json`:
> - `@circle-fin/x402-batching@^2.0.4` (primary)
> - `@x402/core@^2.6.0`
> - `@x402/evm@^2.6.0`
> - `viem@^2.47.1`

## What it is

Circle Nanopayments enables **gasless USDC transfers as small as $0.000001**, following the x402 standard. The core trick is **offchain aggregation with delayed, batched onchain settlement**: thousands of signed authorizations bundle into a single Arc tx, so per-action gas → ~$0.

## Docs
- Dev hub: https://developers.circle.com/
- LLM-ingestible index: https://developers.circle.com/llms.txt
- Gateway overview: https://developers.circle.com/gateway.md
- Gateway supported chains: https://developers.circle.com/gateway/references/supported-blockchains.md
- Gateway fees: https://developers.circle.com/gateway/references/fees.md
- Nanopayments root: https://developers.circle.com/gateway/nanopayments
- **Seller quickstart**: https://developers.circle.com/gateway/nanopayments/quickstarts/seller
- **Buyer quickstart**: https://developers.circle.com/gateway/nanopayments/quickstarts/buyer
- x402 integration concepts: https://developers.circle.com/gateway/nanopayments/concepts/x402
- Batched settlement concepts: https://developers.circle.com/gateway/nanopayments/concepts/batched-settlement
- Settle API reference: https://developers.circle.com/api-reference/gateway/all/settle-x402payment
- CCTP Eth→Arc: https://developers.circle.com/cctp/quickstarts/transfer-usdc-ethereum-to-arc.md
- CCTP Solana→Arc: https://developers.circle.com/cctp/quickstarts/transfer-usdc-solana-to-arc.md
- Marketing landing: https://www.circle.com/nanopayments
- LangChain demo blog: https://www.circle.com/blog/autonomous-payments-using-circle-wallets-usdc-and-x402
- Nanopayments launch blog: https://www.circle.com/blog/circle-nanopayments-launches-on-testnet-as-the-core-primitive-for-agentic-economic-activity

## SDK shape (authoritative — extracted from `_refs/arc-nanopayments/lib/x402.ts` and `agent.mts`)

### Server side
```ts
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";

const facilitator = new BatchFacilitatorClient();

// On 402 challenge:
const requirements = {
  scheme: "exact",
  network: "eip155:5042002",
  asset: "0x3600000000000000000000000000000000000000",      // USDC
  amount: "10000",                                            // atomic 6-decimal ($0.01)
  payTo: sellerAddress,
  maxTimeoutSeconds: 345600,                                  // 4 days
  extra: {
    name: "GatewayWalletBatched",
    version: "1",
    verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  },
};

const paymentRequired = { x402Version: 2, resource: {...}, accepts: [requirements] };
// Set header: PAYMENT-REQUIRED: base64(JSON paymentRequired)

// On payment verification + settlement:
const verifyResult = await facilitator.verify(paymentPayload, requirements);
const settleResult = await facilitator.settle(paymentPayload, requirements);
// returns { success, errorReason, transaction, payer }
```

### Client side
```ts
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { arcTestnet } from "viem/chains";                     // already exported by viem!

const gateway = new GatewayClient({
  chain: "arcTestnet",
  privateKey: ephemeralKey,
});

const deposit = await gateway.deposit("1");                   // returns { depositTxHash }
const balances = await gateway.getBalances();                 // .gateway.formattedAvailable
```

### Header format (verbatim from reference)
- Request: `payment-signature` (lowercase) = base64(JSON PaymentPayload)
- Response (challenge): `PAYMENT-REQUIRED` (uppercase) = base64(JSON)
- Response (receipt): `PAYMENT-RESPONSE` (uppercase) = base64(JSON)

### Gateway API URLs
- Balance: `https://gateway-api-testnet.circle.com/v1/balances`
- CCTP domain for Arc: `26`

The reference is heavy (Next + Supabase + LangChain) — Supabase just logs payment events to a dashboard table, not required for the payment flow. Our `@pay2play/*` packages extract just the `BatchFacilitatorClient.verify/settle` + `GatewayClient.deposit/pay` pattern, strip Supabase.

## Supported chains (Feb 2026)

Arbitrum, **Arc**, Avalanche, Base, Ethereum, HyperEVM, Optimism, Polygon PoS, Sei, Sonic, Unichain, World Chain.

## Batch window

**Not publicly documented.** Community refers to "periodic"; may be seconds to minutes. Product feedback item: propose publishing an SLA.

Design UX to **honestly distinguish** signed vouchers (instant, client-side) from settled on-chain batches (deferred, server-side).

## Prerequisites for a working demo

1. Node.js v22+
2. EVM wallet (private key or Circle Developer-Controlled Wallet)
3. Testnet USDC from https://faucet.circle.com/ (Arc Testnet)
4. One-time Gateway deposit (onchain tx, NOT gasless)
5. Optional: OpenAI key (for LangChain-style buyer agent) or Gemini key

## Gotchas from the reference implementation
- The reference uses `agent.mts` with experimental TS transform (`--experimental-transform-types`) — overkill for us, plain `tsx` suffices.
- Supabase in the reference is just for a seller dashboard showing payment history — not required for the x402 payment flow itself. We skip it.
- The agent uses LangChain; for pay2play we offer simpler wrappers that work with any fetch/stream/MCP client.
