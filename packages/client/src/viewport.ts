/**
 * Browser-side viewport dwell meter. Watches `<p>` (or custom selector)
 * elements with IntersectionObserver; emits a `dwell` UsageSignal after
 * the element has been continuously visible for `dwellMs`.
 *
 * Pair with @pay2play/server/http or /sse on the server side.
 */
import type { UsageSignal } from "@pay2play/core";

export interface ViewportMeterOptions {
  /** CSS selector for elements to meter. Default: "p". */
  selector?: string;
  /** Dwell threshold in ms. Default: 3000. */
  dwellMs?: number;
  /** IntersectionObserver visibility threshold 0..1. Default: 0.5. */
  threshold?: number;
  /** Fire when an element has dwelled. Typically triggers a voucher sign + POST. */
  onDwell: (signal: Extract<UsageSignal, { kind: "dwell" }>, el: Element) => void;
}

/**
 * Start a viewport dwell meter in the current document.
 * Returns a disposer function.
 */
export function startViewportMeter(opts: ViewportMeterOptions): () => void {
  const selector = opts.selector ?? "p";
  const dwellMs = opts.dwellMs ?? 3000;
  const threshold = opts.threshold ?? 0.5;

  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
  const charged = new WeakSet<Element>();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target;
        if (entry.isIntersecting && !charged.has(el)) {
          // start dwell timer
          const t = setTimeout(() => {
            if (charged.has(el)) return;
            charged.add(el);
            const id = el.id || undefined;
            opts.onDwell({ kind: "dwell", elementId: id, ms: dwellMs }, el);
          }, dwellMs);
          timers.set(el, t);
        } else {
          // element left viewport before threshold; cancel timer
          const t = timers.get(el);
          if (t) {
            clearTimeout(t);
            timers.delete(el);
          }
        }
      }
    },
    { threshold },
  );

  const els = Array.from(document.querySelectorAll(selector));
  for (const el of els) observer.observe(el);

  return () => {
    observer.disconnect();
    for (const el of els) {
      const t = timers.get(el);
      if (t) clearTimeout(t);
    }
  };
}
