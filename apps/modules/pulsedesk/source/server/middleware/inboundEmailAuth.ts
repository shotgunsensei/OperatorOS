import type { Request } from "express";

export type InboundAuthResult = { ok: true } | { ok: false; reason: string; status: number };

function normalizeIp(ip: string): string {
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

function getClientIp(req: Request): string {
  return normalizeIp(req.ip || "");
}

function parseList(env: string | undefined): string[] {
  if (!env) return [];
  return env
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function checkBasicAuth(req: Request, expected: string): boolean {
  const header = req.headers["authorization"];
  if (typeof header !== "string" || !header.toLowerCase().startsWith("basic ")) return false;
  const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  return decoded === expected;
}

function verifySendgridSignature(req: Request): boolean | null {
  const verificationKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
  if (!verificationKey) return null;
  const signature = req.headers["x-twilio-email-event-webhook-signature"];
  const timestamp = req.headers["x-twilio-email-event-webhook-timestamp"];
  if (typeof signature !== "string" || typeof timestamp !== "string") return null;
  try {
    const crypto = require("crypto") as typeof import("crypto");
    const publicKey = crypto.createPublicKey(verificationKey);
    const payload = timestamp + JSON.stringify(req.body);
    const decodedSignature = Buffer.from(signature, "base64");
    return crypto.verify("sha256", Buffer.from(payload), publicKey, decodedSignature);
  } catch {
    return false;
  }
}

export function verifySendgridInbound(req: Request): InboundAuthResult {
  const basicAuth = process.env.SENDGRID_INBOUND_BASIC_AUTH;
  const ipAllowlist = parseList(process.env.SENDGRID_INBOUND_IP_ALLOWLIST);
  const sigResult = verifySendgridSignature(req);

  const anyConfigured = !!basicAuth || ipAllowlist.length > 0 || sigResult !== null;

  if (!anyConfigured) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 401,
        reason:
          "SendGrid inbound webhook not authenticated: configure SENDGRID_INBOUND_BASIC_AUTH, SENDGRID_INBOUND_IP_ALLOWLIST, or SENDGRID_WEBHOOK_VERIFICATION_KEY",
      };
    }
    return { ok: true };
  }

  if (sigResult === true) return { ok: true };

  if (basicAuth && checkBasicAuth(req, basicAuth)) return { ok: true };

  if (ipAllowlist.length > 0) {
    const clientIp = getClientIp(req);
    if (clientIp && ipAllowlist.includes(clientIp)) return { ok: true };
  }

  return {
    ok: false,
    status: 401,
    reason: "SendGrid inbound request failed signature, basic-auth, and IP allowlist checks",
  };
}

export function verifyInboundRequest(providerName: string, req: Request): InboundAuthResult {
  if (providerName === "sendgrid") return verifySendgridInbound(req);
  return { ok: true };
}
