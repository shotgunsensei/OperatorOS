import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import {
  mergeUserRows,
  resolveClerkUserFromRequest,
} from "../lib/userSync";
import type { User } from "@workspace/db";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { clearSessionCookie } from "../lib/sessionCookie";

const router: IRouter = Router();

type LinkedIdentitiesResponse = {
  primaryUserId: string;
  clerk: { linked: boolean; clerkId: string | null };
  operatoros: {
    linked: boolean;
    operatorIdentityId: string | null;
    planSlug: string | null;
    organizationId: string | null;
    role: string | null;
  };
};

function describeIdentities(user: User): LinkedIdentitiesResponse {
  return {
    primaryUserId: user.id,
    clerk: { linked: !!user.clerkId, clerkId: user.clerkId ?? null },
    operatoros: {
      linked: !!user.operatorIdentityId,
      operatorIdentityId: user.operatorIdentityId ?? null,
      planSlug: user.operatorPlanSlug ?? null,
      organizationId: user.operatorOrganizationId ?? null,
      role: user.operatorRole ?? null,
    },
  };
}

router.get("/account/identities", requireAuth, (req, res) => {
  const user = (req as any).appUser as User;
  return res.json(describeIdentities(user));
});

/**
 * Link the OTHER auth identity present on this request into the currently
 * signed-in account. The "current" account is whichever side `requireAuth`
 * chose (cookie wins over Clerk header). The "other" side is read by
 * inspecting the Clerk session header directly. If the two resolve to
 * different rows we merge `other` INTO `current`.
 *
 * Only Clerk-side linking is supported here because the SSO landing endpoint
 * (`/sso`) handles the inverse direction: when an OperatorOS launch arrives
 * while a Clerk session is already present, that flow links the OperatorOS
 * identity into the Clerk row.
 */
router.post("/account/link", requireAuth, async (req, res) => {
  try {
    const current = (req as any).appUser as User;

    const clerkUser = await resolveClerkUserFromRequest(req);
    if (!clerkUser) {
      return res.status(400).json({
        error: "no_clerk_session",
        message:
          "Sign in with Clerk in this browser tab before linking the account.",
      });
    }

    if (clerkUser.id === current.id) {
      // Already the same row — Clerk session belongs to the active account.
      return res.json({
        success: true,
        alreadyLinked: true,
        identities: describeIdentities(current),
      });
    }

    if (current.clerkId && current.clerkId !== clerkUser.clerkId) {
      return res.status(409).json({
        error: "clerk_already_linked",
        message:
          "This account is already linked to a different Clerk login. Unlink it first.",
      });
    }

    const merged = await mergeUserRows(current, clerkUser);
    return res.json({
      success: true,
      alreadyLinked: false,
      identities: describeIdentities(merged),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to link account");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Remove one of the two identity bindings from the current account row.
 *
 * Safety rules:
 *   - You can never unlink the identity you're currently authenticated with
 *     on this request (would lock you out instantly).
 *   - You can never unlink the only remaining identity (would orphan the
 *     row from any sign-in path).
 *   - Profile, entitlements, and purchases are NOT touched — only the
 *     identity column on `users` is nulled. The other identity remains
 *     bound and can still reach this data.
 */
router.post("/account/unlink", requireAuth, async (req, res) => {
  try {
    const current = (req as any).appUser as User;
    const identity = req.body?.identity as string | undefined;
    if (identity !== "clerk" && identity !== "operatoros") {
      return res.status(400).json({ error: "invalid_identity" });
    }

    if (!current.clerkId || !current.operatorIdentityId) {
      return res.status(400).json({
        error: "not_linked",
        message: "This account has only one sign-in method linked.",
      });
    }

    // Don't let the user remove the identity they're holding right now.
    const clerkUser = await resolveClerkUserFromRequest(req);
    const usingClerk = !!clerkUser && clerkUser.id === current.id;
    // If the cookie path matched, requireAuth picked cookie-based session;
    // otherwise Clerk picked the row. We infer "session source" from whether
    // a Clerk session is present AND a session cookie path was NOT taken.
    // The simplest robust check: if the unlink target matches the current
    // request's auth source, reject.
    const cookieToken = (req as any).cookies?.fl_session as string | undefined;
    if (identity === "operatoros" && cookieToken) {
      return res.status(400).json({
        error: "active_session",
        message:
          "You're signed in with OperatorOS right now. Sign in with Clerk first, then unlink.",
      });
    }
    if (identity === "clerk" && usingClerk && !cookieToken) {
      return res.status(400).json({
        error: "active_session",
        message:
          "You're signed in with Clerk right now. Sign in with OperatorOS first, then unlink.",
      });
    }

    const updates: Partial<User> = { updatedAt: new Date() };
    if (identity === "clerk") {
      updates.clerkId = null;
    } else {
      updates.operatorIdentityId = null;
      updates.operatorPlanSlug = null;
      updates.operatorOrganizationId = null;
      updates.operatorRole = null;
      updates.operatorLastLaunchAt = null;
    }
    await db.update(usersTable).set(updates).where(eq(usersTable.id, current.id));

    // If we just unlinked the OperatorOS side, also drop the SSO cookie so
    // the next request isn't authenticated as a now-detached identity.
    if (identity === "operatoros") {
      clearSessionCookie(res);
    }

    const refreshed = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, current.id))
      .limit(1);
    return res.json({
      success: true,
      identities: describeIdentities(refreshed[0]),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to unlink account");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
