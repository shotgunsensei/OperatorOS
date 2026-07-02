import { createHash, randomBytes } from "crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { storage } from "../storage";
import { checkTenantFeatureAccess } from "./billing/enforcePlan";

export interface ApiAuthContext {
  tenantId: string;
  tokenId: string;
  scopes: string[];
}

declare global {
  namespace Express {
    interface Request {
      apiAuth?: ApiAuthContext;
    }
  }
}

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateToken(): string {
  return `snv_${randomBytes(32).toString("hex")}`;
}

export function requireApiAuth(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Authorization header. Use: Bearer <token>" });
    }

    const plaintext = authHeader.slice(7).trim();
    if (!plaintext) {
      return res.status(401).json({ error: "Empty token" });
    }

    const tokenHash = hashToken(plaintext);
    const result = await storage.validateApiToken(tokenHash);

    if (!result) {
      return res.status(401).json({ error: "Invalid or disabled API token" });
    }

    req.apiAuth = {
      tenantId: result.tenantId,
      tokenId: result.tokenId,
      scopes: result.scopes,
    };

    const access = await checkTenantFeatureAccess(result.tenantId, "api");
    if (!access.ok) {
      return res.status(access.status).json({
        error: access.error,
        message: access.message,
        accessLevel: access.accessLevel,
        subscriptionStatus: access.subscriptionStatus,
      });
    }

    storage.updateApiTokenLastUsed(result.tokenId).catch(() => {});

    next();
  };
}

export function requireScopes(...required: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiAuth) {
      return res.status(401).json({ error: "API authentication required" });
    }

    const missing = required.filter((s) => !req.apiAuth!.scopes.includes(s));
    if (missing.length > 0) {
      return res.status(403).json({ error: `Missing required scopes: ${missing.join(", ")}` });
    }

    next();
  };
}
