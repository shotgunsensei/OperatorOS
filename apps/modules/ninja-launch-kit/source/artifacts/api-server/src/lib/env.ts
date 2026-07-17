import { z } from "zod";
import { logger } from "./logger";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z
    .string()
    .min(1, "PORT is required")
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "PORT must be a positive number"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid Postgres URL"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 chars").optional(),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  STRIPE_PRO_PRICE_ID: z.string().startsWith("price_").optional(),
  STRIPE_AGENCY_PRICE_ID: z.string().startsWith("price_").optional(),
  PUBLIC_BASE_URL: z.string().url().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  MODULE_SSO_SECRET: z.string().min(16, "MODULE_SSO_SECRET must be at least 16 chars").optional(),
  OPERATOROS_BASE_URL: z.string().url().optional(),
  OPERATOROS_SSO_AUDIENCE: z
    .string()
    .min(1)
    .refine((v) => v === v.toLowerCase(), "OPERATOROS_SSO_AUDIENCE must be lowercase")
    .optional(),
  OPERATOROS_SSO_ENV: z.enum(["prod", "staging", "dev"]).optional(),
  OPERATOROS_API_URL: z.string().url().optional(),
  OPERATOROS_SSO_DISABLED: z.enum(["0", "1"]).optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    logger.fatal({ issues: result.error.issues }, `Invalid environment configuration:\n${issues}`);
    throw new Error(`Environment validation failed:\n${issues}`);
  }
  const env = result.data;

  if (env.NODE_ENV === "production" && !env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required in production");
  }

  const ssoKeys = [
    env.MODULE_SSO_SECRET,
    env.OPERATOROS_BASE_URL,
    env.OPERATOROS_SSO_AUDIENCE,
    env.OPERATOROS_SSO_ENV,
    env.OPERATOROS_API_URL,
  ];
  const ssoPresent = ssoKeys.filter(Boolean).length;
  // Production safety: SSO must be either fully configured or fully absent.
  // OperatorOS requires fail-fast when MODULE_SSO_SECRET is missing in prod
  // (per spec: "If MODULE_SSO_SECRET is missing, fail startup loudly. Do not
  // fall back to unsigned launches in production."). We extend that to the
  // full tuple so a partial deploy can never produce silently-broken SSO.
  if (env.NODE_ENV === "production") {
    if (env.OPERATOROS_SSO_DISABLED === "1") {
      if (ssoPresent > 0) {
        throw new Error(
          "OPERATOROS_SSO_DISABLED=1 set but SSO env vars are also configured — pick one.",
        );
      }
    } else if (ssoPresent < ssoKeys.length) {
      throw new Error(
        "OperatorOS SSO is required in production. Set ALL of MODULE_SSO_SECRET (>=16 chars), OPERATOROS_BASE_URL, OPERATOROS_SSO_AUDIENCE, OPERATOROS_SSO_ENV, OPERATOROS_API_URL — or set OPERATOROS_SSO_DISABLED=1 to opt out explicitly.",
      );
    }
  } else if (ssoPresent > 0 && ssoPresent < ssoKeys.length) {
    logger.warn(
      { configured: ssoPresent, required: ssoKeys.length },
      "Partial OperatorOS SSO configuration — /api/sso will reject all launches until all 5 vars are set.",
    );
  }

  const stripeKeys = [env.STRIPE_SECRET_KEY, env.STRIPE_PRO_PRICE_ID, env.STRIPE_AGENCY_PRICE_ID];
  const stripePresent = stripeKeys.filter(Boolean).length;
  if (stripePresent > 0 && stripePresent < stripeKeys.length) {
    logger.warn(
      { configured: stripePresent, required: stripeKeys.length },
      "Partial Stripe configuration detected — running in DEMO mode. Set STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, STRIPE_AGENCY_PRICE_ID, and STRIPE_WEBHOOK_SECRET together to enable live billing.",
    );
  }

  logger.info(
    {
      nodeEnv: env.NODE_ENV,
      stripeEnabled: stripePresent === stripeKeys.length,
      hasWebhookSecret: !!env.STRIPE_WEBHOOK_SECRET,
      publicBaseUrl: env.PUBLIC_BASE_URL ?? "(unset)",
      ssoEnabled: ssoPresent === ssoKeys.length,
      ssoEnv: env.OPERATOROS_SSO_ENV ?? "(unset)",
    },
    "Environment loaded",
  );

  return env;
}

export const env: Env = loadEnv();
