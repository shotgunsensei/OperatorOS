import type { FastifyReply, FastifyRequest } from 'fastify';
import { normalizeHost } from '../../../../packages/modules/registry.js';
import { runtimeTrustsProxy } from './proxy-trust.js';

export const PLATFORM_PUBLIC_AUTH_HOSTS = Object.freeze([
  'operatoros.net',
  'app.operatoros.net',
  'auth.operatoros.net',
] as const);

const PLATFORM_PUBLIC_AUTH_HOST_SET = new Set<string>(PLATFORM_PUBLIC_AUTH_HOSTS);

function isLoopbackHost(host: string): boolean {
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host === '::1'
    || host.endsWith('.localhost');
}

function firstHeader(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(',')[0]?.trim() || null;
}

function runtimeIsProduction(): boolean {
  const value = (process.env.APP_ENV || process.env.NODE_ENV || '').trim().toLowerCase();
  return value === 'production' || value === 'prod';
}

export interface PlatformPublicAuthHostInput {
  host: string | string[] | undefined;
  forwardedHost?: string | string[] | undefined;
  trustProxy: boolean;
  production: boolean;
}

export function resolvePlatformPublicAuthHost(input: PlatformPublicAuthHostInput): string {
  const directHost = firstHeader(input.host);
  const forwardedHost = input.trustProxy ? firstHeader(input.forwardedHost) : null;
  return normalizeHost(forwardedHost || directHost);
}

/**
 * Platform credentials may only be submitted to the three canonical public
 * identity/console hosts (or an explicit loopback host during development).
 * Child module and public preview hosts use the browser SSO exchange and must
 * never be able to mint a broad platform session.
 */
export function isPlatformPublicAuthHostAllowed(input: PlatformPublicAuthHostInput): boolean {
  const host = resolvePlatformPublicAuthHost(input);
  if (PLATFORM_PUBLIC_AUTH_HOST_SET.has(host)) return true;
  return !input.production && isLoopbackHost(host);
}

export function enforcePlatformPublicAuthHost(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  reply.header('Cache-Control', 'no-store');
  reply.header('Pragma', 'no-cache');
  reply.header('Referrer-Policy', 'no-referrer');

  const allowed = isPlatformPublicAuthHostAllowed({
    host: request.headers.host,
    forwardedHost: request.headers['x-forwarded-host'],
    trustProxy: runtimeTrustsProxy(),
    production: runtimeIsProduction(),
  });
  if (allowed) return true;

  reply.code(403).send({
    error: 'This authentication flow is not available on the requested host',
    code: 'AUTH_HOST_NOT_ALLOWED',
  });
  return false;
}
