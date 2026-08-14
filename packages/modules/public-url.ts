/**
 * Shared, framework-agnostic public-URL helpers.
 *
 * OperatorOS serves every subdomain (`operatoros.net`, `app`, `auth`, `api`,
 * and each module host) from a SINGLE Replit deployment using host-based
 * routing. Internally the web app binds to Replit's required port (e.g.
 * `5000`) and Replit's proxy terminates TLS and forwards the request with the
 * public host in `x-forwarded-host` / `x-forwarded-proto`.
 *
 * The classic production bug is building a browser-facing URL from the inbound
 * request URL, which behind the proxy still carries the internal `:5000` port
 * and `http`. That produces broken links like `http://auth.operatoros.net:5000`.
 *
 * These helpers are the single source of truth for turning an inbound request
 * into a clean public origin:
 *   - Exact registered production hosts always resolve to a
 *     clean `https://<host>` origin with NO internal port.
 *   - Local dev / Replit preview hosts keep their protocol and port so
 *     development keeps working.
 *
 * They are pure (no framework or Node globals) so both the Fastify API and the
 * Next.js edge middleware can import them.
 */
import { PLATFORM_DOMAINS } from '../sdk/src/ecosystem.js';
import {
  getHostSurface,
  normalizeHost,
  type OperatorOSHostSurface,
} from './registry.js';

export { normalizeHost };

/** Host-role classification for a request host. */
export type PublicHostRole = OperatorOSHostSurface;

export interface PublicOriginInput {
  /** Raw `Host` header (may include a port). */
  host?: string | null;
  /** `x-forwarded-host` header value (may be comma-separated). */
  forwardedHost?: string | null;
  /** `x-forwarded-proto` header value (may be comma-separated). */
  forwardedProto?: string | null;
}

/**
 * A recognized production host is an exact platform or module hostname from
 * the registry. Merely sharing the `operatoros.net` suffix is insufficient.
 * Ports are ignored (normalized away) before comparison.
 */
export function isProductionHost(host: string | null | undefined): boolean {
  const normalized = normalizeHost(host);
  if (!normalized) return false;
  return getHostSurface(normalized) !== 'unknown';
}

/** Loopback hosts that are safe redirect targets in local development. */
export function isLocalHost(host: string | null | undefined): boolean {
  const raw = String(host ?? '').trim().toLowerCase();
  if (raw === '::1') return true;
  const normalized = normalizeHost(host).replace(/^\[|\]$/g, '');
  if (!normalized) return false;
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost')
  );
}

/**
 * True when a host is a safe SAME-SITE redirect target: a recognized
 * production host or loopback host. Used to reject open redirects. Replit
 * preview/public suffixes are not trusted without explicit registration.
 */
export function isSameSiteHost(host: string | null | undefined): boolean {
  return isProductionHost(host) || isLocalHost(host);
}

/** Classify a host into its platform role (root/app/auth/api/module/...). */
export function resolveHostRole(host: string | null | undefined): PublicHostRole {
  return getHostSurface(host);
}

function firstHeaderValue(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).split(',')[0]?.trim() ?? '';
}

function hostWithPortFrom(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.includes('://')) {
    try {
      return new URL(trimmed).host;
    } catch {
      return trimmed.split('/')[0] ?? '';
    }
  }
  return trimmed;
}

/**
 * Resolve the clean, browser-facing origin for an inbound request.
 *
 * Recognized production hosts always collapse to `https://<host>` (no port).
 * Everything else (localhost / Replit preview) preserves the inbound protocol
 * and port so local development keeps working.
 */
export function getPublicOrigin(input: PublicOriginInput): string {
  const forwardedHost = firstHeaderValue(input.forwardedHost);
  const rawHost = forwardedHost || firstHeaderValue(input.host);
  const normalized = normalizeHost(rawHost);

  if (isProductionHost(normalized)) {
    return `https://${normalized}`;
  }

  const proto = firstHeaderValue(input.forwardedProto) || 'http';
  const hostWithPort = hostWithPortFrom(rawHost) || normalized || 'localhost';
  return `${proto}://${hostWithPort}`;
}

function originForRole(role: PublicHostRole): string {
  switch (role) {
    case 'app':
      return PLATFORM_DOMAINS.app;
    case 'auth':
      return PLATFORM_DOMAINS.auth;
    case 'api':
      return PLATFORM_DOMAINS.api;
    case 'root':
    default:
      return PLATFORM_DOMAINS.root;
  }
}

/**
 * Build a clean public URL for a platform host role. Module hosts are not
 * addressable by role alone (use the module's `launchUrl` instead); they fall
 * back to the root origin here.
 */
export function buildPublicUrl(path: string, hostRole: PublicHostRole): string {
  const origin = originForRole(hostRole);
  const suffix = !path ? '' : path.startsWith('/') ? path : `/${path}`;
  return `${origin}${suffix}`;
}

/**
 * Sanitize a post-login / post-logout destination to prevent open redirects.
 *
 * Accepts:
 *   - Relative same-origin paths (`/app/...`), rejecting protocol-relative
 *     `//evil.com` values.
 *   - HTTPS URLs whose host is exactly registered, returned verbatim so
 *     cross-subdomain hand-back works.
 *   - HTTP(S) loopback URLs for local development only.
 *
 * Anything else collapses to `fallback`.
 */
export function sanitizeReturnTo(
  raw: string | null | undefined,
  fallback = '/app',
): string {
  if (!raw || typeof raw !== 'string') return fallback;
  const value = raw.trim();
  if (!value) return fallback;

  // WHATWG URL parsing treats backslashes as authority separators for special
  // schemes. For example `/\\evil.com` resolves to `https://evil.com/` when
  // combined with an HTTPS base. Reject raw/encoded separators and controls
  // before either the relative or absolute branch sees them.
  if (
    /[\\\u0000-\u001f\u007f]/.test(value) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|5c|7f)/i.test(value) ||
    /^\/%2f/i.test(value)
  ) {
    return fallback;
  }

  if (value.startsWith('/')) {
    if (value.startsWith('//')) return fallback;
    try {
      const trustedBase = new URL('https://operatoros-return.invalid');
      const parsed = new URL(value, trustedBase);
      if (parsed.origin !== trustedBase.origin || parsed.username || parsed.password) {
        return fallback;
      }
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return fallback;
    }
  }

  try {
    const parsed = new URL(value);
    const isHttpsProductionTarget =
      parsed.protocol === 'https:' && isProductionHost(parsed.hostname);
    const isLocalDevelopmentTarget =
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      isLocalHost(parsed.hostname);
    if (
      !parsed.username &&
      !parsed.password &&
      (isHttpsProductionTarget || isLocalDevelopmentTarget)
    ) {
      return parsed.toString();
    }
  } catch {
    /* not an absolute URL */
  }

  return fallback;
}
