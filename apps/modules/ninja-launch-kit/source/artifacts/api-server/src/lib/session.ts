import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import type { User } from "@workspace/db";

const COOKIE_NAME = "njk_session";
const IS_PROD = process.env["NODE_ENV"] === "production";
const ENV_SECRET = process.env["SESSION_SECRET"];
if (IS_PROD && !ENV_SECRET) {
  throw new Error("SESSION_SECRET must be set in production");
}
const SECRET = ENV_SECRET ?? "ninjalaunchkit-dev-secret-do-not-use-in-prod";

function sign(value: string): string {
  const sig = crypto.createHmac("sha256", SECRET).update(value).digest("base64url");
  return `${value}.${sig}`;
}

function unsign(signed: string | undefined): string | null {
  if (!signed) return null;
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(value)
    .digest("base64url");
  try {
    if (
      sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return value;
}

export function setSessionCookie(res: Response, userId: number): void {
  const value = sign(String(userId));
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function getSessionUserId(req: Request): number | null {
  const raw = req.cookies?.[COOKIE_NAME] as string | undefined;
  const value = unsign(raw);
  if (!value) return null;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function loadUserMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const id = getSessionUserId(req);
  if (id != null) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (user) req.user = user;
  }
  next();
}

async function createAnonymousUser(): Promise<User> {
  const handle = crypto.randomBytes(6).toString("hex");
  const email = `anon-${handle}@ninjalaunchkit.local`;
  const [created] = await db
    .insert(usersTable)
    .values({
      email,
      name: `Operator ${handle.slice(0, 4).toUpperCase()}`,
      plan: "free",
      role: "user",
      subscriptionStatus: "demo",
    })
    .returning();
  return created;
}

/**
 * Returns the authenticated user, or auto-provisions a fresh per-visitor
 * anonymous user (with a session cookie) so each visitor has isolated data
 * in demo mode. Never shares data across visitors.
 */
export async function requireUser(req: Request, res: Response): Promise<User> {
  if (req.user) return req.user;
  const user = await createAnonymousUser();
  setSessionCookie(res, user.id);
  req.user = user;
  return user;
}

/**
 * Strict variant: returns 401 if there is no authenticated session.
 * Use for admin and billing-portal routes where auto-provisioning would
 * silently bypass intent (e.g. an unauthenticated visitor must NOT become
 * an admin just by hitting /api/admin/*).
 */
export function requireAuthenticatedUser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
