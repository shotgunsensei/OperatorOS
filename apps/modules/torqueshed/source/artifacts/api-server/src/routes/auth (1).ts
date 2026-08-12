import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { Router, type NextFunction, type Request, type Response } from "express";
import {
  db,
  torqueshedSessions,
  torqueshedUsers,
  type TorqueShedUser,
} from "@workspace/db";
import { logger } from "../lib/logger";

const MODULE_ID = "torqueshed";
const SESSION_COOKIE_NAME = "torqueshed_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const SSO_TIMEOUT_MS = 8_000;
const MOBILE_EXCHANGE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

type OperatorOsUser = {
  id?: unknown;
  email?: unknown;
  name?: unknown;
  displayName?: unknown;
  platformRole?: unknown;
  role?: unknown;
};

type OperatorOsTenant = {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  role?: unknown;
};

type OperatorOsConsumeResponse = {
  ok?: unknown;
  user?: OperatorOsUser;
  tenant?: OperatorOsTenant;
  module?: { id?: unknown; slug?: unknown };
};

type AuthenticatedContext = {
  operatorOsUserId: string;
  email: string;
  displayName: string;
  platformRole: string;
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string;
  tenantRole: string | null;
};

type SessionResult = {
  token: string;
  user: TorqueShedUser;
  expiresAt: Date;
};

class SsoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SsoError";
  }
}

const exchangeRate = new Map<string, { count: number; resetAt: number }>();

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function operatorOsApiUrl(): string {
  return stripTrailingSlash(
    process.env.OPERATOROS_API_URL ?? "https://api.operatoros.net",
  );
}

function operatorOsAppUrl(): string {
  return stripTrailingSlash(
    process.env.OPERATOROS_APP_URL ?? "https://app.operatoros.net",
  );
}

function operatorOsAuthUrl(): string {
  return stripTrailingSlash(
    process.env.OPERATOROS_AUTH_URL ?? "https://auth.operatoros.net",
  );
}

function publicAppUrl(): string {
  return stripTrailingSlash(
    process.env.TORQUESHED_PUBLIC_URL ?? "https://torqueshed.pro",
  );
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

function clientIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "0.0.0.0";
}

function allowExchange(request: Request): boolean {
  const key = clientIp(request);
  const now = Date.now();
  const current = exchangeRate.get(key);
  if (!current || current.resetAt <= now) {
    exchangeRate.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= MOBILE_EXCHANGE_LIMIT) return false;
  current.count += 1;
  return true;
}

function mapConsumeFailure(status: number, code: string | null): SsoError {
  if (status >= 500) {
    return new SsoError(
      502,
      "sso_consume_unavailable",
      "OperatorOS could not validate this launch. Please try again.",
    );
  }

  switch (code) {
    case "TOKEN_EXPIRED":
      return new SsoError(401, "expired", "This launch link expired.");
    case "AUDIENCE_MISMATCH":
    case "MODULE_CLAIM_MISMATCH":
      return new SsoError(
        401,
        "audience_mismatch",
        "This launch link was issued for another app.",
      );
    case "ENV_MISMATCH":
      return new SsoError(
        401,
        "env_mismatch",
        "This launch link belongs to another environment.",
      );
    default:
      return new SsoError(
        401,
        "consume_failed",
        "OperatorOS rejected this launch link.",
      );
  }
}

function parseConsumeResponse(payload: OperatorOsConsumeResponse): AuthenticatedContext {
  if (payload.ok !== true) {
    throw new SsoError(401, "consume_failed", "OperatorOS rejected this launch.");
  }

  const moduleId = readString(payload.module?.id) ?? readString(payload.module?.slug);
  const operatorOsUserId = readString(payload.user?.id);
  const email = readString(payload.user?.email);
  const tenantId = readString(payload.tenant?.id);
  const tenantName = readString(payload.tenant?.name);

  if (moduleId !== MODULE_ID || !operatorOsUserId || !email || !tenantId || !tenantName) {
    throw new SsoError(
      502,
      "invalid_consume_response",
      "OperatorOS returned an incomplete launch response.",
    );
  }

  const preferredName =
    readString(payload.user?.displayName) ??
    readString(payload.user?.name) ??
    email.split("@")[0] ??
    "Builder";

  return {
    operatorOsUserId,
    email: email.toLowerCase(),
    displayName: preferredName,
    platformRole:
      readString(payload.user?.platformRole) ??
      readString(payload.user?.role) ??
      "user",
    tenantId,
    tenantSlug: readString(payload.tenant?.slug),
    tenantName,
    tenantRole: readString(payload.tenant?.role),
  };
}

async function consumeOperatorOsToken(token: string): Promise<AuthenticatedContext> {
  let response: globalThis.Response;
  try {
    response = await fetch(`${operatorOsApiUrl()}/v1/sso/consume`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "TorqueShed-SSO/1.0",
      },
      body: JSON.stringify({ token, moduleId: MODULE_ID }),
      signal: AbortSignal.timeout(SSO_TIMEOUT_MS),
    });
  } catch (error) {
    logger.warn({ err: error }, "operatoros_sso_consume_unavailable");
    throw new SsoError(
      502,
      "sso_consume_unavailable",
      "OperatorOS could not validate this launch. Please try again.",
    );
  }

  let payload: OperatorOsConsumeResponse & { code?: unknown } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // The status below still produces a stable, non-sensitive error.
  }

  if (!response.ok) {
    throw mapConsumeFailure(response.status, readString(payload.code));
  }

  return parseConsumeResponse(payload);
}

async function issueSession(
  context: AuthenticatedContext,
  request: Request,
): Promise<SessionResult> {
  const [user] = await db
    .insert(torqueshedUsers)
    .values({
      id: randomUUID(),
      ...context,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: torqueshedUsers.operatorOsUserId,
      set: {
        email: context.email,
        displayName: context.displayName,
        platformRole: context.platformRole,
        tenantId: context.tenantId,
        tenantSlug: context.tenantSlug,
        tenantName: context.tenantName,
        tenantRole: context.tenantRole,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!user) {
    throw new Error("Failed to provision TorqueShed user");
  }

  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.transaction(async (transaction) => {
    await transaction
      .delete(torqueshedSessions)
      .where(lt(torqueshedSessions.expiresAt, new Date()));
    await transaction.insert(torqueshedSessions).values({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt,
      userAgent: request.get("user-agent")?.slice(0, 512) ?? null,
    });
  });

  return { token, user, expiresAt };
}

function publicUser(user: TorqueShedUser) {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    platformRole: user.platformRole,
    tenant: {
      id: user.tenantId,
      slug: user.tenantSlug,
      name: user.tenantName,
      role: user.tenantRole,
    },
  };
}

function readSessionToken(request: Request): string | null {
  const authorization = request.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return readString(authorization.slice("Bearer ".length));
  }
  return readString(request.cookies?.[SESSION_COOKIE_NAME]);
}

async function currentUser(request: Request): Promise<TorqueShedUser | null> {
  const token = readSessionToken(request);
  if (!token) return null;

  const [row] = await db
    .select({ session: torqueshedSessions, user: torqueshedUsers })
    .from(torqueshedSessions)
    .innerJoin(
      torqueshedUsers,
      eq(torqueshedSessions.userId, torqueshedUsers.id),
    )
    .where(
      and(
        eq(torqueshedSessions.tokenHash, hashToken(token)),
        gt(torqueshedSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;

  void db
    .update(torqueshedSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(torqueshedSessions.tokenHash, hashToken(token)))
    .catch((error) => logger.debug({ err: error }, "session_last_seen_update_failed"));

  return row.user;
}

function loginUrl(): string {
  const next = `${operatorOsAppUrl()}/app`;
  return `${operatorOsAuthUrl()}/login?next=${encodeURIComponent(next)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function sendSsoError(response: Response, error: SsoError) {
  response.status(error.status).type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TorqueShed launch interrupted</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#090b0b;color:#f1f0eb;font:15px/1.6 system-ui,sans-serif}.card{width:min(560px,100%);padding:40px;border:1px solid #4e3426;background:radial-gradient(circle at 100% 0,rgba(242,98,24,.18),transparent 40%),#111414;box-shadow:0 30px 90px #000}.eyebrow{color:#ff7b24;font:800 11px ui-monospace,monospace;letter-spacing:.16em}.code{display:inline-block;margin:12px 0;padding:6px 9px;border:1px solid #543823;color:#f3a12a;font:700 11px ui-monospace,monospace}h1{margin:8px 0 12px;font-size:clamp(34px,8vw,58px);line-height:.95;text-transform:uppercase}p{color:#a9adaa}a{display:inline-flex;margin-top:14px;padding:14px 18px;background:#f26218;color:white;text-decoration:none;font-weight:850;font-size:12px;letter-spacing:.08em;text-transform:uppercase}</style>
</head><body><main class="card"><div class="eyebrow">OPERATOROS / SECURE HANDOFF</div><span class="code">${escapeHtml(error.code)}</span><h1>Launch interrupted.</h1><p>${escapeHtml(error.message)}</p><a href="${escapeHtml(loginUrl())}">Return to OperatorOS →</a></main></body></html>`);
}

export async function operatorOsSsoReceiver(
  request: Request,
  response: Response,
) {
  const token = readString(request.query.token);
  if (!token) {
    return sendSsoError(
      response,
      new SsoError(400, "missing_token", "No OperatorOS handoff token was provided."),
    );
  }

  try {
    const context = await consumeOperatorOsToken(token);
    const session = await issueSession(context, request);
    response.cookie(SESSION_COOKIE_NAME, session.token, sessionCookieOptions());
    return response.redirect(302, `${publicAppUrl()}/?signed_in=operatoros`);
  } catch (error) {
    logger.warn(
      { code: error instanceof SsoError ? error.code : "session_error" },
      "operatoros_sso_launch_rejected",
    );
    return sendSsoError(
      response,
      error instanceof SsoError
        ? error
        : new SsoError(500, "session_error", "TorqueShed could not create your session."),
    );
  }
}

const authRouter = Router();

authRouter.get("/auth/me", async (request, response, next) => {
  try {
    const user = await currentUser(request);
    response.set("cache-control", "no-store");
    if (!user) return response.status(401).json({ authenticated: false });
    return response.json({ authenticated: true, user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/auth/logout", async (request, response, next) => {
  try {
    const token = readSessionToken(request);
    if (token) {
      await db
        .delete(torqueshedSessions)
        .where(eq(torqueshedSessions.tokenHash, hashToken(token)));
    }
    response.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return response.status(204).send();
  } catch (error) {
    return next(error);
  }
});

/** Mobile receives the same https://torqueshed.pro/sso universal link. */
authRouter.post("/auth/operatoros", async (request, response, next) => {
  if (!allowExchange(request)) {
    return response.status(429).json({ code: "rate_limited" });
  }

  const token = readString(request.body?.token);
  if (!token) {
    return response.status(400).json({ code: "missing_token" });
  }

  try {
    const context = await consumeOperatorOsToken(token);
    const session = await issueSession(context, request);
    response.set("cache-control", "no-store");
    return response.json({
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user: publicUser(session.user),
    });
  } catch (error) {
    if (error instanceof SsoError) {
      return response.status(error.status).json({ code: error.code });
    }
    return next(error);
  }
});

export default authRouter;
