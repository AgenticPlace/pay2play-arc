export { BridgeModule } from "./bridge.js";
export { SwapModule }  from "./swap.js";
export { SendModule }  from "./send.js";
export type {
  BridgeConfig,
  BridgeEstimate,
  BridgeResult,
  SwapConfig,
  SwapEstimate,
  SwapResult,
  SendConfig,
  SendResult,
  AppKitAdapter,
} from "./types.js";

// Modular bridge zoo — each provider is also independently importable
// via the `@pay2play/bridge/<id>` subpath.
export * from "./provider.js";
export { BridgeRegistry, DEFAULT_PRIORITY } from "./registry.js";
export { CctpBridgeProvider } from "./providers/cctp.js";
export { WormholeBridgeProvider } from "./providers/wormhole.js";
export { AxelarBridgeProvider } from "./providers/axelar.js";
export { XcmBridgeProvider } from "./providers/xcm.js";
