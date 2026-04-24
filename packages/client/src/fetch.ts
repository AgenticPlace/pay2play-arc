/**
 * Fetch wrapper that transparently handles x402 challenges using a
 * Circle Gateway client. Pattern derived from
 * _refs/arc-nanopayments/agent.mts.
 *
 * The caller injects a payment handler so this module has no runtime
 * dependency on @circle-fin/x402-batching — tests can stub it.
 */
import {
  decodeHeader,
  type PaymentRequired,
  type SettlementResponse,
} from "@pay2play/core";

export type PaymentHandler = (
  challenge: PaymentRequired,
  resourceUrl: string,
) => Promise<string>;

export interface PayingFetchOptions {
  /** Return a base64-encoded PaymentPayload for a given challenge. */
  payment: PaymentHandler;
  /** Max times to retry on 402 per URL. Default: 1. */
  maxRetries?: number;
}

export interface PayingFetchResult {
  response: Response;
  paid: boolean;
  receipt: SettlementResponse | null;
}

/**
 * Wrap a fetch implementation with x402 payment support. On 402 the
 * wrapper decodes the `PAYMENT-REQUIRED` header, asks the caller-provided
 * payment handler to produce a signed `PaymentPayload`, and retries.
 */
export function wrapFetchWithPayment(
  baseFetch: typeof fetch,
  opts: PayingFetchOptions,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<PayingFetchResult> {
  const maxRetries = opts.maxRetries ?? 1;

  return async function payingFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<PayingFetchResult> {
    let response = await baseFetch(input, init);
    let attempts = 0;
    let paid = false;

    while (response.status === 402 && attempts < maxRetries) {
      attempts += 1;
      const required = response.headers.get("payment-required");
      if (!required) break;
      const challenge = decodeHeader<PaymentRequired>(required);
      const resourceUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const signature = await opts.payment(challenge, resourceUrl);
      const retryHeaders: Record<string, string> = { "payment-signature": signature };
      const incoming = new Headers(init.headers ?? {});
      incoming.forEach((value, key) => {
        retryHeaders[key] = value;
      });
      retryHeaders["payment-signature"] = signature;
      response = await baseFetch(input, { ...init, headers: retryHeaders });
      paid = true;
    }

    const receiptHeader = response.headers.get("payment-response");
    const receipt = receiptHeader ? decodeHeader<SettlementResponse>(receiptHeader) : null;

    return { response, paid, receipt };
  };
}

/**
 * Minimal payment handler factory that delegates to @circle-fin/x402-batching's
 * GatewayClient#sign (actual method name TBD at Phase 0.5; this is a placeholder
 * that will be wired in once we run the live quickstart).
 *
 * In components we pass our own payment handlers until Phase 0.5 confirms
 * the exact GatewayClient signing API.
 */
export function makeGatewayPaymentHandler(
  signFn: (challenge: PaymentRequired) => Promise<string>,
): PaymentHandler {
  return async (challenge, _resourceUrl) => signFn(challenge);
}
