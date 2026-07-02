import { Router } from "express";
import { pool } from "../db";
import { resolveConsumeUrl } from "../auth/operatoros-sso";
import { getMasterAdminEmails } from "../config/masterAdmin";
import { getPublicAppBaseUrl } from "../services/operatorosEntitlements";

const router = Router();

function hasEnv(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

function hasAnyEnv(...names: string[]): boolean {
  return names.some((name) => Boolean(process.env[name]?.trim()));
}

function getEmailConnectorProviderStatus() {
  return {
    google: hasEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
    microsoft: hasEnv("MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"),
    imap: true,
    forwarding: true,
    sendgridInbound: hasAnyEnv(
      "SENDGRID_INBOUND_BASIC_AUTH",
      "SENDGRID_INBOUND_IP_ALLOWLIST",
      "SENDGRID_WEBHOOK_VERIFICATION_KEY"
    ),
    sendgridOutbound: hasEnv("SENDGRID_API_KEY"),
    mailgunInbound: hasEnv("MAILGUN_API_KEY"),
  };
}

router.get("/api/health", async (_req, res) => {
  let databaseOk = false;
  try {
    await pool.query("select 1");
    databaseOk = true;
  } catch {
    databaseOk = false;
  }

  const consumeUrl = resolveConsumeUrl(
    process.env.OPERATOROS_SSO_CONSUME_URL,
    process.env.OPERATOROS_API_URL
  );
  const emailConnectorProvidersConfigured = getEmailConnectorProviderStatus();
  const ssoConfigured = hasEnv(
    "MODULE_SSO_SECRET",
    "OPERATOROS_BASE_URL",
    "OPERATOROS_SSO_AUDIENCE",
    "OPERATOROS_SSO_ENV"
  );

  const body = {
    ok: databaseOk,
    databaseOk,
    sessionConfigured: process.env.NODE_ENV !== "production" || hasEnv("SESSION_SECRET"),
    ssoConfigured,
    operatorOsConsumeConfigured: Boolean(consumeUrl),
    entitlementWebhookConfigured: hasEnv(
      "MODULE_SSO_SECRET",
      "OPERATOROS_SERVICE_TOKEN",
      "OPERATOROS_BASE_URL"
    ) && Boolean(getPublicAppBaseUrl()),
    masterAdminConfigured: getMasterAdminEmails().length > 0,
    emailConnectorProvidersConfigured,
  };

  return res.status(databaseOk ? 200 : 503).json(body);
});

export default router;
