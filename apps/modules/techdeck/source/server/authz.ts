import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

export interface TenantContext {
  userId: string;
  tenantId: string;
  role: "OWNER" | "ADMIN" | "TECH" | "CLIENT";
}

const ROLE_HIERARCHY: Record<string, number> = {
  OWNER: 4,
  ADMIN: 3,
  TECH: 2,
  CLIENT: 1,
};

function getUserId(req: any): string | undefined {
  return req.user?.claims?.sub;
}

export function requireUser() {
  return (req: any, res: Response, next: NextFunction) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    req.userId = userId;
    next();
  };
}

export function requireTenant() {
  return async (req: any, res: Response, next: NextFunction) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const membership = await storage.getUserMembership(userId);
    if (!membership) {
      return res.status(403).json({ message: "No tenant membership found" });
    }

    req.tenantCtx = {
      userId,
      tenantId: membership.tenant.id,
      role: membership.role as TenantContext["role"],
    };
    next();
  };
}

export function requireRole(...minRoles: Array<"OWNER" | "ADMIN" | "TECH" | "CLIENT">) {
  return async (req: any, res: Response, next: NextFunction) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const membership = await storage.getUserMembership(userId);
    if (!membership) {
      return res.status(403).json({ message: "No tenant membership found" });
    }

    const ctx: TenantContext = {
      userId,
      tenantId: membership.tenant.id,
      role: membership.role as TenantContext["role"],
    };

    if (!minRoles.includes(ctx.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    req.tenantCtx = ctx;
    next();
  };
}

export function requireClientAccess(paramName = "id") {
  return async (req: any, res: Response, next: NextFunction) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const membership = await storage.getUserMembership(userId);
    if (!membership) {
      return res.status(403).json({ message: "No tenant membership found" });
    }

    const ctx: TenantContext = {
      userId,
      tenantId: membership.tenant.id,
      role: membership.role as TenantContext["role"],
    };

    req.tenantCtx = ctx;

    if (ctx.role === "CLIENT") {
      const clientId = req.params[paramName] || req.body?.clientId || req.query?.clientId;
      if (clientId) {
        const allowedIds = await storage.getClientIdsForUser(userId);
        if (!allowedIds.includes(clientId)) {
          return res.status(403).json({ message: "Access denied to this client" });
        }
      }
    }

    next();
  };
}
