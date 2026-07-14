import jwt, { type JwtHeader, type JwtPayload } from "jsonwebtoken";
import { logger } from "./logger";
import type { SsoConfig } from "./ssoConfig";

/**
 * OperatorOS-issued JWT verification + mandatory `consume` callback.
 *
 * The OperatorOS HS256 contract requires every SSO launch token to be
 *   1. validated locally (alg=HS256 ONLY, iss/aud/env/exp/iat checks),
 *   2. POSTed to {OPERATOROS_API_URL}/v1/modules/sso/consume to assert
 *      single-use semantics. Replays, mismatched audience/env, or unknown
 *      tokens are rejected by the upstream service and surfaced here as
 *      `ConsumeFailureCode`.
 *
 * We never log the raw token, claim payload, or shared secret — only `jti`
 * and the high-level outcome.
 */

export type SsoFailureCode =
  | "missing_token"
  | "invalid_signature"
  | "invalid_alg"
  | "expired"
  | "iat_too_old"
  | "iat_in_future"
  | "iss_mismatch"
  | "aud_mismatch"
  | "module_mismatch"
  | "module_key_mismatch"
  | "module_disabled"
  | "env_mismatch"
  | "missing_jti"
  | "missing_sub"
  | "consume_failed"
  | "sso_consume_unavailable";

export class SsoVerificationError extends Error {
  constructor(public code: SsoFailureCode, message: string, public jti?: string) {
    super(message);
    this.name = "SsoVerificationError";
  }
}

export interface VerifiedSsoToken {
  jti: string;
  sub: string;
  iss: string;
  aud: string;
  env: string;
  iat: number;
  exp: number;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  organizationId?: string | null;
  planSlug?: string | null;
  role?: string | null;
  // OperatorOS entitlement-pivot claims (Task #108). The parent app is the
  // source of truth for module access; the child app maps these claims to
  // a local role + entitlement snapshot.
  targetModuleKey: string;
  targetModuleEnabled: boolean;
  tenantId: string | null;
  moduleRole: string | null;
  tenantRole: string | null;
  accessLevel: 'pro' | 'standard' | 'read-only' | 'denied';
  features: string[];
  grantedProductIds: string[];
  subscriptionStatus: string | null;
  raw: JwtPayload;
}

const SKEW_SECONDS = 5;
const MAX_IAT_AGE_SECONDS = 90;

/**
 * Local verification step. Decodes the JWT, enforces alg=HS256 only (rejecting
 * `none` / asymmetric algs), validates the signature against MODULE_SSO_SECRET,
 * and checks every standard claim plus the OperatorOS-specific `env` claim.
 *
 * Throws `SsoVerificationError` with a precise code so the caller can map it
 * to the user-facing failure reason without leaking token internals.
 */
export function verifySsoToken(token: string, cfg: SsoConfig): VerifiedSsoToken {
  if (!token) throw new SsoVerificationError("missing_token", "Missing token");

  // Pre-decode to inspect header so we can reject unsupported algs explicitly
  // (jsonwebtoken would also reject, but we want a clean error code path).
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === "string") {
    throw new SsoVerificationError("invalid_signature", "Token failed to decode");
  }
  const header = decoded.header as JwtHeader;
  if (header.alg !== "HS256") {
    throw new SsoVerificationError("invalid_alg", `Unsupported alg: ${header.alg}`);
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, cfg.secret, {
      algorithms: ["HS256"],
      clockTolerance: SKEW_SECONDS,
      // We perform issuer/audience checks manually below so we can produce
      // distinct error codes for telemetry instead of a generic invalid_token.
    }) as JwtPayload;
  } catch (err: any) {
    if (err?.name === "TokenExpiredError") {
      throw new SsoVerificationError("expired", "Token expired");
    }
    throw new SsoVerificationError("invalid_signature", err?.message || "Verify failed");
  }

  const jti = typeof payload.jti === "string" ? payload.jti : "";
  if (!jti) throw new SsoVerificationError("missing_jti", "Missing jti claim", jti);

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw new SsoVerificationError("missing_sub", "Missing sub claim", jti);

  if (payload.iss !== cfg.issuer) {
    throw new SsoVerificationError("iss_mismatch", "Issuer mismatch", jti);
  }
  const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
  const audLower = typeof aud === "string" ? aud.toLowerCase() : "";
  if (!audLower || audLower !== cfg.audience) {
    throw new SsoVerificationError("aud_mismatch", "Audience mismatch", jti);
  }

  // OperatorOS contract: every token carries an explicit `module_slug` and the
  // child app MUST enforce `aud === module_slug === configured audience`. This
  // prevents a token minted for a different module (but with a forged or
  // mistakenly broad aud) from being accepted here.
  const moduleSlugRaw = (payload as Record<string, unknown>).module_slug;
  const moduleSlug = typeof moduleSlugRaw === "string" ? moduleSlugRaw.toLowerCase() : "";
  if (!moduleSlug || moduleSlug !== cfg.audience || moduleSlug !== audLower) {
    throw new SsoVerificationError("module_mismatch", "module_slug mismatch", jti);
  }

  // OperatorOS entitlement pivot: every launch carries an explicit
  // `target_module_key` (the canonical OperatorOS-side key for this child)
  // that MUST match `module_slug` / `aud` / configured audience. A
  // mismatch is treated as if the token were minted for a different module.
  // `target_module_enabled === false` means the operator has revoked
  // module access at the parent — we surface a dedicated failure so the
  // SPA can render the AccessDenied screen instead of a generic error.
  const targetModuleKeyRaw = (payload as Record<string, unknown>).target_module_key;
  if (typeof targetModuleKeyRaw !== "string" || targetModuleKeyRaw.length === 0) {
    throw new SsoVerificationError(
      "module_key_mismatch",
      "target_module_key is required",
      jti,
    );
  }
  const targetModuleKey = targetModuleKeyRaw.toLowerCase();
  if (targetModuleKey !== cfg.audience) {
    throw new SsoVerificationError(
      "module_key_mismatch",
      "target_module_key mismatch",
      jti,
    );
  }
  const targetModuleEnabledRaw = (payload as Record<string, unknown>).target_module_enabled;
  if (typeof targetModuleEnabledRaw !== "boolean") {
    throw new SsoVerificationError(
      "module_disabled",
      "target_module_enabled is required",
      jti,
    );
  }
  if (targetModuleEnabledRaw !== true) {
    throw new SsoVerificationError(
      "module_disabled",
      "target_module_enabled is false",
      jti,
    );
  }
  const targetModuleEnabled = targetModuleEnabledRaw;

  const envClaim = (payload as Record<string, unknown>).env;
  if (typeof envClaim !== "string" || envClaim !== cfg.env) {
    throw new SsoVerificationError("env_mismatch", "Env mismatch", jti);
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.iat !== "number") {
    throw new SsoVerificationError("invalid_signature", "Missing iat", jti);
  }
  if (payload.iat - now > SKEW_SECONDS) {
    throw new SsoVerificationError("iat_in_future", "iat in future", jti);
  }
  if (now - payload.iat > MAX_IAT_AGE_SECONDS + SKEW_SECONDS) {
    throw new SsoVerificationError("iat_too_old", "iat too old", jti);
  }
  if (typeof payload.exp !== "number" || payload.exp <= now - SKEW_SECONDS) {
    throw new SsoVerificationError("expired", "Token expired", jti);
  }

  const tenantId =
    pickString(payload, "tenant_id") ||
    pickString(payload, "organization_id") ||
    pickString(payload, "org_id");
  const moduleRole =
    pickString(payload, "module_role") || pickString(payload, "role");
  const tenantRole = pickString(payload, "tenant_role");
  const accessLevelRaw = pickString(payload, "access_level");
  const accessLevel: VerifiedSsoToken["accessLevel"] =
    accessLevelRaw === "pro" ||
    accessLevelRaw === "standard" ||
    accessLevelRaw === "read-only" ||
    accessLevelRaw === "denied"
      ? accessLevelRaw
      : moduleRole === "viewer"
        ? "read-only"
        : moduleRole === "none"
          ? "denied"
          : "standard";
  const featuresRaw = (payload as Record<string, unknown>).features;
  const features = Array.isArray(featuresRaw)
    ? featuresRaw.filter((f): f is string => typeof f === "string")
    : [];
  const grantedRaw = (payload as Record<string, unknown>).granted_product_ids;
  const grantedProductIds = Array.isArray(grantedRaw)
    ? grantedRaw.filter((f): f is string => typeof f === "string")
    : [];
  const subscriptionStatus = pickString(payload, "subscription_status");

  return {
    jti,
    sub,
    iss: payload.iss as string,
    aud: audLower,
    env: envClaim,
    iat: payload.iat,
    exp: payload.exp,
    email: pickString(payload, "email"),
    name: pickString(payload, "name") || pickString(payload, "display_name"),
    avatarUrl: pickString(payload, "avatar_url") || pickString(payload, "picture"),
    organizationId: pickString(payload, "organization_id") || pickString(payload, "org_id"),
    planSlug: pickString(payload, "plan_slug") || pickString(payload, "plan"),
    role: moduleRole,
    targetModuleKey,
    targetModuleEnabled,
    tenantId,
    moduleRole,
    tenantRole,
    accessLevel,
    features,
    grantedProductIds,
    subscriptionStatus,
    raw: payload,
  };
}

function pickString(p: Record<string, unknown>, key: string): string | null {
  const v = p[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Mandatory POST to {OPERATOROS_API_URL}/v1/modules/sso/consume. Maps API
 * codes to local SsoFailureCodes. 5xx / network failures surface as
 * `sso_consume_unavailable` so the SPA can suggest "try again" rather than
 * accusing the user of a bad token.
 */
export async function consumeSsoToken(
  verified: VerifiedSsoToken,
  cfg: SsoConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let res: Response;
  try {
    res = await fetchImpl(cfg.consumeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jti: verified.jti, aud: verified.aud, env: verified.env }),
    });
  } catch (err) {
    logger.error({ err, jti: verified.jti }, "SSO consume call failed (network)");
    throw new SsoVerificationError(
      "sso_consume_unavailable",
      "Consume endpoint unreachable",
      verified.jti,
    );
  }

  if (res.ok) return;

  if (res.status >= 500) {
    logger.warn({ jti: verified.jti, status: res.status }, "SSO consume 5xx");
    throw new SsoVerificationError(
      "sso_consume_unavailable",
      `Consume endpoint ${res.status}`,
      verified.jti,
    );
  }

  // 4xx: parse the upstream code if available.
  let code: string | undefined;
  try {
    const body = (await res.json()) as { code?: string };
    code = body?.code;
  } catch {
    // ignore parse error; fall through to generic consume_failed
  }

  switch (code) {
    case "TOKEN_EXPIRED":
      throw new SsoVerificationError("expired", "Upstream: expired", verified.jti);
    case "AUDIENCE_MISMATCH":
      throw new SsoVerificationError("aud_mismatch", "Upstream: aud mismatch", verified.jti);
    case "ENV_MISMATCH":
      throw new SsoVerificationError("env_mismatch", "Upstream: env mismatch", verified.jti);
    case "TOKEN_UNKNOWN":
    case "TOKEN_REPLAYED":
    default:
      throw new SsoVerificationError(
        "consume_failed",
        code ? `Upstream: ${code}` : `Consume rejected (${res.status})`,
        verified.jti,
      );
  }
}
