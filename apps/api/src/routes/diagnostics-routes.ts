import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  getRequestHostRole,
  getRequestPublicOrigin,
  isProductionEnv,
  isProductionHost,
  normalizeHost,
} from '../lib/public-url.js';
import { PRODUCTION_SESSION_COOKIE_DOMAIN } from '../../../../packages/auth/index.js';

/**
 * Non-secret runtime diagnostics for subdomain / public-URL resolution.
 *
 * This endpoint exists to make production host-routing debuggable WITHOUT
 * shelling into the deployment. It echoes only how the server *interprets* the
 * inbound request (host role, normalized host, forwarded headers, resolved
 * public origin, cookie-domain mode). It never returns secrets, env values, or
 * anything tied to a session, so it is safe to leave unauthenticated.
 */
function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function buildPublicUrlDiagnostics(request: FastifyRequest) {
  const rawHost = firstHeader(request.headers.host);
  const forwardedHost = firstHeader(request.headers['x-forwarded-host']);
  const forwardedProto = firstHeader(request.headers['x-forwarded-proto']);
  const effectiveHost = forwardedHost || rawHost;
  const normalized = normalizeHost(effectiveHost);
  const production = isProductionEnv();

  return {
    ok: true,
    environment: production ? 'production' : 'development',
    host: {
      raw: rawHost,
      forwarded: forwardedHost,
      normalized,
    },
    forwardedProto,
    hostRole: getRequestHostRole(request),
    isProductionHost: isProductionHost(normalized),
    isKnownSubdomain: isProductionHost(normalized),
    publicOrigin: getRequestPublicOrigin(request),
    cookieDomainMode: production ? 'parent-domain' : 'host-only',
    cookieDomain: production ? PRODUCTION_SESSION_COOKIE_DOMAIN : null,
  };
}

export async function registerDiagnosticsRoutes(app: FastifyInstance): Promise<void> {
  const handler = async (request: FastifyRequest) => buildPublicUrlDiagnostics(request);
  app.get('/v1/diagnostics/public-url', handler);
  app.get('/api/diagnostics/public-url', handler);
}
