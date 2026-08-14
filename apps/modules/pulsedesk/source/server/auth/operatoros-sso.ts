import { jwtVerify, errors as joseErrors } from "jose";

export interface OperatorOsSsoConfig {
  secret: string;
  audience: string;
  env: string;
  baseUrl: string;
  consumeUrl: string;
  exchangeUrl: string;
  apiUrl?: string;
}

export type OperatorOsRole = "user" | "member" | "admin" | "super_admin";

export interface OperatorOsEntitlementClaims {
  operatoros_tenant_id?: string | null;
  tenant_id?: string | null;
  organization_id?: string | null;
  tenant_role?: string | null;
  tenant_role_alias?: string | null;
  subscription_status?: string | null;
  plan_slug?: string | null;
  target_module_enabled?: boolean | null;
  target_module_access_level?: string | null;
  target_module_role?: string | null;
  target_module_features?: Record<string, unknown> | null;
  all_enabled_modules?: string[];
  raw?: unknown;
}

export interface OperatorOsTokenClaims extends OperatorOsEntitlementClaims {
  iss: string;
  aud: string;
  module_slug: string;
  env: string;
  iat: number;
  exp: number;
  jti: string;
  sub: string;
  user_id: string;
  email: string;
  role: OperatorOsRole;
  plan_slug: string | null;
  organization_id: string | null;
  name?: string;
}

export interface OperatorOsConsumeResponse {
  ok?: boolean;
  code?: string;
  error?: string;
  entitlement?: unknown;
  snapshot?: unknown;
  [key: string]: unknown;
}

export class SsoRejectError extends Error {
  constructor(public code: string, public httpStatus: number) {
    super(code);
    this.name = "SsoRejectError";
  }
}

const CLOCK_SKEW_S = 5;
const MAX_TOKEN_AGE_S = 90;
const CONSUME_TIMEOUT_MS = 5000;

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function normalizeModuleSlug(value: string): string {
  return value.trim().toLowerCase();
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readStringOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  return readString(value);
}

function readBooleanOrNull(value: unknown): boolean | null | undefined {
  if (value === null) return null;
  return typeof value === "boolean" ? value : undefined;
}

function readRecordOrNull(value: unknown): Record<string, unknown> | null | undefined {
  if (value === null) return null;
  return isJsonObject(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === "string");
  return values.length === value.length ? values : undefined;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isConsumePath(pathname: string): boolean {
  return stripTrailingSlash(pathname).endsWith("/modules/sso/consume");
}

function parseAbsoluteUrl(raw: string | undefined): URL | null {
  if (!raw?.trim()) return null;
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

export function resolveConsumeUrl(
  consumeUrlRaw: string | undefined,
  apiUrlRaw: string | undefined
): string | null {
  const explicit = parseAbsoluteUrl(consumeUrlRaw);
  if (explicit) {
    explicit.hash = "";
    explicit.search = "";
    return stripTrailingSlash(explicit.toString());
  }

  const apiUrl = parseAbsoluteUrl(apiUrlRaw);
  if (!apiUrl) return null;

  apiUrl.hash = "";
  apiUrl.search = "";

  const basePath = stripTrailingSlash(apiUrl.pathname);
  if (isConsumePath(basePath)) {
    apiUrl.pathname = basePath;
    return stripTrailingSlash(apiUrl.toString());
  }

  if (!basePath) {
    apiUrl.pathname = "/api/modules/sso/consume";
  } else if (basePath.endsWith("/api") || basePath.endsWith("/api/v1") || basePath.endsWith("/v1")) {
    apiUrl.pathname = `${basePath}/modules/sso/consume`;
  } else if (basePath.endsWith("/modules/sso")) {
    apiUrl.pathname = `${basePath}/consume`;
  } else {
    apiUrl.pathname = `${basePath}/modules/sso/consume`;
  }

  return stripTrailingSlash(apiUrl.toString());
}

/**
 * Derive the opaque-code exchange URL from the resolved consume URL by
 * swapping the trailing `/consume` segment for `/exchange`. An explicit
 * `OPERATOROS_SSO_EXCHANGE_URL` overrides. The hub mounts both endpoints on
 * the same base (`/modules/sso/{consume,exchange}` and their `/v1` twins),
 * so this stays correct whether the consume URL is the bare or `/v1` form.
 */
export function resolveExchangeUrl(
  exchangeUrlRaw: string | undefined,
  consumeUrl: string
): string {
  const explicit = parseAbsoluteUrl(exchangeUrlRaw);
  if (explicit) {
    explicit.hash = "";
    explicit.search = "";
    return stripTrailingSlash(explicit.toString());
  }
  return consumeUrl.replace(/\/consume$/, "/exchange");
}

export function loadConfig(): OperatorOsSsoConfig | null {
  const secret = process.env.OPERATOROS_SSO_CLIENT_SECRET;
  const audienceRaw = process.env.OPERATOROS_SSO_AUDIENCE;
  const env = process.env.OPERATOROS_SSO_ENV;
  const apiUrl = process.env.OPERATOROS_API_URL;
  const baseUrl = process.env.OPERATOROS_BASE_URL;
  const consumeUrl = resolveConsumeUrl(process.env.OPERATOROS_SSO_CONSUME_URL, apiUrl);

  if (!secret || !audienceRaw || !env || !consumeUrl || !baseUrl) return null;

  return {
    secret,
    audience: normalizeModuleSlug(audienceRaw),
    env,
    apiUrl,
    consumeUrl,
    exchangeUrl: resolveExchangeUrl(process.env.OPERATOROS_SSO_EXCHANGE_URL, consumeUrl),
    baseUrl: normalizeBaseUrl(baseUrl),
  };
}

export function getPublicConfig(): { baseUrl: string } | null {
  const cfg = loadConfig();
  if (!cfg) return null;
  return { baseUrl: cfg.baseUrl };
}

export function peekJti(token: string): string | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload?.jti === "string" ? payload.jti : null;
  } catch {
    return null;
  }
}

function isValidRole(r: unknown): r is OperatorOsRole {
  return r === "user" || r === "member" || r === "admin" || r === "super_admin";
}

function extractNestedEntitlementSource(raw: unknown): Record<string, unknown> | null {
  if (!isJsonObject(raw)) return null;
  if (isJsonObject(raw.entitlement)) return raw.entitlement;
  if (isJsonObject(raw.snapshot)) return raw.snapshot;
  return raw;
}

export function extractEntitlementClaims(
  raw: unknown,
  moduleSlug: string
): OperatorOsEntitlementClaims | null {
  const source = extractNestedEntitlementSource(raw);
  if (!source) return null;

  const normalizedModuleSlug = normalizeModuleSlug(moduleSlug);
  const tenant = isJsonObject(source.tenant) ? source.tenant : null;
  const subscription = isJsonObject(source.subscription) ? source.subscription : null;
  const modules = Array.isArray(source.modules)
    ? source.modules.filter(isJsonObject)
    : [];
  const receiverSlug = readString(source.receiver_slug);
  const targetModule = modules.find((entry) => {
    const slug = readString(entry.slug);
    if (!slug) return false;
    const normalized = normalizeModuleSlug(slug);
    return normalized === normalizedModuleSlug || normalized === normalizeModuleSlug(receiverSlug ?? "");
  });

  const explicitEnabledModules = readStringArray(source.all_enabled_modules);
  const enabledModules = explicitEnabledModules
    ?? (modules.length > 0
      ? modules
        .filter((entry) => entry.enabled === true && typeof entry.slug === "string")
        .map((entry) => String(entry.slug))
      : undefined);

  return {
    operatoros_tenant_id:
      readStringOrNull(source.operatoros_tenant_id)
      ?? readStringOrNull(source.tenant_id)
      ?? readStringOrNull(tenant?.id),
    tenant_id:
      readStringOrNull(source.tenant_id)
      ?? readStringOrNull(source.operatoros_tenant_id)
      ?? readStringOrNull(tenant?.id),
    organization_id:
      readStringOrNull(source.organization_id)
      ?? readStringOrNull(source.operatoros_tenant_id)
      ?? readStringOrNull(source.tenant_id)
      ?? readStringOrNull(tenant?.id),
    tenant_role: readStringOrNull(source.tenant_role) ?? readStringOrNull(tenant?.role),
    tenant_role_alias: readStringOrNull(source.tenant_role_alias) ?? readStringOrNull(tenant?.roleAlias),
    subscription_status: readStringOrNull(source.subscription_status) ?? readStringOrNull(subscription?.status),
    plan_slug: readStringOrNull(source.plan_slug) ?? readStringOrNull(subscription?.planSlug),
    target_module_enabled:
      readBooleanOrNull(source.target_module_enabled)
      ?? readBooleanOrNull(targetModule?.enabled),
    target_module_access_level:
      readStringOrNull(source.target_module_access_level)
      ?? readStringOrNull(targetModule?.accessLevel),
    target_module_role:
      readStringOrNull(source.target_module_role)
      ?? readStringOrNull(targetModule?.moduleRole),
    target_module_features:
      readRecordOrNull(source.target_module_features)
      ?? readRecordOrNull(targetModule?.features),
    all_enabled_modules: enabledModules,
    raw: source,
  };
}

export function mergeEntitlementClaims(
  ...sources: Array<OperatorOsEntitlementClaims | null | undefined>
): OperatorOsEntitlementClaims | null {
  const merged: OperatorOsEntitlementClaims = {};
  let sawSource = false;
  for (const source of sources) {
    if (!source) continue;
    sawSource = true;
    for (const key of Object.keys(source) as Array<keyof OperatorOsEntitlementClaims>) {
      const value = source[key];
      if (value !== undefined) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }
  return sawSource ? merged : null;
}

export function isTargetModuleEnabled(
  entitlement: OperatorOsEntitlementClaims | null | undefined,
  moduleSlug: string
): boolean | null {
  if (!entitlement) return null;
  if (entitlement.target_module_enabled === false) return false;
  if (entitlement.target_module_enabled === true) return true;
  if (entitlement.all_enabled_modules) {
    const normalizedModuleSlug = normalizeModuleSlug(moduleSlug);
    return entitlement.all_enabled_modules
      .map((slug) => normalizeModuleSlug(slug))
      .includes(normalizedModuleSlug);
  }
  return null;
}

export async function verifyToken(
  token: string,
  cfg: OperatorOsSsoConfig
): Promise<OperatorOsTokenClaims> {
  if (!token || typeof token !== "string") {
    throw new SsoRejectError("missing_token", 400);
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new SsoRejectError("bad_request", 400);
  }

  let header: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw new SsoRejectError("bad_request", 400);
  }
  if (header.alg !== "HS256") {
    throw new SsoRejectError("signature_invalid", 401);
  }

  const key = new TextEncoder().encode(cfg.secret);
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      clockTolerance: CLOCK_SKEW_S,
    });
    payload = result.payload as Record<string, unknown>;
  } catch (err: any) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new SsoRejectError("expired", 401);
    }
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
      throw new SsoRejectError("signature_invalid", 401);
    }
    if (err?.code === "ERR_JWS_INVALID" || err?.code === "ERR_JWT_INVALID") {
      throw new SsoRejectError("bad_request", 400);
    }
    throw new SsoRejectError("signature_invalid", 401);
  }

  const expectedIssuer = cfg.baseUrl;
  const actualIssuer = typeof payload.iss === "string" ? normalizeBaseUrl(payload.iss) : "";
  if (actualIssuer !== expectedIssuer) {
    throw new SsoRejectError("issuer_mismatch", 401);
  }

  const expectedAudience = normalizeModuleSlug(cfg.audience);
  const actualAudience = typeof payload.aud === "string" ? normalizeModuleSlug(payload.aud) : "";
  const actualModuleSlug = typeof payload.module_slug === "string" ? normalizeModuleSlug(payload.module_slug) : "";
  if (!actualAudience || actualAudience !== expectedAudience || actualModuleSlug !== expectedAudience) {
    throw new SsoRejectError("audience_mismatch", 401);
  }

  if (payload.env !== cfg.env) {
    throw new SsoRejectError("env_mismatch", 401);
  }

  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
    throw new SsoRejectError("bad_request", 400);
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.iat - CLOCK_SKEW_S > now) {
    throw new SsoRejectError("clock_skew", 401);
  }
  if (payload.exp + CLOCK_SKEW_S < now) {
    throw new SsoRejectError("expired", 401);
  }
  if (payload.exp < payload.iat - CLOCK_SKEW_S) {
    throw new SsoRejectError("bad_request", 400);
  }
  if (payload.exp - payload.iat > MAX_TOKEN_AGE_S + CLOCK_SKEW_S) {
    throw new SsoRejectError("expired", 401);
  }
  if (now - payload.iat > MAX_TOKEN_AGE_S + CLOCK_SKEW_S) {
    throw new SsoRejectError("expired", 401);
  }
  if (typeof payload.jti !== "string" || payload.jti.length === 0) {
    throw new SsoRejectError("bad_request", 400);
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new SsoRejectError("bad_request", 400);
  }
  if (typeof payload.user_id !== "string" || payload.user_id !== payload.sub) {
    throw new SsoRejectError("bad_request", 400);
  }
  if (typeof payload.email !== "string" || !payload.email.includes("@")) {
    throw new SsoRejectError("bad_request", 400);
  }
  if (!isValidRole(payload.role)) {
    throw new SsoRejectError("bad_request", 400);
  }

  const entitlement = extractEntitlementClaims(payload, expectedAudience);
  const organizationId =
    entitlement?.organization_id
    ?? entitlement?.operatoros_tenant_id
    ?? entitlement?.tenant_id
    ?? null;
  const planSlug = entitlement?.plan_slug ?? null;

  return {
    iss: actualIssuer,
    aud: actualAudience,
    module_slug: actualModuleSlug,
    env: String(payload.env),
    iat: payload.iat,
    exp: payload.exp,
    jti: payload.jti,
    sub: payload.sub,
    user_id: payload.user_id,
    email: payload.email,
    role: payload.role,
    plan_slug: planSlug,
    organization_id: organizationId,
    name: typeof payload.name === "string" ? payload.name : undefined,
    ...(entitlement ?? {}),
  };
}

function parseJsonBody(text: string): OperatorOsConsumeResponse | null {
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    return isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function consumeToken(
  claims: OperatorOsTokenClaims,
  cfg: OperatorOsSsoConfig
): Promise<OperatorOsConsumeResponse | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONSUME_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(cfg.consumeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.secret}`,
        "X-Module-Slug": cfg.audience,
      },
      body: JSON.stringify({
        jti: claims.jti,
        aud: claims.aud,
        env: claims.env,
      }),
      signal: ctrl.signal,
    });
  } catch {
    throw new SsoRejectError("sso_consume_unavailable", 502);
  } finally {
    clearTimeout(timer);
  }

  let body: OperatorOsConsumeResponse | null = null;
  try {
    body = parseJsonBody(await res.text());
  } catch {
    body = null;
  }

  if (res.status >= 200 && res.status < 300) return body;

  if (res.status >= 500) {
    throw new SsoRejectError("sso_consume_unavailable", 502);
  }

  const code: string = body?.code || body?.error || "";

  switch (code) {
    case "TOKEN_UNKNOWN":
    case "TOKEN_REPLAYED":
      throw new SsoRejectError("consume_failed", 401);
    case "TOKEN_EXPIRED":
      throw new SsoRejectError("expired", 401);
    case "AUDIENCE_MISMATCH":
      throw new SsoRejectError("audience_mismatch", 401);
    case "ENV_MISMATCH":
      throw new SsoRejectError("env_mismatch", 401);
    default:
      throw new SsoRejectError("consume_failed", 401);
  }
}

/**
 * Redeem an opaque `?code=` launch (Task #140) for the same single-use
 * consume payload the token path receives. This is the browser-safe path:
 * the JWT never touches the address bar. The exchange is a bearer-gated
 * server-to-server POST; on success the hub has already atomically marked
 * the underlying handoff consumed, so the returned payload cannot be
 * replayed. Error mapping mirrors `consumeToken` so the /sso route handles
 * both paths identically.
 */
export async function exchangeCode(
  code: string,
  cfg: OperatorOsSsoConfig
): Promise<OperatorOsConsumeResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONSUME_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(cfg.exchangeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.secret}`,
        "X-Module-Slug": cfg.audience,
      },
      body: JSON.stringify({ code, aud: cfg.audience, env: cfg.env }),
      signal: ctrl.signal,
    });
  } catch {
    throw new SsoRejectError("sso_consume_unavailable", 502);
  } finally {
    clearTimeout(timer);
  }

  let body: OperatorOsConsumeResponse | null = null;
  try {
    body = parseJsonBody(await res.text());
  } catch {
    body = null;
  }

  if (res.status >= 200 && res.status < 300) {
    if (!body || !isJsonObject(body.user)) {
      throw new SsoRejectError("consume_failed", 401);
    }
    return body;
  }

  if (res.status >= 500) {
    throw new SsoRejectError("sso_consume_unavailable", 502);
  }

  const errCode: string = body?.code || body?.error || "";
  switch (errCode) {
    case "INVALID_CODE":
    case "UNAUTHORIZED":
    case "TOKEN_UNKNOWN":
    case "TOKEN_REPLAYED":
      throw new SsoRejectError("consume_failed", 401);
    case "TOKEN_EXPIRED":
      throw new SsoRejectError("expired", 401);
    case "AUDIENCE_MISMATCH":
      throw new SsoRejectError("audience_mismatch", 401);
    case "ENV_MISMATCH":
      throw new SsoRejectError("env_mismatch", 401);
    default:
      throw new SsoRejectError("consume_failed", 401);
  }
}

/**
 * Reconstruct token-shaped claims from an exchange payload so the /sso
 * route's provisioning code path is identical for tokens and codes. The
 * exchange response already carries the authoritative identity (`user`)
 * and the canonical entitlement snapshot; we only surface the fields
 * `provisionOperatorOsUser` and `extractEntitlementClaims` read.
 */
export function claimsFromExchange(
  response: OperatorOsConsumeResponse,
  cfg: OperatorOsSsoConfig
): OperatorOsTokenClaims {
  const user = isJsonObject(response.user) ? response.user : {};
  const sub = readString(user.id);
  const email = readString(user.email);
  if (!sub || !email || !email.includes("@")) {
    throw new SsoRejectError("bad_request", 400);
  }
  const roleRaw = user.role;
  const role: OperatorOsRole = isValidRole(roleRaw) ? roleRaw : "user";
  const tenantId =
    readStringOrNull(response.operatoros_tenant_id)
    ?? readStringOrNull((response as Record<string, unknown>).operatorosTenantId)
    ?? null;
  const now = Math.floor(Date.now() / 1000);
  const entitlement = extractEntitlementClaims(response, cfg.audience);

  // Entitlement fields first (tenant_role, subscription_status,
  // target_module_*, etc.), then the authoritative token envelope so the
  // resolved identity + tenant + plan always win over any snapshot echo.
  return {
    ...(entitlement ?? {}),
    iss: cfg.baseUrl,
    aud: cfg.audience,
    module_slug: cfg.audience,
    env: cfg.env,
    iat: now,
    exp: now + 90,
    jti: readString(response.jti) ?? "",
    sub,
    user_id: sub,
    email,
    role,
    plan_slug: readStringOrNull(response.planSlug) ?? entitlement?.plan_slug ?? null,
    organization_id: tenantId,
    name: readString(user.name),
  };
}
