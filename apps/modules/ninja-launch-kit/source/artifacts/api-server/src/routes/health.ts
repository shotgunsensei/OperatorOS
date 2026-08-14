import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";
import { STRIPE_ENABLED } from "../lib/stripe";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz/ready", async (req, res) => {
  const checks: { db: "ok" | "fail"; stripe: "enabled" | "demo" } = { db: "fail", stripe: STRIPE_ENABLED ? "enabled" : "demo" };
  try {
    await db.execute(sql`SELECT 1`);
    checks.db = "ok";
  } catch (err) {
    req.log?.error({ err }, "Database readiness check failed");
  }
  const ready = checks.db === "ok";
  res.status(ready ? 200 : 503).json({ ready, checks });
});

export default router;
