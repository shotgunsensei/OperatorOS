import type { Request, Response, NextFunction } from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, sessionsTable, usersTable, type User } from "@workspace/db";

const SESSION_COOKIE = "sf_session";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Enforces a baseline password policy: at least 8 chars, contains a digit
 * and a letter. Returns null when valid, or an error string for the client.
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(password)) return "Password must contain a letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  return null;
}

export async function createSessionCookie(res: Response, userId: number): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({ token, userId });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
}

/**
 * Rotates the current session token for the authenticated request — call
 * after login, signup, and any privilege-relevant change to defeat session
 * fixation. The old session row is deleted and a fresh cookie is set.
 */
export async function rotateSession(req: Request, res: Response, userId: number): Promise<void> {
  const oldToken = req.cookies?.[SESSION_COOKIE];
  if (oldToken) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, oldToken));
  }
  await createSessionCookie(res, userId);
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function getCurrentUser(req: Request): Promise<User | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.token, token));
  if (!session) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  return user ?? null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.user = user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  req.user = user;
  next();
}
