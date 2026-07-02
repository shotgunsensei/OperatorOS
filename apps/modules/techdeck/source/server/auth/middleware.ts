import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getUser } from "./authService";
import { sendAuthError } from "./errorPage";
import { parseSnapshot } from "./entitlements";

declare global {
  namespace Express {
    interface Request {
      user?: {
        claims: { sub: string };
        profile: Record<string, unknown>;
      };
    }
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
    mfaPending: boolean;
    pendingMfaSecret: string;
  }
}

function hasOperatorOsAccess(user: Awaited<ReturnType<typeof getUser>>): boolean {
  if (!user) return false;
  if (user.revokedAt) return false;
  const snapshot = parseSnapshot(user.entitlementSnapshotJson);
  const operatorOsManaged = !!(user.operatorosUserId || user.ssoSubject || user.operatorosTenantId);
  if (operatorOsManaged && !snapshot) return false;
  if (snapshot && snapshot.enabled === false) return false;
  return true;
}

function destroySession(req: Request): void {
  req.session?.destroy(() => {});
}

export const hydrateUser: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  if (req.session?.userId && !req.session.mfaPending && !req.user) {
    const user = await getUser(req.session.userId);
    if (user && hasOperatorOsAccess(user)) {
      req.user = { claims: { sub: user.id }, profile: user as unknown as Record<string, unknown> };
    } else if (user) {
      destroySession(req);
    }
  }
  next();
};

export const isAuthenticated: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.session?.userId) {
    return sendAuthError(req, res, 401, "not_authenticated", "Unauthorized");
  }

  if (req.session.mfaPending) {
    return sendAuthError(req, res, 401, "mfa_session_missing", "MFA verification required");
  }

  if (!req.user) {
    const user = await getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return sendAuthError(req, res, 401, "not_authenticated", "Unauthorized");
    }
    if (!hasOperatorOsAccess(user)) {
      req.session.destroy(() => {});
      return sendAuthError(
        req,
        res,
        403,
        "module_access_denied",
        "Access to Tech Deck is managed by OperatorOS",
      );
    }
    req.user = { claims: { sub: user.id }, profile: user as unknown as Record<string, unknown> };
  }

  next();
};
