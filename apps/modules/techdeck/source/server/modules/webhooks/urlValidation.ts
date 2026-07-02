import { lookup } from "dns/promises";

const ALLOW_INTERNAL = process.env.ALLOW_INTERNAL_WEBHOOKS === "true";

const PRIVATE_IPV4_RANGES = [
  { prefix: "127.", label: "loopback" },
  { prefix: "10.", label: "RFC1918" },
  { prefix: "0.", label: "unspecified" },
];

function isPrivateIPv4(ip: string): string | null {
  for (const range of PRIVATE_IPV4_RANGES) {
    if (ip.startsWith(range.prefix)) return range.label;
  }

  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return null;

  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return "RFC1918";
  if (parts[0] === 192 && parts[1] === 168) return "RFC1918";
  if (parts[0] === 169 && parts[1] === 254) return "link-local";

  return null;
}

function isPrivateIPv6(ip: string): string | null {
  const normalized = ip.toLowerCase();

  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return "loopback";
  if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return "unspecified";
  if (normalized.startsWith("fe80:") || normalized.startsWith("fe80")) return "link-local";
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return "unique-local";
  if (normalized.startsWith("::ffff:")) {
    const v4part = normalized.slice(7);
    const v4reason = isPrivateIPv4(v4part);
    if (v4reason) return v4reason;
  }

  return null;
}

function isPrivateIP(ip: string): string | null {
  if (ip.includes(":")) return isPrivateIPv6(ip);
  return isPrivateIPv4(ip);
}

function validateUrlScheme(urlStr: string): { hostname: string } | { error: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { error: "Invalid URL" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: "Only http and https schemes are allowed" };
  }

  const hostname = parsed.hostname;
  if (!hostname) return { error: "URL must have a hostname" };

  if (hostname === "localhost" || hostname === "localhost.localdomain") {
    if (!ALLOW_INTERNAL) return { error: "localhost URLs are not allowed" };
  }

  const ipReason = isPrivateIP(hostname);
  if (ipReason && !ALLOW_INTERNAL) {
    return { error: `Private/internal IP addresses are not allowed (${ipReason})` };
  }

  return { hostname };
}

export async function validateWebhookUrl(urlStr: string): Promise<{ valid: true } | { valid: false; reason: string }> {
  const schemeResult = validateUrlScheme(urlStr);
  if ("error" in schemeResult) {
    return { valid: false, reason: schemeResult.error };
  }

  if (ALLOW_INTERNAL) return { valid: true };

  try {
    const result = await lookup(schemeResult.hostname, { all: true });
    for (const record of result) {
      const reason = isPrivateIP(record.address);
      if (reason) {
        return { valid: false, reason: `URL resolves to a private/internal address (${reason})` };
      }
    }
  } catch {
    return { valid: false, reason: "Could not resolve hostname" };
  }

  return { valid: true };
}

export function validateWebhookUrlSync(urlStr: string): { valid: true } | { valid: false; reason: string } {
  const schemeResult = validateUrlScheme(urlStr);
  if ("error" in schemeResult) {
    return { valid: false, reason: schemeResult.error };
  }

  if (ALLOW_INTERNAL) return { valid: true };

  return { valid: true };
}

export const MAX_WEBHOOK_PAYLOAD_BYTES = 256 * 1024;
export const WEBHOOK_TIMEOUT_MS = 10_000;
export const MAX_WEBHOOK_RETRIES = 5;
