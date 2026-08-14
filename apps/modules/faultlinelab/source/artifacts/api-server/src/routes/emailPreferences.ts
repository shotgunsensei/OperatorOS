import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import type { User } from "@workspace/db";
import { ensureUnsubscribeToken } from "../lib/subscriptionRenewalNotices";

const router: IRouter = Router();

/**
 * Returns the signed-in user's transactional-email preferences. Right now
 * we only expose the renewal/expiration email toggle, but the shape leaves
 * room for additional flags without a route migration.
 */
router.get("/account/email-preferences", requireAuth, (req, res) => {
  const user = (req as any).appUser as User;
  return res.json({
    renewalEmailsEnabled: user.renewalEmailsEnabled,
  });
});

/**
 * Flip the renewal/expiration email toggle. Persists the new value and
 * returns the canonical state so the client can re-render without a
 * follow-up read.
 */
router.put("/account/email-preferences", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const raw = req.body?.renewalEmailsEnabled;
  if (typeof raw !== "boolean") {
    return res.status(400).json({ error: "invalid_renewal_emails_enabled" });
  }
  try {
    await db
      .update(usersTable)
      .set({ renewalEmailsEnabled: raw, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    return res.json({ renewalEmailsEnabled: raw });
  } catch (err) {
    req.log.error({ err }, "Failed to save email preferences");
    return res.status(500).json({ error: "Internal server error" });
  }
});

function renderUnsubscribeConfirmation(message: string, success: boolean): string {
  const color = success ? "#22d3ee" : "#f87171";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Unsubscribed</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#0a0e14;color:#e4e4e7;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
.card{max-width:480px;border:1px solid #27272a;background:#111822;border-radius:12px;padding:32px;text-align:center;}
h1{margin:0 0 12px;font-size:20px;color:${color};}
p{margin:0 0 20px;color:#a1a1aa;line-height:1.5;}
a{display:inline-block;padding:10px 18px;border-radius:6px;background:${color};color:#0a0e14;text-decoration:none;font-weight:600;font-size:14px;}</style></head>
<body><div class="card"><h1>${success ? "You're unsubscribed" : "Unsubscribe link is invalid"}</h1>
<p>${message}</p><a href="/">Return to Faultline Lab</a></div></body></html>`;
}

/**
 * Public, no-auth unsubscribe endpoint used by the one-click link embedded
 * in every renewal/expiration email. Both GET (link click) and POST (RFC
 * 8058 List-Unsubscribe one-click) are supported. The token in the URL is
 * the per-user secret on `users.unsubscribe_token`; we resolve it to a
 * row and flip `renewal_emails_enabled` to false. Idempotent.
 *
 * No timing-safe comparison is needed because `unsubscribe_token` is a
 * unique index — the DB lookup itself is the authentication step, and
 * the token is high-entropy (24 random bytes, base64url).
 */
async function handleUnsubscribe(req: Request, res: Response): Promise<Response> {
  const queryToken = req.query?.token;
  const bodyToken = (req.body as { token?: unknown } | undefined)?.token;
  const token =
    typeof queryToken === "string"
      ? queryToken
      : typeof bodyToken === "string"
        ? bodyToken
        : null;
  if (!token) {
    return res
      .status(400)
      .type("html")
      .send(
        renderUnsubscribeConfirmation(
          "This unsubscribe link is missing its token. Open the link directly from the email or use the toggle on your Account screen.",
          false,
        ),
      );
  }
  try {
    const matches = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.unsubscribeToken, token))
      .limit(1);
    if (matches.length === 0) {
      return res
        .status(404)
        .type("html")
        .send(
          renderUnsubscribeConfirmation(
            "We couldn't match this link to an account. It may have been rotated. Sign in and toggle renewal emails from your Account screen instead.",
            false,
          ),
        );
    }
    await db
      .update(usersTable)
      .set({ renewalEmailsEnabled: false, updatedAt: new Date() })
      .where(eq(usersTable.id, matches[0].id));
    return res
      .status(200)
      .type("html")
      .send(
        renderUnsubscribeConfirmation(
          "You won't receive any more renewal or expiration reminders. You can turn them back on anytime from your Account screen.",
          true,
        ),
      );
  } catch (err) {
    req.log?.error?.({ err }, "Failed to process unsubscribe");
    return res
      .status(500)
      .type("html")
      .send(
        renderUnsubscribeConfirmation(
          "Something went wrong on our end. Try again in a minute, or use the toggle on your Account screen.",
          false,
        ),
      );
  }
}

router.get("/email-preferences/unsubscribe", handleUnsubscribe);
router.post("/email-preferences/unsubscribe", handleUnsubscribe);

// Re-export so the function is reachable for tests / lazy callers.
export { ensureUnsubscribeToken };

export default router;
