/**
 * Fee admin router — operator-facing endpoint for inspecting and updating
 * the active fee configuration of a pay2play component at runtime.
 *
 * Security model:
 *   - Every request requires an `X-Admin-Key` header that matches the
 *     `secret` passed to `createFeeAdminRouter`. The secret MUST come from
 *     a deployment-time env var (`PAY2PLAY_ADMIN_KEY`); the factory throws
 *     if the secret is empty so a misconfigured server can't expose this
 *     route open to the world.
 *
 * Persistence model:
 *   - GET /admin/fees       — returns current effective FeeConfig +
 *                              live PriceBreakdown for count=1.
 *   - POST /admin/fees      — accepts a partial FeeConfigInput (basePrice,
 *                              facilitatorFeeBps, gasOverhead). Persists
 *                              to `configPath` (atomic file write). Caller
 *                              is told whether changes apply live (if a
 *                              `liveConfig` getter/setter is wired) or
 *                              only after a restart.
 *
 * The router is intentionally minimal — no rate limiting, no audit DB.
 * Operators are expected to run it behind a private network and rotate
 * the admin key on a schedule. Upgrade path: drop in a more sophisticated
 * router that fronts the same JSON config shape.
 */
import { Router, type Request, type Response } from "express";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  feeConfig,
  priceBreakdown,
  type FeeConfig,
  type FeeConfigInput,
} from "@pay2play/core";

export interface FeeAdminOptions {
  /** Header secret. Must be non-empty. Source: PAY2PLAY_ADMIN_KEY env var. */
  secret: string;
  /** Initial FeeConfig — what the server is currently using. */
  initialConfig: FeeConfig;
  /**
   * Optional path for persisting fee changes. When set, POST writes a JSON
   * snapshot here so the next process start can rehydrate from it.
   */
  configPath?: string;
  /**
   * Optional live setter — when provided, fee changes take effect immediately
   * for the running process. Without it, the response includes a "restart
   * required" flag so the operator knows the change is staged on disk only.
   */
  setLiveConfig?: (cfg: FeeConfig) => void;
  /** Optional getter so GET reflects the latest live state if it's been mutated. */
  getLiveConfig?: () => FeeConfig;
}

const ADMIN_HEADER = "x-admin-key";

export function createFeeAdminRouter(opts: FeeAdminOptions): Router {
  if (!opts.secret || opts.secret.trim().length === 0) {
    throw new Error(
      "createFeeAdminRouter: `secret` is required and must be non-empty. " +
        "Set PAY2PLAY_ADMIN_KEY in env before mounting the admin router.",
    );
  }
  let cfg: FeeConfig = { ...opts.initialConfig };

  function readCfg(): FeeConfig {
    return opts.getLiveConfig ? opts.getLiveConfig() : cfg;
  }

  async function writeCfg(next: FeeConfig): Promise<{ persisted: boolean; live: boolean; path?: string }> {
    cfg = next;
    let persisted = false;
    if (opts.configPath) {
      const p = path.resolve(opts.configPath);
      const tmp = `${p}.tmp.${process.pid}`;
      const serialised = JSON.stringify(
        {
          ...next,
          basePriceAtomic: next.basePriceAtomic.toString(),
          gasOverheadAtomic: next.gasOverheadAtomic?.toString(),
        },
        null,
        2,
      );
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(tmp, serialised + "\n", { encoding: "utf-8", mode: 0o600 });
      await fs.rename(tmp, p);
      persisted = true;
    }
    let live = false;
    if (opts.setLiveConfig) {
      try {
        opts.setLiveConfig(next);
        live = true;
      } catch (err) {
        console.error("[fee-admin] setLiveConfig threw:", err);
      }
    }
    return { persisted, live, path: opts.configPath };
  }

  const router = Router();

  router.use((req, res, next) => {
    const supplied = (req.header(ADMIN_HEADER) ?? req.header(ADMIN_HEADER.toUpperCase()) ?? "").trim();
    if (!supplied || supplied !== opts.secret) {
      res.status(401).json({ error: "admin key required (header X-Admin-Key)" });
      return;
    }
    next();
  });

  router.get("/admin/fees", (_req: Request, res: Response) => {
    const c = readCfg();
    res.json({
      config: serializeConfig(c),
      breakdownPerUnit: serializeBreakdown(priceBreakdown(c)),
      breakdownPerMillion: serializeBreakdown(priceBreakdown(c, 1_000_000)),
    });
  });

  router.post("/admin/fees", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Partial<FeeConfigInput>;
      const current = readCfg();

      // Build a new config — caller can override any subset of fields.
      const merged: FeeConfigInput = {
        basePrice:
          body.basePrice ??
          current.basePriceAtomic.toString() // fallback: re-emit current atomic as a string parseable at decimals
            .padStart(current.decimals + 1, "0")
            .replace(/(\d)(\d{6})$/, "$1.$2"), // crude reformat — only used if no override
        decimals: body.decimals ?? current.decimals,
        facilitatorFeeBps:
          body.facilitatorFeeBps ?? current.facilitatorFeeBps,
        gasOverhead: body.gasOverhead,
        network: body.network ?? current.network,
        schemeName: body.schemeName ?? current.schemeName,
        symbol: body.symbol ?? current.symbol,
      };

      // Build the new config field-by-field from the body so omitted fields
      // preserve their current values (no accidental wipes).
      let basePriceAtomic = current.basePriceAtomic;
      if (body.basePrice !== undefined) {
        basePriceAtomic = feeConfig({
          basePrice: body.basePrice,
          decimals: merged.decimals,
        }).basePriceAtomic;
      }
      let gasOverheadAtomic = current.gasOverheadAtomic;
      if (body.gasOverhead !== undefined) {
        gasOverheadAtomic = feeConfig({
          basePrice: "0",
          decimals: merged.decimals,
          gasOverhead: body.gasOverhead,
        }).gasOverheadAtomic;
      }
      const next: FeeConfig = {
        basePriceAtomic,
        decimals: merged.decimals,
        facilitatorFeeBps:
          body.facilitatorFeeBps !== undefined
            ? body.facilitatorFeeBps
            : current.facilitatorFeeBps,
        gasOverheadAtomic,
        network: merged.network,
        schemeName: merged.schemeName,
        symbol: merged.symbol,
      };

      const result = await writeCfg(next);
      console.log(
        `[fee-admin] update from ${req.ip}: ${JSON.stringify(serializeConfig(next))} ` +
          `persisted=${result.persisted} live=${result.live}`,
      );

      res.json({
        config: serializeConfig(next),
        breakdownPerUnit: serializeBreakdown(priceBreakdown(next)),
        breakdownPerMillion: serializeBreakdown(priceBreakdown(next, 1_000_000)),
        applied: {
          persisted: result.persisted,
          live: result.live,
          configPath: result.path,
          restartRequired: !result.live,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  return router;
}

/* -- JSON serialisation (bigints as strings) ----------------------------- */

function serializeConfig(c: FeeConfig) {
  return {
    basePriceAtomic: c.basePriceAtomic.toString(),
    decimals: c.decimals,
    facilitatorFeeBps: c.facilitatorFeeBps,
    gasOverheadAtomic: c.gasOverheadAtomic?.toString(),
    network: c.network,
    schemeName: c.schemeName,
    symbol: c.symbol,
  };
}

function serializeBreakdown(b: ReturnType<typeof priceBreakdown>) {
  return {
    totalAtomic: b.totalAtomic.toString(),
    totalDisplay: b.totalDisplay,
    components: {
      base: { atomic: b.components.base.atomic.toString(), display: b.components.base.display },
      facilitatorFee: {
        atomic: b.components.facilitatorFee.atomic.toString(),
        display: b.components.facilitatorFee.display,
      },
      gasOverhead: {
        atomic: b.components.gasOverhead.atomic.toString(),
        display: b.components.gasOverhead.display,
      },
    },
    netMarginAtomic: b.netMarginAtomic.toString(),
    netMarginDisplay: b.netMarginDisplay,
    ppmtAtomic: b.ppmtAtomic.toString(),
    ppmtDisplay: b.ppmtDisplay,
    netMarginBps: b.netMarginBps,
    decimals: b.decimals,
    symbol: b.symbol,
  };
}
