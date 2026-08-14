/**
 * Task #108 — Service-to-service (S2S) authentication for entitlement
 * endpoints that module receivers call from their server side.
 *
 * The shared secret lives in `OPERATOROS_SERVICE_TOKEN`. Receivers send
 * it either as `Authorization: Bearer <token>` or `X-Service-Token`.
 * Comparison uses `crypto.timingSafeEqual` to avoid timing oracles.
 *
 * Fail-closed behavior: if the env var is not configured, every request
 * is rejected. We never default to "allow" — these endpoints expose
 * tenant entitlement data to anything that calls them.
 *
 * ───── TRUST-MODEL NOTE (read before deploying) ─────────────────────────
 * The current implementation uses a SINGLE global token shared across
 * every module receiver. Compromise of that token allows introspection of
 * any (user, tenant) entitlement snapshot AND registration of a webhook
 * URL on any module. This is acceptable for the v1 trust model where the
 * S2S boundary is internal (only OperatorOS-owned module receivers).
 *
 * Follow-up (tracked separately): replace this with per-module credentials
 * (HS256 service JWT carrying `module_slug`) and enforce caller-to-module
 * binding inside `/sync` and `/introspect`. Until then, OPERATOROS_SERVICE_TOKEN
 * MUST be at least 32 chars of high-entropy random data and treated as a
 * tier-1 secret.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';

function extractToken(request: FastifyRequest): string | null {
  const xh = request.headers['x-service-token'];
  const fromXh = Array.isArray(xh) ? xh[0] : xh;
  if (typeof fromXh === 'string' && fromXh.length > 0) return fromXh;

  const auth = request.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim() || null;
  }
  return null;
}

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // Still spend the comparison so length doesn't leak via timing.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

export async function requireServiceToken(request: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.OPERATOROS_SERVICE_TOKEN;
  if (!expected || expected.length < 16) {
    reply.code(503).send({
      error: 'Service-to-service authentication is not configured on this OperatorOS instance.',
      code: 'SERVICE_TOKEN_NOT_CONFIGURED',
    });
    return;
  }
  const presented = extractToken(request);
  if (!presented) {
    reply.code(401).send({
      error: 'Missing service token. Send Authorization: Bearer <token> or X-Service-Token.',
      code: 'SERVICE_TOKEN_REQUIRED',
    });
    return;
  }
  if (!safeEq(presented, expected)) {
    reply.code(401).send({
      error: 'Invalid service token.',
      code: 'SERVICE_TOKEN_INVALID',
    });
    return;
  }
  (request as any).serviceCaller = true;
}
