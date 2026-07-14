import { Router, type IRouter, type Request, type Response } from "express";
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import { and, eq, isNull } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  verifyOperatorOsToken,
  consumeOperatorOsToken,
  mapOperatorOsPlan,
  ssoRejectMessage,
  type SsoClaims,
  type SsoReject,
} from "../lib/sso";
import { setSessionCookie } from "../lib/session";

const router: IRouter = Router();

const isProd = process.env["NODE_ENV"] === "production";

/** Tighter limiter than the global readLimiter to blunt token-spam. */
const ssoLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => !isProd && process.env["FORCE_RATE_LIMIT"] !== "1",
  message: { error: "Too many SSO attempts", code: "rate_limited" },
});

function reject(res: Response, r: SsoReject): void {
  res.status(r.http).json({ error: ssoRejectMessage(r.code), code: r.code });
}

function isReject(v: SsoClaims | SsoReject): v is SsoReject {
  return typeof (v as SsoReject).code === "string" && typeof (v as SsoReject).http === "number";
}

async function upsertSsoUser(claims: SsoClaims) {
  // Look up by OperatorOS subject id first.
  let [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.operatorOsUserId, claims.sub));

  // Else by email — link the existing local account to OperatorOS.
  if (!existing) {
    const email = claims.email.trim().toLowerCase();
    [existing] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.email, email), isNull(usersTable.operatorOsUserId)));
  }

  const mappedPlan = mapOperatorOsPlan(claims.plan_slug);
  const email = claims.email.trim().toLowerCase();
  const name = email.split("@")[0] ?? "Operator";

  if (existing) {
    const planUpdate = mappedPlan ?? existing.plan;
    const [updated] = await db
      .update(usersTable)
      .set({
        email,
        role: claims.role,
        organizationId: claims.organization_id,
        operatorOsPlanSlug: claims.plan_slug,
        operatorOsUserId: claims.sub,
        plan: planUpdate,
      })
      .where(eq(usersTable.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      email,
      name,
      role: claims.role,
      plan: mappedPlan ?? "free",
      organizationId: claims.organization_id,
      operatorOsPlanSlug: claims.plan_slug,
      operatorOsUserId: claims.sub,
      subscriptionStatus: "operator_os",
    })
    .returning();
  return created;
}

router.get("/sso", ssoLimiter, async (req: Request, res: Response): Promise<void> => {
  const token = typeof req.query["token"] === "string" ? req.query["token"] : "";
  if (!token) {
    reject(res, { http: 400, code: "missing_token" });
    return;
  }

  const verified = verifyOperatorOsToken(token);
  if (isReject(verified)) {
    req.log.warn({ code: verified.code }, "SSO token rejected at verify");
    reject(res, verified);
    return;
  }
  const claims = verified;

  const consumeReject = await consumeOperatorOsToken(claims);
  if (consumeReject) {
    req.log.warn({ code: consumeReject.code, jti: claims.jti }, "SSO token rejected at consume");
    reject(res, consumeReject);
    return;
  }

  let user;
  try {
    user = await upsertSsoUser(claims);
  } catch (err) {
    req.log.error({ err, jti: claims.jti }, "SSO user upsert failed");
    res.status(500).json({ error: "SSO provisioning failed", code: "provisioning_failed" });
    return;
  }
  if (!user) {
    res.status(500).json({ error: "SSO provisioning failed", code: "provisioning_failed" });
    return;
  }

  setSessionCookie(res, user.id);
  req.log.info({ jti: claims.jti, userId: user.id, plan: user.plan }, "SSO launch accepted");
  res.redirect(302, "/dashboard");
});

export default router;
