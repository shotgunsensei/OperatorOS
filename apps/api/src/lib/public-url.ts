/**
 * API-side public-URL resolution.
 *
 * Re-exports the shared, framework-agnostic helpers and adds the Node/env-aware
 * pieces the Fastify server needs: reading `x-forwarded-*` headers off a
 * Fastify request and resolving the canonical platform/app base URLs from
 * environment configuration.
 *
 * The rule everywhere: in production NEVER emit an internal port or `http://`.
 * When an explicit base URL env var is set we honor it; otherwise production
 * falls back to the clean HTTPS platform domains and dev falls back to
 * localhost (so `pnpm dev` keeps working).
 */
import type { FastifyRequest } from 'fastify';
import { PLATFORM_DOMAINS } from '../../../../packages/sdk/src/ecosystem.js';
import {
  getPublicOrigin,
  resolveHostRole,
  type PublicHostRole,
} from '../../../../packages/modules/public-url.js';

export * from '../../../../packages/modules/public-url.js';

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function isProductionEnv(): boolean {
  const v = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  return v === 'production' || v === 'prod';
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Canonical platform base URL (root domain) used for SSO issuer, invite links,
 * and anywhere a stable identity/root origin is needed.
 */
export function resolvePlatformBaseUrl(): string {
  const explicit = process.env.OPERATOROS_BASE_URL || process.env.APP_URL;
  if (explicit && explicit.trim()) return trimTrailingSlash(explicit.trim());
  return isProductionEnv() ? PLATFORM_DOMAINS.root : 'http://localhost:5000';
}

/**
 * Canonical console/app base URL used for post-checkout and billing-portal
 * return URLs (the authenticated console lives on `app.operatoros.net`).
 */
export function resolveAppBaseUrl(): string {
  const explicit = process.env.APP_URL || process.env.OPERATOROS_BASE_URL;
  if (explicit && explicit.trim()) return trimTrailingSlash(explicit.trim());
  return isProductionEnv() ? PLATFORM_DOMAINS.app : 'http://localhost:5000';
}

/** Resolve the clean public origin for an inbound Fastify request. */
export function getRequestPublicOrigin(request: FastifyRequest): string {
  return getPublicOrigin({
    host: firstHeader(request.headers.host),
    forwardedHost: firstHeader(request.headers['x-forwarded-host']),
    forwardedProto: firstHeader(request.headers['x-forwarded-proto']),
  });
}

/** Resolve the host role for an inbound Fastify request. */
export function getRequestHostRole(request: FastifyRequest): PublicHostRole {
  const forwardedHost = firstHeader(request.headers['x-forwarded-host']);
  const host = forwardedHost || firstHeader(request.headers.host);
  return resolveHostRole(host);
}
