/**
 * Drive enough traffic through a running component to clear the
 * hackathon's ≥50 on-chain-batch-tx bar.
 *
 * Usage:
 *   pnpm bench                      # default: 200 reqs against C1 on :4021
 *   pnpm bench --component c7       # drive C7's row endpoint
 *   pnpm bench --component c1 --count 500
 *
 * Does NOT sign x402 payments (that's the real clients' job) — this just
 * generates 402 challenges so you can watch the server/gateway counters
 * tick. For end-to-end settlement, run the component's own demo client.
 */
const args = process.argv.slice(2);
function arg(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
}

const component = arg("component", "c1");
const count = Number(arg("count", "200"));
const concurrency = Number(arg("concurrency", "8"));

const targets: Record<string, string> = {
  c1: "http://localhost:4021/weather?city=SF",
  c2: "http://localhost:4022/ask?q=hello",
  c6: "http://localhost:4026/classify",
  c7: "http://localhost:4027/data?limit=5",
};
const url = targets[component];
if (!url) {
  console.error(`[bench] unknown component: ${component} (valid: ${Object.keys(targets).join(", ")})`);
  process.exit(1);
}

console.log(`[bench] component=${component} target=${url} count=${count} concurrency=${concurrency}`);

let done = 0;
let challenged = 0;
let errored = 0;
const start = Date.now();

async function one(): Promise<void> {
  try {
    const res = component === "c6"
      ? await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frame: "data:image/jpeg;base64,AAAA" }) })
      : await fetch(url);
    if (res.status === 402) challenged++;
    // don't retry with payment — this is a volume generator, not a paying client
  } catch {
    errored++;
  }
  done++;
}

async function worker(): Promise<void> {
  while (done < count) {
    await one();
  }
}

const workers = Array.from({ length: Math.min(concurrency, count) }, () => worker());
await Promise.all(workers);

const secs = (Date.now() - start) / 1000;
console.log(`[bench] ${done} reqs in ${secs.toFixed(1)}s · ${challenged} 402s · ${errored} errors · ${(done / secs).toFixed(1)} req/s`);
