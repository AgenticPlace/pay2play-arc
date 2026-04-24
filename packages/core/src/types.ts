// x402 v2 shapes — canonical from _refs/coinbase/x402/specs/transports-v2/
// and verified against _refs/arc-nanopayments/lib/x402.ts.

/** x402 payment requirements (one option in `accepts[]`). */
export interface PaymentRequirement {
  scheme: "exact";
  network: string;          // CAIP-2, e.g. "eip155:5042002"
  asset: string;            // ERC-20 contract address
  amount: string;           // atomic units as decimal string
  payTo: string;            // recipient address
  maxTimeoutSeconds: number;
  extra?: {
    name?: string;          // for GatewayWalletBatched: "GatewayWalletBatched"
    version?: string;       // "1" | "2"
    verifyingContract?: string;
    [k: string]: unknown;
  };
}

/** The 402 challenge body — base64-encoded in `PAYMENT-REQUIRED` response header. */
export interface PaymentRequired {
  x402Version: 2;
  error?: string;
  resource: {
    url: string;
    description: string;
    mimeType: string;
  };
  accepts: PaymentRequirement[];
}

/** The client's signed authorization — base64-encoded in `payment-signature` request header. */
export interface PaymentPayload {
  x402Version: 2;
  resource?: PaymentRequired["resource"];
  accepted?: Record<string, unknown>;
  payload: {
    signature: `0x${string}`;
    authorization: {
      from: `0x${string}`;
      to: `0x${string}`;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: `0x${string}`;
    };
  };
  extensions?: Record<string, unknown>;
}

/** The settlement receipt — base64-encoded in `PAYMENT-RESPONSE` response header. */
export interface SettlementResponse {
  success: boolean;
  transaction?: `0x${string}`;
  network: string;
  payer?: `0x${string}`;
  errorReason?: string;
}

// --- Private pay2play types (not part of x402 spec) ---

/** Private discriminated union — all metering axes funnel into one path. */
export type UsageSignal =
  | { kind: "request" }
  | { kind: "tokens";  count: number }
  | { kind: "frames";  count: number; model?: string }
  | { kind: "bytes";   count: number }
  | { kind: "rows";    count: number }
  | { kind: "dwell";   elementId?: string; ms: number }
  | { kind: "seconds"; count: number };

export type UsageKind = UsageSignal["kind"];

/** Public price-rule shape — string or function per axis. */
export type PriceRule<K extends UsageKind> =
  | string                                    // fixed, e.g. "$0.001"
  | ((signal: Extract<UsageSignal, { kind: K }>) => string);

export interface PriceRules {
  request?: PriceRule<"request">;
  tokens?:  PriceRule<"tokens">;
  frames?:  PriceRule<"frames">;
  bytes?:   PriceRule<"bytes">;
  rows?:    PriceRule<"rows">;
  dwell?:   PriceRule<"dwell">;
  seconds?: PriceRule<"seconds">;
}

/** The base64 helpers that match the reference's choice of encoding. */
export function encodeHeader(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

export function decodeHeader<T = unknown>(b64: string): T {
  return JSON.parse(Buffer.from(b64, "base64").toString("utf-8")) as T;
}
