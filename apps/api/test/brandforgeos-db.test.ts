process.env.SESSION_SECRET ||= 'operatoros-brandforgeos-phase11a-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { brandforgeBrands, brandforgeCalendarItems, brandforgeCampaignMetrics, brandforgeCampaigns, brandforgeCopyAssets, brandforgeGenerations, brandforgePersonas, brandforgeWorkspaceSettings, modules, tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: ReturnType<typeof Fastify>;
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let viewer: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
let brandId = '';
let campaignId = '';
let resetAttachmentScanner: (() => void) | null = null;

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
  const { registerBrandForgeOsPhase31Routes } = await import('../src/routes/brandforgeos-phase31-routes.js');
  await registerBrandForgeOsRoutes(instance);
  await registerBrandForgeOsPhase31Routes(instance);
  await instance.ready();
  return instance;
}

async function processLogoSafetyScan(attachmentId: string) {
  const queued = await db.execute(sql`
    SELECT * FROM shared_jobs
    WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id}
      AND handler_key='shared.attachment.scan.v1'
      AND payload_json->>'attachmentId'=${attachmentId}
    ORDER BY created_at DESC LIMIT 1
  `);
  assert.ok(queued.rows[0], 'logo safety scan job must be queued');
  const jobId = String(queued.rows[0]?.id);
  await db.execute(sql`
    UPDATE shared_jobs SET status='processing',lease_owner='brandforge-logo-test',
      lease_expires_at=NOW()+INTERVAL '1 minute'
    WHERE id=${jobId}
  `);
  const current = await db.execute(sql`SELECT * FROM shared_jobs WHERE id=${jobId}`);
  const { processSharedJob } = await import('../src/lib/shared-background-jobs.js');
  await processSharedJob(current.rows[0] as Record<string, unknown>);
}

async function cleanTenant(tenantId: string) {
  await db.execute(sql`DELETE FROM brandforge_export_jobs WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM brandforge_reports WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM brandforge_sync_runs WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM brandforge_integrations WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM brandforge_lead_submissions WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM brandforge_recommendations WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM brandforge_ai_workflows WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM brandforge_landing_pages WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM brandforge_campaign_comments WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM brandforge_campaign_tasks WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM brandforge_templates WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM brandforge_offers WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM brandforge_credit_counters WHERE tenant_id=${tenantId}`);
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
  await db.execute(sql`DELETE FROM shared_jobs WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_attachment_blobs WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM shared_attachments WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_provider_configs WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
}

before(async () => {
  await ensureSchemaReady();
  const { setAttachmentScannerForTests } = await import('../src/lib/shared-attachments.js');
  setAttachmentScannerForTests({ name: 'brandforge-clean-test-scanner', configured: true, async scan() { return 'clean'; } });
  resetAttachmentScanner = () => setAttachmentScannerForTests(null);
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();

  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'brandforgeos')).limit(1);
  moduleRow = existing ?? (await createTestModule('brandforgeos'));
  createdModule = !existing;

  await db.insert(tenantModules).values([
    {
      tenantId: ownerA.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
      metadata: { features: { 'integrations.starter': true } },
    },
    {
      tenantId: ownerB.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
    },
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
  resetAttachmentScanner?.();
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
      headingFont: 'Space Grotesk',
      bodyFont: 'Inter',
      voiceTone: 'Direct, technical, and evidence-led',
      guidelines: 'Lead with measurable evidence and use direct calls to action.',
      assetSummary: ['Primary logo', 'Operator campaign imagery'],
    },
  });
  assert.equal(brand.statusCode, 201, brand.body);
  brandId = brand.json().id;
  assert.equal('tenantId' in brand.json(), false);
  assert.deepEqual(brand.json().assetSummary, ['Primary logo', 'Operator campaign imagery']);

  const injectedLogoOnCreate = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/brands',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      name: 'Untrusted logo reference',
      logoAttachmentId: '00000000-0000-4000-8000-000000000001',
    },
  });
  assert.equal(injectedLogoOnCreate.statusCode, 400, injectedLogoOnCreate.body);

  const injectedLogoOnPatch = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/brandforgeos/brands/${brandId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      expectedVersion: 1,
      logoAttachmentId: '00000000-0000-4000-8000-000000000001',
    },
  });
  assert.equal(injectedLogoOnPatch.statusCode, 400, injectedLogoOnPatch.body);

  const logoRequest = {
    expectedVersion: 1,
    fileName: 'operator-launch-concept.png',
    mimeType: 'image/png',
    contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    idempotencyKey: 'brandforge-logo-concept-0001',
  };
  const stagedLogo = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/brands/${brandId}/logo`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: logoRequest,
  });
  assert.equal(stagedLogo.statusCode, 202, stagedLogo.body);
  assert.equal(stagedLogo.json().pendingSafetyCheck, true);
  assert.equal(stagedLogo.json().brand.version, 1);
  assert.notEqual(stagedLogo.json().brand.logoAttachmentId, stagedLogo.json().logo.id);
  const logoId = String(stagedLogo.json().logo.id);
  await processLogoSafetyScan(logoId);
  const logo = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/brands/${brandId}/logo`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: logoRequest,
  });
  assert.equal(logo.statusCode, 201, logo.body);
  assert.equal(logo.json().brand.version, 2);
  assert.equal(logo.json().brand.logoAttachmentId, logo.json().logo.id);
  assert.equal(logo.json().logo.mimeType, 'image/png');
  assert.equal(logo.json().logo.scanStatus, 'clean');
  assert.match(logo.json().brand.assetSummary.at(-1), /^Primary logo:/);

  const logoReplay = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/brands/${brandId}/logo`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      expectedVersion: 1,
      fileName: 'operator-launch-concept.png',
      mimeType: 'image/png',
      contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      idempotencyKey: 'brandforge-logo-concept-0001',
    },
  });
  assert.equal(logoReplay.statusCode, 200, logoReplay.body);
  assert.equal(logoReplay.json().duplicate, true);
  assert.equal(logoReplay.json().brand.version, 2);
  assert.equal(logoReplay.json().logo.id, logoId);

  const logoMismatch = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/brands/${brandId}/logo`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      expectedVersion: 2,
      fileName: 'different.png',
      mimeType: 'image/png',
      contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZgWQAAAAASUVORK5CYII=',
      idempotencyKey: 'brandforge-logo-concept-0001',
    },
  });
  assert.equal(logoMismatch.statusCode, 400, logoMismatch.body);
  assert.equal(logoMismatch.json().code, 'ATTACHMENT_IDEMPOTENCY_MISMATCH');
  for (const status of ['pending', 'error', 'infected'] as const) {
    await db.execute(sql`
      UPDATE shared_attachments SET scan_status=${status}
      WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id} AND id=${logoId}
    `);
    const blocked = await app.inject({
      method: 'GET',
      url: `/v1/modules/brandforgeos/brands/${brandId}/logo`,
      headers: headers(ownerA, ownerA.currentTenantId),
    });
    assert.equal(blocked.statusCode, status === 'infected' ? 404 : 409, `${status}: ${blocked.body}`);
    assert.equal(blocked.json().code, status === 'infected' ? 'ATTACHMENT_QUARANTINED' : 'ATTACHMENT_SCAN_PENDING');
  }

  await db.execute(sql`
    UPDATE shared_attachments SET scan_status='unavailable'
    WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id} AND id=${logoId}
  `);
  const scannerUnavailable = await app.inject({
    method: 'GET',
    url: `/v1/modules/brandforgeos/brands/${brandId}/logo`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(scannerUnavailable.statusCode, 200, scannerUnavailable.body);
  assert.equal(scannerUnavailable.headers['content-type'], 'image/png');
  assert.equal(scannerUnavailable.headers['cache-control'], 'private, no-store');

  const largePng = Buffer.alloc(1_100_000);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(largePng);
  const largePayload = {
    expectedVersion: 2,
    fileName: 'operator-launch-large-concept.png',
    mimeType: 'image/png',
    contentBase64: largePng.toString('base64'),
    idempotencyKey: 'brandforge-logo-concept-large-0001',
  };
  assert.ok(Buffer.byteLength(JSON.stringify(largePayload)) > 1_048_576, 'test payload must exceed Fastify default body limit');
  const stagedLargeLogo = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/brands/${brandId}/logo`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: largePayload,
  });
  assert.equal(stagedLargeLogo.statusCode, 202, stagedLargeLogo.body);
  assert.equal(stagedLargeLogo.json().brand.version, 2);
  assert.equal(stagedLargeLogo.json().pendingSafetyCheck, true);
  await processLogoSafetyScan(String(stagedLargeLogo.json().logo.id));
  const largeLogo = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/brands/${brandId}/logo`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: largePayload,
  });
  assert.equal(largeLogo.statusCode, 201, largeLogo.body);
  assert.equal(largeLogo.json().brand.version, 3);
  assert.equal(largeLogo.json().logo.mimeType, 'image/png');
  assert.notEqual(largeLogo.json().logo.id, logoId);
  const retiredLogo = await db.execute(sql`
    SELECT deleted_at,retention_until FROM shared_attachments
    WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id} AND id=${logoId}
  `);
  assert.ok(retiredLogo.rows[0]?.deleted_at);
  assert.ok(retiredLogo.rows[0]?.retention_until);
  const retiredReplay = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/brands/${brandId}/logo`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      expectedVersion: 3,
      fileName: 'operator-launch-concept.png',
      mimeType: 'image/png',
      contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      idempotencyKey: 'brandforge-logo-concept-0001',
    },
  });
  assert.equal(retiredReplay.statusCode, 400, retiredReplay.body);
  assert.equal(retiredReplay.json().code, 'ATTACHMENT_IDEMPOTENCY_RETIRED');

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

  const publicationBypass = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/brandforgeos/calendar-items/${calendar.json().id}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: 1, status: 'published' },
  });
  assert.equal(publicationBypass.statusCode, 409, publicationBypass.body);
  assert.equal(publicationBypass.json().code, 'BRANDFORGE_PUBLICATION_CONFIRMATION_REQUIRED');

  const publicationRequest = {
    expectedVersion: 1,
    externalPublicationConfirmed: true,
    externalReference: 'provider-post:launch-email-2026-08-15',
    idempotencyKey: 'brandforge-publication-email-0001',
  };
  const published = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/calendar-items/${calendar.json().id}/record-publication`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: publicationRequest,
  });
  assert.equal(published.statusCode, 200, published.body);
  assert.equal(published.json().calendarItem.status, 'published');
  assert.equal(published.json().externalPublication.performedByOperatorOS, false);
  const publishedReplay = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/calendar-items/${calendar.json().id}/record-publication`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: publicationRequest,
  });
  assert.equal(publishedReplay.statusCode, 200, publishedReplay.body);
  assert.equal(publishedReplay.json().replayed, true);
  const publicationAudit = await db.execute(sql`
    SELECT metadata_json FROM shared_activity_events
    WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id}
      AND object_type='brandforge_calendar_item' AND object_id=${calendar.json().id}
      AND event_type='external_publication.confirmed'
  `);
  assert.equal(publicationAudit.rows.length, 1);
  assert.equal((publicationAudit.rows[0]?.metadata_json as any)?.externalActionPerformedByOperatorOS, false);

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

test('Phase 31 restores campaign production, marketplace, connector, report, and export outcomes', async () => {
  const contract = await app.inject({
    method: 'GET',
    url: '/v1/modules/brandforgeos/product-contract',
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(contract.statusCode, 200, contract.body);
  assert.equal(contract.json().copyModes.length, 10);
  assert.equal(contract.json().workflows.length, 6);
  assert.equal(contract.json().integrations.length, 12);
  assert.equal(contract.json().authority.billing, 'operatoros');

  const offer = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/offers',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      brandId,
      name: 'Operator launch offer',
      description: 'Evidence-led campaign operations',
      callToAction: 'Book a review',
      status: 'active',
    },
  });
  assert.equal(offer.statusCode, 201, offer.body);

  const task = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/campaigns/${campaignId}/tasks`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { title: 'Approve launch brief', assigneeUserId: ownerA.id, priority: 'high' },
  });
  assert.equal(task.statusCode, 201, task.body);
  const completedTask = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/brandforgeos/campaign-tasks/${task.json().id}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: task.json().version, status: 'done' },
  });
  assert.equal(completedTask.statusCode, 200, completedTask.body);
  assert.equal(completedTask.json().status, 'done');
  const foreignAssignee = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/campaigns/${campaignId}/tasks`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { title: 'Cross tenant assignment', assigneeUserId: ownerB.id },
  });
  assert.equal(foreignAssignee.statusCode, 404, foreignAssignee.body);
  assert.equal(foreignAssignee.json().code, 'BRANDFORGE_ASSIGNEE_NOT_FOUND');

  const comment = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/campaigns/${campaignId}/comments`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { body: 'Approved with recorded evidence.' },
  });
  assert.equal(comment.statusCode, 201, comment.body);
  const landing = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/campaigns/${campaignId}/landing-pages`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      title: 'Operator launch',
      slug: 'operator-launch',
      status: 'published',
      content: { headline: 'Build measurable campaigns' },
      seo: { title: 'Operator launch' },
    },
  });
  assert.equal(landing.statusCode, 201, landing.body);

  const workflow = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/workflows',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      workflowType: 'product_launch',
      name: 'Launch workflow',
      brandId,
      campaignId,
      inputs: { brief: 'Evidence-led launch' },
    },
  });
  assert.equal(workflow.statusCode, 201, workflow.body);
  const production = await app.inject({
    method: 'GET',
    url: `/v1/modules/brandforgeos/campaigns/${campaignId}/production`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(production.statusCode, 200, production.body);
  assert.equal(production.json().tasks.length, 1);
  assert.equal(production.json().comments.length, 1);
  assert.equal(production.json().landingPages.length, 1);

  const templates = await app.inject({
    method: 'GET',
    url: '/v1/modules/brandforgeos/templates',
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(templates.statusCode, 200, templates.body);
  assert.ok(templates.json().templates.length >= 6);
  assert.ok(templates.json().templates.some((item: any) => item.is_premium && !item.usable));

  const deniedIntegration = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/integrations/salesforce/connect',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { mode: 'test', publicConfig: {}, callbackReady: false },
  });
  assert.equal(deniedIntegration.statusCode, 403, deniedIntegration.body);
  assert.equal(deniedIntegration.json().code, 'BRANDFORGE_INTEGRATION_ENTITLEMENT_REQUIRED');
  assert.equal(deniedIntegration.json().requiredFeature, 'integrations.agency');

  const integration = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/integrations/meta_ads/connect',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { mode: 'test', publicConfig: {}, callbackReady: false },
  });
  assert.equal(integration.statusCode, 200, integration.body);
  assert.equal(integration.json().status, 'degraded');
  const sync = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/integrations/meta_ads/sync',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { idempotencyKey: 'phase31-meta-sync-0001' },
  });
  assert.equal(sync.statusCode, 202, sync.body);

  const otherBrand = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/brands',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { name: 'Unrelated brand' },
  });
  assert.equal(otherBrand.statusCode, 201, otherBrand.body);
  const otherCampaign = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/campaigns',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { name: 'Unrelated campaign', brandId: otherBrand.json().id, status: 'active' },
  });
  assert.equal(otherCampaign.statusCode, 201, otherCampaign.body);
  const otherMetric = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/campaigns/${otherCampaign.json().id}/metrics`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      metricDate: '2026-08-16T00:00:00.000Z', channel: 'Search', impressions: 50,
      clicks: 10, conversions: 2, spendCents: 500, revenueCents: 1_500,
    },
  });
  assert.equal(otherMetric.statusCode, 201, otherMetric.body);
  const otherOffer = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/offers',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { brandId: otherBrand.json().id, name: 'Unrelated brand offer' },
  });
  assert.equal(otherOffer.statusCode, 201, otherOffer.body);

  const brandReport = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/reports',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { name: 'Selected brand health', reportType: 'brand_health', brandId },
  });
  assert.equal(brandReport.statusCode, 201, brandReport.body);
  const generatedBrandReport = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/reports/${brandReport.json().id}/generate`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(generatedBrandReport.statusCode, 200, generatedBrandReport.body);
  assert.equal(Number(generatedBrandReport.json().snapshot.metrics.impressions), 100);
  assert.equal(Number(generatedBrandReport.json().snapshot.counts.campaigns), 1);
  assert.equal(Number(generatedBrandReport.json().snapshot.counts.copy_assets), 1);
  assert.ok(generatedBrandReport.json().snapshot.recentActivity.some((item: any) => /Operator launch offer/.test(item.summary)));
  assert.ok(generatedBrandReport.json().snapshot.recentActivity.every((item: any) => !/Unrelated brand offer/.test(item.summary)));

  const report = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/reports',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      name: 'White-label launch report',
      reportType: 'executive_summary',
      brandId,
      campaignId,
      sections: ['kpis', 'channels', 'activity'],
      isWhiteLabel: true,
      branding: { companyName: 'Operator Launch Brand', color: '#ef4444' },
    },
  });
  assert.equal(report.statusCode, 201, report.body);
  const generated = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/reports/${report.json().id}/generate`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(generated.statusCode, 200, generated.body);
  assert.equal(generated.json().snapshot.evidence, 'persisted_records_only');
  assert.equal(generated.json().snapshot.sampleData, false);
  assert.match(generated.json().snapshot_sha256, /^[a-f0-9]{64}$/);

  const queued = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/exports',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      reportId: report.json().id,
      exportType: 'report',
      format: 'html',
      idempotencyKey: 'phase31-report-export-0001',
    },
  });
  assert.equal(queued.statusCode, 202, queued.body);
  const replayed = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/exports',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      reportId: report.json().id,
      exportType: 'report',
      format: 'html',
      idempotencyKey: 'phase31-report-export-0001',
    },
  });
  assert.equal(replayed.statusCode, 202, replayed.body);
  assert.equal(replayed.json().duplicate, true);
  assert.equal(replayed.json().export.id, queued.json().export.id);
  const exportRows = await db.execute(
    sql`SELECT count(*)::int count FROM brandforge_export_jobs WHERE tenant_id=${ownerA.currentTenantId} AND idempotency_key='phase31-report-export-0001'`,
  );
  assert.equal(Number(exportRows.rows[0]?.count), 1);
  const { processSharedJob } = await import('../src/lib/shared-background-jobs.js');
  for (const jobId of [sync.json().job.id, queued.json().job.id]) {
    await db.execute(sql`UPDATE shared_jobs SET status='processing',lease_owner='phase31-test',lease_expires_at=NOW()+INTERVAL '1 minute' WHERE id=${jobId}`);
    const job = await db.execute(sql`SELECT * FROM shared_jobs WHERE id=${jobId}`);
    await processSharedJob(job.rows[0] as Record<string, unknown>);
  }
  const syncHistory = await app.inject({
    method: 'GET',
    url: '/v1/modules/brandforgeos/integrations/meta_ads/history',
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(syncHistory.json().runs[0].status, 'completed');
  const download = await app.inject({
    method: 'GET',
    url: `/v1/modules/brandforgeos/exports/${queued.json().export.id}/download`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(download.statusCode, 200, download.body);
  assert.match(download.headers['content-type'] ?? '', /text\/html/);
  assert.match(download.body, /White-label launch report/);

  const csvQueued = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/exports',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      reportId: report.json().id,
      exportType: 'report',
      format: 'csv',
      idempotencyKey: 'phase31-report-export-csv-0001',
    },
  });
  assert.equal(csvQueued.statusCode, 202, csvQueued.body);
  await db.execute(sql`UPDATE shared_jobs SET status='processing',lease_owner='phase31-test',lease_expires_at=NOW()+INTERVAL '1 minute' WHERE id=${csvQueued.json().job.id}`);
  const csvJob = await db.execute(sql`SELECT * FROM shared_jobs WHERE id=${csvQueued.json().job.id}`);
  await processSharedJob(csvJob.rows[0] as Record<string, unknown>);
  const csvDownload = await app.inject({
    method: 'GET',
    url: `/v1/modules/brandforgeos/exports/${csvQueued.json().export.id}/download`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(csvDownload.statusCode, 200, csvDownload.body);
  assert.match(csvDownload.headers['content-type'] ?? '', /text\/csv/);
  assert.match(csvDownload.body, /"report","name","White-label launch report"/);
  assert.match(csvDownload.body, /"metrics","impressions","100"/);

  const foreignReport = await app.inject({
    method: 'GET',
    url: `/v1/modules/brandforgeos/reports/${report.json().id}`,
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreignReport.statusCode, 404, foreignReport.body);
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

  const generationRows = await db
    .select()
    .from(brandforgeGenerations)
    .where(and(eq(brandforgeGenerations.tenantId, ownerA.currentTenantId), eq(brandforgeGenerations.idempotencyKey, payload.idempotencyKey)));
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

test('Phase 31 enforces concurrent OperatorOS credit limits atomically and preserves replay', async () => {
  await db.execute(sql`UPDATE tenant_modules SET metadata=${{ features: { brandforgeMonthlyCredits: 1 } }} WHERE tenant_id=${ownerB.currentTenantId} AND module_id=${moduleRow.id}`);
  const requests = ['phase31-credit-a-0001', 'phase31-credit-b-0001'].map((idempotencyKey) =>
    app.inject({
      method: 'POST',
      url: '/v1/modules/brandforgeos/generations',
      headers: headers(ownerB, ownerB.currentTenantId),
      payload: {
        type: 'campaign_ideas',
        prompt: 'Create one evidence-led campaign direction.',
        idempotencyKey,
      },
    }),
  );
  const results = await Promise.all(requests);
  assert.deepEqual(results.map((result) => result.statusCode).sort(), [201, 402]);
  const accepted = results.find((result) => result.statusCode === 201)!;
  const acceptedKey = accepted.json().generation.idempotencyKey;
  const replay = await app.inject({
    method: 'POST',
    url: '/v1/modules/brandforgeos/generations',
    headers: headers(ownerB, ownerB.currentTenantId),
    payload: {
      type: 'campaign_ideas',
      prompt: 'Create one evidence-led campaign direction.',
      idempotencyKey: acceptedKey,
    },
  });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.deepEqual(replay.json(), accepted.json());
  const counter = await db.execute(sql`SELECT used_credits,limit_snapshot FROM brandforge_credit_counters WHERE tenant_id=${ownerB.currentTenantId}`);
  assert.equal(Number(counter.rows[0].used_credits), 1);
  assert.equal(Number(counter.rows[0].limit_snapshot), 1);
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
  const viewerLogoWrite = await app.inject({
    method: 'POST',
    url: `/v1/modules/brandforgeos/brands/${brandId}/logo`,
    headers: headers(viewer, ownerA.currentTenantId),
    payload: {},
  });
  assert.equal(viewerLogoWrite.statusCode, 403, viewerLogoWrite.body);
  assert.equal(viewerLogoWrite.json().code, 'TENANT_MODULE_WRITE_ACCESS_REQUIRED');
});
