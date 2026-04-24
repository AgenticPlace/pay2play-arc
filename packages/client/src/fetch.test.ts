import { describe, it, expect, vi } from "vitest";
import { wrapFetchWithPayment } from "./fetch.js";
import { encodeHeader, type PaymentPayload, type PaymentRequired, type SettlementResponse } from "@pay2play/core";

function mkChallenge(): PaymentRequired {
  return {
    x402Version: 2,
    resource: { url: "http://x/y", description: "paid", mimeType: "application/json" },
    accepts: [{
      scheme: "exact",
      network: "eip155:5042002",
      asset: "0x3600000000000000000000000000000000000000",
      amount: "1000",
      payTo: "0xaaa",
      maxTimeoutSeconds: 60,
    }],
  };
}

function mkPayload(): PaymentPayload {
  return {
    x402Version: 2,
    payload: {
      signature: "0xabc" as `0x${string}`,
      authorization: {
        from: "0xbbb" as `0x${string}`,
        to: "0xaaa" as `0x${string}`,
        value: "1000",
        validAfter: "0",
        validBefore: "9",
        nonce: "0x00" as `0x${string}`,
      },
    },
  };
}

describe("wrapFetchWithPayment", () => {
  it("passes through 200 responses", async () => {
    const base = vi.fn().mockResolvedValue(
      new Response("ok", { status: 200 }),
    );
    const pay = vi.fn();
    const f = wrapFetchWithPayment(base as unknown as typeof fetch, { payment: pay });
    const r = await f("http://x/y");
    expect(r.response.status).toBe(200);
    expect(r.paid).toBe(false);
    expect(r.receipt).toBeNull();
    expect(pay).not.toHaveBeenCalled();
  });

  it("retries after signing a payment on 402", async () => {
    const challenge = mkChallenge();
    const receipt: SettlementResponse = {
      success: true,
      transaction: "0xdeadbeef",
      network: "eip155:5042002",
      payer: "0xbbb",
    };
    const base = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 402,
          headers: { "payment-required": encodeHeader(challenge) },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ weather: "sunny" }), {
          status: 200,
          headers: { "payment-response": encodeHeader(receipt) },
        }),
      );
    const pay = vi.fn().mockResolvedValue(encodeHeader(mkPayload()));
    const f = wrapFetchWithPayment(base as unknown as typeof fetch, { payment: pay });
    const r = await f("http://x/y");
    expect(base).toHaveBeenCalledTimes(2);
    expect(pay).toHaveBeenCalledTimes(1);
    expect(r.response.status).toBe(200);
    expect(r.paid).toBe(true);
    expect(r.receipt).toEqual(receipt);
    // retry carries the payment-signature header
    const secondCall = base.mock.calls[1];
    const headers = secondCall?.[1]?.headers as Record<string, string>;
    expect(headers["payment-signature"]).toBeTruthy();
  });

  it("respects maxRetries", async () => {
    const challenge = mkChallenge();
    const base = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 402,
          headers: { "payment-required": encodeHeader(challenge) },
        }),
      );
    const pay = vi.fn().mockResolvedValue(encodeHeader(mkPayload()));
    const f = wrapFetchWithPayment(base as unknown as typeof fetch, {
      payment: pay,
      maxRetries: 2,
    });
    const r = await f("http://x/y");
    // 1 initial + 2 retries = 3 base calls
    expect(base).toHaveBeenCalledTimes(3);
    expect(pay).toHaveBeenCalledTimes(2);
    expect(r.response.status).toBe(402);
    expect(r.paid).toBe(true); // we did pay, just got rejected again
  });
});
