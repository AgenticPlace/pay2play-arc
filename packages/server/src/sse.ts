/**
 * SSE-based streaming meter for per-token / per-chunk / per-frame-of-stream flows.
 *
 * Shape: the server owns an SSE connection to the browser. For each
 * usage event (N tokens consumed, a frame processed, etc.) the server
 * emits a `charge` event that tells the client "sign a voucher for X USDC
 * and POST it back to /meter/voucher". The server accumulates vouchers in
 * a @pay2play/core Session and flushes them into the Gateway batched
 * facilitator.
 *
 * This is an x402 *extension*, not part of the canonical HTTP transport
 * (which is stateless per request). Be honest about that in the demo.
 */
import type { Response } from "express";
import {
  Session,
  mkVoucherId,
  type Voucher,
  type Meter,
  type PaymentPayload,
  type UsageSignal,
} from "@pay2play/core";

export interface SseStreamOptions {
  meter: Meter;
  payTo: string;
  flushEveryN?: number;
  flushEveryMs?: number;
  /** Settle a batch of vouchers on-chain. Returns tx hash(es). */
  onBatchSettle: (vouchers: Voucher[]) => Promise<string[]>;
  /** Observability hook. */
  onCounter?: (c: { vouchersSigned: number; vouchersFlushed: number; batchesSettled: number }) => void;
}

/** A live streaming meter attached to one SSE response. */
export class SseMeter {
  private res: Response;
  private session: Session;

  constructor(res: Response, opts: SseStreamOptions) {
    this.res = res;

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    this.session = new Session({
      flushEveryN: opts.flushEveryN ?? 100,
      flushEveryMs: opts.flushEveryMs ?? 5000,
      onFlush: async (vs) => {
        const txs = await opts.onBatchSettle(vs);
        this.emit("settled", { count: vs.length, txs });
        return txs.length;
      },
      onCounterChange: (c) => {
        opts.onCounter?.(c);
        this.emit("counters", c);
      },
    });
  }

  /** Emit a typed SSE event to the browser. */
  emit(event: string, data: unknown): void {
    this.res.write(`event: ${event}\n`);
    this.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * Tell the client to sign a voucher for `signal`. Client should POST
   * back the signed PaymentPayload to `voucherPath` (e.g. `/meter/voucher`).
   */
  requestCharge(signal: UsageSignal, voucherPath: string): string {
    const id = mkVoucherId();
    this.emit("charge", {
      id,
      voucherPath,
      amount: this.session ? undefined : undefined, // just echo via meter below
      signal,
      price: undefined,
    });
    return id;
  }

  /** Server side: record a voucher received back from the browser. */
  async record(id: string, signal: UsageSignal, payload: PaymentPayload): Promise<void> {
    await this.session.record({ id, signal, payload, signedAt: Date.now() });
  }

  async close(): Promise<void> {
    await this.session.close();
    this.res.end();
  }

  get snapshot() {
    return this.session.snapshot;
  }
}
