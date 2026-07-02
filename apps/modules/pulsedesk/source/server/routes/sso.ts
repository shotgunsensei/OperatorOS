/**
 * OperatorOS SSO end-to-end verification — VALIDATED 2026-05-15
 * --------------------------------------------------------------
 * A real OperatorOS-issued launch token (jti
 * b453eefa6ccefd310de08365c3b8ecd9993d60f37d499587, sub
 * 6c0e2f28-da08-4601-b0ff-7ff31194b7b0, role=admin, plan_slug=elite,
 * organization_id=null) was POSTed at GET /sso?token=… against the
 * live `https://operatoros.net/api/modules/sso/consume` endpoint.
 *
 * Result of the success run:
 *   - HTTP 302 → /dashboard with Set-Cookie connect.sid
 *   - GET /api/auth/me returned the provisioned user authenticated
 *   - 1 row in `users` (operatoros_user_id = sub, operatoros_role=admin,
 *     operatoros_plan_slug=elite, last_sso_at populated)
 *   - 1 row in `orgs` ("john's Workspace", per-user Personal workspace
 *     because organization_id was null in the token)
 *   - 1 row in `memberships` (role=admin)
 *   - 1 row in `auth_audit_log` (event_type = operatoros_sso_success,
 *     success=true, user_id+org_id populated, jti recorded)
 *
 * Result of the immediate replay (same token, second hit):
 *   - HTTP 401 { code: "consume_failed" }
 *   - 1 additional `auth_audit_log` row (event_type
 *     operatoros_sso_consume_failed, success=false, no session created)
 *
 * Two interop bugs were uncovered and fixed during this verification:
 *   1. The role validator only accepted "user"|"super_admin" but
 *      OperatorOS tokens carry role="admin"/"member" too. Broadened in
 *      `server/auth/operatoros-sso.ts::isValidRole` to accept the full
 *      set ("user", "member", "admin", "super_admin"). All non-
 *      "super_admin" values map to PulseDesk org role "admin" downstream
 *      (see `storage.provisionOperatorOsUser`).
 *   2. The consume URL was being built as
 *      `${OPERATOROS_API_URL}/v1/modules/sso/consume`. The real route
 *      lives at `https://operatoros.net/api/modules/sso/consume` with
 *      no `/v1` segment. `consumeToken` now POSTs to OPERATOROS_API_URL
 *      as-is (full URL, no path appending). `replit.md` and
 *      `threat_model.md` updated to match.
 */
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import {
  loadConfig,
  verifyToken,
  consumeToken,
  peekJti,
  getPublicConfig,
  SsoRejectError,
  extractEntitlementClaims,
  mergeEntitlementClaims,
  isTargetModuleEnabled,
  type OperatorOsEntitlementClaims,
} from "../auth/operatoros-sso";
import { ssoRateLimiter } from "../middleware/rateLimit";
import { cacheOperatorOsEntitlementSnapshot } from "../services/operatorosEntitlements";

const router = Router();

async function logAttempt(
  req: Request,
  outcome: string,
  success: boolean,
  details: Record<string, unknown>,
  userId?: string | null,
  orgId?: string | null
) {
  try {
    await storage.createAuthAuditLog({
      orgId: orgId ?? null,
      userId: userId ?? null,
      eventType: `operatoros_sso_${outcome}`,
      authSource: "operatoros",
      tenantResolved: orgId ?? null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
      details,
      success,
    });
  } catch (err: any) {
    console.error("[sso] audit log write failed:", err.message);
  }
}

function reject(
  req: Request,
  res: Response,
  code: string,
  status: number,
  jti: string | null,
  auditOutcome = code,
  details: Record<string, unknown> = {}
) {
  void logAttempt(req, auditOutcome, false, jti ? { ...details, jti } : details);
  return res.status(status).json({ code });
}

function summarizeEntitlement(entitlement: OperatorOsEntitlementClaims | null | undefined) {
  if (!entitlement) return null;
  return {
    tenantId: entitlement.operatoros_tenant_id ?? entitlement.tenant_id ?? entitlement.organization_id ?? null,
    tenantRole: entitlement.tenant_role ?? null,
    tenantRoleAlias: entitlement.tenant_role_alias ?? null,
    subscriptionStatus: entitlement.subscription_status ?? null,
    planSlug: entitlement.plan_slug ?? null,
    targetModuleEnabled: entitlement.target_module_enabled ?? null,
    targetModuleAccessLevel: entitlement.target_module_access_level ?? null,
    targetModuleRole: entitlement.target_module_role ?? null,
    featureKeys: entitlement.target_module_features ? Object.keys(entitlement.target_module_features) : [],
    allEnabledModules: entitlement.all_enabled_modules ?? [],
  };
}

router.get("/api/public/sso-config", (_req, res) => {
  const pub = getPublicConfig();
  if (!pub) return res.status(404).json({ error: "sso_not_configured" });
  return res.json(pub);
});

router.get("/sso", ssoRateLimiter, async (req, res) => {
  const tokenRaw = req.query.token;
  const token = typeof tokenRaw === "string" ? tokenRaw.trim() : "";
  const earlyJti = peekJti(token);

  if (!token) {
    return reject(req, res, "missing_token", 400, earlyJti, "validation_failed", { code: "missing_token" });
  }

  const cfg = loadConfig();
  if (!cfg) {
    return reject(req, res, "sso_not_configured", 503, earlyJti, "configuration_failed");
  }

  let claims;
  try {
    claims = await verifyToken(token, cfg);
  } catch (err) {
    if (err instanceof SsoRejectError) {
      return reject(req, res, err.code, err.httpStatus, earlyJti, "validation_failed", { code: err.code });
    }
    return reject(req, res, "signature_invalid", 401, earlyJti, "validation_failed", { code: "signature_invalid" });
  }

  let consumeResponse = null;
  try {
    consumeResponse = await consumeToken(claims, cfg);
  } catch (err) {
    if (err instanceof SsoRejectError) {
      return reject(req, res, err.code, err.httpStatus, claims.jti, "consume_failed", { code: err.code });
    }
    return reject(req, res, "consume_failed", 401, claims.jti, "consume_failed", { code: "consume_failed" });
  }

  const entitlement = mergeEntitlementClaims(
    extractEntitlementClaims(claims, cfg.audience),
    extractEntitlementClaims(consumeResponse, cfg.audience)
  );
  const entitlementSummary = summarizeEntitlement(entitlement);
  const operatorOsTenantId =
    entitlement?.operatoros_tenant_id
    ?? entitlement?.tenant_id
    ?? entitlement?.organization_id
    ?? claims.organization_id;
  const targetEnabled = isTargetModuleEnabled(entitlement, cfg.audience);
  if (targetEnabled === false) {
    return reject(req, res, "entitlement_disabled", 403, claims.jti, "entitlement_denied", {
      code: "entitlement_disabled",
      entitlement: entitlementSummary,
    });
  }

  let provisioned;
  try {
    provisioned = await storage.provisionOperatorOsUser({
      sub: claims.sub,
      email: claims.email,
      name: claims.name ?? "",
      role: claims.role,
      planSlug: entitlement?.plan_slug ?? claims.plan_slug,
      organizationId: operatorOsTenantId,
      entitlement,
    });
  } catch (err: any) {
    console.error("[sso] provisioning failed:", err);
    void logAttempt(
      req,
      "provisioning_failed",
      false,
      { jti: claims.jti, message: String(err?.message ?? ""), entitlement: entitlementSummary }
    );
    return res.status(500).json({ code: "provisioning_failed" });
  }

  let cachedSnapshot = null;
  let staleSnapshotIgnored = false;
  const cacheSource = consumeResponse ?? entitlement?.raw ?? claims;
  if (operatorOsTenantId) {
    const cacheResult = await cacheOperatorOsEntitlementSnapshot(cacheSource, {
      localUserId: provisioned.user.id,
      localOrgId: provisioned.org.id,
      fallbackOperatorOsUserId: claims.sub,
      fallbackOperatorOsTenantId: operatorOsTenantId,
      fallbackComputedAt: new Date(claims.iat * 1000),
      moduleSlug: cfg.audience,
    });
    cachedSnapshot = cacheResult.snapshot;
    staleSnapshotIgnored = cacheResult.staleIgnored;
    if (cachedSnapshot && (!cachedSnapshot.enabled || cachedSnapshot.revokedAt)) {
      void logAttempt(
        req,
        "entitlement_denied",
        false,
        {
          jti: claims.jti,
          snapshotId: cachedSnapshot.id,
          staleIgnored: staleSnapshotIgnored,
          entitlement: entitlementSummary,
        },
        provisioned.user.id,
        provisioned.org.id
      );
      return res.status(403).json({ code: "entitlement_disabled" });
    }
  }

  req.session.userId = provisioned.user.id;
  req.session.orgId = provisioned.org.id;
  req.session.authSource = "operatoros";
  req.session.operatorOsUserId = claims.sub;
  req.session.operatorOsTenantId = operatorOsTenantId ?? undefined;
  req.session.operatorOsModuleSlug = cfg.audience;
  req.session.operatorOsEntitlementSnapshotId = cachedSnapshot?.id;

  req.session.save((err) => {
    if (err) {
      console.error("[sso] session save failed:", err);
      void logAttempt(
        req,
        "session_error",
        false,
        { jti: claims.jti, message: String(err?.message ?? "") },
        provisioned.user.id,
        provisioned.org.id
      );
      return res.status(500).json({ code: "session_error" });
    }
    void logAttempt(
      req,
      "success",
      true,
      {
        jti: claims.jti,
        orgCreated: provisioned.orgCreated,
        userCreated: provisioned.userCreated,
        operatorOsRole: claims.role,
        localSuperAdmin: provisioned.user.isSuperAdmin,
        entitlement: entitlementSummary,
        consumeResponseReceived: consumeResponse !== null,
        snapshotId: cachedSnapshot?.id ?? null,
        staleSnapshotIgnored,
      },
      provisioned.user.id,
      provisioned.org.id
    );
    res.redirect(302, "/dashboard");
  });
});

export default router;
