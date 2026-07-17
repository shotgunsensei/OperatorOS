import { logger } from "./logger";

/**
 * Centralised configuration for the OperatorOS SSO + entitlement-sync
 * contract. All values come from environment variables — see
 * `docs/operatoros-sso.md` for the full list.
 *
 * `assertSsoConfigOrExit` is invoked at boot. In production the process
 * exits when required env is missing or the shared secret is too short. In
 * development we log a loud warning but still allow the rest of the server
 * to start so unrelated work isn't blocked.
 *
 * Env precedence (new names win, legacy fall through):
 *   secret     ← OPERATOROS_JWT_SECRET    || MODULE_SSO_SECRET
 *   audience   ← CHILD_APP_MODULE_KEY     || OPERATOROS_SSO_AUDIENCE
 *   issuer     ← OPERATOROS_ISSUER        || OPERATOROS_BASE_URL
 *   apiBase    ← OPERATOROS_BASE_URL      || OPERATOROS_API_URL
 *   consume    ← OPERATOROS_API_URL       || OPERATOROS_BASE_URL
 *
 * `serviceToken` (OPERATOROS_SERVICE_TOKEN) gates the inbound
 * `/api/operatoros/entitlements/sync` endpoint. It is OPTIONAL — when
 * missing, the sync endpoint refuses every request and the pivot falls
 * back to "snapshot is whatever the last SSO launch carried".
 */
export interface SsoConfig {
  secret: string;
  issuer: string;
  audience: string;
  env: string;
  apiUrl: string;
  consumeUrl: string;
  baseUrl: string;
  serviceToken: string | null;
}

function pickEnv(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.length > 0) return v;
  }
  return "";
}

export function getSsoConfig(): SsoConfig | null {
  const secret = pickEnv("OPERATOROS_JWT_SECRET", "MODULE_SSO_SECRET");
  const audience = pickEnv(
    "CHILD_APP_MODULE_KEY",
    "OPERATOROS_SSO_AUDIENCE",
  ).toLowerCase();
  const issuer = pickEnv("OPERATOROS_ISSUER", "OPERATOROS_BASE_URL");
  const baseUrl = pickEnv("OPERATOROS_BASE_URL", "OPERATOROS_ISSUER");
  const env = process.env.OPERATOROS_SSO_ENV || "";
  const apiUrl = pickEnv("OPERATOROS_API_URL", "OPERATOROS_BASE_URL");
  const serviceToken = process.env.OPERATOROS_SERVICE_TOKEN || null;
  if (!secret || secret.length < 16) return null;
  if (!issuer || !audience || !env || !apiUrl) return null;
  const consumeUrl = `${apiUrl.replace(/\/+$/, "")}/v1/modules/sso/consume`;
  return {
    secret,
    issuer,
    audience,
    env,
    apiUrl,
    consumeUrl,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    serviceToken,
  };
}

export function assertSsoConfigOrExit(): void {
  const isProd =
    process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
  const secret = pickEnv("OPERATOROS_JWT_SECRET", "MODULE_SSO_SECRET");
  const missing: string[] = [];
  if (!secret) missing.push("OPERATOROS_JWT_SECRET (or MODULE_SSO_SECRET)");
  else if (secret.length < 16)
    missing.push("OPERATOROS_JWT_SECRET (must be >= 16 chars)");
  if (!pickEnv("OPERATOROS_ISSUER", "OPERATOROS_BASE_URL"))
    missing.push("OPERATOROS_ISSUER (or OPERATOROS_BASE_URL)");
  if (!pickEnv("CHILD_APP_MODULE_KEY", "OPERATOROS_SSO_AUDIENCE"))
    missing.push("CHILD_APP_MODULE_KEY (or OPERATOROS_SSO_AUDIENCE)");
  if (!process.env.OPERATOROS_SSO_ENV) missing.push("OPERATOROS_SSO_ENV");
  if (!pickEnv("OPERATOROS_API_URL", "OPERATOROS_BASE_URL"))
    missing.push("OPERATOROS_API_URL (or OPERATOROS_BASE_URL)");
  if (missing.length === 0) return;
  if (isProd) {
    logger.fatal(
      { missing },
      "OperatorOS SSO env config missing — refusing to start",
    );
    process.exit(1);
  }
  logger.warn(
    { missing },
    "OperatorOS SSO env config incomplete; /sso endpoint will return 503 until configured",
  );
}
