import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import {
  MODULE_CATALOG,
  MODULE_CATALOG_BY_SLUG,
  getCanonicalModuleBaseUrl,
  getCanonicalModuleBaseUrlMismatch,
} from '@operatoros/sdk';
import { db } from '../src/db.js';
import {
  adminAuditLogs,
  modules,
  planModules,
  platformComponents,
  users,
} from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import {
  MODULE_SEEDS,
  seedModules,
  seedPlatformComponents,
} from '../src/lib/saas-db-init.js';
import {
  cleanupModule,
  cleanupUser,
  createTestUser,
  ensureSchemaReady,
  uniqueId,
} from './_setup.js';

const KNOWN_SLUG = 'techdeck';
const CANONICAL_URL = 'https://techdeck.operatoros.net';

let app: any;
let superAdmin: any;
let customModuleId: string | null = null;
let catalogModulesBefore = new Map<string, typeof modules.$inferSelect>();
let platformComponentsBefore = new Map<string, typeof platformComponents.$inferSelect>();
let planModuleIdsBefore = new Set<string>();
let insertedCatalogModuleIds: string[] = [];
let insertedPlatformComponentIds: string[] = [];

const bearer = (user: any) => ({
  authorization: `Bearer ${signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    sessionType: 'platform',
  })}`,
});

before(async () => {
  await ensureSchemaReady();

  const catalogSlugs = MODULE_CATALOG.map(entry => entry.slug);
  const existingCatalogModules = await db.select().from(modules)
    .where(inArray(modules.slug, catalogSlugs));
  catalogModulesBefore = new Map(existingCatalogModules.map(row => [row.slug, row]));

  const existingComponents = await db.select().from(platformComponents);
  platformComponentsBefore = new Map(existingComponents.map(row => [row.slug, row]));
  planModuleIdsBefore = new Set(
    (await db.select({ id: planModules.id }).from(planModules)).map(row => row.id),
  );

  await seedPlatformComponents();
  await seedModules();

  insertedCatalogModuleIds = (await db.select().from(modules)
    .where(inArray(modules.slug, catalogSlugs)))
    .filter(row => !catalogModulesBefore.has(row.slug))
    .map(row => row.id);
  insertedPlatformComponentIds = (await db.select().from(platformComponents))
    .filter(row => !platformComponentsBefore.has(row.slug))
    .map(row => row.id);

  superAdmin = await createTestUser();
  await db.update(users)
    .set({ platformRole: 'super_admin' })
    .where(eq(users.id, superAdmin.id));

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerPlatformRoutes } = await import('../src/routes/platform-routes.js');
  const { registerModuleRoutes } = await import('../src/routes/module-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  await registerPlatformRoutes(app);
  await registerModuleRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (customModuleId) await cleanupModule(customModuleId);
  if (superAdmin) {
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.adminId, superAdmin.id));
    await cleanupUser(superAdmin.id);
  }

  // seedModules may add tier links for both catalog and preexisting custom
  // modules. Remove only links created by this test and preserve every link
  // that existed when the file started.
  const insertedPlanModuleIds = (await db.select({ id: planModules.id }).from(planModules))
    .filter(row => !planModuleIdsBefore.has(row.id))
    .map(row => row.id);
  if (insertedPlanModuleIds.length > 0) {
    await db.delete(planModules).where(inArray(planModules.id, insertedPlanModuleIds));
  }

  // Restore catalog rows that belonged to the database before this test.
  // This includes URL/status/metadata/component changes made by the startup
  // seeder and the deliberate URL-drift mutations exercised below.
  for (const row of catalogModulesBefore.values()) {
    await db.update(modules).set({
      name: row.name,
      description: row.description,
      iconUrl: row.iconUrl,
      category: row.category,
      componentId: row.componentId,
      baseUrl: row.baseUrl,
      status: row.status,
      planMin: row.planMin,
      requiresOrg: row.requiresOrg,
      ord: row.ord,
      metadata: row.metadata,
      entitlementWebhookUrl: row.entitlementWebhookUrl,
      pushShape: row.pushShape,
      pushAuthMode: row.pushAuthMode,
      pushBearerEnvVar: row.pushBearerEnvVar,
      archivedAt: row.archivedAt,
      updatedAt: row.updatedAt,
    }).where(eq(modules.id, row.id));
  }

  // Delete only catalog/component rows this test inserted. Module rows go
  // first because component_id references the platform component table.
  for (const moduleId of insertedCatalogModuleIds) {
    await cleanupModule(moduleId);
  }

  for (const row of platformComponentsBefore.values()) {
    await db.update(platformComponents).set({
      name: row.name,
      description: row.description,
      audience: row.audience,
      ord: row.ord,
      iconUrl: row.iconUrl,
      status: row.status,
      metadata: row.metadata,
      updatedAt: row.updatedAt,
    }).where(eq(platformComponents.id, row.id));
  }
  if (insertedPlatformComponentIds.length > 0) {
    await db.delete(platformComponents)
      .where(inArray(platformComponents.id, insertedPlatformComponentIds));
  }
});

test('catalog publishes one exact HTTPS OperatorOS origin for all 13 modules', () => {
  assert.equal(MODULE_CATALOG.length, 13);
  assert.equal(MODULE_SEEDS.length, MODULE_CATALOG.length);

  for (const entry of MODULE_CATALOG) {
    const parsed = new URL(entry.canonicalBaseUrl);
    assert.equal(parsed.protocol, 'https:', `${entry.slug} uses HTTPS`);
    assert.ok(
      parsed.hostname.endsWith('.operatoros.net'),
      `${entry.slug} stays on an OperatorOS subdomain`,
    );
    assert.equal(parsed.pathname, '/', `${entry.slug} base URL has no path`);
    assert.equal(parsed.search, '', `${entry.slug} base URL has no query`);
    assert.equal(parsed.hash, '', `${entry.slug} base URL has no fragment`);
    assert.equal(getCanonicalModuleBaseUrl(entry.slug), entry.canonicalBaseUrl);
    assert.equal(
      MODULE_SEEDS.find(seed => seed.slug === entry.slug)?.baseUrl,
      entry.canonicalBaseUrl,
      `${entry.slug} seed uses the catalog URL`,
    );
  }

  assert.equal(
    MODULE_CATALOG_BY_SLUG['ninja-launch-kit'].canonicalBaseUrl,
    'https://ninjalaunchkit.operatoros.net',
  );
  assert.equal(getCanonicalModuleBaseUrl('custom-module'), undefined);
  assert.equal(
    getCanonicalModuleBaseUrlMismatch(KNOWN_SLUG, `${CANONICAL_URL}/`)?.canonicalBaseUrl,
    CANONICAL_URL,
    'even a trailing slash is rejected as URL drift',
  );
});

test('startup seeding repairs known URL drift and ignores legacy URL env values', async () => {
  const previous = process.env.TECHDECK_URL;
  process.env.TECHDECK_URL = 'https://techdeck.app';
  try {
    await db.update(modules)
      .set({ baseUrl: 'https://drift.invalid', updatedAt: new Date() })
      .where(eq(modules.slug, KNOWN_SLUG));

    await seedModules();

    const [row] = await db.select().from(modules).where(eq(modules.slug, KNOWN_SLUG)).limit(1);
    assert.equal(row.baseUrl, CANONICAL_URL);
  } finally {
    if (previous === undefined) delete process.env.TECHDECK_URL;
    else process.env.TECHDECK_URL = previous;
  }
});

test('Platform Command rejects catalog URL mutation and heals drift on other edits', async () => {
  const rejected = await app.inject({
    method: 'PATCH',
    url: `/v1/platform/modules/${KNOWN_SLUG}`,
    headers: bearer(superAdmin),
    payload: { baseUrl: 'https://techdeck.app' },
  });
  assert.equal(rejected.statusCode, 400, rejected.body);
  assert.equal(rejected.json().code, 'CANONICAL_MODULE_URL_REQUIRED');
  assert.equal(rejected.json().canonicalBaseUrl, CANONICAL_URL);

  await db.update(modules)
    .set({ baseUrl: 'https://drift.invalid', updatedAt: new Date() })
    .where(eq(modules.slug, KNOWN_SLUG));
  const healed = await app.inject({
    method: 'PATCH',
    url: `/v1/platform/modules/${KNOWN_SLUG}`,
    headers: bearer(superAdmin),
    payload: { description: MODULE_CATALOG_BY_SLUG[KNOWN_SLUG].description },
  });
  assert.equal(healed.statusCode, 200, healed.body);
  assert.equal(healed.json().module.baseUrl, CANONICAL_URL);
});

test('legacy module admin surface enforces the same canonical URL contract', async () => {
  const rejected = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/admin/${KNOWN_SLUG}`,
    headers: bearer(superAdmin),
    payload: { baseUrl: `${CANONICAL_URL}/` },
  });
  assert.equal(rejected.statusCode, 400, rejected.body);
  assert.equal(rejected.json().code, 'CANONICAL_MODULE_URL_REQUIRED');
  assert.equal(rejected.json().canonicalBaseUrl, CANONICAL_URL);

  const accepted = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/admin/${KNOWN_SLUG}`,
    headers: bearer(superAdmin),
    payload: { baseUrl: CANONICAL_URL },
  });
  assert.equal(accepted.statusCode, 200, accepted.body);
  assert.equal(accepted.json().module.baseUrl, CANONICAL_URL);
});

test('custom modules retain the existing safe HTTP(S) URL policy', async () => {
  const slug = `custom-url-${uniqueId('m').replace(/_/g, '-')}`;
  const created = await app.inject({
    method: 'POST',
    url: '/v1/platform/modules',
    headers: bearer(superAdmin),
    payload: {
      slug,
      name: 'Custom URL Fixture',
      baseUrl: 'https://custom.example/start',
      status: 'live',
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  customModuleId = created.json().module.id;
  assert.equal(created.json().module.baseUrl, 'https://custom.example/start');

  const updated = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/admin/${slug}`,
    headers: bearer(superAdmin),
    payload: { baseUrl: 'http://localhost:4400' },
  });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().module.baseUrl, 'http://localhost:4400');

  const unsafe = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/admin/${slug}`,
    headers: bearer(superAdmin),
    payload: { baseUrl: 'javascript:alert(1)' },
  });
  assert.equal(unsafe.statusCode, 400, unsafe.body);
});
