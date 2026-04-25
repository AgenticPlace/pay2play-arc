# C8 · Bridge Demo

Cross-chain USDC bridge and stablecoin swap via **Circle App Kit**, gated by a nanopayment.

## What it demonstrates

| Feature | Detail |
|---------|--------|
| **App Kit Bridge** | `@pay2play/bridge` wraps `@circle-fin/app-kit` as a modular component |
| **CCTP V2** | Arc testnet is Domain 26 — bridges settle via `TokenMessengerV2` |
| **Stablecoin FX** | USDC ↔ EURC swap via `SwapModule` on Arc |
| **Nanopayment gate** | Bridge API calls cost $0.001 via `createPaidMiddleware()` |

## Endpoints

```
GET  /estimate?from=ethereum&to=arcTestnet&amount=1.00  — free fee preview
POST /bridge   { sourceChain, destinationChain, amount }  — execute bridge ($0.001)
POST /swap     { chain, fromToken, toToken, amount }       — execute swap ($0.001)
```

## Running

```bash
cp ../../.env.example .env
# fill SELLER_PRIVATE_KEY, BUYER_PRIVATE_KEY, SELLER_ADDRESS
pnpm start
```

## Arc Contract Addresses Used

| Contract | Address |
|----------|---------|
| USDC | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| CCTP TokenMessengerV2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| CCTP MessageTransmitterV2 | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |
| FxEscrow (stablecoin FX) | `0x867650F5eAe8df91445971f14d89fd84F0C9a9f8` |
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |

## SDK Reference

- [App Kit Bridge](https://docs.arc.network/app-kit/bridge.md)
- [EVM-to-EVM Quickstart](https://docs.arc.network/app-kit/quickstarts/bridge-between-evm-chains.md)
- [SDK Reference](https://docs.arc.network/app-kit/references/sdk-reference.md)
