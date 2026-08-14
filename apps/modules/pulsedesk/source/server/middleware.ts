import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import crypto from "crypto";
import type { Org, OrgAuthConfig } from "@shared/schema";
import {
  getCurrentEntitlementSnapshotForRequest,
  isSnapshotActive,
  snapshotAllowsFeature,
} from "./services/operatorosEntitlements";
import {
  hasRole as hasCanonicalRole,
  normalizeRole,
  type CanonicalRole,
} from "@shared/roles";

export interface ResolvedTenantRequest extends Request {
  resolvedOrg: Org;
  resolvedAuthConfig: OrgAuthConfig | { authMode: "local" };
}

export const BCRYPT_ROUNDS = 12;

function isLegacyHash(hash: string): boolean {
  return /^[0-9a-f]{64}$/.test(hash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (isLegacyHash(storedHash)) {
    const sha256 = crypto.createHash("sha256").update(password).digest("hex");
    return sha256 === storedHash;
  }
  return bcrypt.compare(password, storedHash);
}

function codedError(res: Response, status: number, error: string, code: string, details?: Record<string, unknown>) {
  return res.status(status).json({ error, code, ...(details ?? {}) });
}

function destroyOperatorOsSession(req: Request, res: Response, reason: string) {
  return req.session.destroy(() => {
    res.status(403).json({
      error: "OperatorOS module access has been revoked",
      code: "MODULE_ACCESS_REVOKED",
      reason,
    });
  });
}

function requireOperatorOsSession(req: Request, res: Response): boolean {
  if (req.session.authSource === "operatoros") return true;
  res.status(401).json({
    error: "PulseDesk access is managed by OperatorOS SSO. Launch PulseDesk from OperatorOS.",
    code: "OPERATOROS_SSO_REQUIRED",
  });
  return false;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized", code: "SESSION_EXPIRED" });
  }
  if (!requireOperatorOsSession(req, res)) return;
  if (req.session.authSource === "operatoros") {
    const snapshot = await getCurrentEntitlementSnapshotForRequest(req, {
      refreshIfMissing: true,
    });
    if (!isSnapshotActive(snapshot)) {
      const user = await storage.getUser(req.session.userId);
      if (!user?.isSuperAdmin) {
        return destroyOperatorOsSession(
          req,
          res,
          snapshot ? "OPERATOROS_ENTITLEMENT_REVOKED" : "OPERATOROS_ENTITLEMENT_MISSING"
        );
      }
    }
  }
  next();
}

export function requireOrg(req: Request, res: Response, next: NextFunction) {
  if (!req.session.orgId) {
    return codedError(res, 400, "No organization selected", "NO_ORG_SELECTED");
  }
  next();
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized", code: "SESSION_EXPIRED" });
  }
  if (!requireOperatorOsSession(req, res)) return;
  if (req.session.authSource === "operatoros") {
    const snapshot = await getCurrentEntitlementSnapshotForRequest(req, {
      refreshIfMissing: true,
      refreshIfStale: true,
    });
    if (!isSnapshotActive(snapshot)) {
      return destroyOperatorOsSession(req, res, "OPERATOROS_ENTITLEMENT_REQUIRED");
    }
  }
  const user = await storage.getUser(req.session.userId);
  if (!user?.isSuperAdmin) {
    return codedError(res, 403, "Forbidden: Super admin access required", "INSUFFICIENT_ROLE");
  }
  next();
}

export function requireRole(...allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Unauthorized", code: "SESSION_EXPIRED" });
    }
    if (!req.session.orgId) {
      return codedError(res, 400, "No organization selected", "NO_ORG_SELECTED");
    }
    const membership = await storage.getMembership(req.session.orgId, req.session.userId);
    if (!membership) {
      return codedError(res, 403, "Not a member of this organization", "INSUFFICIENT_ROLE");
    }
    const membershipRole = normalizeRole(membership.role);
    const allowed = new Set(
      allowedRoles
        .map((role) => normalizeRole(role))
        .filter((role): role is CanonicalRole => role !== null)
    );
    if (!membershipRole || (membershipRole !== "owner" && !allowed.has(membershipRole))) {
      return codedError(res, 403, "Insufficient permissions", "INSUFFICIENT_ROLE");
    }
    next();
  };
}

export async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  const routeSlug = req.params.slug;
  const queryOrg = req.query.org;
  const orgQueryParam = typeof queryOrg === "string"
    ? queryOrg
    : Array.isArray(queryOrg) && typeof queryOrg[0] === "string"
      ? queryOrg[0]
      : undefined;
  const slug = (Array.isArray(routeSlug) ? routeSlug[0] : routeSlug) || orgQueryParam;

  let org: any = null;

  if (slug) {
    org = await storage.getOrgBySlug(slug);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
  } else if (req.session?.orgId) {
    org = await storage.getOrg(req.session.orgId);
  } else {
    const host = req.hostname;
    const subdomain = host.split(".")[0];
    if (subdomain && subdomain !== "www" && subdomain !== "localhost") {
      org = await storage.getOrgBySlug(subdomain);
    }
  }

  if (!org) {
    return res.status(400).json({ error: "Organization identifier required. Provide org slug, sign in first, or use a subdomain." });
  }

  const authConfig = await storage.getOrgAuthConfig(org.id);

  (req as ResolvedTenantRequest).resolvedOrg = org;
  (req as ResolvedTenantRequest).resolvedAuthConfig = authConfig || { authMode: "local" };
  next();
}

export function requireFeature(feature: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.orgId) {
      return codedError(res, 400, "No organization selected", "NO_ORG_SELECTED");
    }

    const snapshot = await getCurrentEntitlementSnapshotForRequest(req, {
      refreshIfMissing: true,
      refreshIfStale: true,
    });
    if (snapshotAllowsFeature(snapshot, feature)) {
      return next();
    }

    return res.status(403).json({
      error: "OperatorOS entitlement does not allow this feature",
      code: "MODULE_ACCESS_REVOKED",
      feature,
    });
  };
}

export async function getCurrentEntitlementSnapshot(req: Request) {
  return getCurrentEntitlementSnapshotForRequest(req, {
    refreshIfMissing: true,
    refreshIfStale: true,
  });
}

export function requireOperatorOsModuleAccess(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    const snapshot = await getCurrentEntitlementSnapshotForRequest(req, {
      refreshIfMissing: true,
      refreshIfStale: true,
    });
    if (isSnapshotActive(snapshot)) return next();
    return destroyOperatorOsSession(req, res, "OPERATOROS_ENTITLEMENT_REQUIRED");
  })().catch(next);
}

const MODULE_ROLE_HIERARCHY: Record<string, number> = {
  none: 0,
  viewer: 10,
  module_user: 50,
  module_admin: 100,
};

export function requireOperatorOsModuleRole(requiredRole: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const snapshot = await getCurrentEntitlementSnapshotForRequest(req, {
        refreshIfMissing: true,
        refreshIfStale: true,
      });
      if (!isSnapshotActive(snapshot)) {
        return destroyOperatorOsSession(req, res, "OPERATOROS_ENTITLEMENT_REQUIRED");
      }

      const actualLevel = MODULE_ROLE_HIERARCHY[snapshot.moduleRole] ?? 0;
      const requiredLevel = MODULE_ROLE_HIERARCHY[requiredRole] ?? MODULE_ROLE_HIERARCHY.module_admin;
      if (actualLevel < requiredLevel) {
        return codedError(res, 403, "OperatorOS module role is insufficient", "INSUFFICIENT_ROLE", {
          requiredRole,
        });
      }
      return next();
    })().catch(next);
  };
}

export function requireMinRole(minRole: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Unauthorized", code: "SESSION_EXPIRED" });
    }
    if (!req.session.orgId) {
      return codedError(res, 400, "No organization selected", "NO_ORG_SELECTED");
    }
    const membership = await storage.getMembership(req.session.orgId, req.session.userId);
    if (!membership) {
      return codedError(res, 403, "Not a member of this organization", "INSUFFICIENT_ROLE");
    }
    const requiredRole = normalizeRole(minRole);
    if (!requiredRole || !hasCanonicalRole(membership.role, requiredRole)) {
      return codedError(res, 403, "Insufficient permissions", "INSUFFICIENT_ROLE");
    }
    next();
  };
}
