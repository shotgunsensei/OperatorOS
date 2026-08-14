import rateLimit, { type Options } from "express-rate-limit";
import type { Request, Response } from "express";
import { storage } from "../storage";

function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    ""
  );
}

async function logRateLimitBlock(
  req: Request,
  scope: string,
): Promise<void> {
  try {
    await storage.createAuthAuditLog({
      orgId: null,
      userId: null,
      eventType: "rate_limit_blocked",
      authSource: scope,
      tenantResolved: null,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] || null,
      details: { path: req.originalUrl, method: req.method, scope },
      success: false,
    });
  } catch (err: any) {
    console.error("[rate-limit] audit log write failed:", err?.message);
  }
}

function makeLimiter(scope: string, opts: Partial<Options>) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...opts,
    handler: (req: Request, res: Response, _next, options) => {
      void logRateLimitBlock(req, scope);
      const retryAfterSec = Math.ceil(options.windowMs / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(options.statusCode).json({ error: "rate_limited" });
    },
  });
}

export const loginRateLimiter = makeLimiter("auth_login", {
  windowMs: 60 * 1000,
  max: 10,
});

export const registerRateLimiter = makeLimiter("auth_register", {
  windowMs: 60 * 1000,
  max: 20,
});

export const ssoRateLimiter = makeLimiter("operatoros_sso", {
  windowMs: 60 * 1000,
  max: 30,
});
