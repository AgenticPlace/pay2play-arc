/**
 * Express middleware for pay2play — composes @pay2play/core's Meter with
 * Circle's @circle-fin/x402-batching BatchFacilitatorClient.
 *
 * Pattern distilled from _refs/arc-nanopayments/lib/x402.ts (`withGateway`).
 */
import type { RequestHandler, Request, Response, NextFunction } from "express";
import {
  encodeHeader,
  decodeHeader,
  type Meter,
  type PaymentPayload,
  type PaymentRequirement,
  type UsageSignal,
} from "@pay2play/core";
// Type-only; the real client comes from @circle-fin/x402-batching/server at runtime.
import type {} from "@circle-fin/x402-batching";

export interface PaidRouteOptions {
  /** Recipient address that earns the payment. */
  payTo: string;
  /** Price rule — the UsageSignal this route charges on. Default: one request. */
  signal?: UsageSignal | ((req: Request) => UsageSignal);
  /** Optional human description for the 402 challenge. */
  description?: string;
}

export interface PaidMiddlewareOptions {
  meter: Meter;
  payTo: string;
  /** BatchFacilitatorClient from @circle-fin/x402-batching/server. Caller injects so we can mock in tests. */
  facilitator: {
    verify: (payload: PaymentPayload, req: PaymentRequirement) => Promise<{ isValid: boolean; invalidReason?: string; payer?: string }>;
    settle: (payload: PaymentPayload, req: PaymentRequirement) => Promise<{ success: boolean; errorReason?: string; transaction?: string; payer?: string }>;
  };
  /** Hook fired after every successful settlement — useful for observability. */
  onSettled?: (info: { endpoint: string; amount: string; payer: string; transaction?: string }) => void;
}

/**
 * Create a paywall middleware factory bound to a meter + facilitator + payTo.
 * Returns a per-route `paid()` factory that produces Express middleware.
 *
 * ```ts
 * const paid = createPaidMiddleware({ meter: m, payTo, facilitator });
 * app.get("/weather", paid({ signal: { kind: "request" } }), (req, res) => {...});
 * ```
 */
export function createPaidMiddleware(opts: PaidMiddlewareOptions) {
  return function paid(routeOpts: Partial<PaidRouteOptions> = {}): RequestHandler {
    const payTo = routeOpts.payTo ?? opts.payTo;

    return async function handler(req: Request, res: Response, next: NextFunction) {
      const signal: UsageSignal =
        typeof routeOpts.signal === "function"
          ? routeOpts.signal(req)
          : (routeOpts.signal ?? { kind: "request" });

      const requirement = opts.meter.requirement(signal, payTo);
      const resourceUrl = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;

      // Accept either header casing; reference uses lowercase "payment-signature"
      const sig =
        (req.header("payment-signature") as string | undefined) ??
        (req.header("PAYMENT-SIGNATURE") as string | undefined) ??
        (req.header("x-payment") as string | undefined);

      if (!sig) {
        const challenge = opts.meter.challenge(signal, {
          payTo,
          resourceUrl,
          description: routeOpts.description,
        });
        res.setHeader("PAYMENT-REQUIRED", encodeHeader(challenge));
        res.status(402).json({});
        return;
      }

      try {
        const payload = decodeHeader<PaymentPayload>(sig);
        const verifyResult = await opts.facilitator.verify(payload, requirement);
        if (!verifyResult.isValid) {
          res.status(402).json({
            error: "Payment verification failed",
            reason: verifyResult.invalidReason,
          });
          return;
        }

        const settleResult = await opts.facilitator.settle(payload, requirement);
        if (!settleResult.success) {
          res.status(402).json({
            error: "Payment settlement failed",
            reason: settleResult.errorReason,
          });
          return;
        }

        const payer = settleResult.payer ?? verifyResult.payer ?? "unknown";
        const amountUsdc = (Number(requirement.amount) / 1e6).toString();

        opts.onSettled?.({
          endpoint: req.originalUrl,
          amount: amountUsdc,
          payer,
          transaction: settleResult.transaction,
        });

        res.setHeader(
          "PAYMENT-RESPONSE",
          encodeHeader({
            success: true,
            transaction: settleResult.transaction,
            network: requirement.network,
            payer,
          }),
        );

        next();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "Payment processing error", message });
      }
    };
  };
}

/**
 * Convenience: lazy-import the real BatchFacilitatorClient from @circle-fin/x402-batching/server
 * so callers don't need to.
 */
export async function defaultFacilitator() {
  // dynamic import keeps this package optional-peer-compatible and
  // avoids requiring the Circle SDK during unit tests.
  const mod = await import("@circle-fin/x402-batching/server" as string);
  const Ctor = (mod as { BatchFacilitatorClient: new () => PaidMiddlewareOptions["facilitator"] }).BatchFacilitatorClient;
  return new Ctor();
}
