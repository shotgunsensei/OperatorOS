import crypto from "node:crypto";
import type { Response } from "express";

/**
 * Local session cookie minted after a successful OperatorOS SSO launch (or
 * any future server-issued session). The token is a compact `payload.sig`
 * string where `payload` is base64url(JSON({ uid, exp, iat, src })) and `sig`
 * is base64url(HMAC-SHA256(payload, SESSION_SECRET)).
 *
 * We deliberately do NOT reuse the OperatorOS JWT as our session cookie:
 *   - OperatorOS tokens are short-lived (90s) and single-use.
 *   - We must never echo a third-party signed token back to the browser.
 * Instead we mint a fresh cookie whose only payload is the LOCAL user.id.
 */

const COOKIE_NAME = "fl_session";
const DEFAULT_TTL_DAYS = 30;

interface SessionPayload {
  uid: string;
  iat: number;
  exp: number;
  src: "operatoros";
}

function getSecret(): string {
  const s = process.env.SESSION_SECRET || "";
  if (!s) throw new Error("SESSION_SECRET is required to mint session cookies");
  return s;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payloadStr: string, secret: string): string {
  return b64urlEncode(crypto.createHmac("sha256", secret).update(payloadStr).digest());
}

export function mintSessionToken(
  userId: string,
  src: "operatoros" = "operatoros",
  ttlDays: number = DEFAULT_TTL_DAYS,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    uid: userId,
    iat: now,
    exp: now + ttlDays * 24 * 60 * 60,
    src,
  };
  const payloadStr = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = sign(payloadStr, getSecret());
  return `${payloadStr}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const payloadStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }
  const expected = sign(payloadStr, secret);
  // timingSafeEqual requires equal-length buffers; bail out otherwise.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadStr).toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
  if (!payload.uid || typeof payload.uid !== "string") return null;
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

export function setSessionCookie(res: Response, token: string, ttlDays: number = DEFAULT_TTL_DAYS): void {
  const isProd = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: ttlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  const isProd = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
  });
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
