import crypto from "node:crypto";
import { env } from "./env";
import { logger } from "./logger";

export type SsoReject = { http: number; code: string };

export type SsoClaims = {
  iss: string;
  aud: string;
  env: "prod" | "staging" | "dev";
  sub: string;
  user_id: string;
  email: string;
  role: string;
  module_slug: string;
  plan_slug: "starter" | "pro" | "elite" | null;
  organization_id: string | null;
  jti: string;
  iat: number;
  exp: number;
};

const MAX_TOKEN_AGE_SEC = 90;
const CLOCK_SKEW_SEC = 5;

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function ssoConfigured(): boolean {
  return !!(
    env.MODULE_SSO_SECRET &&
    env.OPERATOROS_BASE_URL &&
    env.OPERATOROS_SSO_AUDIENCE &&
    env.OPERATOROS_SSO_ENV &&
    env.OPERATOROS_API_URL
  );
}

/**
 * Verify an HS256 OperatorOS SSO token. Returns claims on success or a
 * structured reject with the HTTP status + child reject code on failure.
 * Never accepts alg=none or non-HS256 algorithms.
 */
export function verifyOperatorOsToken(token: string): SsoClaims | SsoReject {
  if (!ssoConfigured()) {
    logger.warn("SSO token received but OperatorOS env not fully configured");
    return { http: 401, code: "consume_failed" };
  }
  const parts = token.split(".");
  if (parts.length !== 3) return { http: 400, code: "bad_request" };
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(b64urlDecode(headerB64).toString("utf8"));
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return { http: 400, code: "bad_request" };
  }
  if (!isObj(header) || header["alg"] !== "HS256" || header["typ"] !== "JWT") {
    return { http: 401, code: "signature_invalid" };
  }

  const expected = crypto
    .createHmac("sha256", env.MODULE_SSO_SECRET as string)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  let provided: Buffer;
  try {
    provided = b64urlDecode(sigB64);
  } catch {
    return { http: 401, code: "signature_invalid" };
  }
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { http: 401, code: "signature_invalid" };
  }

  if (!isObj(payload)) return { http: 400, code: "bad_request" };
  const required: Record<string, (v: unknown) => boolean> = {
    iss: isString,
    aud: isString,
    env: (v) => v === "prod" || v === "staging" || v === "dev",
    sub: isString,
    user_id: isString,
    email: isString,
    role: isString,
    module_slug: isString,
    jti: isString,
    iat: isNumber,
    exp: isNumber,
  };
  for (const [k, check] of Object.entries(required)) {
    if (!check(payload[k])) return { http: 400, code: "bad_request" };
  }
  const planRaw = payload["plan_slug"];
  if (planRaw != null && planRaw !== "starter" && planRaw !== "pro" && planRaw !== "elite") {
    return { http: 400, code: "bad_request" };
  }
  const orgRaw = payload["organization_id"];
  if (orgRaw != null && !isString(orgRaw)) return { http: 400, code: "bad_request" };

  const claims = payload as unknown as SsoClaims;

  if (claims.iss !== env.OPERATOROS_BASE_URL) return { http: 401, code: "issuer_mismatch" };
  if (claims.aud !== env.OPERATOROS_SSO_AUDIENCE) return { http: 401, code: "audience_mismatch" };
  if (claims.module_slug !== env.OPERATOROS_SSO_AUDIENCE) return { http: 401, code: "audience_mismatch" };
  if (claims.env !== env.OPERATOROS_SSO_ENV) return { http: 401, code: "env_mismatch" };

  const nowSec = Math.floor(Date.now() / 1000);
  if (claims.iat - nowSec > CLOCK_SKEW_SEC) return { http: 401, code: "clock_skew" };
  if (claims.exp <= nowSec - CLOCK_SKEW_SEC) return { http: 401, code: "expired" };
  if (nowSec - claims.iat > MAX_TOKEN_AGE_SEC) return { http: 401, code: "expired" };

  return claims;
}

/**
 * Call OperatorOS /v1/modules/sso/consume to enforce single-use semantics.
 * Returns null on success, or a structured reject on failure. Maps API
 * codes 1:1 to documented child reject codes.
 */
export async function consumeOperatorOsToken(claims: SsoClaims): Promise<SsoReject | null> {
  if (!env.OPERATOROS_API_URL) return { http: 401, code: "consume_failed" };
  const url = `${env.OPERATOROS_API_URL.replace(/\/$/, "")}/v1/modules/sso/consume`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jti: claims.jti, aud: claims.aud, env: claims.env }),
      signal: controller.signal,
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, jti: claims.jti }, "SSO consume network error");
    return { http: 502, code: "sso_consume_unavailable" };
  } finally {
    clearTimeout(timeout);
  }
  if (resp.status === 200) return null;
  if (resp.status >= 500) {
    logger.warn({ status: resp.status, jti: claims.jti }, "SSO consume upstream error");
    return { http: 502, code: "sso_consume_unavailable" };
  }
  let body: unknown = null;
  try {
    body = await resp.json();
  } catch {
    /* ignore */
  }
  const apiCode = isObj(body) && isString(body["code"]) ? body["code"] : "";
  switch (apiCode) {
    case "TOKEN_UNKNOWN":
    case "TOKEN_REPLAYED":
      return { http: 401, code: "consume_failed" };
    case "TOKEN_EXPIRED":
      return { http: 401, code: "expired" };
    case "AUDIENCE_MISMATCH":
      return { http: 401, code: "audience_mismatch" };
    case "ENV_MISMATCH":
      return { http: 401, code: "env_mismatch" };
    default:
      return { http: 401, code: "consume_failed" };
  }
}

/** Map OperatorOS plan slug → internal NinjaLaunchKit plan. */
export function mapOperatorOsPlan(slug: SsoClaims["plan_slug"]): "free" | "pro" | "agency" | null {
  switch (slug) {
    case "starter":
      return "free";
    case "pro":
      return "pro";
    case "elite":
      return "agency";
    case null:
    default:
      return null;
  }
}

export function ssoRejectMessage(code: string): string {
  const map: Record<string, string> = {
    missing_token: "Missing token",
    bad_request: "Malformed token",
    signature_invalid: "Invalid signature",
    issuer_mismatch: "Issuer mismatch",
    audience_mismatch: "Audience mismatch",
    env_mismatch: "Environment mismatch",
    expired: "Token expired",
    clock_skew: "Token issued in the future",
    consume_failed: "Token rejected by issuer",
    sso_consume_unavailable: "Token verification temporarily unavailable",
  };
  return map[code] ?? "SSO rejected";
}
