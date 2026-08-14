import { Router, type IRouter } from "express";
import {
  ensureOperatorOsUserRow,
  mergeUserRows,
  resolveClerkUserFromRequest,
} from "../lib/userSync";
// Imported as a namespace so test suites can vi.spyOn(sso, "consumeSsoToken")
// without having to vi.mock the entire module.
import * as sso from "../lib/operatorOsSso";
import type { SsoFailureCode } from "../lib/operatorOsSso";
import { getSsoConfig } from "../lib/ssoConfig";
import { mintSessionToken, setSessionCookie } from "../lib/sessionCookie";

/**
 * Child-app SSO endpoint per the OperatorOS HS256 contract.
 *
 *   GET /sso?token=<JWT>&returnTo=/some/path
 *
 * On success we redirect to `/?sso=ok` (or `returnTo` when it's a same-origin
 * absolute path) with the local session cookie set. On failure we redirect
 * to `/?sso=error&reason=<code>` so the SPA can render a human-friendly
 * message — the raw token / signature error is never echoed back.
 *
 * NOTE: This router is intentionally mounted at the application root, NOT
 * under `/api`, because OperatorOS launches users at `<app_origin>/sso?...`.
 */
const router: IRouter = Router();

const FAILURE_REASONS: Record<SsoFailureCode, string> = {
  missing_token: "missing_token",
  invalid_signature: "invalid_token",
  invalid_alg: "invalid_token",
  expired: "expired",
  iat_too_old: "expired",
  iat_in_future: "invalid_token",
  iss_mismatch: "wrong_issuer",
  aud_mismatch: "wrong_audience",
  module_mismatch: "wrong_module",
  module_key_mismatch: "wrong_module",
  module_disabled: "module_disabled",
  env_mismatch: "wrong_env",
  missing_jti: "invalid_token",
  missing_sub: "invalid_token",
  consume_failed: "consume_failed",
  sso_consume_unavailable: "sso_consume_unavailable",
};

function safeReturnTo(input: unknown): string {
  // Only allow same-origin absolute paths to prevent open-redirect.
  // Must start with `/` followed by a non-slash, non-backslash character.
  // This rejects:
  //   - non-strings / empty strings
  //   - absolute URLs like "https://evil.com"
  //   - protocol-relative URLs like "//evil.com" (also catches the encoded
  //     form "%2F%2Fevil.com" since Express decodes query strings)
  //   - backslash tricks like "/\evil.com" which some browsers normalize
  //     into "//evil.com" when used in a Location header
  if (typeof input !== "string") return "/";
  if (input === "/") return "/";
  if (!/^\/[^/\\]/.test(input)) return "/";
  return input;
}

type SsoLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};
const noopLogger: SsoLogger = { info() {}, warn() {}, error() {} };

router.get("/sso", async (req, res) => {
  const log: SsoLogger = (req as { log?: SsoLogger }).log ?? noopLogger;
  const cfg = getSsoConfig();
  if (!cfg) {
    log.warn("SSO request received but config is incomplete");
    return res.status(503).redirect("/?sso=error&reason=not_configured");
  }

  const tokenParam = req.query.token;
  const token = typeof tokenParam === "string" ? tokenParam : "";
  const returnTo = safeReturnTo(req.query.returnTo);

  let jti: string | undefined;
  try {
    const verified = sso.verifySsoToken(token, cfg);
    jti = verified.jti;
    await sso.consumeSsoToken(verified, cfg);

    let user = await ensureOperatorOsUserRow(verified);

    // Account linking: if a Clerk session is also present on this request
    // and resolves to a different local row, fold the freshly-ensured
    // OperatorOS row into the Clerk row. This is the "I'm signed in via
    // Clerk and just launched myself from OperatorOS" path. The resulting
    // session cookie still points at the unified row.
    let merged = false;
    try {
      const clerkUser = await resolveClerkUserFromRequest(req);
      if (clerkUser && clerkUser.id !== user.id) {
        user = await mergeUserRows(clerkUser, user);
        merged = true;
      }
    } catch (linkErr) {
      log.warn({ err: linkErr }, "SSO Clerk-link attempt failed (non-fatal)");
    }

    const sessionToken = mintSessionToken(user.id, "operatoros");
    setSessionCookie(res, sessionToken);

    log.info(
      {
        jti: verified.jti,
        userId: user.id,
        planSlug: verified.planSlug ?? null,
        linkedClerk: merged,
      },
      "OperatorOS SSO launch accepted",
    );

    const sep = returnTo.includes("?") ? "&" : "?";
    return res.redirect(`${returnTo}${sep}sso=ok`);
  } catch (err) {
    if (err instanceof sso.SsoVerificationError) {
      const reason = FAILURE_REASONS[err.code] ?? "invalid_token";
      // Log jti only — never the token, secret, or claims.
      log.warn(
        { jti: err.jti ?? jti ?? null, code: err.code },
        "OperatorOS SSO launch rejected",
      );
      const status = err.code === "sso_consume_unavailable" ? 502 : 302;
      return res.redirect(status, `/?sso=error&reason=${encodeURIComponent(reason)}`);
    }
    log.error({ err, jti }, "OperatorOS SSO launch crashed");
    return res.status(500).redirect("/?sso=error&reason=server_error");
  }
});

export default router;
