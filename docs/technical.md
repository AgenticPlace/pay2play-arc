# pay2play — Technical Reference

Deep internals: x402 v2 protocol, SDK shapes, facilitators, contract ABIs, and known gotchas.

---

## x402 v2 Protocol Flow

### Overview

x402 is an HTTP-level payment protocol. The server issues a `402 Payment Required` challenge; the client signs an off-chain authorization and retries with it in a header; the server verifies and (for Circle Gateway) batches the authorization for deferred on-chain settlement.

### Message sequence

```
Client                          Server
  │                               │
  │  GET /resource                │
  │ ─────────────────────────────>│
  │                               │  (no payment-signature header)
  │  402 Payment Required         │
  │  PAYMENT-REQUIRED: <base64>   │
  │ <─────────────────────────────│
  │                               │
  │  (client signs EIP-3009 auth) │
  │                               │
  │  GET /resource                │
  │  payment-signature: <base64>  │
  │ ─────────────────────────────>│
  │                               │  facilitator.verify() + settle()
  │  200 OK                       │
  │  PAYMENT-RESPONSE: <base64>   │
  │ <─────────────────────────────│
```

### Header encoding

All three headers use `base64(JSON(...))`:

| Header | Direction | Content type |
|---|---|---|
| `PAYMENT-REQUIRED` (uppercase) | server → client | `PaymentRequired` |
| `payment-signature` (lowercase) | client → server | `PaymentPayload` |
| `PAYMENT-RESPONSE` (uppercase) | server → client | `SettlementResponse` |

### PaymentRequired shape

```typescript
interface PaymentRequired {
  x402Version: 2;
  error?: string;
  resource: { url: string; description: string; mimeType: string };
  accepts: PaymentRequirement[];  // typically one entry
}

interface PaymentRequirement {
  scheme: "exact";
  network: "eip155:5042002";               // CAIP-2
  asset:   "0x3600000000000000000000000000000000000000"; // USDC
  amount:  string;                          // atomic 6-dec, e.g. "1000" = $0.001
  payTo:   string;                          // seller address
  maxTimeoutSeconds: 345600;                // 4 days
  extra: {
    name: "GatewayWalletBatched";
    version: "1";
    verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
  };
}
```

### PaymentPayload shape (EIP-3009)

```typescript
interface PaymentPayload {
  x402Version: 2;
  payload: {
    signature: `0x${string}`;     // EIP-712 signature over the authorization
    authorization: {
      from:        `0x${string}`; // buyer wallet
      to:          `0x${string}`; // GatewayWallet contract
      value:       string;        // atomic USDC
      validAfter:  string;        // unix seconds (bigint as string)
      validBefore: string;        // unix seconds + maxTimeoutSeconds
      nonce:       `0x${string}`; // 32-byte random
    };
  };
}
```

The buyer's `GatewayClient.pay()` builds this payload from the challenge and signs it with the buyer's private key using EIP-712 typed data — `TransferWithAuthorization` domain.

---

## EIP-3009 Signing

EIP-3009 defines `TransferWithAuthorization` — a gasless USDC transfer signed off-chain. The signature authorizes the GatewayWallet contract to pull funds from the buyer without a separate `approve()` call.

Domain for Arc testnet:

```typescript
{
  name: "GatewayWalletBatched",
  version: "1",
  chainId: 5042002,
  verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
}
```

Type hash: `TransferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce)`

---

## Circle Gateway Batch Settlement

### Off-chain aggregation

The server's `BatchFacilitatorClient.settle()` does not immediately write to Arc. It submits the signed authorization to the Circle Gateway API, which:

1. Validates the EIP-3009 signature off-chain
2. Adds the authorization to a pending batch
3. Periodically writes one Arc transaction covering thousands of authorizations

From the user's perspective: payment is "confirmed" when `settle()` returns success. On-chain finality follows within the batch window (undocumented; typically seconds to minutes).

### Observability gap

The `BatchFacilitatorClient.settle()` response includes `{ success: true, payer, transaction }` where `transaction` is the **batch** settlement tx hash, not a per-payment hash. Multiple calls with different payers share one transaction.

pay2play's `Session` class makes this explicit: `vouchersSigned` (instant, off-chain) vs `batchesSettled` (deferred, on-chain).

### Gateway API endpoints (testnet)

```
GET  https://gateway-api-testnet.circle.com/v1/balances
POST https://gateway-api-testnet.circle.com/v1/deposits
POST https://gateway-api-testnet.circle.com/v1/withdrawals
```

---

## `@pay2play/core` — Public API

### `meter(rules, opts?)`

Builds a price function + challenge builder from a price-rules dict:

```typescript
import { meter } from "@pay2play/core";

const m = meter({
  request:  "$0.001",
  tokens:   (s) => `$${(s.count * 0.00005).toFixed(6)}`,
  frames:   (s) => `$${(s.count * 0.0005).toFixed(6)}`,
  rows:     (s) => `$${(s.count * 0.0001).toFixed(6)}`,
  dwell:    (s) => s.ms >= 3000 ? "$0.0001" : "$0",
});

m.price({ kind: "tokens", count: 100 });     // → "$0.005000"
m.priceAtomic({ kind: "request" });          // → 1000n  (6-decimal USDC)
m.challenge({ kind: "request" }, { payTo: "0x...", resourceUrl: "https://..." });
// → { x402Version: 2, resource: {...}, accepts: [PaymentRequirement] }
```

Supported `UsageSignal` kinds: `request` · `tokens` · `frames` · `bytes` · `rows` · `dwell` · `seconds`

### `Session`

Decouples "how often to sign" from "how often to settle on-chain":

```typescript
const session = new Session({
  flushEveryN:  100,   // flush after 100 vouchers
  flushEveryMs: 5000,  // or after 5s, whichever comes first
  onFlush: async (vouchers) => {
    for (const v of vouchers) {
      await facilitator.settle(v.payload, requirement);
    }
    return vouchers.length;
  },
  onCounterChange: (c) => console.log(c.vouchersSigned, c.batchesSettled),
});

await session.record(voucher);   // client side: called per token/frame/row
await session.close();           // flush remaining at stream end
```

### `parseUsdPrice(price)` / `formatUsdc(atomic)`

```typescript
parseUsdPrice("$0.001")    // → 1000n
parseUsdPrice("0.00005")   // → 50n
formatUsdc(1000n)          // → "0.001"
formatUsdc(1_000_000n)     // → "1"
```

### `verifyChainId(rpcUrl, expected)`

Called at server startup. Throws if the RPC returns a chain ID other than `5042002`. Prevents silent misconfiguration:

```typescript
await verifyChainId(); // → 5042002 or throws
```

---

## `@pay2play/server` — Public API

### `createPaidMiddleware(price, opts?)`

Express middleware that enforces the x402 gate:

```typescript
import { createPaidMiddleware } from "@pay2play/server";

app.get("/data", createPaidMiddleware("$0.001", {
  payTo: process.env.SELLER_ADDRESS!,
  description: "Paid data endpoint",
  facilitator: "circle",   // "circle" | "thirdweb" | "coinbase"
}), handler);
```

On missing/invalid payment: sends `402` with `PAYMENT-REQUIRED` header.
On valid payment: calls `facilitator.settle()`, sets `PAYMENT-RESPONSE` header, calls `next()`.

### `thirdwebFacilitator(config)`

Alternative facilitator supporting 170+ EVM chains:

```typescript
import { thirdwebFacilitator } from "@pay2play/server";

const f = await thirdwebFacilitator({
  secretKey: process.env.THIRDWEB_SECRET_KEY!,
  serverWalletAddress: process.env.SERVER_WALLET_ADDRESS!,
});
app.use(createPaidMiddleware("$0.001", { facilitator: f }));
```

---

## `@pay2play/client` — Public API

### `paidFetch(url, init?, opts?)`

Drop-in `fetch` wrapper that handles the 402 cycle automatically:

```typescript
import { paidFetch } from "@pay2play/client";

const res = await paidFetch("http://localhost:4021/weather", {
  method: "GET",
}, {
  privateKey: process.env.BUYER_PRIVATE_KEY!,
});
```

When the server returns 402, `paidFetch` decodes the `PAYMENT-REQUIRED` header, signs an EIP-3009 authorization, and retries with the `payment-signature` header. Transparent to the caller.

For full Gateway integration (pre-funded deposit pool), use `GatewayClient.pay()` directly:

```typescript
import { GatewayClient } from "@circle-fin/x402-batching/client";

const gw = new GatewayClient({ chain: "arcTestnet", privateKey: "0x..." });
const result = await gw.pay("http://localhost:4021/weather", { method: "GET" });
// result.formattedAmount → "0.001" (USDC paid)
```

---

## `@pay2play/bridge` — Public API

```typescript
import { BridgeModule, SwapModule, SendModule } from "@pay2play/bridge";

// USDC: Ethereum → Arc (CCTP V2, Domain 26)
const bridge = new BridgeModule("0x<privateKey>");
const est = await bridge.estimate({ sourceChain: "ethereum", destinationChain: "arcTestnet", amount: "1.00" });
const res = await bridge.bridge({ sourceChain: "ethereum", destinationChain: "arcTestnet", amount: "1.00" });

// USDC ↔ EURC (FxEscrow on Arc)
const swap = new SwapModule("0x<privateKey>");
await swap.swap({ fromAsset: "USDC", toAsset: "EURC", amount: "1.00" });

// Same-chain USDC send
const send = new SendModule("0x<privateKey>");
await send.sendUsdc({ to: "0x<recipient>", amount: "0.50" });
```

Known limitation: `AppKit.estimateBridge()` requires fully configured `WalletContext` adapter objects (not chain-name strings). C8's `/estimate` endpoint uses a static CCTP V2 fee formula instead: flat $0.003 + 0.03% of amount.

---

## Arc Testnet Contract Addresses

| Contract | Address | Standard |
|---|---|---|
| USDC | `0x3600000000000000000000000000000000000000` | ERC-20 (6-dec surface) |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | ERC-20 |
| USYC | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` | yield-bearing |
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` | batched settlement |
| GatewayMinter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` | |
| CCTP TokenMessengerV2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` | CCTP v2 |
| CCTP MessageTransmitterV2 | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` | CCTP v2 |
| FxEscrow | `0x867650F5eAe8df91445971f14d89fd84F0C9a9f8` | stablecoin FX |
| Memo | `0x9702466268ccF55eAB64cdf484d272Ac08d3b75b` | metadata |
| IdentityRegistry (ERC-8004) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | agent identity |
| ReputationRegistry (ERC-8004) | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | feedback scores |
| ValidationRegistry (ERC-8004) | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | validation lifecycle |
| JobEscrow (ERC-8183) | `0x0747EEf0706327138c69792bF28Cd525089e4583` | job lifecycle |

Chain config: `chainId: 5042002` · CAIP-2: `eip155:5042002` · CCTP domain: `26` · RPC: `https://rpc.testnet.arc.network`

---

## ERC-8004 Agent Identity

### IdentityRegistry ABI (minimal)

```solidity
function register(string memory metadataURI) external returns (uint256 agentId);
function ownerOf(uint256 tokenId) external view returns (address);
function tokenURI(uint256 tokenId) external view returns (string memory);
event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
```

### ReputationRegistry ABI (minimal)

```solidity
function giveFeedback(uint256 agentId, uint8 score, bytes32 feedbackHash) external;
function getScore(uint256 agentId) external view returns (uint256 score);
function revokeFeedback(uint256 feedbackId) external;
```

### Registration flow (viem)

```typescript
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { ARC_TESTNET, IDENTITY_REGISTRY_ABI } from "@pay2play/core";

const walletClient = createWalletClient({
  account: privateKeyToAccount("0x<key>"),
  chain: arcTestnet,
  transport: http(ARC_TESTNET.rpcUrl),
});

const agentId = await walletClient.writeContract({
  address: ARC_TESTNET.contracts.identityRegistry,
  abi: IDENTITY_REGISTRY_ABI,
  functionName: "register",
  args: ["ipfs://Qm..."],   // metadata URI
});
```

---

## ERC-8183 Job Escrow

State machine: `OPEN → FUNDED → SUBMITTED → COMPLETED` (or `DISPUTED`).

Numeric enum on-chain: `0=OPEN, 1=FUNDED, 2=SUBMITTED, 3=COMPLETED, 4=DISPUTED`.

### JobEscrow ABI (minimal)

```solidity
function createJob(address provider, address evaluator, uint256 expiry, bytes32 descHash)
    external returns (uint256 jobId);
function setBudget(uint256 jobId, uint256 amount) external;
function fund(uint256 jobId) external;        // ERC-20 transferFrom + lock
function submit(uint256 jobId, bytes32 deliverableHash) external;
function complete(uint256 jobId, bytes32 reasonHash) external; // releases USDC
function dispute(uint256 jobId) external;
function getJob(uint256 jobId) external view returns (
    address client, address provider, address evaluator,
    uint256 amount, uint256 expiry, uint8 state, bytes32 deliverableHash);
```

`dryRun` pattern for test wallets: pass `dryRun: true` in the request body to `/job/create` — the server returns the intended call parameters without executing the transaction.

---

## Facilitator Comparison

| | Circle Gateway | Coinbase public | thirdweb |
|---|---|---|---|
| Chain support | Arc (Domain 26) | Base, Polygon, Arbitrum, World, Solana | 170+ EVM |
| Settlement | batched off-chain → periodic on-chain | immediate on-chain | immediate on-chain |
| Free tier | yes | 1,000 tx/mo | project-based |
| Gas model | USDC-native on Arc (zero gas cost) | normal EVM gas | normal EVM gas |
| SDK | `@circle-fin/x402-batching` | `@x402/core` | `thirdweb/x402` |
| Required deposit | yes (one-time `deposit()`) | no | no |

---

## Vyper Contracts

Located in `contracts/arc/`. Require `vyper~=0.4.3` + optionally `titanoboa` for tests.

| Contract | Purpose |
|---|---|
| `PaymentChannel.vy` | Off-chain USDC payment channel — EIP-712 vouchers, `close(amount, sig)`, `timeout()` |
| `AgentEscrow.vy` | Task lifecycle matching ERC-8183 — `createJob` → `fund` → `submit` → `complete` |
| `SpendingLimiter.vy` | Per-agent daily/per-tx limits with allowlist and pause |
| `SubscriptionManager.vy` | Recurring USDC subscription with period-based access control |

Test pattern (Titanoboa):
```python
import boa
channel = boa.load("contracts/arc/PaymentChannel.vy", usdc_addr, recipient, expiry)
channel.deposit(1_000_000)   # 1 USDC (6 dec)
```

---

## Python SDK (`python/pay2play_arc/`)

| Module | Exports |
|---|---|
| `gateway_client.py` | `GatewayClient(chain, private_key)` — `.pay(url)`, async x402 handshake |
| `x402.py` | `decode_challenge()`, `encode_payload()`, `sign_eip3009()` |
| `middleware.py` | `create_gateway_middleware(price_usdc, pay_to)` — FastAPI/ASGI |
| `contracts.py` | `ContractLoader` — wraps `boa.load()` for Vyper in-process testing |

Install: `pip install -e "python/[dev]"` (Python 3.11+).

---

## Algorand AVM (C10)

C10 uses `algosdk` v3 (camelCase properties) and AlgoKit TypeScript contracts. Key differences vs Arc:

| | Arc | Algorand |
|---|---|---|
| Payment token | USDC (ERC-20) | ALGO or ASA |
| Payment header | `payment-signature` (EIP-3009) | `X-Algo-Payment` |
| Settlement | Circle Gateway batched | group transaction |
| Gas model | USDC-native | microALGO |
| Contract language | Vyper / Solidity | AlgoKit TypeScript (AVM) |

algosdk v3 note: `response.applicationIndex` not `.appId`; `response.confirmedRound` not `.confirmedRound` (was `undefined` in v2 on pending); `Address` type not plain string in function signatures.

---

## Known SDK Gotchas

**`GatewayClient.signPayment` / `.sign` are not public exports.**
Always use `gateway.pay(url, opts)`. The `.pay()` method handles the full 402 challenge → EIP-3009 sign → retry cycle internally.

**`createViemAdapterFromPrivateKey` — exact export name.**
`@circle-fin/adapter-viem-v2` exports `createViemAdapterFromPrivateKey`, not `createViemAdapter`. Verify with:
```bash
node -e "console.log(Object.keys(require('@circle-fin/adapter-viem-v2')))"
```

**`AppKit.estimateBridge` requires WalletContext adapters.**
Signature: `estimateBridge({ from: WalletContext, to: { adapter, chain }, amount, token })`.
Passing chain-name strings throws a runtime type error. Use static fee formula for previews.

**Top-level await in CJS scripts.**
Root `package.json` has no `"type": "module"`, so `tsx` defaults to CJS. Scripts must use:
```typescript
async function main() { ... }
main().catch(console.error);
```

**USDC decimals on Arc.**
Arc uses 18-decimal native gas internally but the ERC-20 surface for USDC is 6 decimals. All price math in pay2play uses 6-decimal atomic units (e.g., `1000n` = $0.001).
