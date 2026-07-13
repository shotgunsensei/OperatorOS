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
import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import {
  loadConfig,
  verifyToken,
  consumeToken,
  exchangeCode,
  claimsFromExchange,
  peekJti,
  getPublicConfig,
  SsoRejectError,
  extractEntitlementClaims,
  mergeEntitlementClaims,
  isTargetModuleEnabled,
  type OperatorOsEntitlementClaims,
  type OperatorOsTokenClaims,
  type OperatorOsConsumeResponse,
  type OperatorOsSsoConfig,
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

/**
 * Task #140: instead of stranding a failed browser launch on a JSON error
 * page (which invites the user to retry and re-enter the auth chain), send
 * them back to the OperatorOS hub launcher with a user-visible error code and
 * a correlation id they can quote to support. Falls back to JSON only when we
 * cannot resolve the hub base URL (non-browser callers / misconfiguration).
 */
function launchErrorRedirect(
  res: Response,
  hubBaseUrl: string | undefined,
  code: string,
  cid: string,
): boolean {
  const base = (hubBaseUrl || process.env.OPERATOROS_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return false;
  res.redirect(
    302,
    `${base}/app?launch_error=${encodeURIComponent(code)}&cid=${encodeURIComponent(cid)}`,
  );
  return true;
}

function reject(
  req: Request,
  res: Response,
  code: string,
  status: number,
  jti: string | null,
  auditOutcome = code,
  details: Record<string, unknown> = {},
  redirect?: { hubBaseUrl?: string; cid: string }
) {
  const auditDetails: Record<string, unknown> = { ...details };
  if (jti) auditDetails.jti = jti;
  if (redirect) auditDetails.cid = redirect.cid;
  void logAttempt(req, auditOutcome, false, auditDetails);
  if (redirect && launchErrorRedirect(res, redirect.hubBaseUrl, code, redirect.cid)) {
    return;
  }
  return res.status(status).json(redirect ? { code, cid: redirect.cid } : { code });
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
  const codeRaw = req.query.code;
  const code = typeof codeRaw === "string" ? codeRaw.trim() : "";
  const earlyJti = peekJti(token);

  // One correlation id per launch attempt: it appears in every audit row for
  // this request and is surfaced to the user on the launcher error page, so a
  // failed launch can be traced end to end from a single id.
  const cid = randomUUID();

  const cfg = loadConfig();
  // Redirect target for a failed browser launch. Resolvable even when cfg is
  // null via the OPERATOROS_BASE_URL fallback inside `launchErrorRedirect`.
  const redirect = { hubBaseUrl: cfg?.baseUrl, cid };

  if (!token && !code) {
    return reject(req, res, "missing_token", 400, earlyJti, "validation_failed", { code: "missing_token" }, redirect);
  }

  if (!cfg) {
    return reject(req, res, "sso_not_configured", 503, earlyJti, "configuration_failed", {}, redirect);
  }

  let claims: OperatorOsTokenClaims;
  let consumeResponse: OperatorOsConsumeResponse | null = null;

  // Task #140: opaque-code path (preferred). The JWT never rides in the
  // browser URL — we redeem the code server-to-server for the same
  // single-use consume payload the token path returns. `?token=` is kept
  // working for backward compatibility during the migration window, and a
  // present `?code=` always wins over a stray `?token=`.
  if (code) {
    try {
      consumeResponse = await exchangeCode(code, cfg);
      claims = claimsFromExchange(consumeResponse, cfg);
    } catch (err) {
      if (err instanceof SsoRejectError) {
        return reject(req, res, err.code, err.httpStatus, null, "consume_failed", { code: err.code, via: "code" }, redirect);
      }
      return reject(req, res, "consume_failed", 401, null, "consume_failed", { code: "consume_failed", via: "code" }, redirect);
    }
  } else {
    try {
      claims = await verifyToken(token, cfg);
    } catch (err) {
      if (err instanceof SsoRejectError) {
        return reject(req, res, err.code, err.httpStatus, earlyJti, "validation_failed", { code: err.code }, redirect);
      }
      return reject(req, res, "signature_invalid", 401, earlyJti, "validation_failed", { code: "signature_invalid" }, redirect);
    }

    try {
      consumeResponse = await consumeToken(claims, cfg);
    } catch (err) {
      if (err instanceof SsoRejectError) {
        return reject(req, res, err.code, err.httpStatus, claims.jti, "consume_failed", { code: err.code }, redirect);
      }
      return reject(req, res, "consume_failed", 401, claims.jti, "consume_failed", { code: "consume_failed" }, redirect);
    }
  }

  return finishSso(req, res, claims, consumeResponse, cfg, cid);
});

/**
 * Shared post-consume flow: entitlement resolution, provisioning, snapshot
 * caching, session establishment, and the final redirect. Both the token
 * (`?token=`) and opaque-code (`?code=`) paths converge here with an
 * identical `{ claims, consumeResponse }` pair, so provisioning behaviour
 * is guaranteed the same regardless of how the handoff arrived.
 */
async function finishSso(
  req: Request,
  res: Response,
  claims: OperatorOsTokenClaims,
  consumeResponse: OperatorOsConsumeResponse | null,
  cfg: OperatorOsSsoConfig,
  cid: string,
) {
  const redirect = { hubBaseUrl: cfg.baseUrl, cid };
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
    }, redirect);
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
          cid,
        },
        provisioned.user.id,
        provisioned.org.id
      );
      if (launchErrorRedirect(res, cfg.baseUrl, "entitlement_disabled", cid)) return;
      return res.status(403).json({ code: "entitlement_disabled", cid });
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
}

export default router;
