import { describe, it, expect, vi } from "vitest";
import { Session, mkVoucherId, type Voucher } from "./session.js";
import type { PaymentPayload, UsageSignal } from "./types.js";

function mkVoucher(signal: UsageSignal): Voucher {
  return {
    id: mkVoucherId(),
    signal,
    payload: {
      x402Version: 2,
      payload: {
        signature: "0x00" as `0x${string}`,
        authorization: {
          from: "0x0" as `0x${string}`,
          to: "0x0" as `0x${string}`,
          value: "1",
          validAfter: "0",
          validBefore: "9999999999",
          nonce: "0x0" as `0x${string}`,
        },
      },
    } satisfies PaymentPayload,
    signedAt: Date.now(),
  };
}

describe("Session", () => {
  it("flushes when N vouchers arrive", async () => {
    const flushes: Voucher[][] = [];
    const s = new Session({
      flushEveryN: 3,
      flushEveryMs: 60_000,
      onFlush: async (vs) => {
        flushes.push(vs);
        return 1;
      },
    });
    await s.record(mkVoucher({ kind: "request" }));
    await s.record(mkVoucher({ kind: "request" }));
    expect(flushes).toHaveLength(0);
    await s.record(mkVoucher({ kind: "request" }));
    expect(flushes).toHaveLength(1);
    expect(flushes[0]).toHaveLength(3);
    expect(s.snapshot.vouchersSigned).toBe(3);
    expect(s.snapshot.vouchersFlushed).toBe(3);
    expect(s.snapshot.batchesSettled).toBe(1);
  });

  it("flushes on close", async () => {
    const flushes: Voucher[][] = [];
    const s = new Session({
      flushEveryN: 100,
      flushEveryMs: 60_000,
      onFlush: async (vs) => (flushes.push(vs), 1),
    });
    await s.record(mkVoucher({ kind: "tokens", count: 10 }));
    await s.close();
    expect(flushes).toHaveLength(1);
    expect(flushes[0]).toHaveLength(1);
  });

  it("emits counter updates", async () => {
    const updates: number[] = [];
    const s = new Session({
      flushEveryN: 2,
      flushEveryMs: 60_000,
      onFlush: async () => 1,
      onCounterChange: (c) => updates.push(c.vouchersSigned),
    });
    await s.record(mkVoucher({ kind: "request" }));
    await s.record(mkVoucher({ kind: "request" }));
    // Expect at least one update per record + flush
    expect(updates.length).toBeGreaterThanOrEqual(2);
    expect(updates).toContain(1);
    expect(updates).toContain(2);
  });

  it("flushes on timer when N not reached", async () => {
    vi.useFakeTimers();
    const flushes: Voucher[][] = [];
    const s = new Session({
      flushEveryN: 100,
      flushEveryMs: 500,
      onFlush: async (vs) => (flushes.push(vs), 1),
    });
    await s.record(mkVoucher({ kind: "request" }));
    await vi.advanceTimersByTimeAsync(600);
    expect(flushes).toHaveLength(1);
    vi.useRealTimers();
  });
});
