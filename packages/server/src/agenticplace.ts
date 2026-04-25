/**
 * AgenticPlace gateway — reusable Express router that exposes pay2play-metered
 * endpoints for an agent marketplace. Chain-agnostic via dependency injection:
 * the caller supplies the chain-specific identity/job functions, and this module
 * provides the routing, payment gating, CORS, error handling, and listings layer.
 *
 * Used by:
 *   components/c9-agent-identity/src/server.ts   (Arc + ERC-8004 + ERC-8183)
 *   future per-chain marketplaces with the same shape.
 */
import { Router, type RequestHandler } from "express";
import { createPaidMiddleware, type PaidMiddlewareOptions } from "./http.js";
import { asyncHandler } from "./middleware.js";

/* -- Injected helpers (chain-specific implementations) -------------------- */

export interface RegisterAgentFn {
  (opts: {
    ownerKey:    `0x${string}`;
    validatorKey?: `0x${string}`;
    metadataURI: string;
    initialScore?: number;
    dryRun?:     boolean;
  }): Promise<{
    agentId?: bigint;
    owner: string;
    registerTx?: string;
    feedbackTx?: string;
    reputationScore?: number;
    dryRun: boolean;
  }>;
}

export interface RunJobLifecycleFn {
  (opts: {
    clientKey:    `0x${string}`;
    providerKey:  `0x${string}`;
    evaluatorKey: `0x${string}`;
    descText:     string;
    budgetUsdc:   number;
    deliverable:  string;
  }): Promise<{
    jobId: bigint;
    createTx: string;
    fundTx: string;
    submitTx: string;
    completeTx: string;
    finalState: string;
  }>;
}

export interface GetJobInfoFn {
  (jobId: bigint): Promise<{
    jobId: bigint;
    client: string;
    provider: string;
    evaluator: string;
    amount: bigint;
    expiry: bigint;
    state: string;
    deliverableHash?: string;
  }>;
}

export interface HealthCheckFn {
  (): Promise<{ ok: boolean; checks: Record<string, { ok: boolean; detail?: string }> }>;
}

/* -- Router factory ------------------------------------------------------- */

export interface AgenticPlaceRouterOptions {
  /** Pay2play meter + facilitator config — passed straight to createPaidMiddleware. */
  paidMiddleware: PaidMiddlewareOptions;
  /** Per-route description for the 402 challenge (shown to clients before paying). */
  description?: string;
  /** Chain-specific implementations injected by the caller. */
  registerAgent:    RegisterAgentFn;
  runJobLifecycle:  RunJobLifecycleFn;
  getJobInfo:       GetJobInfoFn;
  /** Optional: contracts/state metadata returned by GET /info (free). */
  info?: () => Record<string, unknown>;
  /** Optional: startup-time and on-demand health check. */
  healthCheck?: HealthCheckFn;
}

export function createAgenticPlaceRouter(opts: AgenticPlaceRouterOptions): Router {
  const router = Router();
  const paid = createPaidMiddleware(opts.paidMiddleware);
  const gate: RequestHandler = paid({ description: opts.description ?? "AgenticPlace op" });

  // GET /info — free service metadata
  router.get("/info", (_req, res) => {
    res.json(opts.info ? opts.info() : { service: "agenticplace" });
  });

  // GET /health — free, runs the injected healthCheck
  router.get("/health", asyncHandler(async (_req, res) => {
    if (!opts.healthCheck) {
      res.json({ ok: true, checks: {}, note: "no healthCheck configured" });
      return;
    }
    const result = await opts.healthCheck();
    res.status(result.ok ? 200 : 503).json(result);
  }));

  // POST /agent/register — paid, ERC-8004 register flow
  router.post("/agent/register", gate, asyncHandler(async (req, res) => {
    const body = req.body as {
      ownerKey?: `0x${string}`;
      validatorKey?: `0x${string}`;
      metadataURI?: string;
      initialScore?: number;
      dryRun?: boolean;
    };
    if (!body.ownerKey || !body.metadataURI) {
      res.status(400).json({ error: "ownerKey and metadataURI are required" });
      return;
    }
    const result = await opts.registerAgent({
      ownerKey: body.ownerKey,
      validatorKey: body.validatorKey,
      metadataURI: body.metadataURI,
      initialScore: body.initialScore,
      dryRun: body.dryRun ?? false,
    });
    res.json({
      ...result,
      agentId: result.agentId?.toString(),
    });
  }));

  // POST /job/create — paid, full ERC-8183 lifecycle
  router.post("/job/create", gate, asyncHandler(async (req, res) => {
    const body = req.body as {
      clientKey?: `0x${string}`;
      providerKey?: `0x${string}`;
      evaluatorKey?: `0x${string}`;
      descText?: string;
      budgetUsdc?: number;
      deliverable?: string;
    };
    if (!body.clientKey || !body.providerKey || !body.descText || body.budgetUsdc === undefined) {
      res.status(400).json({
        error: "clientKey, providerKey, descText, budgetUsdc are required",
      });
      return;
    }
    const result = await opts.runJobLifecycle({
      clientKey: body.clientKey,
      providerKey: body.providerKey,
      evaluatorKey: body.evaluatorKey ?? body.clientKey,
      descText: body.descText,
      budgetUsdc: body.budgetUsdc,
      deliverable: body.deliverable ?? "work delivered",
    });
    res.json({
      jobId: result.jobId.toString(),
      createTx: result.createTx,
      fundTx: result.fundTx,
      submitTx: result.submitTx,
      completeTx: result.completeTx,
      finalState: result.finalState,
    });
  }));

  // GET /job/:id — free, read-only job state
  router.get("/job/:id", asyncHandler(async (req, res) => {
    const idParam = req.params.id;
    if (!idParam || !/^\d+$/.test(idParam)) {
      res.status(400).json({ error: "job id must be a non-negative integer" });
      return;
    }
    const info = await opts.getJobInfo(BigInt(idParam));
    res.json({
      ...info,
      jobId: info.jobId.toString(),
      amount: info.amount.toString(),
      expiry: info.expiry.toString(),
    });
  }));

  return router;
}

/* -- Health check helper -------------------------------------------------- */

export interface ContractHealthCheck {
  name: string;
  address: string;
  /** Probe function that returns true if the contract is reachable + behaves as expected. */
  probe: () => Promise<boolean>;
}

/**
 * Run a battery of probes in parallel and return a structured health summary.
 * Probes that throw are reported as failed with the error message.
 */
export async function runHealthChecks(
  checks: ContractHealthCheck[],
): Promise<{ ok: boolean; checks: Record<string, { ok: boolean; detail?: string }> }> {
  const results = await Promise.all(
    checks.map(async (c) => {
      try {
        const ok = await c.probe();
        return [c.name, { ok, detail: ok ? c.address : `probe returned false (addr ${c.address})` }] as const;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return [c.name, { ok: false, detail: `${msg} (addr ${c.address})` }] as const;
      }
    }),
  );
  const summary = Object.fromEntries(results);
  return {
    ok: results.every(([, r]) => r.ok),
    checks: summary,
  };
}
