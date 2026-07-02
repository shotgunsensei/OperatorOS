import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireOrg, requireMinRole, resolveTenant } from "../middleware";
import { hashPassword, verifyPassword } from "../middleware";
import type { ResolvedTenantRequest } from "../middleware";
import { getAuthProvider, localProvider, encryptSecret, decryptSecret } from "../auth";
import { loginRateLimiter, registerRateLimiter } from "../middleware/rateLimit";
import type { AuthProviderConfig } from "../auth";
import type { InsertOrgAuthConfig } from "@shared/schema";
import {
  getCurrentEntitlementSnapshotForRequest,
  snapshotAllowsFeature,
} from "../services/operatorosEntitlements";
import {
  CANONICAL_ROLES,
  ROLE_HIERARCHY,
  hasRole,
  normalizeRole,
} from "@shared/roles";

const authConfigSchema = z.object({
  authMode: z.enum(["local", "m365", "hybrid"]),
  entraTenantId: z.string().optional().default(""),
  entraTenantDomain: z.string().optional().default(""),
  entraClientId: z.string().optional().default(""),
  entraClientSecret: z.string().optional(),
  entraRedirectUri: z.string().optional().default(""),
  entraPostLogoutRedirectUri: z.string().optional().default(""),
  entraAllowedDomains: z.array(z.string()).optional().default([]),
  entraJitProvisioningEnabled: z.boolean().optional().default(true),
  entraRequireAdminConsent: z.boolean().optional().default(false),
});

const roleMappingSchema = z.object({
  entraGroupId: z.string().min(1, "Entra Group Object ID is required").trim(),
  pulsedeskRole: z.enum(CANONICAL_ROLES),
  displayLabel: z.string().optional(),
});

const router = Router();

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
}

async function logAuthEvent(req: Request, params: {
  orgId?: string | null;
  userId?: string | null;
  eventType: string;
  authSource?: string;
  tenantResolved?: string;
  details?: any;
  success: boolean;
}) {
  try {
    await storage.createAuthAuditLog({
      ...params,
      orgId: params.orgId || null,
      userId: params.userId || null,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] || null,
    });
  } catch (err) {
    console.error("Failed to log auth event:", err);
  }
}

function isLocalAuthEnabled(): boolean {
  return false;
}

function getOperatorOsLaunchUrl(): string {
  const baseUrl =
    process.env.OPERATOROS_BASE_URL
    || process.env.OPERATOROS_APP_URL
    || "https://app.operatoros.net";
  return `${baseUrl.replace(/\/+$/, "")}/app/apps/pulsedesk`;
}

async function rejectOperatorOsManagedAuth(req: Request, res: Response, eventType: string, action: string, tenantResolved?: string) {
  await logAuthEvent(req, {
    eventType,
    authSource: "local",
    tenantResolved,
    details: { reason: "PulseDesk authentication is managed by OperatorOS SSO", action },
    success: false,
  });
  return res.status(410).json({
    code: "managed_by_operatoros",
    managedBy: "operatoros",
    action,
    launchUrl: getOperatorOsLaunchUrl(),
    error: "PulseDesk authentication is managed by OperatorOS SSO. Launch PulseDesk from OperatorOS.",
  });
}

router.get("/api/auth/tenant/:slug", resolveTenant, async (req, res) => {
  try {
    const tenantReq = req as ResolvedTenantRequest;
    const org = tenantReq.resolvedOrg;
    const authConfig = tenantReq.resolvedAuthConfig;
    res.json({
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
      authMode: authConfig?.authMode || "local",
      logoUrl: org.logoUrl || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/auth/register", registerRateLimiter, async (req, res) => {
  try {
    if (!isLocalAuthEnabled()) {
      return rejectOperatorOsManagedAuth(req, res, "register_rejected", "register");
    }

    const { username, password, fullName } = req.body;
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    if (username.trim().length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }

    const existing = await storage.getUserByUsername(username.trim());
    if (existing) {
      return res.status(400).json({ error: "Username already taken" });
    }

    const user = await storage.createUser({
      username: username.trim(),
      password: await hashPassword(password),
      fullName: fullName?.trim() || username.trim(),
      phone: "",
      email: "",
    });

    req.session.userId = user.id;
    req.session.authSource = "local";
    req.session.save((err) => {
      if (err) {
        console.error("[session.save error] register:", err.message, err.stack);
        return res.status(500).json({ error: "Session error" });
      }
      logAuthEvent(req, { userId: user.id, eventType: "register", authSource: "local", success: true });
      res.json({ user: { ...user, password: undefined } });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/auth/login", loginRateLimiter, async (req, res) => {
  try {
    const { username, password, orgSlug } = req.body;
    if (!isLocalAuthEnabled()) {
      return rejectOperatorOsManagedAuth(req, res, "login_rejected", "login", orgSlug);
    }

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    let org = null;
    let authConfig = null;
    if (orgSlug) {
      org = await storage.getOrgBySlug(orgSlug);
      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }
      authConfig = await storage.getOrgAuthConfig(org.id);
      if (authConfig?.authMode === "m365") {
        await logAuthEvent(req, {
          orgId: org.id,
          eventType: "login_rejected",
          authSource: "local",
          tenantResolved: orgSlug,
          details: { reason: "Local login not allowed in M365-only mode" },
          success: false,
        });
        return res.status(403).json({ error: "This organization requires Microsoft 365 sign-in" });
      }
      if (authConfig?.authMode === "hybrid") {
        const userToCheck = await storage.getUserByUsername(username);
        if (userToCheck) {
          const mem = await storage.getMembership(org.id, userToCheck.id);
          if (mem && !hasRole(mem.role, "admin")) {
            await logAuthEvent(req, {
              orgId: org.id,
              userId: userToCheck.id,
              eventType: "login_rejected",
              authSource: "local",
              tenantResolved: orgSlug,
              details: { reason: "Hybrid mode: local login restricted to admin/owner roles", role: mem.role },
              success: false,
            });
            return res.status(403).json({ error: "This organization requires Microsoft 365 sign-in. Local login is available only for administrators." });
          }
        }
      }
    }

    const user = await storage.getUserByUsername(username);
    if (!user) {
      await logAuthEvent(req, {
        orgId: org?.id,
        eventType: "login_failed",
        authSource: "local",
        tenantResolved: orgSlug || undefined,
        details: { reason: "User not found", username },
        success: false,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const credResult = await localProvider.validateCredentials(username, password, user.password);
    if (!credResult.success) {
      await logAuthEvent(req, {
        orgId: org?.id,
        userId: user.id,
        eventType: "login_failed",
        authSource: "local",
        tenantResolved: orgSlug || undefined,
        details: { reason: "Invalid password" },
        success: false,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (credResult.needsRehash) {
      const newHash = await localProvider.rehashPassword(password);
      await storage.updateUser(user.id, { password: newHash });
    }

    const userOrgs = await storage.getUserOrgs(user.id);
    let selectedOrgId: string | undefined;

    if (org) {
      const membership = await storage.getMembership(org.id, user.id);
      if (membership) {
        selectedOrgId = org.id;
      } else {
        await logAuthEvent(req, {
          orgId: org.id,
          userId: user.id,
          eventType: "login_rejected",
          authSource: "local",
          tenantResolved: orgSlug,
          details: { reason: "User is not a member of the requested organization" },
          success: false,
        });
        return res.status(403).json({ error: "You are not a member of this organization" });
      }
    } else if (userOrgs.length > 0) {
      selectedOrgId = userOrgs[0].id;
    }

    if (selectedOrgId) {
      const finalAuthConfig = await storage.getOrgAuthConfig(selectedOrgId);
      if (finalAuthConfig?.authMode === "m365") {
        await logAuthEvent(req, {
          orgId: selectedOrgId,
          userId: user.id,
          eventType: "login_rejected",
          authSource: "local",
          details: { reason: "Organization requires M365 sign-in; local login blocked" },
          success: false,
        });
        return res.status(403).json({ error: "This organization requires Microsoft 365 sign-in. Please use your organization code to sign in." });
      }
      if (finalAuthConfig?.authMode === "hybrid") {
        const mem = await storage.getMembership(selectedOrgId, user.id);
        if (mem && !hasRole(mem.role, "admin")) {
          await logAuthEvent(req, {
            orgId: selectedOrgId,
            userId: user.id,
            eventType: "login_rejected",
            authSource: "local",
            details: { reason: "Hybrid mode: local login restricted to admin/owner", role: mem.role },
            success: false,
          });
          return res.status(403).json({ error: "This organization requires Microsoft 365 sign-in. Local login is available only for administrators." });
        }
      }
    }

    await storage.updateUser(user.id, { lastLoginAt: new Date() });

    req.session.userId = user.id;
    req.session.authSource = "local";
    req.session.orgId = selectedOrgId;

    req.session.save((err) => {
      if (err) {
        console.error("[session.save error] login:", err.message, err.stack);
        return res.status(500).json({ error: "Session error" });
      }
      console.log(`[session] Login session saved: sid=${req.sessionID}, userId=${user.id}, orgId=${req.session.orgId}`);
      logAuthEvent(req, {
        orgId: req.session.orgId,
        userId: user.id,
        eventType: "login_success",
        authSource: "local",
        tenantResolved: orgSlug || undefined,
        success: true,
      });
      res.json({ user: { ...user, password: undefined } });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const DEV_M365_MOCK = process.env.NODE_ENV === "development" && process.env.DEV_M365_MOCK === "true";

router.get("/api/auth/m365/login", resolveTenant, async (req, res) => {
  try {
    return rejectOperatorOsManagedAuth(req, res, "m365_login_rejected", "m365_login");

    const tenantReq = req as ResolvedTenantRequest;
    const org = tenantReq.resolvedOrg;
    const authConfig = tenantReq.resolvedAuthConfig;

    if (!authConfig || authConfig.authMode === "local") {
      return res.status(400).json({ error: "Microsoft 365 login is not enabled for this organization" });
    }

    if (DEV_M365_MOCK) {
      req.session.entraState = "dev-mock-state";
      req.session.entraNonce = "dev-mock-nonce";
      req.session.entraOrgId = org.id;
      return req.session.save((err) => {
        if (err) return res.status(500).json({ error: "Session error" });
        res.json({ redirectUrl: `/api/auth/m365/callback?code=dev-mock-code&state=dev-mock-state` });
      });
    }

    let clientSecret = null;
    if (authConfig.entraClientSecretEncrypted) {
      try {
        clientSecret = decryptSecret(authConfig.entraClientSecretEncrypted);
      } catch {
        return res.status(500).json({ error: "Auth configuration error" });
      }
    }

    const providerConfig: AuthProviderConfig = {
      orgId: org.id,
      authMode: authConfig.authMode,
      entraTenantId: authConfig.entraTenantId,
      entraClientId: authConfig.entraClientId,
      entraClientSecret: clientSecret,
      entraRedirectUri: authConfig.entraRedirectUri,
      entraAllowedDomains: authConfig.entraAllowedDomains,
      entraJitProvisioningEnabled: authConfig.entraJitProvisioningEnabled,
    };

    const provider = getAuthProvider(authConfig.authMode);
    const result = await provider.initiateLogin(req, providerConfig);

    req.session.entraState = result.state;
    req.session.entraNonce = result.nonce;
    req.session.entraOrgId = org.id;

    req.session.save((err) => {
      if (err) return res.status(500).json({ error: "Session error" });
      res.json({ redirectUrl: result.redirectUrl });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/auth/m365/callback", async (req, res) => {
  try {
    return res.redirect(`${getOperatorOsLaunchUrl()}?error=managed_by_operatoros`);

    const orgId = req.session.entraOrgId;
    const savedState = req.session.entraState;

    if (!orgId) {
      return res.redirect("/?error=invalid_session");
    }

    if (DEV_M365_MOCK && req.query.code === "dev-mock-code") {
      const org = await storage.getOrg(orgId);
      if (!org) return res.redirect("/?error=org_not_found");

      const mockEmail = `dev-user@${org.slug}.local`;
      const mockOid = `dev-mock-oid-${org.id}`;
      let user = await storage.getUserByEntraObjectId(mockOid, orgId);
      if (!user) {
        user = await storage.createUser({
          username: `dev-m365-${Date.now()}`,
          password: await hashPassword(crypto.randomBytes(32).toString("hex")),
          fullName: "Dev M365 User",
          phone: "",
          email: mockEmail,
        });
        await storage.updateUser(user.id, { entraObjectId: mockOid, authSource: "m365" });
        await storage.createMembership(org.id, user.id, "staff");
      }
      req.session.userId = user.id;
      req.session.orgId = org.id;
      req.session.authSource = "m365";
      delete req.session.entraState;
      delete req.session.entraNonce;
      delete req.session.entraOrgId;
      await logAuthEvent(req, {
        orgId: org.id,
        userId: user.id,
        eventType: "m365_login_success",
        authSource: "m365",
        details: { mockMode: true },
        success: true,
      });
      return req.session.save((err) => {
        if (err) return res.redirect("/?error=session_error");
        res.redirect("/");
      });
    }

    const savedNonce = req.session.entraNonce;
    const receivedState = req.query.state as string;

    if (!savedState || !receivedState || receivedState !== savedState) {
      await logAuthEvent(req, {
        orgId,
        eventType: "m365_callback_failed",
        authSource: "m365",
        details: { reason: !savedState ? "Missing saved state (session expired)" : !receivedState ? "Missing state parameter" : "State mismatch" },
        success: false,
      });
      return res.redirect("/?error=state_mismatch");
    }

    if (!savedNonce) {
      await logAuthEvent(req, {
        orgId,
        eventType: "m365_callback_failed",
        authSource: "m365",
        details: { reason: "Missing saved nonce (session expired)" },
        success: false,
      });
      return res.redirect("/?error=invalid_session");
    }

    const org = await storage.getOrg(orgId);
    if (!org) {
      return res.redirect("/?error=org_not_found");
    }

    const authConfig = await storage.getOrgAuthConfig(orgId);
    if (!authConfig) {
      return res.redirect("/?error=auth_not_configured");
    }

    let clientSecret = null;
    if (authConfig.entraClientSecretEncrypted) {
      try {
        clientSecret = decryptSecret(authConfig.entraClientSecretEncrypted);
      } catch {
        return res.redirect("/?error=config_error");
      }
    }

    const providerConfig: AuthProviderConfig = {
      orgId: org.id,
      authMode: authConfig.authMode,
      entraTenantId: authConfig.entraTenantId,
      entraClientId: authConfig.entraClientId,
      entraClientSecret: clientSecret,
      entraRedirectUri: authConfig.entraRedirectUri,
      entraAllowedDomains: authConfig.entraAllowedDomains,
      entraJitProvisioningEnabled: authConfig.entraJitProvisioningEnabled,
    };

    const provider = getAuthProvider(authConfig.authMode);
    const result = await provider.handleCallback(req, providerConfig);

    delete req.session.entraState;
    delete req.session.entraNonce;
    delete req.session.entraOrgId;

    if (!result.success) {
      await logAuthEvent(req, {
        orgId,
        eventType: "m365_login_failed",
        authSource: "m365",
        details: { error: result.error },
        success: false,
      });
      console.error("M365 login failed:", result.error);
      return res.redirect("/?error=auth_failed");
    }

    let user = result.entraObjectId
      ? await storage.getUserByEntraObjectId(result.entraObjectId, orgId)
      : null;

    const roleMappings = await storage.getOrgRoleMappings(orgId);
    let mappedRole: string | null = null;
    const matchedGroups: string[] = [];
    const hasMappings = roleMappings.length > 0;

    if (result.groups && hasMappings) {
      let highestLevel = 0;

      for (const mapping of roleMappings) {
        if (result.groups.includes(mapping.entraGroupId)) {
          matchedGroups.push(mapping.entraGroupId);
          const normalizedMappedRole = normalizeRole(mapping.pulsedeskRole);
          const level = normalizedMappedRole ? ROLE_HIERARCHY[normalizedMappedRole] : 0;
          if (level > highestLevel) {
            highestLevel = level;
            mappedRole = normalizedMappedRole;
          }
        }
      }
    }

    if (!hasMappings) {
      mappedRole = "staff";
    }

    if (hasMappings && matchedGroups.length === 0) {
      await logAuthEvent(req, {
        orgId,
        eventType: "m365_login_denied",
        authSource: "m365",
        details: {
          reason: "User groups do not match any configured role mappings",
          entraObjectId: result.entraObjectId,
          userGroups: result.groups,
        },
        success: false,
      });
      return res.redirect("/?error=no_matching_role");
    }

    if (user) {
      await storage.updateUser(user.id, {
        fullName: result.displayName || user.fullName,
        email: result.email || user.email,
        entraUPN: result.upn || user.entraUPN,
        entraDepartment: result.department || user.entraDepartment,
        entraJobTitle: result.jobTitle || user.entraJobTitle,
        lastLoginAt: new Date(),
      });

      const membership = await storage.getMembership(orgId, user.id);
      if (membership) {
        await storage.updateMembershipRole(orgId, user.id, mappedRole!);
      }
    } else if (authConfig.entraJitProvisioningEnabled) {
      const username = (result.upn || result.email || result.entraObjectId || "").split("@")[0].toLowerCase().replace(/[^a-z0-9_.-]/g, "");
      if (!username) {
        await logAuthEvent(req, {
          orgId,
          eventType: "jit_provision_failed",
          authSource: "m365",
          details: { reason: "Could not determine username", entraObjectId: result.entraObjectId },
          success: false,
        });
        return res.redirect("/?error=provisioning_failed");
      }

      const existingByUsername = await storage.getUserByUsername(username);
      const finalUsername = existingByUsername ? `${username}_${Date.now()}` : username;

      user = await storage.createUser({
        username: finalUsername,
        password: await hashPassword(crypto.randomBytes(32).toString("hex")),
        fullName: result.displayName || finalUsername,
        phone: "",
        email: result.email || "",
      });

      await storage.updateUser(user.id, {
        authSource: "m365",
        entraObjectId: result.entraObjectId || null,
        entraUPN: result.upn || null,
        entraDepartment: result.department || null,
        entraJobTitle: result.jobTitle || null,
        lastLoginAt: new Date(),
      });

      await storage.createMembership(orgId, user.id, mappedRole ?? "staff");

      await logAuthEvent(req, {
        orgId,
        userId: user.id,
        eventType: "jit_provisioned",
        authSource: "m365",
        details: {
          entraObjectId: result.entraObjectId,
          mappedRole,
          matchedGroups,
          username: finalUsername,
        },
        success: true,
      });
    } else {
      await logAuthEvent(req, {
        orgId,
        eventType: "m365_login_denied",
        authSource: "m365",
        details: {
          reason: "JIT provisioning disabled and user not found",
          entraObjectId: result.entraObjectId,
        },
        success: false,
      });
      return res.redirect("/?error=user_not_provisioned");
    }

    req.session.userId = user.id;
    req.session.orgId = orgId;
    req.session.authSource = "m365";
    req.session.entraTenantId = result.entraTenantId || undefined;

    req.session.save((err) => {
      if (err) {
        console.error("Session save error after M365 callback:", err);
        return res.redirect("/?error=session_error");
      }
      logAuthEvent(req, {
        orgId,
        userId: user!.id,
        eventType: "m365_login_success",
        authSource: "m365",
        details: {
          entraObjectId: result.entraObjectId,
          mappedRole,
          matchedGroups,
        },
        success: true,
      });
      res.redirect("/");
    });
  } catch (err: any) {
    console.error("M365 callback error:", err);
    res.redirect("/?error=callback_error");
  }
});

router.post("/api/auth/logout", (req, res) => {
  const orgId = req.session.orgId;
  const userId = req.session.userId;
  const authSource = req.session.authSource;
  req.session.destroy(() => {
    if (userId) {
      logAuthEvent(req, { orgId, userId, eventType: "logout", authSource, success: true });
    }
    res.json({ ok: true });
  });
});

router.delete("/api/auth/delete-account", requireAuth, async (req, res) => {
  try {
    return res.status(410).json({
      code: "managed_by_operatoros",
      managedBy: "operatoros",
      action: "delete_account",
      launchUrl: getOperatorOsLaunchUrl(),
      error: "Account lifecycle is managed by OperatorOS.",
    });

    const userId = req.session.userId!;
    await storage.deleteUser(userId);
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to delete account" });
  }
});

router.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const userOrgs = await storage.getUserOrgs(user.id);

    let org = null;
    let membership = null;

    if (req.session.orgId) {
      org = await storage.getOrg(req.session.orgId);
      membership = await storage.getMembership(req.session.orgId, user.id);
    }

    if (!org && userOrgs.length > 0) {
      org = userOrgs[0];
      req.session.orgId = org.id;
      membership = await storage.getMembership(org.id, user.id);
    }

    let orgCounts = null;
    if (org) {
      try {
        orgCounts = await storage.getOrgCounts(org.id);
      } catch {
        orgCounts = { tickets: 0, departments: 0, assets: 0, members: 0 };
      }
    }

    let authConfig = null;
    if (org) {
      const config = await storage.getOrgAuthConfig(org.id);
      if (config) {
        authConfig = { authMode: config.authMode };
      }
    }

    res.json({
      user: { ...user, password: undefined },
      org,
      membership,
      orgs: userOrgs,
      orgCounts,
      authConfig,
      authSource: req.session.authSource || "local",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/auth/switch-org", requireAuth, async (req, res) => {
  try {
    const { orgId } = req.body;
    const membership = await storage.getMembership(orgId, req.session.userId!);
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this organization", code: "INSUFFICIENT_ROLE" });
    }

    const targetAuthConfig = await storage.getOrgAuthConfig(orgId);
    const sessionAuthSource = req.session.authSource || "local";

    if (targetAuthConfig?.authMode === "m365" && sessionAuthSource === "local") {
      return res.status(403).json({ error: "This organization requires Microsoft 365 sign-in. Please sign in via M365 to access it." });
    }

    if (targetAuthConfig?.authMode === "hybrid" && sessionAuthSource === "local") {
      if (!hasRole(membership.role, "admin")) {
        return res.status(403).json({
          error: "This organization requires Microsoft 365 sign-in. Local login is available only for administrators.",
          code: "INSUFFICIENT_ROLE",
        });
      }
    }

    req.session.orgId = orgId;
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/auth/profile", requireAuth, async (req, res) => {
  try {
    const { fullName, phone, email } = req.body;
    if (!fullName?.trim()) {
      return res.status(400).json({ error: "Full name is required" });
    }
    const user = await storage.updateUser(req.session.userId!, {
      fullName: fullName.trim(),
      phone: phone?.trim() || "",
      email: email?.trim() || "",
    });
    res.json({ ...user, password: undefined });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/auth/change-password", requireAuth, async (req, res) => {
  try {
    return res.status(410).json({
      code: "managed_by_operatoros",
      managedBy: "operatoros",
      action: "change_password",
      launchUrl: getOperatorOsLaunchUrl(),
      error: "Password management is handled by OperatorOS.",
    });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.authSource === "m365") {
      return res.status(400).json({ error: "Password changes are not available for Microsoft 365 accounts" });
    }
    const valid = await verifyPassword(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });
    const newHash = await hashPassword(newPassword);
    await storage.updateUser(user.id, { password: newHash });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/members", requireAuth, requireOrg, async (req, res) => {
  try {
    const mems = await storage.getOrgMemberships(req.session.orgId!);
    const result = [];
    for (const m of mems) {
      const u = await storage.getUser(m.userId);
      if (u) {
        result.push({
          ...m,
          fullName: u.fullName,
          username: u.username,
          email: u.email,
          authSource: u.authSource || "local",
        });
      }
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/auth/config", requireAuth, requireOrg, requireMinRole("admin"), async (req, res) => {
  try {
    const orgId = req.session.orgId!;
    const config = await storage.getOrgAuthConfig(orgId);
    if (!config) {
      return res.json({
        authMode: "local",
        entraTenantId: null,
        entraTenantDomain: null,
        entraClientId: null,
        hasClientSecret: false,
        entraRedirectUri: null,
        entraPostLogoutRedirectUri: null,
        entraAllowedDomains: [],
        entraJitProvisioningEnabled: true,
        entraRequireAdminConsent: false,
        entraLastTestStatus: null,
        entraLastTestedAt: null,
        graphEnabled: false,
        graphScopes: [],
        graphSyncInterval: null,
      });
    }

    res.json({
      authMode: config.authMode,
      entraTenantId: config.entraTenantId,
      entraTenantDomain: config.entraTenantDomain,
      entraClientId: config.entraClientId,
      hasClientSecret: !!config.entraClientSecretEncrypted,
      entraRedirectUri: config.entraRedirectUri,
      entraPostLogoutRedirectUri: config.entraPostLogoutRedirectUri,
      entraAllowedDomains: config.entraAllowedDomains || [],
      entraJitProvisioningEnabled: config.entraJitProvisioningEnabled,
      entraRequireAdminConsent: config.entraRequireAdminConsent,
      entraLastTestStatus: config.entraLastTestStatus,
      entraLastTestedAt: config.entraLastTestedAt,
      graphEnabled: config.graphEnabled,
      graphScopes: config.graphScopes || [],
      graphSyncInterval: config.graphSyncInterval,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/api/auth/config", requireAuth, requireOrg, requireMinRole("admin"), async (req, res) => {
  try {
    const orgId = req.session.orgId!;
    const parsed = authConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid configuration", details: parsed.error.flatten().fieldErrors });
    }
    const body = parsed.data;

    if (body.authMode === "m365" || body.authMode === "hybrid") {
      const snapshot = await getCurrentEntitlementSnapshotForRequest(req, {
        refreshIfMissing: true,
        refreshIfStale: true,
      });
      if (!snapshotAllowsFeature(snapshot, "entraEnabled")) {
        return res.status(403).json({
          error: "Microsoft 365/Entra login is not enabled by the current OperatorOS entitlement.",
          code: "MODULE_ACCESS_REVOKED",
        });
      }
    }

    if (body.authMode === "m365" || body.authMode === "hybrid") {
      const existingConfig = await storage.getOrgAuthConfig(orgId);
      const hasExistingSecret = existingConfig?.entraClientSecretEncrypted;
      const hasNewSecret = body.entraClientSecret && body.entraClientSecret !== "***";
      const missingFields: string[] = [];
      if (!body.entraTenantId) missingFields.push("Tenant ID");
      if (!body.entraClientId) missingFields.push("Client ID");
      if (!body.entraRedirectUri) missingFields.push("Redirect URI");
      if (!hasExistingSecret && !hasNewSecret) missingFields.push("Client Secret");
      if (missingFields.length > 0) {
        return res.status(400).json({
          error: `The following fields are required for ${body.authMode === "m365" ? "M365" : "hybrid"} mode: ${missingFields.join(", ")}`,
        });
      }
    }

    const updateData: Partial<InsertOrgAuthConfig> & { entraClientSecretEncrypted?: string } = {
      authMode: body.authMode,
      entraTenantId: body.entraTenantId || null,
      entraTenantDomain: body.entraTenantDomain || null,
      entraClientId: body.entraClientId || null,
      entraRedirectUri: body.entraRedirectUri || null,
      entraPostLogoutRedirectUri: body.entraPostLogoutRedirectUri || null,
      entraAllowedDomains: body.entraAllowedDomains || [],
      entraJitProvisioningEnabled: body.entraJitProvisioningEnabled,
      entraRequireAdminConsent: body.entraRequireAdminConsent,
    };

    if (body.entraClientSecret && body.entraClientSecret !== "***") {
      updateData.entraClientSecretEncrypted = encryptSecret(body.entraClientSecret);
    }

    const config = await storage.upsertOrgAuthConfig(orgId, updateData);

    await logAuthEvent(req, {
      orgId,
      userId: req.session.userId,
      eventType: "auth_config_updated",
      authSource: "local",
      details: { authMode: updateData.authMode },
      success: true,
    });

    res.json({
      authMode: config.authMode,
      entraTenantId: config.entraTenantId,
      entraTenantDomain: config.entraTenantDomain,
      entraClientId: config.entraClientId,
      hasClientSecret: !!config.entraClientSecretEncrypted,
      entraRedirectUri: config.entraRedirectUri,
      entraPostLogoutRedirectUri: config.entraPostLogoutRedirectUri,
      entraAllowedDomains: config.entraAllowedDomains || [],
      entraJitProvisioningEnabled: config.entraJitProvisioningEnabled,
      entraRequireAdminConsent: config.entraRequireAdminConsent,
      entraLastTestStatus: config.entraLastTestStatus,
      entraLastTestedAt: config.entraLastTestedAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/auth/config/test", requireAuth, requireOrg, requireMinRole("admin"), async (req, res) => {
  try {
    const orgId = req.session.orgId!;
    const config = await storage.getOrgAuthConfig(orgId);

    if (!config || config.authMode === "local") {
      return res.status(400).json({ error: "Microsoft 365 is not configured" });
    }

    const issues: string[] = [];
    if (!config.entraTenantId) issues.push("Entra Tenant ID is required");
    if (!config.entraClientId) issues.push("Client ID is required");
    if (!config.entraClientSecretEncrypted) issues.push("Client Secret is required");
    if (!config.entraRedirectUri) issues.push("Redirect URI is required");

    if (issues.length > 0) {
      await storage.upsertOrgAuthConfig(orgId, {
        entraLastTestStatus: "failed",
        entraLastTestedAt: new Date(),
      });
      return res.json({ success: false, issues });
    }

    try {
      const oidcUrl = `https://login.microsoftonline.com/${config.entraTenantId}/v2.0/.well-known/openid-configuration`;
      const oidcResponse = await fetch(oidcUrl);
      if (!oidcResponse.ok) {
        issues.push("Could not reach Microsoft Entra OIDC discovery endpoint. Check Tenant ID.");
      }
    } catch {
      issues.push("Network error reaching Microsoft Entra. Check Tenant ID.");
    }

    const status = issues.length === 0 ? "passed" : "failed";
    await storage.upsertOrgAuthConfig(orgId, {
      entraLastTestStatus: status,
      entraLastTestedAt: new Date(),
    });

    await logAuthEvent(req, {
      orgId,
      userId: req.session.userId,
      eventType: "auth_config_test",
      details: { status, issues },
      success: issues.length === 0,
    });

    res.json({ success: issues.length === 0, issues, status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/auth/role-mappings", requireAuth, requireOrg, requireMinRole("admin"), async (req, res) => {
  try {
    const mappings = await storage.getOrgRoleMappings(req.session.orgId!);
    res.json(mappings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/auth/role-mappings", requireAuth, requireOrg, requireMinRole("admin"), async (req, res) => {
  try {
    const parsed = roleMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid role mapping", details: parsed.error.flatten().fieldErrors });
    }
    const { entraGroupId, pulsedeskRole, displayLabel } = parsed.data;
    const mapping = await storage.createOrgRoleMapping(
      req.session.orgId!,
      entraGroupId,
      pulsedeskRole,
      displayLabel?.trim() || undefined,
    );

    await logAuthEvent(req, {
      orgId: req.session.orgId,
      userId: req.session.userId,
      eventType: "role_mapping_created",
      details: { entraGroupId: entraGroupId.trim(), pulsedeskRole, displayLabel },
      success: true,
    });

    res.json(mapping);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/auth/role-mappings/:id", requireAuth, requireOrg, requireMinRole("admin"), async (req, res) => {
  try {
    await storage.deleteOrgRoleMapping(req.session.orgId!, (req.params.id as string));

    await logAuthEvent(req, {
      orgId: req.session.orgId,
      userId: req.session.userId,
      eventType: "role_mapping_deleted",
      details: { mappingId: (req.params.id as string) },
      success: true,
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/auth/audit-log", requireAuth, requireOrg, requireMinRole("admin"), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await storage.getAuthAuditLog(req.session.orgId!, Math.min(limit, 200));
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
