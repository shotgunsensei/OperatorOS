import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { db, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSsoConfig } from "../lib/ssoConfig";
import {
  applyEntitlementSnapshot,
} from "../lib/userSync";
import {
  snapshotFromSyncInput,
  type SyncInput,
} from "../lib/operatorOsRole";

/**
 * Inbound entitlement-sync endpoint. OperatorOS POSTs here whenever a
 * managed user's plan/role/module access changes out-of-band (subscription
 * cancelled, module disabled, plan upgraded, role reassigned). Gated by a
 * shared bearer token (`OPERATOROS_SERVICE_TOKEN`).
 *
 * Body shape:
 *   {
 *     operatoros_user_id: string,    // = users.operator_identity_id (JWT sub)
 *     access_level: 'pro' | 'standard' | 'read-only' | 'denied',
 *     module_enabled: boolean,
 *     module_role?: string,
 *     tenant_role?: string,
 *     plan_slug?: string,
 *     subscription_status?: string,
 *     features?: string[],
 *     granted_product_ids?: string[]
 *   }
 *
 * Snapshot fields that are omitted are inherited from the previous
 * snapshot, so callers can send partial deltas safely.
 */
const router: IRouter = Router();

function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

router.post("/operatoros/entitlements/sync", async (req, res) => {
  const cfg = getSsoConfig();
  const serviceToken = cfg?.serviceToken || process.env.OPERATOROS_SERVICE_TOKEN || "";
  if (!serviceToken) {
    return res
      .status(503)
      .json({ error: "OPERATOROS_SERVICE_TOKEN not configured" });
  }

  const authHeader = req.headers.authorization || "";
  const presented = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!presented || !timingSafeStringEqual(presented, serviceToken)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const operatorosUserId =
    typeof body.operatoros_user_id === "string"
      ? body.operatoros_user_id
      : typeof body.operator_identity_id === "string"
        ? (body.operator_identity_id as string)
        : "";
  if (!operatorosUserId) {
    return res
      .status(400)
      .json({ error: "Missing operatoros_user_id" });
  }

  const [user]: User[] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.operatorIdentityId, operatorosUserId))
    .limit(1);
  if (!user) {
    return res.status(404).json({ error: "Unknown operatoros_user_id" });
  }

  const input: SyncInput = {
    accessLevel: body.access_level as SyncInput["accessLevel"],
    moduleEnabled:
      typeof body.module_enabled === "boolean"
        ? (body.module_enabled as boolean)
        : null,
    moduleRole:
      typeof body.module_role === "string" ? (body.module_role as string) : null,
    tenantRole:
      typeof body.tenant_role === "string" ? (body.tenant_role as string) : null,
    planSlug:
      typeof body.plan_slug === "string" ? (body.plan_slug as string) : null,
    subscriptionStatus:
      typeof body.subscription_status === "string"
        ? (body.subscription_status as string)
        : null,
    features: Array.isArray(body.features)
      ? (body.features as unknown[]).filter((f): f is string => typeof f === "string")
      : null,
    grantedProductIds: Array.isArray(body.granted_product_ids)
      ? (body.granted_product_ids as unknown[]).filter(
          (f): f is string => typeof f === "string",
        )
      : null,
  };

  const next = snapshotFromSyncInput(input, user.entitlementSnapshotJson ?? null);
  const updated = await applyEntitlementSnapshot(user, next);

  req.log?.info(
    {
      userId: updated.id,
      operatorIdentityId: operatorosUserId,
      accessLevel: next.accessLevel,
      moduleEnabled: next.moduleEnabled,
      localRole: updated.localRole,
    },
    "OperatorOS entitlement snapshot applied",
  );

  return res.json({
    success: true,
    userId: updated.id,
    localRole: updated.localRole,
    snapshot: next,
  });
});

export default router;
