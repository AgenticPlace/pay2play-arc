/**
 * Unified bridge-provider interface for pay2play.
 *
 * Every cross-chain USDC bridging mechanism in the zoo
 * (CCTP, Wormhole, Axelar, Polkadot XCM) implements this interface.
 * The shapes intentionally accommodate both EVM-style ECDSA signers and
 * Substrate-style sr25519 signers, so the same `BridgeProvider` contract
 * services Polkadot-flavored chains alongside EVM ones.
 *
 * Composability: each provider is its own subpath export under
 * `@pay2play/bridge/<provider-id>` so downstream projects can import
 * a single bridge worth of code.
 */

/* ─── Shared shapes ────────────────────────────────────────────────── */

/** A canonical chain identifier — CAIP-2 for EVM (eip155:1284) or
 *  a `polkadot:` prefix for Substrate-side chains. */
export type ChainId = `eip155:${string}` | `polkadot:${string}` | `solana:${string}`;

/** A bridgeable route — provider-specific support is enumerated by
 *  the provider's `supportedRoutes` field. */
export interface BridgeRoute {
  from: ChainId;
  to: ChainId;
  /** ISO-ish symbol — e.g. "USDC", "USDC.wh", "axlUSDC", "EURC". */
  asset: string;
}

/** Inbound parameters for a bridge operation. */
export interface BridgeRequest {
  route: BridgeRoute;
  /** Atomic units of the asset (matches `decimals` of `route.asset`). */
  amountAtomic: bigint;
  /** Recipient on the destination chain (raw address string for EVM, ss58 for Substrate). */
  recipient: string;
  /** Optional slippage tolerance in basis points (1bp = 0.01%). Default per provider. */
  slippageBps?: number;
}

/** Fee + timing quote — same shape across providers for apples-to-apples comparison. */
export interface BridgeQuote {
  /** ID of the provider that produced the quote. */
  providerId: string;
  route: BridgeRoute;
  /** Net amount delivered to the recipient after all fees. */
  netReceiveAtomic: bigint;
  /** Fee breakdown — every provider populates as many slots as apply. */
  fees: {
    /** Off-chain attestation / relayer fee (Wormhole, Axelar). */
    relayerAtomic?: bigint;
    /** Estimated source-chain gas in *destination-asset* units (lossy approximation acceptable). */
    sourceGasAtomic?: bigint;
    /** Estimated destination-chain finalisation gas in destination-asset units. */
    destGasAtomic?: bigint;
    /** Bridge protocol fee (Squid, NTT). */
    protocolAtomic?: bigint;
    /** Sum of all populated fee slots. */
    totalAtomic: bigint;
  };
  /** Wall-clock estimate in seconds, provider's best guess. */
  estimatedSeconds: number;
  /** Free-form provider notes, e.g. "requires manual claim on destination". */
  notes?: string;
}

/** Result of a successful or failed bridge submission. */
export interface BridgeResult {
  providerId: string;
  success: boolean;
  /** Source-chain submission tx hash (or attestation ID). */
  sourceTxHash?: string;
  /** Destination-chain delivery tx hash, when known synchronously. */
  destTxHash?: string;
  /** Provider-rendered explorer URL for the source tx. */
  sourceExplorerUrl?: string;
  /** Same for the destination side, if applicable. */
  destExplorerUrl?: string;
  route: BridgeRoute;
  amountAtomic: bigint;
  /** When success === false, this is populated. */
  error?: string;
}

/** Status of an in-flight or completed bridge operation. */
export interface BridgeStatus {
  providerId: string;
  state: "pending" | "attesting" | "delivered" | "claimed" | "failed";
  /** Optional human-readable progress note. */
  detail?: string;
  destTxHash?: string;
}

/* ─── Signer abstractions ──────────────────────────────────────────── */

/** EVM signer — caller passes a private key OR a viem-style WalletClient.
 *  Each provider chooses the format that fits its SDK. */
export interface EvmBridgeSigner {
  kind: "evm";
  /** Hex private key (0x-prefixed, 64 hex chars). Optional if `walletClient` is provided. */
  privateKey?: `0x${string}`;
  /** Pre-built viem-compatible wallet client. */
  walletClient?: unknown;
}

/** Substrate signer for XCM-side providers. */
export interface SubstrateBridgeSigner {
  kind: "substrate";
  /** 12-word mnemonic OR raw sr25519 secret URI. Provider passes through to `@polkadot/keyring`. */
  suri: string;
}

export type BridgeSigner = EvmBridgeSigner | SubstrateBridgeSigner;

/* ─── The provider contract itself ─────────────────────────────────── */

export interface BridgeProvider {
  /** Stable string id — use this in registry lookups. */
  readonly id: string;

  /** Display name for UIs. */
  readonly displayName: string;

  /** Routes this provider supports. Filtered at registry time so callers
   *  can ask "who can bridge USDC from X to Y?" without instantiating
   *  any heavy SDK. */
  readonly supportedRoutes: ReadonlyArray<BridgeRoute>;

  /** Quote-only — must NOT submit any transaction. Safe to call freely. */
  estimate(req: BridgeRequest): Promise<BridgeQuote>;

  /** Execute the bridge. Caller supplies the signer. The promise resolves
   *  as soon as the source-chain tx is submitted; downstream delivery is
   *  observed via `getStatus`. */
  bridge(req: BridgeRequest, signer: BridgeSigner): Promise<BridgeResult>;

  /** Poll the destination chain for delivery. Idempotent. */
  getStatus(sourceTxHash: string, route: BridgeRoute): Promise<BridgeStatus>;
}

/* ─── Helpers used by all providers ────────────────────────────────── */

/** Throw a structured error if `signer` isn't compatible with the provider. */
export function requireEvmSigner(
  signer: BridgeSigner,
  providerId: string,
): asserts signer is EvmBridgeSigner {
  if (signer.kind !== "evm") {
    throw new TypeError(
      `${providerId}: requires an EVM signer ({kind: "evm"}); got ${signer.kind}`,
    );
  }
  if (!signer.privateKey && !signer.walletClient) {
    throw new TypeError(
      `${providerId}: EVM signer needs at least one of {privateKey, walletClient}`,
    );
  }
}

export function requireSubstrateSigner(
  signer: BridgeSigner,
  providerId: string,
): asserts signer is SubstrateBridgeSigner {
  if (signer.kind !== "substrate") {
    throw new TypeError(
      `${providerId}: requires a Substrate signer ({kind: "substrate"}); got ${signer.kind}`,
    );
  }
  if (!signer.suri) {
    throw new TypeError(`${providerId}: Substrate signer requires {suri}`);
  }
}

/** Find route ∈ provider.supportedRoutes; throws when unsupported. */
export function findSupportedRoute(
  provider: Pick<BridgeProvider, "id" | "supportedRoutes">,
  route: BridgeRoute,
): BridgeRoute {
  const match = provider.supportedRoutes.find(
    (r) => r.from === route.from && r.to === route.to && r.asset === route.asset,
  );
  if (!match) {
    throw new Error(
      `${provider.id}: route not supported: ${route.from} → ${route.to} (${route.asset})`,
    );
  }
  return match;
}

/** Sum all populated fee slots into a `totalAtomic`. Helper for providers
 *  that build fee breakdowns piecewise. */
export function sumFees(
  parts: Omit<BridgeQuote["fees"], "totalAtomic">,
): BridgeQuote["fees"] {
  const total =
    (parts.relayerAtomic ?? 0n) +
    (parts.sourceGasAtomic ?? 0n) +
    (parts.destGasAtomic ?? 0n) +
    (parts.protocolAtomic ?? 0n);
  return { ...parts, totalAtomic: total };
}
