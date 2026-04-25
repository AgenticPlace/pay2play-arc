# Bridges — modular USDC bridge zoo

`@pay2play/bridge` ships a **composable bridge layer**: one provider per
USDC bridging mechanism, all behind a single `BridgeProvider` interface.
Downstream projects (`pay2play-arc`, `pay2play-algo`, `pay2play-glmr`,
mindX, AgenticPlace, anyone else) can import a single provider, several,
or compose them all through the registry.

- [Provider zoo](#provider-zoo)
- [Common interface](#common-interface)
- [Composition recipe](#composition-recipe)
- [Route matrix](#route-matrix)
- [Signer requirements](#signer-requirements)
- [Fee model — what each provider quotes](#fee-model--what-each-provider-quotes)

---

## Provider zoo

| ID | Subpath | SDK | Chains | Asset symbol(s) |
|---|---|---|---|---|
| `cctp`     | `@pay2play/bridge/cctp`     | `@circle-fin/app-kit` (in tree)            | Ethereum, Avalanche, OP, Arbitrum, Base, Polygon, Arc | `USDC` |
| `wormhole` | `@pay2play/bridge/wormhole` | `@wormhole-foundation/sdk` (lazy-imported) | Ethereum, BSC, Polygon, Avalanche, OP, Arbitrum, Base, Moonbeam, Moonbase Alpha | `USDC`, `USDC.wh` |
| `axelar`   | `@pay2play/bridge/axelar`   | `@0xsquid/sdk` + `@axelar-network/axelarjs-sdk` (lazy) | Ethereum, BSC, Polygon, Avalanche, OP, Arbitrum, Base, Moonbeam, Linea, Filecoin, Celo, Fantom | `USDC`, `axlUSDC` |
| `xcm`      | `@pay2play/bridge/xcm`      | `@moonbeam-network/xcm-sdk` (lazy)         | Polkadot Asset Hub ↔ Moonbeam ↔ Astar ↔ Hydra | `USDC`, `xcUSDC` |

The registry sorts in this order by default — `cctp` first (lowest fees,
fastest finality on its mesh), then `wormhole`, `axelar`, `xcm`.
Override per-call via the second arg to `pickProvider(route, "wormhole")`.

---

## Common interface

```ts
import {
  type BridgeProvider, type BridgeRoute, type BridgeRequest,
  type BridgeQuote, type BridgeResult, type BridgeStatus, type BridgeSigner,
} from "@pay2play/bridge/provider";
```

Every provider implements:

```ts
interface BridgeProvider {
  readonly id: string;
  readonly displayName: string;
  readonly supportedRoutes: ReadonlyArray<BridgeRoute>;

  estimate(req: BridgeRequest): Promise<BridgeQuote>;
  bridge(req: BridgeRequest, signer: BridgeSigner): Promise<BridgeResult>;
  getStatus(sourceTxHash: string, route: BridgeRoute): Promise<BridgeStatus>;
}
```

Routes are CAIP-2-flavored:

- EVM: `eip155:<chainId>` (e.g. `"eip155:1284"` for Moonbeam mainnet)
- Polkadot: `polkadot:<para-name>` (e.g. `"polkadot:asset-hub"`,
  `"polkadot:moonbeam"`)
- Solana: `solana:<network>` (reserved; not yet implemented in the zoo)

---

## Composition recipe

### Just one bridge

```ts
import { CctpBridgeProvider } from "@pay2play/bridge/cctp";

const cctp = new CctpBridgeProvider();
const quote = await cctp.estimate({
  route: { from: "eip155:5042002", to: "eip155:8453", asset: "USDC" },
  amountAtomic: 100_000_000n,                  // 100 USDC at 6 decimals
  recipient: "0xabc…",
});
console.log(quote.netReceiveAtomic);            // 99_697_000n
```

### Several bridges, choose at runtime

```ts
import { BridgeRegistry } from "@pay2play/bridge/registry";
import { CctpBridgeProvider } from "@pay2play/bridge/cctp";
import { WormholeBridgeProvider } from "@pay2play/bridge/wormhole";

const registry = new BridgeRegistry([
  new CctpBridgeProvider(),
  new WormholeBridgeProvider(),
]);

// Lowest-fee provider for the route, by default priority:
const auto = await registry.estimate({
  route: { from: "eip155:1284", to: "eip155:1", asset: "USDC" },
  amountAtomic: 100_000_000n,
  recipient: "0xabc…",
});

// Comparison shopping — quote every supporting provider:
const quotes = await registry.compareAll({
  route: { from: "eip155:1284", to: "eip155:1", asset: "USDC" },
  amountAtomic: 100_000_000n,
  recipient: "0xabc…",
});
quotes.sort((a, b) => Number(b.netReceiveAtomic - a.netReceiveAtomic)); // best net first
```

### All four bridges, one call site

```ts
import { BridgeRegistry } from "@pay2play/bridge/registry";
import { CctpBridgeProvider } from "@pay2play/bridge/cctp";
import { WormholeBridgeProvider } from "@pay2play/bridge/wormhole";
import { AxelarBridgeProvider } from "@pay2play/bridge/axelar";
import { XcmBridgeProvider } from "@pay2play/bridge/xcm";

const registry = new BridgeRegistry([
  new CctpBridgeProvider(),
  new WormholeBridgeProvider(),
  new AxelarBridgeProvider(),
  new XcmBridgeProvider(),
]);
```

### Forced override

```ts
// Always use Wormhole, even when CCTP is also available:
const quote = await registry.estimate(req, "wormhole");
```

Throws if the chosen provider doesn't support the route — fail-loud.

---

## Route matrix

| Source ↓ / Dest → | CCTP routes | Wormhole | Axelar | XCM |
|---|:---:|:---:|:---:|:---:|
| Ethereum (eip155:1) | ✅ to all CCTP chains | ✅ | ✅ | — |
| Base (eip155:8453) | ✅ | ✅ | ✅ | — |
| Arbitrum (eip155:42161) | ✅ | ✅ | ✅ | — |
| Optimism (eip155:10) | ✅ | ✅ | ✅ | — |
| Polygon (eip155:137) | ✅ | ✅ | ✅ | — |
| Avalanche (eip155:43114) | ✅ | ✅ | ✅ | — |
| Arc (eip155:5042002) | ✅ (Domain 26) | — | — | — |
| Moonbeam (eip155:1284) | — | ✅ | ✅ | (via Asset Hub) |
| Moonbase Alpha (eip155:1287) | — | ✅ | ✅ | — |
| BSC (eip155:56) | — | ✅ | ✅ | — |
| Linea (eip155:59144) | — | — | ✅ | — |
| Filecoin EVM (eip155:314) | — | — | ✅ | — |
| Celo (eip155:42220) | — | — | ✅ | — |
| Fantom (eip155:250) | — | — | ✅ | — |
| Polkadot Asset Hub | — | — | — | ✅ |
| Astar / Hydra (Polkadot) | — | — | — | ✅ |

The registry's `forRoute()` returns *all* providers that match a given
`(from, to, asset)` triple — useful for UIs that present "best fee"
vs. "fastest" trade-offs.

---

## Signer requirements

Each provider declares the signer kind it accepts:

| Provider | Signer kind | Field |
|---|---|---|
| `cctp`     | `evm`       | `privateKey: 0x...` (or pre-built `walletClient`) |
| `wormhole` | `evm`       | same |
| `axelar`   | `evm`       | same |
| `xcm`      | `substrate` | `suri: "//Alice"` or 12-word mnemonic |

A `BridgeSigner` is a discriminated union; passing an EVM signer to the
XCM provider returns `{ success: false, error: "...requires a Substrate
signer..." }` — never silently fails.

---

## Fee model — what each provider quotes

All providers return a `BridgeQuote.fees` block with the same shape:

```ts
fees: {
  relayerAtomic?:   bigint;   // off-chain relayer (Wormhole, Axelar)
  sourceGasAtomic?: bigint;   // source-chain gas (rare in this layer)
  destGasAtomic?:   bigint;   // destination-chain delivery gas
  protocolAtomic?:  bigint;   // bridge protocol fee (CCTP)
  totalAtomic:       bigint;   // sum of the above
}
```

Defaults (subject to live SDK overrides at execute time):

| Provider | Approximate fee at $1 amount | Composition |
|---|---|---|
| `cctp`     | $0.003003 | $0.003 protocol flat + 0.03% (3000n + 30bps) |
| `wormhole` | $0.020    | $0.02 relayer (20_000n) |
| `axelar`   | $0.070    | $0.05 relayer + $0.02 dest gas |
| `xcm`      | $0.050    | $0.05 weight fee (deducted from amount) |

For trustworthy production use, always pull fresh quotes via
`provider.estimate(...)`; the static defaults are bigint-correct upper
bounds, refined by the live SDK at execute time.

---

## Live execution path

Quote-only flows (`estimate`, `getStatus`) work without any SDK install
— useful for build-time tooling, fee planning, and comparison shopping.

Live `bridge()` calls require the consuming project to install the
provider's SDK as a runtime dep (lazy-imported on first call):

```bash
pnpm add @circle-fin/app-kit @circle-fin/adapter-viem-v2          # cctp
pnpm add @wormhole-foundation/sdk @wormhole-foundation/sdk-evm     # wormhole
pnpm add @0xsquid/sdk @axelar-network/axelarjs-sdk                 # axelar
pnpm add @moonbeam-network/xcm-sdk @polkadot/api @polkadot/keyring # xcm
```

Each provider throws a structured error pointing the operator to the
right install command if the SDK isn't found.
