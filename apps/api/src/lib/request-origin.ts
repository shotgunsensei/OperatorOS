function normalizeHostname(value: string | string[] | undefined): string | null {
  const raw = (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export interface BrowserRequestOriginInput {
  origin: string | undefined;
  host: string | string[] | undefined;
  forwardedHost: string | string[] | undefined;
  trustProxy: boolean;
  production: boolean;
}

/**
 * Production browser requests must remain same-origin with the public host.
 *
 * All OperatorOS browser API calls use same-origin `/api/*` rewrites. Merely
 * belonging to `*.operatoros.net` is not enough: sibling subdomains are
 * same-site for cookie purposes, so accepting one module Origin against an
 * auth/app host would defeat host-only session isolation.
 */
export function isBrowserRequestOriginAllowed(input: BrowserRequestOriginInput): boolean {
  if (!input.origin || !input.production) return true;

  let origin: URL;
  try {
    origin = new URL(input.origin);
  } catch {
    return false;
  }
  if (
    origin.protocol !== 'https:' || origin.username || origin.password ||
    (origin.port && origin.port !== '443')
  ) return false;

  const directHost = normalizeHostname(input.host);
  const forwardedHost = input.trustProxy
    ? normalizeHostname(input.forwardedHost)
    : null;
  // Once the deployment explicitly trusts its proxy, the proxy-supplied
  // public host is authoritative. Accepting both the internal/direct Host and
  // X-Forwarded-Host would let a conflicting pair satisfy the check through
  // whichever value happened to match the attacker-controlled Origin.
  const publicHost = forwardedHost || directHost;
  return !!publicHost && publicHost === origin.hostname.toLowerCase();
}
