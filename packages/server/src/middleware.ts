/**
 * Production-ready Express middleware helpers for pay2play components.
 *
 * - corsForX402: permissive CORS that exposes x402 headers so browser JS can read them.
 *   Without `Access-Control-Expose-Headers`, the browser hides PAYMENT-REQUIRED /
 *   PAYMENT-RESPONSE from the client even on a successful CORS request.
 *
 * - asyncHandler: wraps an async route handler so unhandled rejections become
 *   500 responses instead of crashing the process.
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";

export function corsForX402(): RequestHandler {
  return (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, payment-signature, PAYMENT-SIGNATURE, X-PAYMENT, x-payment",
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "PAYMENT-REQUIRED, PAYMENT-RESPONSE, payment-required, payment-response",
    );
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown> | unknown;

export function asyncHandler(fn: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error(`[asyncHandler] ${req.method} ${req.originalUrl}:`, err);
      if (res.headersSent) return;
      res.status(500).json({
        error: "internal server error",
        message: err instanceof Error ? err.message : String(err),
      });
    });
  };
}
