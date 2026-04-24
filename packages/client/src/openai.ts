/**
 * Browser-side OpenAI/Gemini streaming wrapper — counts tokens
 * client-side as they arrive in an SSE stream from a pay2play server,
 * and signs one voucher per N tokens.
 *
 * Pair with @pay2play/server/sse on the server side.
 */
import type { PaymentPayload, UsageSignal } from "@pay2play/core";

export interface StreamMeterOptions {
  /** Sign a PaymentPayload for a UsageSignal (tokens). */
  sign: (signal: UsageSignal) => Promise<PaymentPayload>;
  /** Path on the server to POST vouchers to. Default: "/meter/voucher". */
  voucherPath?: string;
  /** Sign a voucher every N tokens. Default: 100. */
  tokensPerVoucher?: number;
  /** Called as vouchers are signed (for UI counters). */
  onVoucherSigned?: (count: number) => void;
  /** Called when server reports a settled batch. */
  onBatchSettled?: (info: { count: number; txs: string[] }) => void;
  /** Called with any server-side counters update. */
  onCounters?: (counters: unknown) => void;
}

/**
 * Subscribe to an SSE stream from a pay2play server and auto-pay per tokens.
 *
 * The server emits three event types:
 * - `chunk` — actual LLM content (forwarded to `onChunk`)
 * - `charge` — "please sign a voucher for signal X and POST it back"
 * - `counters` — latest session counters (vouchers signed/flushed/batches)
 * - `settled` — a batch has been settled on-chain
 */
export async function openStreamingSession(
  url: string,
  body: unknown,
  onChunk: (s: string) => void,
  opts: StreamMeterOptions,
): Promise<() => void> {
  const voucherPath = opts.voucherPath ?? "/meter/voucher";

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.body) throw new Error("No SSE body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let vouchersSigned = 0;
  let aborted = false;

  (async () => {
    while (!aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE frames: each "event: X\ndata: Y\n\n"
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const [eventLine, dataLine] = frame.split("\n");
        if (!eventLine || !dataLine) continue;
        const event = eventLine.replace(/^event:\s*/, "");
        const data = JSON.parse(dataLine.replace(/^data:\s*/, ""));

        if (event === "chunk") {
          onChunk((data as { text: string }).text);
        } else if (event === "charge") {
          const { id, signal } = data as { id: string; signal: UsageSignal };
          const payload = await opts.sign(signal);
          vouchersSigned += 1;
          opts.onVoucherSigned?.(vouchersSigned);
          await fetch(voucherPath, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, signal, payload }),
          });
        } else if (event === "settled") {
          opts.onBatchSettled?.(data as { count: number; txs: string[] });
        } else if (event === "counters") {
          opts.onCounters?.(data);
        }
      }
    }
  })().catch((err) => {
    console.error("stream error:", err);
  });

  return () => {
    aborted = true;
    void reader.cancel();
  };
}
