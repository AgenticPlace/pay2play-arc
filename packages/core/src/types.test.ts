import { describe, it, expect } from "vitest";
import {
  encodeHeader,
  decodeHeader,
  isEvmPayment,
  isAlgoPayment,
  type PaymentPayload,
  type EvmPaymentPayload,
  type AlgoPaymentPayload,
} from "./types.js";

describe("PaymentPayload tagged union", () => {
  const evm: EvmPaymentPayload = {
    x402Version: 2,
    network: "eip155:5042002",
    payload: {
      signature: "0xdeadbeef",
      authorization: {
        from: "0x1111111111111111111111111111111111111111",
        to:   "0x2222222222222222222222222222222222222222",
        value: "1000",
        validAfter: "0",
        validBefore: "9999999999",
        nonce: "0xabc123",
      },
    },
  };

  const algo: AlgoPaymentPayload = {
    x402Version: 2,
    network: "algorand:testnet-v1.0",
    payload: {
      sender: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      txId:   "TXIDABC123",
      appId:  123456,
      groupId: "groupabcdef",
    },
  };

  it("isEvmPayment narrows the EVM variant", () => {
    const p: PaymentPayload = evm;
    expect(isEvmPayment(p)).toBe(true);
    expect(isAlgoPayment(p)).toBe(false);
    if (isEvmPayment(p)) {
      // TS narrowing — these accesses are type-safe.
      expect(p.payload.signature).toBe("0xdeadbeef");
      expect(p.payload.authorization.from).toBe("0x1111111111111111111111111111111111111111");
    }
  });

  it("isAlgoPayment narrows the Algorand variant", () => {
    const p: PaymentPayload = algo;
    expect(isAlgoPayment(p)).toBe(true);
    expect(isEvmPayment(p)).toBe(false);
    if (isAlgoPayment(p)) {
      expect(p.payload.sender).toMatch(/^[A-Z2-7]+$/);
      expect(p.payload.txId).toBe("TXIDABC123");
      expect(p.payload.appId).toBe(123456);
    }
  });

  it("treats an omitted network as EVM (back-compat)", () => {
    const legacy: PaymentPayload = {
      x402Version: 2,
      payload: evm.payload,
    };
    expect(isEvmPayment(legacy)).toBe(true);
    expect(isAlgoPayment(legacy)).toBe(false);
  });

  it("EVM payload round-trips through encodeHeader/decodeHeader", () => {
    const b64 = encodeHeader(evm);
    const decoded = decodeHeader<PaymentPayload>(b64);
    expect(isEvmPayment(decoded)).toBe(true);
    expect(decoded).toEqual(evm);
  });

  it("Algorand payload round-trips through encodeHeader/decodeHeader", () => {
    const b64 = encodeHeader(algo);
    const decoded = decodeHeader<PaymentPayload>(b64);
    expect(isAlgoPayment(decoded)).toBe(true);
    expect(decoded).toEqual(algo);
  });

  it("a settlement layer can dispatch on the discriminant", () => {
    const settle = (p: PaymentPayload): string => {
      if (isEvmPayment(p)) return `evm:${p.payload.authorization.from}`;
      if (isAlgoPayment(p)) return `algo:${p.payload.sender}:${p.payload.txId}`;
      return "unknown";
    };
    expect(settle(evm)).toBe("evm:0x1111111111111111111111111111111111111111");
    expect(settle(algo)).toMatch(/^algo:[A-Z2-7]+:TXIDABC123$/);
  });
});
