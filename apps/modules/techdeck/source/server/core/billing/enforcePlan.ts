import type { Response, NextFunction } from "express";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { users, tenantMembers } from "@shared/schema";
import { storage } from "../../storage";
import { logger } from "../../logger";
import { db } from "../../db";
import {
  parseSnapshot,
  isBlockingStatus,
  defaultLimitsFor,
  type EntitlementLimits,
  type EntitlementSnapshot,
} from "../../auth/entitlements";

type EntitledFeature = "api" | "portal" | "status" | "webhooks" | "reports" | "intake";

/**
 * OperatorOS is the authority for plans/entitlements.
 *
 * Authenticated feature and limit checks read the per-user entitlement
 * snapshot stored on users.entitlement_snapshot_json. A legacy fallback can
 * be enabled only for non-production migration drills by setting
 * ENABLE_LEGACY_ENTITLEMENT_FALLBACK=true. Production never reads local
 * tenant_subscriptions as an access authority.
 */

function getSnapshotFromReq(req: any): EntitlementSnapshot | null {
  const profile = req.user?.profile as Record<string, unknown> | undefined;
  if (!profile) return null;
  return parseSnapshot(profile.entitlementSnapshotJson);
}

function isOperatorOsManagedProfile(profile: Record<string, unknown> | undefined): boolean {
  if (!profile) return false;
  return !!(profile.operatorosUserId || profile.ssoSubject || profile.operatorosTenantId);
}

function canUseLegacyFallback(): boolean {
  return process.env.ENABLE_LEGACY_ENTITLEMENT_FALLBACK === "true" && process.env.NODE_ENV !== "production";
}

const legacyWarnedTenants = new Set<string>();
function warnLegacyOnce(tenantId: string, extra: Record<string, unknown>) {
  if (legacyWarnedTenants.has(tenantId)) return;
  legacyWarnedTenants.add(tenantId);
  logger.warn({ tenantId, ...extra }, "[enforcePlan] using legacy migration fallback");
}

async function getLegacyEntitlementForTenant(
  tenantId: string,
): Promise<{ blocked: boolean; features: string[]; limits: Record<string, number>; accessLevel: string } | null> {
  if (!canUseLegacyFallback()) return null;
  try {
    const sub = await storage.getTenantSubscription(tenantId);
    if (!sub) return null;
    const status = (sub.status || "").toLowerCase();
    const accessLevel = (sub.planCode || "basic").toLowerCase();
    return {
      blocked: ["past_due", "unpaid", "canceled"].includes(status),
      features: [],
      limits: defaultLimitsFor(accessLevel) as Record<string, number>,
      accessLevel,
    };
  } catch {
    return null;
  }
}

export async function getTenantEntitlementSnapshot(tenantId: string): Promise<EntitlementSnapshot | null> {
  try {
    const rows = await db
      .select({ snapshot: users.entitlementSnapshotJson })
      .from(users)
      .innerJoin(tenantMembers, eq(tenantMembers.userId, users.id))
      .where(and(eq(tenantMembers.tenantId, tenantId), isNotNull(users.entitlementSnapshotJson)))
      .orderBy(desc(users.lastEntitlementSyncAt))
      .limit(1);
    return parseSnapshot(rows[0]?.snapshot);
  } catch (err) {
    logger.warn({ tenantId, err: err instanceof Error ? err.message : String(err) }, "[enforcePlan] tenant snapshot lookup failed");
    return null;
  }
}

export type TenantFeatureAccessResult =
  | { ok: true; snapshot: EntitlementSnapshot }
  | { ok: false; status: number; error: string; message: string; accessLevel?: string; subscriptionStatus?: string };

export async function checkTenantFeatureAccess(
  tenantId: string,
  feature: EntitledFeature,
): Promise<TenantFeatureAccessResult> {
  const snapshot = await getTenantEntitlementSnapshot(tenantId);
  if (!snapshot) {
    return {
      ok: false,
      status: 503,
      error: "entitlement_snapshot_missing",
      message: "OperatorOS entitlements are not synced for this tenant.",
    };
  }
  if (snapshot.enabled === false) {
    return {
      ok: false,
      status: 403,
      error: "module_access_denied",
      message: "Access to Tech Deck is disabled by OperatorOS.",
      accessLevel: snapshot.accessLevel,
      subscriptionStatus: snapshot.subscriptionStatus,
    };
  }
  if (isBlockingStatus(snapshot.subscriptionStatus)) {
    return {
      ok: false,
      status: 402,
      error: "subscription_inactive",
      message: "The OperatorOS subscription is not active.",
      accessLevel: snapshot.accessLevel,
      subscriptionStatus: snapshot.subscriptionStatus,
    };
  }
  if (!snapshot.features.includes(feature)) {
    return {
      ok: false,
      status: 402,
      error: "plan_required",
      message: `The ${feature} feature is not enabled by OperatorOS.`,
      accessLevel: snapshot.accessLevel,
      subscriptionStatus: snapshot.subscriptionStatus,
    };
  }
  return { ok: true, snapshot };
}

export async function getTenantPlanLimits(
  reqOrTenantId: any | string,
): Promise<EntitlementLimits & Record<string, any>> {
  if (reqOrTenantId && typeof reqOrTenantId === "object" && "user" in reqOrTenantId) {
    const snap = getSnapshotFromReq(reqOrTenantId);
    if (snap) return snap.limits as EntitlementLimits & Record<string, any>;
  }

  const tenantId = typeof reqOrTenantId === "string" ? reqOrTenantId : reqOrTenantId?.tenantCtx?.tenantId;
  if (tenantId) {
    const snap = await getTenantEntitlementSnapshot(tenantId);
    if (snap) return snap.limits as EntitlementLimits & Record<string, any>;

    const legacy = await getLegacyEntitlementForTenant(tenantId);
    if (legacy) {
      warnLegacyOnce(tenantId, { limitLookup: true, accessLevel: legacy.accessLevel });
      return legacy.limits as EntitlementLimits & Record<string, any>;
    }
  }

  return {} as EntitlementLimits & Record<string, any>;
}

function getCurrentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function entitlementMissingResponse(res: Response, extra: Record<string, unknown>) {
  return res.status(402).json({
    error: "entitlement_snapshot_missing",
    message: "OperatorOS entitlements are not synced. Sign in again from OperatorOS to refresh access.",
    ...extra,
  });
}

export function requireFeature(feature: EntitledFeature) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const snapshot = getSnapshotFromReq(req);
      if (snapshot) {
        if (isBlockingStatus(snapshot.subscriptionStatus) || !snapshot.enabled) {
          return res.status(402).json({
            error: "subscription_inactive",
            status: snapshot.subscriptionStatus,
            message: "Your OperatorOS subscription is not active. Manage billing in OperatorOS.",
          });
        }
        if (!snapshot.features.includes(feature)) {
          return res.status(402).json({
            error: "plan_required",
            feature,
            accessLevel: snapshot.accessLevel,
            message: `The ${feature} feature is not included in your current OperatorOS plan.`,
          });
        }
        return next();
      }

      const profile = req.user?.profile as Record<string, unknown> | undefined;
      if (isOperatorOsManagedProfile(profile)) {
        return entitlementMissingResponse(res, { feature });
      }

      const tenantId = req.tenantCtx?.tenantId;
      if (!tenantId) return next();

      const legacy = await getLegacyEntitlementForTenant(tenantId);
      if (!legacy) {
        return res.status(402).json({
          error: "entitlement_snapshot_missing",
          feature,
          message: "OperatorOS entitlements are not synced for this tenant.",
        });
      }
      warnLegacyOnce(tenantId, { feature, accessLevel: legacy.accessLevel });
      if (legacy.blocked) {
        return res.status(402).json({
          error: "subscription_inactive",
          message: "Your legacy migration subscription is not active. Refresh OperatorOS entitlements.",
        });
      }
      if (!legacy.features.includes(feature)) {
        return res.status(402).json({
          error: "plan_required",
          feature,
          accessLevel: legacy.accessLevel,
          message: `The ${feature} feature is not included in the legacy migration fallback.`,
        });
      }
      return next();
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[enforcePlan] requireFeature error");
      return res.status(500).json({ error: "entitlement_check_failed", message: "Unable to verify OperatorOS entitlements." });
    }
  };
}

export function checkLimit(limitType: "usersMax" | "webhooksMax" | "reportsPerMonth" | "storageGb" | "intakeSpacesMax" | "intakeRequestsPerMonth" | "intakeStorageGb") {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const snapshot = getSnapshotFromReq(req);
      const tenantId = req.tenantCtx?.tenantId;
      if (!tenantId) return next();

      let maxValue: number | undefined;
      let accessLevel = snapshot?.accessLevel;
      if (snapshot) {
        if (isBlockingStatus(snapshot.subscriptionStatus) || !snapshot.enabled) {
          return res.status(402).json({
            error: "subscription_inactive",
            status: snapshot.subscriptionStatus,
            message: "Your OperatorOS subscription is not active. Manage billing in OperatorOS.",
          });
        }
        maxValue = snapshot.limits[limitType] as number | undefined;
      } else {
        const profile = req.user?.profile as Record<string, unknown> | undefined;
        if (isOperatorOsManagedProfile(profile)) {
          return entitlementMissingResponse(res, { limit: limitType });
        }

        const legacy = await getLegacyEntitlementForTenant(tenantId);
        if (!legacy) {
          return res.status(402).json({
            error: "entitlement_snapshot_missing",
            limit: limitType,
            message: "OperatorOS entitlements are not synced for this tenant.",
          });
        }
        warnLegacyOnce(tenantId, { limitType });
        maxValue = legacy.limits[limitType];
        accessLevel = legacy.accessLevel;
      }
      if (maxValue === undefined || maxValue === null) {
        return res.status(402).json({
          error: "entitlement_limit_missing",
          limit: limitType,
          accessLevel,
          message: `OperatorOS has not synced the ${limitType} limit for this tenant.`,
        });
      }

      let currentValue = 0;
      switch (limitType) {
        case "usersMax":
          currentValue = await storage.getMemberCountByTenant(tenantId);
          break;
        case "webhooksMax":
          currentValue = await storage.getWebhookEndpointCountByTenant(tenantId);
          break;
        case "reportsPerMonth": {
          const usage = await storage.getOrCreateUsageCounter(tenantId, getCurrentMonthKey());
          currentValue = usage.reportsGenerated;
          break;
        }
        case "storageGb":
        case "intakeStorageGb": {
          const usage = await storage.getOrCreateUsageCounter(tenantId, getCurrentMonthKey());
          currentValue = Math.ceil(usage.evidenceBytesStored / (1024 * 1024 * 1024));
          break;
        }
        case "intakeSpacesMax":
          currentValue = await storage.getIntakeSpaceCount(tenantId);
          break;
        case "intakeRequestsPerMonth": {
          const usage = await storage.getOrCreateUsageCounter(tenantId, getCurrentMonthKey());
          currentValue = (usage as any).intakeRequestsCreated || 0;
          break;
        }
      }

      if (currentValue >= maxValue) {
        return res.status(402).json({
          error: "plan_limit_reached",
          limit: limitType,
          current: currentValue,
          max: maxValue,
          accessLevel,
          message: `You have reached the ${limitType} limit for your OperatorOS plan.`,
        });
      }

      return next();
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[enforcePlan] checkLimit error");
      return res.status(500).json({ error: "entitlement_check_failed", message: "Unable to verify OperatorOS entitlements." });
    }
  };
}
