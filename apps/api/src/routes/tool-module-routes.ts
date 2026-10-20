import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { tenants } from '../schema.js';
import { authenticate } from '../lib/auth.js';
import { resolveTenantContext } from '../lib/tenant-auth.js';
import { getTenantMembership } from '../lib/tenant-entitlements.js';
import { toolModuleCatalogReadiness } from '../lib/tool-module-policy.js';

/** Read-only readiness, not a checkout, license, download or execution API. */
export async function registerToolModuleRoutes(app: FastifyInstance) {
  app.get('/v1/tools/catalog', { preHandler: [authenticate] }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const user = (request as any).user;
    const context = await resolveTenantContext(request);
    if (!context) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });

    // Support authority is not purchase authority. Re-read a real membership:
    // resolveTenantContext permits synthetic owner context for platform admins.
    const [membership, rows] = await Promise.all([
      getTenantMembership(user.id, context.tenantId),
      db.select().from(tenants).where(eq(tenants.id, context.tenantId)).limit(1),
    ]);
    const tenant = rows[0];
    if (!membership || !tenant || tenant.status === 'archived') {
      return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    }
    if (tenant.status !== 'active') {
      return reply.code(403).send({ error: 'Tenant is not active', code: 'TENANT_INACTIVE' });
    }
    return toolModuleCatalogReadiness({
      userId: user.id, userStatus: user.status,
      tenantId: tenant.id, tenantStatus: tenant.status, ownerUserId: tenant.ownerUserId,
      membership: { userId: membership.userId, tenantId: membership.tenantId, role: membership.role },
    });
  });
}
