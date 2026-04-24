import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { meter, encodeHeader, decodeHeader, type PaymentPayload, type SettlementResponse } from "@pay2play/core";
import { createPaidMiddleware } from "./http.js";

const m = meter({ request: "$0.001" });
const payTo = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const payer = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function mkPayload(): PaymentPayload {
  return {
    x402Version: 2,
    payload: {
      signature: "0xdeadbeef" as `0x${string}`,
      authorization: {
        from: payer as `0x${string}`,
        to: payTo as `0x${string}`,
        value: "1000",
        validAfter: "0",
        validBefore: "9999999999",
        nonce: "0x00" as `0x${string}`,
      },
    },
  };
}

function buildApp(facilitator: {
  verify: ReturnType<typeof vi.fn>;
  settle: ReturnType<typeof vi.fn>;
}, onSettled?: (info: unknown) => void) {
  const app = express();
  app.use(express.json());
  const paid = createPaidMiddleware({ meter: m, payTo, facilitator, onSettled });
  app.get("/weather", paid(), (_req, res) => {
    res.json({ weather: "sunny" });
  });
  return app;
}

describe("createPaidMiddleware", () => {
  it("returns 402 with PAYMENT-REQUIRED header when no payment header is present", async () => {
    const facilitator = { verify: vi.fn(), settle: vi.fn() };
    const app = buildApp(facilitator);
    const res = await request(app).get("/weather");
    expect(res.status).toBe(402);
    expect(res.headers["payment-required"]).toBeTruthy();
    const challenge = decodeHeader<{ accepts: { amount: string }[] }>(res.headers["payment-required"]);
    expect(challenge.accepts[0].amount).toBe("1000");
    expect(facilitator.verify).not.toHaveBeenCalled();
  });

  it("settles payment and proceeds to handler on valid payment-signature header", async () => {
    const facilitator = {
      verify: vi.fn().mockResolvedValue({ isValid: true, payer }),
      settle: vi.fn().mockResolvedValue({ success: true, transaction: "0xabc", payer }),
    };
    const settlements: unknown[] = [];
    const app = buildApp(facilitator, (i) => settlements.push(i));
    const res = await request(app)
      .get("/weather")
      .set("payment-signature", encodeHeader(mkPayload()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ weather: "sunny" });
    expect(facilitator.verify).toHaveBeenCalledTimes(1);
    expect(facilitator.settle).toHaveBeenCalledTimes(1);
    expect(res.headers["payment-response"]).toBeTruthy();
    const receipt = decodeHeader<SettlementResponse>(res.headers["payment-response"]);
    expect(receipt.success).toBe(true);
    expect(receipt.transaction).toBe("0xabc");
    expect(settlements).toHaveLength(1);
  });

  it("returns 402 when verification fails", async () => {
    const facilitator = {
      verify: vi.fn().mockResolvedValue({ isValid: false, invalidReason: "bad sig" }),
      settle: vi.fn(),
    };
    const app = buildApp(facilitator);
    const res = await request(app)
      .get("/weather")
      .set("payment-signature", encodeHeader(mkPayload()));
    expect(res.status).toBe(402);
    expect(facilitator.settle).not.toHaveBeenCalled();
  });
});
