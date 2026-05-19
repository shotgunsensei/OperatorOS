/**
 * Task #108 — Entitlement HTTP surface.
 *
 *   GET  /v1/entitlements/me                       (user auth)
 *   GET  /v1/sso/entitlements/introspect           (service token)
 *   POST /v1/sso/entitlements/sync                 (service token)
 *
 * `/me` answers the active tenant from request context (URL param /
 * header / users.current_tenant_id, in that order).
 *
 * `/introspect` lets a module receiver verify a user's entitlements on
 * its own server. It accepts (user_id, tenant_id) as query params and
 * returns the same canonical snapshot shape as /me.
 *
 * `/sync` lets a receiver register (or update / clear) the webhook URL
 * we POST entitlement snapshots to when they change.
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { modules } from '../schema.js';
import { authenticate } from '../lib/auth.js';
import { resolveTenantContext } from '../lib/tenant-auth.js';
import { resolveEntitlements } from '../lib/entitlement-resolver.js';
import { requireServiceToken } from '../lib/service-token.js';

/**
 * Webhook URL validator. Hardened against SSRF on the outbound push path:
 *   - https only in production (http allowed for local dev / docker only)
 *   - reject obvious internal targets (loopback, link-local, RFC1918,
 *     metadata service) by hostname / literal IP inspection
 * Note: this is a coarse client-side filter — the propagation `fetch`
 * call also has a 5-second timeout. A determined attacker controlling
 * DNS could still pivot through a public hostname that resolves to a
 * private IP; receivers should be deployed behind an egress proxy if
 * that threat model applies.
 */
function isSafeWebhookUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  let u: URL;
  try { u = new URL(value); } catch { return false; }
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && u.protocol !== 'https:') return false;
  if (!isProd && u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.localhost')) return false;
  // IPv6 loopback / link-local
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return false;
  // IPv4 literal: block loopback / link-local / RFC1918 / metadata
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
    if (a === 127) return false;              // loopback
    if (a === 10) return false;               // 10/8
    if (a === 169 && b === 254) return false; // 169.254/16 (link-local + AWS metadata)
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16/12
    if (a === 192 && b === 168) return false; // 192.168/16
    if (a === 0) return false;
  }
  return true;
}

export async function registerEntitlementRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------
  // GET /v1/entitlements/me
  // -------------------------------------------------------------------
  app.get('/v1/entitlements/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const ctx = await resolveTenantContext(request);
    if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    const snapshot = await resolveEntitlements(user.id, ctx.tenantId);
    if (!snapshot) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    return snapshot;
  });

  // -------------------------------------------------------------------
  // GET /v1/sso/entitlements/introspect?user_id=&tenant_id=
  // -------------------------------------------------------------------
  app.get('/v1/sso/entitlements/introspect', { preHandler: [requireServiceToken] }, async (request, reply) => {
    // Task #108 — accept BOTH camelCase (userId/tenantId, per spec) and
    // snake_case (user_id/tenant_id, legacy) query-param styles so
    // integrators picking either convention from the docs both work.
    const q = (request.query ?? {}) as Record<string, string | undefined>;
    const userId = q.userId ?? q.user_id;
    const tenantId = q.tenantId ?? q.tenant_id;
    if (!userId || !tenantId) {
      return reply.code(400).send({
        error: 'userId (or user_id) and tenantId (or tenant_id) query params are required',
        code: 'INTROSPECT_PARAMS_REQUIRED',
      });
    }
    try {
      const snapshot = await resolveEntitlements(userId, tenantId);
      if (!snapshot) {
        return reply.code(404).send({
          error: 'No entitlement snapshot for this (user, tenant).',
          code: 'ENTITLEMENT_NOT_FOUND',
        });
      }
      return snapshot;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg.includes('not found')) {
        return reply.code(404).send({ error: msg, code: 'USER_NOT_FOUND' });
      }
      request.log.error({ err }, 'introspect failed');
      return reply.code(500).send({ error: 'Introspection failed', code: 'INTERNAL' });
    }
  });

  // -------------------------------------------------------------------
  // POST /v1/sso/entitlements/sync
  //   body: { module_slug, webhook_url | null }
  //   - non-null webhook_url   -> register / replace
  //   - null webhook_url       -> clear (stop receiving pushes)
  // -------------------------------------------------------------------
  app.post('/v1/sso/entitlements/sync', { preHandler: [requireServiceToken] }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const moduleSlug = typeof body.module_slug === 'string' ? body.module_slug : null;
    const webhookUrlRaw = body.webhook_url;
    if (!moduleSlug) {
      return reply.code(400).send({
        error: 'module_slug is required',
        code: 'SYNC_PARAMS_REQUIRED',
      });
    }
    let nextUrl: string | null;
    if (webhookUrlRaw === null) {
      nextUrl = null;
    } else if (isSafeWebhookUrl(webhookUrlRaw)) {
      nextUrl = webhookUrlRaw as string;
    } else {
      return reply.code(400).send({
        error: 'webhook_url must be a public http(s) URL (https only in production; private/loopback addresses are rejected), or null to clear.',
        code: 'SYNC_URL_INVALID',
      });
    }

    const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
    if (!mod) {
      return reply.code(404).send({
        error: `Module ${moduleSlug} not found`,
        code: 'MODULE_NOT_FOUND',
      });
    }

    const before = mod.entitlementWebhookUrl;
    await db.update(modules)
      .set({ entitlementWebhookUrl: nextUrl, updatedAt: new Date() })
      .where(eq(modules.id, mod.id));

    // Service-token callers have no user id, and admin_audit_logs.admin_id
    // is a FK to users.id — so we surface this via the request log instead
    // of writeAudit. Receivers also see the change reflected on next
    // /introspect call.
    request.log.info({
      moduleSlug, before: before ?? null, after: nextUrl, via: 'service_token',
    }, 'entitlement_webhook_url_set');

    return {
      module_slug: moduleSlug,
      webhook_url: nextUrl,
      updated: before !== nextUrl,
    };
  });
}
