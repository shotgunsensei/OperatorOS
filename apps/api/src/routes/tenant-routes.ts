/**
 * Gate 1 — Minimal tenant routes.
 *
 *   GET  /v1/tenants                — list ALL tenants (super_admin only)
 *   GET  /v1/tenants/:tenantId      — fetch one tenant (member or super_admin)
 *   GET  /v1/me/tenants             — list tenants the caller belongs to
 *   POST /v1/tenants/:tenantId/switch — set users.current_tenant_id
 *
 * HTTP code policy:
 *   - cross-tenant or missing tenant -> 404 TENANT_NOT_FOUND
 *   - platform-only route w/ non-super_admin -> 403 PLATFORM_ROLE_REQUIRED
 *   - validation error -> 400
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { tenants, tenantUsers, users } from '../schema.js';
import { authenticate } from '../lib/auth.js';
import { requireSuperAdmin, requireTenantMember } from '../lib/tenant-auth.js';

export async function registerTenantRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────────────────────────────
  // Platform: list every tenant (super_admin only).
  // ──────────────────────────────────────────────────────────────────────
  app.get('/v1/tenants', { preHandler: [requireSuperAdmin] }, async (_req, reply) => {
    const rows = await db.select().from(tenants);
    return reply.send({ tenants: rows, total: rows.length });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Fetch one tenant. Membership enforced by `requireTenantMember`,
  // which collapses non-membership to 404 to avoid leaking existence.
  // ──────────────────────────────────────────────────────────────────────
  app.get<{ Params: { tenantId: string } }>(
    '/v1/tenants/:tenantId',
    { preHandler: [requireTenantMember] },
    async (request, reply) => {
      const ctx = (request as any).tenantContext;
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
      // The pre-handler already verified existence + membership; this is a
      // belt-and-braces guard against a race where the tenant is deleted
      // between the pre-handler and the handler.
      if (!tenant) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      return reply.send({
        tenant,
        membership: { role: ctx.role, viaPlatformRole: ctx.viaPlatformRole },
      });
    },
  );

  // ──────────────────────────────────────────────────────────────────────
  // List the caller's tenants. Always at least one row (their personal tenant).
  // ──────────────────────────────────────────────────────────────────────
  app.get('/v1/me/tenants', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const memberships = await db.select().from(tenantUsers).where(eq(tenantUsers.userId, user.id));
    if (memberships.length === 0) {
      return reply.send({ tenants: [], current: null });
    }
    const tenantIds = memberships.map(m => m.tenantId);
    const rows = await db.select().from(tenants).where(inArray(tenants.id, tenantIds));
    const roleByTenant = Object.fromEntries(memberships.map(m => [m.tenantId, m.role]));
    return reply.send({
      tenants: rows.map(t => ({ ...t, role: roleByTenant[t.id] })),
      current: user.currentTenantId ?? null,
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Switch the caller's active tenant. Verifies membership; returns 404
  // when the caller is not a member (do not reveal tenant existence).
  // ──────────────────────────────────────────────────────────────────────
  app.post<{ Params: { tenantId: string } }>(
    '/v1/tenants/:tenantId/switch',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = (request as any).user;
      const { tenantId } = request.params;
      if (!tenantId) {
        return reply.code(400).send({ error: 'tenantId is required', code: 'BAD_REQUEST' });
      }
      // Direct (tenantId, userId) predicate — single-row indexed lookup,
      // no in-memory filter. Membership existence implies tenant existence
      // so we can collapse both checks into one query.
      const [membership] = await db.select().from(tenantUsers)
        .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, user.id)))
        .limit(1);
      if (!membership && user.platformRole !== 'super_admin') {
        return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      }
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) {
        return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      }
      // Gate 2: archived tenants are invisible to non-super-admins.
      if ((tenant as any).status === 'archived' && user.platformRole !== 'super_admin') {
        return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      }
      // Gate 2: suspended tenant denies module launch and login-into-it
      // for everyone except super_admin (who needs access to un-suspend).
      if ((tenant as any).status === 'suspended' && user.platformRole !== 'super_admin') {
        return reply.code(403).send({
          error: 'Tenant is suspended. Contact platform administrator.',
          code: 'TENANT_SUSPENDED',
        });
      }
      await db.update(users)
        .set({ currentTenantId: tenantId, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      return reply.send({
        ok: true,
        currentTenantId: tenantId,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, type: tenant.type },
      });
    },
  );
}
