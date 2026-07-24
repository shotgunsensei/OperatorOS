process.env.SESSION_SECRET ||= 'operatoros-brandforgeos-phase11a-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  brandforgeBrands,
  brandforgeCalendarItems,
  brandforgeCampaignMetrics,
  brandforgeCampaigns,
  brandforgeCopyAssets,
  brandforgeGenerations,
  brandforgePersonas,
  brandforgeWorkspaceSettings,
  modules,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
} from '../src/schema.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
} from './_setup.js';

let app: ReturnType<typeof Fastify>;
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let viewer: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
let brandId = '';
let campaignId = '';

function headers(user: typeof ownerA, tenantId: string) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
  };
}

async function makeApp() {
  const instance = Fastify();
  await instance.register(cookie);
  const { registerBrandForgeOsRoutes } = await import('../src/routes/brandforgeos-routes.js');
  await registerBrandForgeOsRoutes(instance);
  await instance.ready();
  return instance;
}

async function cleanTenant(tenantId: string) {
  await db.delete(brandforgeCalendarItems).where(eq(brandforgeCalendarItems.tenantId, tenantId));
  await db.delete(brandforgeCopyAssets).where(eq(brandforgeCopyAssets.tenantId, tenantId));
  await db.delete(brandforgeCampaignMetrics).where(eq(brandforgeCampaignMetrics.tenantId, tenantId));
  await db.delete(brandforgeGenerations).where(eq(brandforgeGenerations.tenantId, tenantId));
  await db.delete(brandforgeCampaigns).where(eq(brandforgeCampaigns.tenantId, tenantId));
  await db.delete(brandforgePersonas).where(eq(brandforgePersonas.tenantId, tenantId));
  await db.delete(brandforgeBrands).where(eq(brandforgeBrands.tenantId, tenantId));
  await db.delete(brandforgeWorkspaceSettings).where(eq(brandforgeWorkspaceSettings.tenantId, tenantId));
  await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();

  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'brandforgeos')).limit(1);
  moduleRow = existing ?? await createTestModule('brandforgeos');
  createdModule = !existing;

  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUsers).values({
    tenantId: ownerA.currentTenantId,
    userId: viewer.id,
    role: 'member',
  });
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId,
    userId: viewer.id,
    moduleId: moduleRow.id,
    accessLevel: 'viewer',
  });
  app = await makeApp();
});

after(async () => {
  if (app) await app.close();
  if (ownerA && moduleRow) await cleanTenant(ownerA.currentTenantId);
  if (ownerB && moduleRow) await cleanTenant(ownerB.currentTenantId);
  if (moduleRow) {
    await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.moduleId, moduleRow.id));
    await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id));
  }
  for (const user of [viewer, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('BrandForgeOS requires an authenticated entitled OperatorOS session', async () => {
  const anonymous = await app.inject({ method: 'GET', url: '/v1/modules/brandforgeos/dashboard' });
  assert.equal(anonymous.statusCode, 401, anonymous.body);

  const browserTenantOverride = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/brands',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { name: 'Rejected authority', tenantId: ownerB.currentTenantId },
  });
  assert.equal(browserTenantOverride.statusCode, 400, browserTenantOverride.body);
  assert.equal(browserTenantOverride.json().field, 'tenantId');
});

test('BrandForgeOS persists the approved creative workflow and reports only recorded facts', async () => {
  const workspace = await app.inject({
    method: 'PUT',
    url: '/v1/modules/brandforgeos/workspace',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      expectedVersion: 0,
      completed: true,
      industry: 'Managed services',
      businessType: 'B2B services',
      products: 'Operator workflow software',
      idealCustomer: 'Technical service operators',
      geographicMarket: 'United States',
      competitors: null,
      goals: ['Qualified pipeline'],
      channels: ['Email', 'LinkedIn'],
    },
  });
  assert.equal(workspace.statusCode, 200, workspace.body);
  assert.equal(workspace.json().persisted, true);

  const brand = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/brands',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      name: 'Operator Launch Brand',
      primaryColor: '#EF4444',
      voiceTone: 'Direct, technical, and evidence-led',
    },
  });
  assert.equal(brand.statusCode, 201, brand.body);
  brandId = brand.json().id;
  assert.equal('tenantId' in brand.json(), false);

  const persona = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/personas',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      name: 'MSP Operations Lead',
      goals: 'Reduce operational drag',
      channels: ['Email', 'LinkedIn'],
    },
  });
  assert.equal(persona.statusCode, 201, persona.body);

  const campaign = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/campaigns',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      brandId,
      personaId: persona.json().id,
      name: 'Evidence-led launch',
      objective: 'Create qualified product interest',
      channels: ['Email'],
      budgetCents: 50_000,
    },
  });
  assert.equal(campaign.statusCode, 201, campaign.body);
  campaignId = campaign.json().id;

  const advanced = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/brandforgeos/campaigns/${campaignId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: 1, status: 'planning' },
  });
  assert.equal(advanced.statusCode, 200, advanced.body);
  assert.equal(advanced.json().version, 2);

  const stale = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/brandforgeos/campaigns/${campaignId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: 1, objective: 'Stale overwrite' },
  });
  assert.equal(stale.statusCode, 409, stale.body);
  assert.equal(stale.json().code, 'BRANDFORGE_VERSION_CONFLICT');

  const copy = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/copy-assets',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      brandId,
      campaignId,
      title: 'Launch email',
      content: 'A real persisted campaign message.',
      copyType: 'email',
      channel: 'Email',
    },
  });
  assert.equal(copy.statusCode, 201, copy.body);

  const calendar = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/calendar-items',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      brandId,
      campaignId,
      copyAssetId: copy.json().id,
      title: 'Launch email publication',
      itemType: 'email',
      channel: 'Email',
      scheduledAt: '2026-08-15T14:00:00.000Z',
      status: 'scheduled',
    },
  });
  assert.equal(calendar.statusCode, 201, calendar.body);

  const metric = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/campaigns/${campaignId}/metrics`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      metricDate: '2026-08-16T00:00:00.000Z',
      channel: 'Email',
      impressions: 100,
      clicks: 20,
      conversions: 4,
      spendCents: 1_000,
      revenueCents: 7_500,
    },
  });
  assert.equal(metric.statusCode, 201, metric.body);

  const dashboard = await app.inject({
    method: 'GET',
    url: '/v1/modules/brandforgeos/dashboard',
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(dashboard.statusCode, 200, dashboard.body);
  assert.equal(dashboard.json().sampleData, false);
  assert.equal(dashboard.json().evidence, 'persisted_records_only');
  assert.equal(Number(dashboard.json().counts.brands), 1);
  assert.equal(Number(dashboard.json().counts.campaigns), 1);
  assert.equal(Number(dashboard.json().performance.impressions), 100);
  assert.equal(Number(dashboard.json().performance.revenue_cents), 7_500);

  const csv = await app.inject({
    method: 'GET',
    url: '/v1/modules/brandforgeos/export?format=csv',
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(csv.statusCode, 200, csv.body);
  assert.match(csv.headers['content-type'] ?? '', /text\/csv/);
  assert.match(csv.body, /Operator Launch Brand/);

  await app.close();
  app = await makeApp();
  const persisted = await app.inject({
    method: 'GET',
    url: `/v1/modules/brandforgeos/campaigns/${campaignId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(persisted.statusCode, 200, persisted.body);
  assert.equal(persisted.json().name, 'Evidence-led launch');
  assert.equal(persisted.json().version, 2);
});

test('BrandForgeOS AI generation is deterministic, idempotent, metered once, and redacted', async () => {
  const payload = {
    type: 'copy',
    idempotencyKey: 'phase11a-copy-generation-0001',
    brandId,
    campaignId,
    prompt: 'Write a concise launch message for operators who need durable workflow evidence.',
    tone: 'direct',
    channel: 'Email',
    audience: 'Technical service operators',
  };
  const first = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/generations',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload,
  });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(first.json().generation.provider, 'test');
  assert.equal(first.json().generation.generationType, 'copy');
  assert.equal(Array.isArray(first.json().generation.output.variants), true);
  assert.equal('inputHash' in first.json().generation, false);
  assert.equal('userId' in first.json().generation, false);

  const replay = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/generations',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload,
  });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.deepEqual(replay.json(), first.json());

  const generationRows = await db.select().from(brandforgeGenerations).where(and(
    eq(brandforgeGenerations.tenantId, ownerA.currentTenantId),
    eq(brandforgeGenerations.idempotencyKey, payload.idempotencyKey),
  ));
  assert.equal(generationRows.length, 1);
  const usage = await db.execute(sql`
    SELECT units, metadata_json FROM shared_usage_events
    WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id}
      AND operation='brandforge.generation' AND idempotency_key=${payload.idempotencyKey}
  `);
  assert.equal(usage.rows.length, 1);
  assert.ok(Number(usage.rows[0].units) > 0);
  assert.equal(JSON.stringify(usage.rows[0].metadata_json).includes(payload.prompt), false);
});

test('BrandForgeOS enforces cross-tenant non-enumeration and viewer read-only access', async () => {
  const foreignRead = await app.inject({
    method: 'GET',
    url: `/v1/modules/brandforgeos/brands/${brandId}`,
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreignRead.statusCode, 404, foreignRead.body);

  const foreignReference = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/campaigns',
    headers: headers(ownerB, ownerB.currentTenantId),
    payload: { name: 'Cross tenant attempt', brandId },
  });
  assert.equal(foreignReference.statusCode, 404, foreignReference.body);
  assert.equal(foreignReference.json().code, 'BRANDFORGE_BRAND_NOT_FOUND');

  const viewerRead = await app.inject({
    method: 'GET',
    url: '/v1/modules/brandforgeos/dashboard',
    headers: headers(viewer, ownerA.currentTenantId),
  });
  assert.equal(viewerRead.statusCode, 200, viewerRead.body);

  const viewerWrite = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/brands',
    headers: headers(viewer, ownerA.currentTenantId),
    payload: { name: 'Viewer cannot create' },
  });
  assert.equal(viewerWrite.statusCode, 403, viewerWrite.body);
  assert.equal(viewerWrite.json().code, 'TENANT_MODULE_WRITE_ACCESS_REQUIRED');
});
