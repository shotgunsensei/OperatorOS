process.env.SESSION_SECRET ||= 'operatoros-brandforgeos-platform-delete-test-v1';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  adminAuditLogs,
  brandforgeBrands,
  brandforgeCalendarItems,
  brandforgeCampaignMetrics,
  brandforgeCampaigns,
  brandforgeCopyAssets,
  brandforgeGenerations,
  brandforgeWorkspaceSettings,
  modules,
  tenants,
  users,
} from '../src/schema.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
  uniqueId,
} from './_setup.js';

let app: ReturnType<typeof Fastify>;
let admin: Awaited<ReturnType<typeof createTestUser>>;
let moduleId: string;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;

const bearer = () => ({
  authorization: `Bearer ${signToken({
    userId: admin.id,
    email: admin.email,
    role: admin.role,
    tokenVersion: admin.tokenVersion,
    sessionType: 'platform',
  })}`,
});

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  admin = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, admin.id));
  let [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'brandforgeos')).limit(1);
  if (!moduleRow) {
    moduleRow = await createTestModule('brandforgeos');
    createdModule = true;
  }
  moduleId = moduleRow.id;

  const { registerPlatformRoutes } = await import('../src/routes/platform-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerPlatformRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (admin) {
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.adminId, admin.id));
    await cleanupUser(admin.id);
  }
  if (createdModule && moduleId) await cleanupModule(moduleId);
});

test('user hard-delete preserves tenant-owned BrandForge records and clears user attribution', async () => {
  const [target] = await db.insert(users).values({
    email: `${uniqueId('brandforge-delete')}@test.local`,
    passwordHash: 'x',
    name: 'BrandForge Delete Target',
    role: 'user',
    status: 'deleted',
    deletedAt: new Date(),
  }).returning();
  const [brand] = await db.insert(brandforgeBrands).values({
    tenantId: admin.currentTenantId,
    createdByUserId: target.id,
    name: `Preserved Brand ${uniqueId('brand')}`,
  }).returning();
  await db.execute(sql`
    INSERT INTO shared_usage_events (
      tenant_id,module_id,user_id,operation,units,unit_kind,idempotency_key
    ) VALUES (
      ${admin.currentTenantId},${moduleId},${target.id},'brandforge.generation',1,'tokens',${uniqueId('usage')}
    )
  `);
  await db.execute(sql`
    INSERT INTO shared_activity_events (
      tenant_id,module_id,actor_user_id,object_type,object_id,event_type,summary
    ) VALUES (
      ${admin.currentTenantId},${moduleId},${target.id},'brandforge_generation',${brand.id},'generated','Delete lifecycle proof'
    )
  `);

  try {
    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/platform/users/${target.id}/hard`,
      headers: bearer(),
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal((await db.select().from(users).where(eq(users.id, target.id))).length, 0);
    const [preserved] = await db.select().from(brandforgeBrands).where(eq(brandforgeBrands.id, brand.id));
    assert.ok(preserved);
    assert.equal(preserved.createdByUserId, null);
    const usage = await db.execute(sql`SELECT user_id FROM shared_usage_events WHERE external_reference IS NULL AND tenant_id=${admin.currentTenantId} AND operation='brandforge.generation'`);
    assert.equal(usage.rows.some((row) => row.user_id === target.id), false);
    const activity = await db.execute(sql`SELECT actor_user_id FROM shared_activity_events WHERE tenant_id=${admin.currentTenantId} AND object_id=${brand.id}`);
    assert.equal(activity.rows[0]?.actor_user_id, null);
  } finally {
    await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id=${admin.currentTenantId} AND user_id IS NULL AND operation='brandforge.generation'`);
    await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id=${admin.currentTenantId} AND object_id=${brand.id}`);
    await db.delete(brandforgeBrands).where(eq(brandforgeBrands.id, brand.id));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.targetUserId, target.id));
    await db.delete(users).where(eq(users.id, target.id));
  }
});

test('tenant hard-delete removes BrandForge and shared-service rows atomically', async () => {
  const slug = `brandforge-delete-${uniqueId('tenant').replaceAll('_', '-')}`;
  const [tenant] = await db.insert(tenants).values({
    name: 'BrandForge Tenant Delete Proof',
    slug,
    type: 'company',
    ownerUserId: admin.id,
    status: 'archived',
  }).returning();
  await db.insert(brandforgeWorkspaceSettings).values({
    tenantId: tenant.id,
    updatedByUserId: admin.id,
    completed: true,
    profile: { goals: ['Delete safely'], channels: ['Email'] },
  });
  const [brand] = await db.insert(brandforgeBrands).values({
    tenantId: tenant.id,
    createdByUserId: admin.id,
    name: 'Tenant Delete Brand',
  }).returning();
  const [campaign] = await db.insert(brandforgeCampaigns).values({
    tenantId: tenant.id,
    createdByUserId: admin.id,
    brandId: brand.id,
    name: 'Tenant Delete Campaign',
  }).returning();
  const [generation] = await db.insert(brandforgeGenerations).values({
    tenantId: tenant.id,
    userId: admin.id,
    brandId: brand.id,
    campaignId: campaign.id,
    generationType: 'copy',
    idempotencyKey: 'tenant-delete-generation',
    inputHash: 'a'.repeat(64),
    inputSummary: { type: 'copy' },
    output: { variants: [{ title: 'Delete proof', content: 'Persisted until tenant deletion.' }] },
    provider: 'test',
    model: 'test',
    providerVersion: 'test-v1',
    tokenCount: 1,
  }).returning();
  const [copy] = await db.insert(brandforgeCopyAssets).values({
    tenantId: tenant.id,
    createdByUserId: admin.id,
    brandId: brand.id,
    campaignId: campaign.id,
    generationId: generation.id,
    title: 'Tenant Delete Copy',
    content: 'Delete atomically.',
    copyType: 'email',
  }).returning();
  await db.insert(brandforgeCalendarItems).values({
    tenantId: tenant.id,
    createdByUserId: admin.id,
    brandId: brand.id,
    campaignId: campaign.id,
    copyAssetId: copy.id,
    title: 'Tenant Delete Calendar',
    itemType: 'email',
    scheduledAt: new Date('2026-08-20T12:00:00.000Z'),
  });
  await db.insert(brandforgeCampaignMetrics).values({
    tenantId: tenant.id,
    campaignId: campaign.id,
    recordedByUserId: admin.id,
    metricDate: new Date('2026-08-21T00:00:00.000Z'),
    impressions: 1,
  });
  await db.execute(sql`
    INSERT INTO shared_usage_events (
      tenant_id,module_id,user_id,operation,units,unit_kind,idempotency_key
    ) VALUES (${tenant.id},${moduleId},${admin.id},'brandforge.generation',1,'tokens','tenant-delete-usage')
  `);
  await db.execute(sql`
    INSERT INTO shared_activity_events (
      tenant_id,module_id,actor_user_id,object_type,object_id,event_type,summary
    ) VALUES (${tenant.id},${moduleId},${admin.id},'brandforge_generation',${generation.id},'generated','Tenant delete proof')
  `);
  await db.execute(sql`
    INSERT INTO shared_idempotency_keys (
      tenant_id,module_id,scope,idempotency_key,request_sha256,status,locked_until
    ) VALUES (${tenant.id},${moduleId},'brandforge-generation','tenant-delete-idempotency',${'b'.repeat(64)},'completed',NOW())
  `);

  try {
    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/platform/tenants/${tenant.id}?confirm=${encodeURIComponent(slug)}`,
      headers: bearer(),
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal((await db.select().from(tenants).where(eq(tenants.id, tenant.id))).length, 0);
    assert.equal((await db.select().from(brandforgeBrands).where(eq(brandforgeBrands.tenantId, tenant.id))).length, 0);
    assert.equal((await db.select().from(brandforgeGenerations).where(eq(brandforgeGenerations.tenantId, tenant.id))).length, 0);
    assert.equal((await db.execute(sql`SELECT id FROM shared_usage_events WHERE tenant_id=${tenant.id}`)).rows.length, 0);
    assert.equal((await db.execute(sql`SELECT id FROM shared_activity_events WHERE tenant_id=${tenant.id}`)).rows.length, 0);
    assert.equal((await db.execute(sql`SELECT id FROM shared_idempotency_keys WHERE tenant_id=${tenant.id}`)).rows.length, 0);
  } finally {
    await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id=${tenant.id}`);
    await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id=${tenant.id}`);
    await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id=${tenant.id}`);
    await db.delete(brandforgeCalendarItems).where(eq(brandforgeCalendarItems.tenantId, tenant.id));
    await db.delete(brandforgeCopyAssets).where(eq(brandforgeCopyAssets.tenantId, tenant.id));
    await db.delete(brandforgeCampaignMetrics).where(eq(brandforgeCampaignMetrics.tenantId, tenant.id));
    await db.delete(brandforgeGenerations).where(eq(brandforgeGenerations.tenantId, tenant.id));
    await db.delete(brandforgeCampaigns).where(eq(brandforgeCampaigns.tenantId, tenant.id));
    await db.delete(brandforgeBrands).where(eq(brandforgeBrands.tenantId, tenant.id));
    await db.delete(brandforgeWorkspaceSettings).where(eq(brandforgeWorkspaceSettings.tenantId, tenant.id));
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
  }
});
