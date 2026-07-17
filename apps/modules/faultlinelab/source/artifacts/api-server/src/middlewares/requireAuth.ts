import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureUserRow } from "../lib/userSync";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../lib/sessionCookie";

// Test-only auth bypass for the scripted Stripe purchase E2E
// (`scripts/src/test-stripe-flow.ts`). DISABLED in production deployments
// AND disabled unless explicitly opted in via `ENABLE_E2E_AUTH_BYPASS=1`.
// To opt in, the caller must satisfy ALL of:
//   1. Run in a non-production workspace (REPLIT_DEPLOYMENT !== "1").
//   2. Server has both `ENABLE_E2E_AUTH_BYPASS=1` and `E2E_AUTH_TOKEN` set.
//   3. Send the matching token in the `x-e2e-test-token` header.
//   4. Send the desired clerk id in the `x-e2e-clerk-id` header.
// Using a dedicated env var (rather than reusing SESSION_SECRET) keeps the
// bypass off by default even in dev workspaces.
function tryE2ETestBypass(req: Request): string | null {
  if (process.env.REPLIT_DEPLOYMENT === "1") return null;
  if (process.env.ENABLE_E2E_AUTH_BYPASS !== "1") return null;
  const expected = process.env.E2E_AUTH_TOKEN;
  if (!expected) return null;
  const provided = req.headers["x-e2e-test-token"];
  if (typeof provided !== "string" || provided !== expected) return null;
  const clerkId = req.headers["x-e2e-clerk-id"];
  if (typeof clerkId !== "string" || !clerkId) return null;
  return clerkId;
}

/**
 * Resolve the local app User for this request, supporting both auth modes:
 *   1. OperatorOS SSO session cookie (HMAC-signed, set by /sso).
 *   2. Clerk session (cookie or header, processed by clerkMiddleware).
 *
 * The cookie path is checked first because OperatorOS users may not have
 * Clerk credentials at all. Returns `null` when no valid session is present.
 */
async function resolveUser(req: Request): Promise<User | null> {
  const bypassClerkId = tryE2ETestBypass(req);
  if (bypassClerkId) {
    return await ensureUserRow(bypassClerkId);
  }

  const cookieToken = (req as any).cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (cookieToken) {
    const payload = verifySessionToken(cookieToken);
    if (payload) {
      const rows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, payload.uid))
        .limit(1);
      if (rows.length > 0) return rows[0];
      // Stale cookie pointing at a deleted user: fall through (no session).
    }
  }

  const auth = getAuth(req);
  const clerkId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
  if (clerkId) {
    return await ensureUserRow(clerkId);
  }

  return null;
}

function isAccessDenied(user: User): boolean {
  if (user.localRole === "deny") return true;
  const snap = user.entitlementSnapshotJson as
    | { moduleEnabled?: boolean; accessLevel?: string }
    | null
    | undefined;
  if (!snap) return false;
  if (snap.moduleEnabled === false) return true;
  if (snap.accessLevel === "denied") return true;
  return false;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await resolveUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (isAccessDenied(user)) {
      res.status(403).json({
        error: "Access denied",
        code: "access_denied",
        reason:
          user.entitlementSnapshotJson?.accessLevel === "denied"
            ? "access_revoked"
            : "module_disabled",
      });
      return;
    }
    (req as any).appUser = user;
    (req as any).userId = user.id;
    next();
  } catch (err) {
    req.log?.error({ err }, "requireAuth resolve failed");
    res.status(500).json({ error: "Auth resolve failed" });
  }
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await resolveUser(req);
    if (user) {
      (req as any).appUser = user;
      (req as any).userId = user.id;
    } else {
      (req as any).appUser = null;
      (req as any).userId = null;
    }
    next();
  } catch (err) {
    req.log?.error({ err }, "optionalAuth resolve failed");
    (req as any).appUser = null;
    (req as any).userId = null;
    next();
  }
}
