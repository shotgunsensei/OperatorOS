process.env.SESSION_SECRET ||= 'operatoros-ninja-launch-kit-phase11d-db-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  modules, tenantModules, tenantUserModuleAccess, tenantUsers,
} from '../src/schema.js';
import {
  cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady,
} from './_setup.js';
import { ensureNinjaLaunchKitTables } from '../src/lib/ninja-launch-kit-db-init.js';

let app: ReturnType<typeof Fastify>;
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let viewer: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
let launchId = '';

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
  const { registerNinjaLaunchKitRoutes } = await import('../src/routes/ninja-launch-kit-routes.js');
  await registerNinjaLaunchKitRoutes(instance);
  await instance.ready();
  return instance;
}

async function cleanTenant(tenantId: string) {
  await db.execute(sql`DELETE FROM launchkit_exports WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM launchkit_artifacts WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM launchkit_tasks WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM launchkit_milestones WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM launchkit_phases WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM launchkit_generations WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM launchkit_launches WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM shared_jobs WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_attachment_blobs WHERE tenant_id=${tenantId}
    AND attachment_id IN (SELECT id FROM shared_attachments WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id})`);
  await db.execute(sql`DELETE FROM shared_attachments WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
}

before(async () => {
  await ensureSchemaReady();
  await ensureNinjaLaunchKitTables();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();
  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'ninja-launch-kit')).limit(1);
  moduleRow = existing ?? await createTestModule('ninja-launch-kit');
  createdModule = !existing;
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'member' });
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

test('Ninja Launch Kit requires OperatorOS authentication, entitlement, and write authority', async () => {
  const anonymous = await app.inject({ method: 'GET', url: '/v1/modules/ninja-launch-kit/workspace' });
  assert.equal(anonymous.statusCode, 401, anonymous.body);
  const viewerRead = await app.inject({
    method: 'GET',
    url: '/v1/modules/ninja-launch-kit/workspace',
    headers: headers(viewer, ownerA.currentTenantId),
  });
  assert.equal(viewerRead.statusCode, 200, viewerRead.body);
  const viewerWrite = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninja-launch-kit/launches',
    headers: headers(viewer, ownerA.currentTenantId),
    payload: { title: 'Unauthorized', productType: 'service' },
  });
  assert.equal(viewerWrite.statusCode, 403, viewerWrite.body);
  const clientAuthority = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninja-launch-kit/launches',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { title: 'Rejected', productType: 'service', tenantId: ownerB.currentTenantId },
  });
  assert.equal(clientAuthority.statusCode, 400, clientAuthority.body);
  assert.equal(clientAuthority.json().field, 'tenantId');
});

test('Ninja Launch Kit persists a template workspace, plans, dependencies, assets, and draft generation once', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninja-launch-kit/launches',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      title: 'OperatorOS field launch',
      productType: 'SaaS service',
      templateSlug: 'it-support-msp',
      audience: 'MSP owners',
      painPoint: 'Scattered operating tools',
      positioning: 'One coherent operator platform',
      offer: 'Operator bundle',
      priceMinor: 14900,
      currency: 'USD',
      channels: ['Email', 'LinkedIn'],
      targetDate: '2026-09-01',
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  launchId = created.json().launch.id;
  const detail = await app.inject({
    method: 'GET',
    url: `/v1/modules/ninja-launch-kit/launches/${launchId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(detail.statusCode, 200, detail.body);
  assert.equal(detail.json().phases.length, 3);
  assert.equal(detail.json().milestones.length, 3);
  assert.equal(detail.json().tasks.length, 6);
  assert.equal(detail.json().artifacts.length, 8);
  assert.equal(detail.json().readiness.score, 33);
  const firstTask = detail.json().tasks[0];
  const dependent = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-launch-kit/launches/${launchId}/tasks`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      title: 'Dependent launch validation',
      position: 50,
      dependsOnTaskId: firstTask.id,
      required: true,
    },
  });
  assert.equal(dependent.statusCode, 201, dependent.body);
  const blockedCompletion = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninja-launch-kit/tasks/${dependent.json().task.id}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { status: 'complete', expectedVersion: dependent.json().task.version },
  });
  assert.equal(blockedCompletion.statusCode, 409, blockedCompletion.body);
  assert.equal(blockedCompletion.json().code, 'LAUNCHKIT_TASK_DEPENDENCY_INCOMPLETE');
  const invalidOwner = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninja-launch-kit/tasks/${dependent.json().task.id}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { status: 'pending', ownerUserId: ownerB.id, expectedVersion: dependent.json().task.version },
  });
  assert.equal(invalidOwner.statusCode, 400, invalidOwner.body);
  assert.equal(invalidOwner.json().code, 'LAUNCHKIT_OWNER_INVALID');
  const asset = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-launch-kit/launches/${launchId}/assets`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      originalName: 'launch-notes.txt',
      mimeType: 'text/plain',
      contentBase64: Buffer.from('Approved internal launch reference.').toString('base64'),
    },
  });
  assert.equal(asset.statusCode, 201, asset.body);
  assert.match(asset.json().asset.sha256, /^[0-9a-f]{64}$/);
  const generationPayload = { idempotencyKey: 'launchkit-db-generation-0001' };
  const generated = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-launch-kit/launches/${launchId}/generations`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: generationPayload,
  });
  assert.equal(generated.statusCode, 201, generated.body);
  assert.equal(generated.json().artifacts.length, 8);
  assert.equal(generated.json().reviewRequired, true);
  const replay = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-launch-kit/launches/${launchId}/generations`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: generationPayload,
  });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.json().replayed, true);
  assert.equal(replay.json().generation.id, generated.json().generation.id);
  const usage = await db.execute(sql`SELECT units FROM shared_usage_events
    WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id}
      AND operation='launchkit.ai_generation'`);
  assert.equal(usage.rows.length, 1);
  assert.equal(Number(usage.rows[0].units), 1);
});

test('Ninja Launch Kit blocks premature launch, then derives 100 percent from persisted task and artifact approval', async () => {
  let detail = await app.inject({
    method: 'GET',
    url: `/v1/modules/ninja-launch-kit/launches/${launchId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  const premature = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninja-launch-kit/launches/${launchId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      status: 'launched',
      expectedVersion: detail.json().selected.version,
    },
  });
  assert.equal(premature.statusCode, 409, premature.body);
  assert.equal(premature.json().code, 'LAUNCHKIT_NOT_READY');
  for (const task of detail.json().tasks) {
    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/modules/ninja-launch-kit/tasks/${task.id}`,
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: { status: 'complete', expectedVersion: task.version },
    });
    assert.equal(response.statusCode, 200, response.body);
  }
  detail = await app.inject({
    method: 'GET',
    url: `/v1/modules/ninja-launch-kit/launches/${launchId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  const dependent = detail.json().tasks.find((task: any) => task.title === 'Dependent launch validation');
  const dependentComplete = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninja-launch-kit/tasks/${dependent.id}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { status: 'complete', expectedVersion: dependent.version },
  });
  assert.equal(dependentComplete.statusCode, 200, dependentComplete.body);
  for (const artifact of detail.json().artifacts) {
    const review = await app.inject({
      method: 'PATCH',
      url: `/v1/modules/ninja-launch-kit/artifacts/${artifact.id}`,
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: { status: 'review', expectedVersion: artifact.version },
    });
    assert.equal(review.statusCode, 200, review.body);
    const approved = await app.inject({
      method: 'PATCH',
      url: `/v1/modules/ninja-launch-kit/artifacts/${artifact.id}`,
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: { status: 'approved', expectedVersion: review.json().artifact.version },
    });
    assert.equal(approved.statusCode, 200, approved.body);
  }
  detail = await app.inject({
    method: 'GET',
    url: `/v1/modules/ninja-launch-kit/launches/${launchId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(detail.json().readiness.score, 100);
  assert.equal(detail.json().readiness.complete, detail.json().readiness.total);
  const unattested = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninja-launch-kit/launches/${launchId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { status: 'launched', expectedVersion: detail.json().selected.version },
  });
  assert.equal(unattested.statusCode, 409, unattested.body);
  assert.equal(unattested.json().code, 'LAUNCHKIT_EXTERNAL_CONFIRMATION_REQUIRED');
  const launched = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninja-launch-kit/launches/${launchId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      status: 'launched',
      expectedVersion: detail.json().selected.version,
      externalLaunchConfirmed: true,
      externalLaunchEvidence: 'Release ticket OPS-2026-0904 verified by the launch owner.',
    },
  });
  assert.equal(launched.statusCode, 200, launched.body);
  assert.equal(launched.json().launch.status, 'launched');
});

test('Ninja Launch Kit exports persisted data and prevents cross-tenant enumeration', async () => {
  for (const format of ['markdown', 'json', 'csv']) {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/modules/ninja-launch-kit/launches/${launchId}/exports`,
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: { format },
    });
    assert.equal(response.statusCode, 201, response.body);
    assert.ok(response.json().content.length > 40);
    assert.match(response.json().export.contentSha256, /^[0-9a-f]{64}$/);
  }
  const foreignRead = await app.inject({
    method: 'GET',
    url: `/v1/modules/ninja-launch-kit/launches/${launchId}`,
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreignRead.statusCode, 404, foreignRead.body);
  const foreignTask = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-launch-kit/launches/${launchId}/tasks`,
    headers: headers(ownerB, ownerB.currentTenantId),
    payload: { title: 'Cross tenant', position: 0 },
  });
  assert.equal(foreignTask.statusCode, 404, foreignTask.body);
  const workspaceB = await app.inject({
    method: 'GET',
    url: '/v1/modules/ninja-launch-kit/workspace',
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(workspaceB.statusCode, 200, workspaceB.body);
  assert.equal(workspaceB.json().launches.some((item: any) => item.id === launchId), false);
});
