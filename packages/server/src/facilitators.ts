/**
 * Pluggable facilitator adapters for createPaidMiddleware().
 *
 * Three options:
 *   1. Circle Gateway (default)   — batched settlement on Arc via x402-batching
 *   2. thirdweb x402 facilitator  — 170+ EVM chains, uses server wallets
 *   3. Coinbase facilitator        — free tier 1000/mo, Base/Polygon/Arbitrum/World
 *
 * Usage:
 *   const fac = await circleGatewayFacilitator();
 *   const fac = await thirdwebFacilitator({ secretKey: "...", serverWalletAddress: "0x..." });
 *   const fac = await coinbaseFacilitator({ network: "base" });
 *
 * All return the same interface used by createPaidMiddleware().
 */

import type { PaymentPayload, PaymentRequirement } from "@pay2play/core";

export interface FacilitatorResult {
  isValid?: boolean;
  invalidReason?: string;
  payer?: string;
  success?: boolean;
  errorReason?: string;
  transaction?: string;
}

export interface Facilitator {
  verify(payload: PaymentPayload, req: PaymentRequirement): Promise<{ isValid: boolean; invalidReason?: string; payer?: string }>;
  settle(payload: PaymentPayload, req: PaymentRequirement): Promise<{ success: boolean; errorReason?: string; transaction?: string; payer?: string }>;
}

// ── 1. Circle Gateway (default) ───────────────────────────���───────────────────

/**
 * Circle Gateway BatchFacilitatorClient.
 * Handles EIP-3009 signed transfers; batches and settles on Arc testnet.
 */
export async function circleGatewayFacilitator(): Promise<Facilitator> {
  const mod = await import("@circle-fin/x402-batching/server" as string);
  const Ctor = (mod as { BatchFacilitatorClient: new () => Facilitator }).BatchFacilitatorClient;
  return new Ctor();
}

// ── 2. thirdweb x402 facilitator ─────────────────────────────��───────────────

export interface ThirdwebFacilitatorConfig {
  secretKey: string;
  serverWalletAddress: `0x${string}`;
}

/**
 * thirdweb x402 facilitator.
 *
 * Supports 170+ EVM chains. Uses EIP-7702 for gasless server-wallet submission.
 * Docs: https://portal.thirdweb.com/x402/facilitator
 *
 * Config: THIRDWEB_SECRET_KEY + THIRDWEB_SERVER_WALLET env vars (or explicit config).
 */
export async function thirdwebFacilitator(
  config?: Partial<ThirdwebFacilitatorConfig>,
): Promise<Facilitator> {
  const secretKey           = config?.secretKey           ?? process.env.THIRDWEB_SECRET_KEY ?? "";
  const serverWalletAddress = config?.serverWalletAddress ?? process.env.THIRDWEB_SERVER_WALLET as `0x${string}` | undefined;

  if (!secretKey) throw new Error("thirdwebFacilitator: secretKey required (THIRDWEB_SECRET_KEY)");
  if (!serverWalletAddress) throw new Error("thirdwebFacilitator: serverWalletAddress required (THIRDWEB_SERVER_WALLET)");

  const { createThirdwebClient, facilitator: makeFacilitator } =
    await import("thirdweb/x402" as string) as {
      createThirdwebClient: (cfg: { secretKey: string }) => unknown;
      facilitator: (cfg: { client: unknown; serverWalletAddress: string }) => {
        verify: (payload: unknown, req: unknown) => Promise<{ isValid: boolean; invalidReason?: string; payer?: string }>;
        settle: (payload: unknown, req: unknown) => Promise<{ success: boolean; transaction?: string; payer?: string; errorReason?: string }>;
      };
    };

  const client = createThirdwebClient({ secretKey });
  const fac    = makeFacilitator({ client, serverWalletAddress });

  return {
    verify: (payload, req) => fac.verify(payload, req),
    settle: (payload, req) => fac.settle(payload, req),
  };
}

// ── 3. Coinbase facilitator ────────────────────────────���──────────────────────

export interface CoinbaseFacilitatorConfig {
  /** Network name: "base" | "base-sepolia" | "polygon" | "arbitrum" | "world" */
  network: string;
}

/**
 * Coinbase x402 facilitator.
 *
 * Free tier: 1,000 transactions/month. Supports Base, Polygon, Arbitrum, World.
 * Docs: https://docs.cdp.coinbase.com/x402/welcome
 *
 * Requires CDP_API_KEY env var.
 */
export async function coinbaseFacilitator(
  config: CoinbaseFacilitatorConfig = { network: "base" },
): Promise<Facilitator> {
  const { createFacilitatorClient } =
    await import(`@x402/${config.network}-facilitator` as string) as {
      createFacilitatorClient: () => Facilitator;
    };
  return createFacilitatorClient();
}

// Note: defaultFacilitator() is already exported from ./http.ts as a convenience alias
// for circleGatewayFacilitator(). Use circleGatewayFacilitator() for explicit usage.
