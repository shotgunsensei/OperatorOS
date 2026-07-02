import type { Express, Request, Response } from "express";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { db } from "../../db";
import { users, tenantMembers, tenants } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { logger } from "../../logger";
import { emitEvent } from "../../core/events/helpers";
import {
  buildSnapshot,
  mapOperatorOsRole,
  type EntitlementLimits,
} from "../../auth/entitlements";

/**
 * Task #12 — Server-to-server entitlement sync from OperatorOS.
 *
 * POST /api/operatoros/entitlements/sync
 *   Authorization: Bearer <OPERATOROS_SERVICE_TOKEN>
 *   { operatoros_user_id, sub, email, ... target_module_enabled, module_role, ... }
 *
 * OperatorOS calls this whenever a user's plan, role, or access changes so
 * that we don't have to wait for their next /sso login to pick up the change.
 * The same snapshot shape used in the SSO flow is built, persisted on the
 * user row, and reflected onto the local tenant_member role. Setting
 * `target_module_enabled=false` records `revoked_at` so middleware blocks
 * the user immediately.
 *
 * Security:
 *  - Bearer token compared with `timingSafeEqual` to prevent timing attacks.
 *  - Express rate-limited per operatoros_user_id (60/min).
 *  - Idempotent: we never throw on "already up-to-date" inputs.
 *  - Failure modes return a JSON `{code, message}` shape mirroring /sso.
 */

const BodySchema = z.object({
  operatoros_user_id: z.string().min(1).max(200),
  sub: z.string().min(1).max(200).optional(),
  email: z.string().email().max(320),
  organization_id: z.string().max(200).optional(),
  target_module_key: z.string().min(1).max(100),
  target_module_enabled: z.boolean(),
  target_module_access_level: z.string().max(50).optional(),
  target_module_features: z.array(z.string().max(50)).max(50).optional(),
  target_module_limits: z.record(z.string(), z.number()).optional(),
  plan_slug: z.string().max(50).optional(),
  subscription_status: z.string().max(50).optional(),
  module_role: z.string().max(50).optional(),
  tenant_role: z.string().max(50).optional(),
});

const MODULE_SLUG = "techdeck";
const MIN_SERVICE_TOKEN_LEN = 32;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // Pad to equal length to keep comparison time independent of length.
  const len = Math.max(ab.length, bb.length, 32);
  const ap = Buffer.alloc(len); ab.copy(ap);
  const bp = Buffer.alloc(len); bb.copy(bp);
  let result = timingSafeEqual(ap, bp);
  if (ab.length !== bb.length) result = false;
  return result;
}

export function registerOperatorOsRoutes(app: Express) {
  const serviceToken = process.env.OPERATOROS_SERVICE_TOKEN;
  const moduleKey = (process.env.CHILD_APP_MODULE_KEY || MODULE_SLUG).toLowerCase();

  const limiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    keyGenerator: (req, res) => {
      try {
        const id = (req.body as any)?.operatoros_user_id;
        if (id && typeof id === "string") return `os:${id}`;
      } catch { /* fall through */ }
      return ipKeyGenerator(req.ip ?? "");
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: "rate_limited", message: "Too many sync requests" },
  });

  app.post("/api/operatoros/entitlements/sync", limiter, async (req: Request, res: Response) => {
    if (!serviceToken) {
      return res.status(503).json({ code: "sync_not_configured", message: "Entitlement sync is not configured" });
    }
    if (serviceToken.length < MIN_SERVICE_TOKEN_LEN || moduleKey !== MODULE_SLUG) {
      logger.error({ moduleKey }, "[entitlement-sync] invalid OperatorOS sync configuration");
      return res.status(503).json({ code: "sync_not_configured", message: "Entitlement sync is not configured" });
    }

    const auth = req.headers.authorization || "";
    const presented = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!presented || !safeEqual(presented, serviceToken)) {
      logger.warn({ ip: req.ip }, "[entitlement-sync] unauthorized");
      return res.status(401).json({ code: "unauthorized", message: "Invalid service token" });
    }

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "bad_request", message: "Invalid sync payload", issues: parsed.error.issues });
    }
    const body = parsed.data;

    if (body.target_module_key.toLowerCase() !== moduleKey) {
      return res.status(400).json({ code: "module_mismatch", message: "Payload targets a different module" });
    }

    const enabled = body.target_module_enabled === true;
    const localRole = mapOperatorOsRole(body.module_role, body.tenant_role);

    const snapshot = buildSnapshot({
      planSlug: body.plan_slug,
      subscriptionStatus: body.subscription_status,
      accessLevel: body.target_module_access_level || body.plan_slug,
      features: body.target_module_features,
      limits: body.target_module_limits as EntitlementLimits | undefined,
      moduleRole: body.module_role,
      tenantRole: body.tenant_role,
      organizationId: body.organization_id,
      operatorosUserId: body.operatoros_user_id,
      enabled,
    });

    try {
      const result = await db.transaction(async (tx) => {
        // Strict identity binding: only resolve by stable OperatorOS
        // identifiers (operatoros_user_id, then JWT sub stored in
        // sso_subject). Emails can churn or collide and must NEVER be
        // used to attach an OperatorOS sync payload to a local row —
        // doing so risks mis-associating snapshots across accounts.
        let row = (await tx.select().from(users).where(eq(users.operatorosUserId, body.operatoros_user_id)))[0];
        if (!row && body.sub) {
          row = (await tx.select().from(users).where(eq(users.ssoSubject, body.sub)))[0];
        }
        if (!row) {
          return { found: false as const };
        }

        const now = new Date();
        const updates: Record<string, unknown> = {
          email: body.email.toLowerCase(),
          operatorosUserId: body.operatoros_user_id,
          operatorosTenantId: body.organization_id ?? row.operatorosTenantId,
          entitlementSnapshotJson: snapshot,
          lastEntitlementSyncAt: now,
          updatedAt: now,
        };
        if (enabled && localRole) {
          updates.localRole = localRole;
          updates.ssoRole = localRole;
          updates.revokedAt = null;
        } else {
          updates.revokedAt = now;
        }

        await tx.update(users).set(updates).where(eq(users.id, row.id));

        // Reflect role onto local membership if both are known and not revoked.
        let tenantId: string | undefined;
        if (enabled && localRole && body.organization_id) {
          const rawOrg = body.organization_id.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 50);
          const orgSlug = `os-${rawOrg}`;
          let tenant = (await tx.select().from(tenants).where(eq(tenants.slug, orgSlug)))[0];
          if (tenant) {
            tenantId = tenant.id;
            await tx.insert(tenantMembers)
              .values({ tenantId: tenant.id, userId: row.id, role: localRole })
              .onConflictDoUpdate({
                target: [tenantMembers.tenantId, tenantMembers.userId],
                set: { role: localRole },
              });
          }
        }

        return { found: true as const, userId: row.id, tenantId, role: localRole, enabled };
      });

      if (!result.found) {
        // 202 Accepted: the user hasn't logged in yet, so we have no row to
        // attach the snapshot to. We acknowledge so OperatorOS doesn't retry
        // forever; the next /sso login will pick up fresh claims anyway.
        return res.status(202).json({ code: "user_unknown", message: "User has not yet signed in to Tech Deck" });
      }

      if (result.tenantId) {
        await emitEvent("entitlement_sync", result.tenantId, result.userId, "user", result.userId, {
          enabled: result.enabled,
          role: result.role,
          accessLevel: snapshot.accessLevel,
          subscriptionStatus: snapshot.subscriptionStatus,
        });
      }

      // Session invalidation on revoke — drop any active sessions for this
      // user so the next request lands on /sso or login. Sessions are stored
      // in the `sessions` table with the connect-pg-simple JSONB `sess`
      // column containing `passport.user = <userId>`.
      let sessionsKilled = 0;
      if (!enabled || !localRole) {
        try {
          // This app stores `req.session.userId` (not passport.user).
          // Match both shapes for safety across legacy + current sessions.
          const killed = await db.execute(sql`
            DELETE FROM sessions
            WHERE sess->>'userId' = ${result.userId}
               OR sess->'passport'->>'user' = ${result.userId}
          `);
          sessionsKilled = (killed as any).rowCount ?? 0;
        } catch (err) {
          logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[entitlement-sync] session kill failed");
        }
      }

      logger.info({
        userId: result.userId,
        operatorosUserId: body.operatoros_user_id,
        enabled,
        role: localRole,
        sessionsKilled,
      }, "[entitlement-sync] applied");

      return res.status(200).json({ code: "ok", userId: result.userId, snapshot, sessionsKilled });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[entitlement-sync] failed");
      return res.status(500).json({ code: "server_error", message: "Failed to apply entitlement sync" });
    }
  });
}
