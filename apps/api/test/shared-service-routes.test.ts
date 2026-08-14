import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  modules,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
  tradeflowkitCustomers,
  tradeflowkitJobs,
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
import { setAttachmentScannerForTests } from '../src/lib/shared-attachments.js';
import { processSharedJobBatch } from '../src/lib/shared-background-jobs.js';
import { processOutboxBatch } from '../src/lib/shared-notification-outbox.js';

process.env.SESSION_SECRET ||= 'shared-service-routes-test-session-key-v1';
const { signToken } = await import('../src/lib/auth.js');

let app: any;
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let viewer: Awaited<ReturnType<typeof createTestUser>>;
let moduleId: string;
let insertedModule = false;
let jobA: typeof tradeflowkitJobs.$inferSelect;
let jobB: typeof tradeflowkitJobs.$inferSelect;

function bearer(user: Awaited<ReturnType<typeof createTestUser>>) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionType: 'platform',
    })}`,
  };
}

before(async () => {
  await ensureSchemaReady();
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();

  let [moduleRow] = await db.select({ id: modules.id }).from(modules)
    .where(eq(modules.slug, 'tradeflowkit')).limit(1);
  if (!moduleRow) {
    moduleRow = await createTestModule('tradeflowkit');
    insertedModule = true;
  }
  moduleId = moduleRow.id;

  await db.insert(tenantUsers).values({
    tenantId: ownerA.currentTenantId!,
    userId: viewer.id,
    // Keep tenant membership writable while the module-level grant below is
    // viewer-only, proving the module boundary independently narrows access.
    role: 'member',
  });
  await db.update(users).set({ currentTenantId: ownerA.currentTenantId!, updatedAt: new Date() })
    .where(eq(users.id, viewer.id));

  await db.insert(tenantModules).values([
    {
      tenantId: ownerA.currentTenantId!, moduleId, status: 'enabled',
      source: 'included', allowAllMembers: false,
    },
    {
      tenantId: ownerB.currentTenantId!, moduleId, status: 'enabled',
      source: 'included', allowAllMembers: false,
    },
  ]);
  await db.insert(tenantUserModuleAccess).values([
    { tenantId: ownerA.currentTenantId!, userId: ownerA.id, moduleId, accessLevel: 'manager' },
    { tenantId: ownerA.currentTenantId!, userId: viewer.id, moduleId, accessLevel: 'viewer' },
    { tenantId: ownerB.currentTenantId!, userId: ownerB.id, moduleId, accessLevel: 'manager' },
  ]);

  const [customerA] = await db.insert(tradeflowkitCustomers).values({
    tenantId: ownerA.currentTenantId!, createdByUserId: ownerA.id, name: 'Phase 3 Customer A',
  }).returning();
  const [customerB] = await db.insert(tradeflowkitCustomers).values({
    tenantId: ownerB.currentTenantId!, createdByUserId: ownerB.id, name: 'Phase 3 Customer B',
  }).returning();
  [jobA] = await db.insert(tradeflowkitJobs).values({
    tenantId: ownerA.currentTenantId!, customerId: customerA.id,
    createdByUserId: ownerA.id, title: 'Phase 3 Job A',
  }).returning();
  [jobB] = await db.insert(tradeflowkitJobs).values({
    tenantId: ownerB.currentTenantId!, customerId: customerB.id,
    createdByUserId: ownerB.id, title: 'Phase 3 Job B',
  }).returning();

  setAttachmentScannerForTests({
    name: 'route-proof-clean',
    configured: true,
    async scan() { return 'clean'; },
  });

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerSharedServiceRoutes } = await import('../src/routes/shared-service-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  await registerSharedServiceRoutes(app);
  await app.ready();
});

after(async () => {
  setAttachmentScannerForTests(null);
  if (app) await app.close();
  // ownerA cleanup removes the shared tenant and viewer's secondary
  // membership. viewer then owns only its original personal tenant again.
  for (const user of [ownerA, ownerB, viewer]) {
    if (user) await cleanupUser(user.id);
  }
  if (insertedModule && moduleId) await cleanupModule(moduleId);
});

test('TradeFlowKit attachment route is idempotent, tenant-scoped, and read/write gated', async () => {
  const uploadBody = {
    originalName: '../phase-3-proof.txt',
    mimeType: 'text/plain',
    contentBase64: Buffer.from('phase 3 route attachment', 'utf8').toString('base64'),
  };
  const key = uniqueId('attachment-key');
  const upload = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/jobs/${jobA.id}/attachments`,
    headers: { ...bearer(ownerA), 'idempotency-key': key },
    payload: uploadBody,
  });
  assert.equal(upload.statusCode, 202, upload.body);
  const first = upload.json();
  assert.equal(first.replayed, false);
  assert.equal(first.attachment.originalName, 'phase-3-proof.txt');
  assert.equal(first.attachment.scanStatus, 'pending');
  assert.equal('storageKey' in first.attachment, false, 'storage key must never leave the service boundary');

  const replay = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/jobs/${jobA.id}/attachments`,
    headers: { ...bearer(ownerA), 'idempotency-key': key },
    payload: uploadBody,
  });
  assert.equal(replay.statusCode, 202, replay.body);
  assert.equal(replay.json().replayed, true);
  assert.equal(replay.json().attachment.id, first.attachment.id);

  const count = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM shared_attachments
    WHERE tenant_id = ${ownerA.currentTenantId!} AND object_id = ${jobA.id}
  `);
  assert.equal(Number(count.rows[0]?.count), 1);

  const conflictingReplay = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/jobs/${jobA.id}/attachments`,
    headers: { ...bearer(ownerA), 'idempotency-key': key },
    payload: { ...uploadBody, contentBase64: Buffer.from('changed').toString('base64') },
  });
  assert.equal(conflictingReplay.statusCode, 409);
  assert.equal(conflictingReplay.json().code, 'IDEMPOTENCY_CONFLICT');

  const pendingDownload = await app.inject({
    method: 'GET',
    url: `/v1/modules/tradeflowkit/jobs/${jobA.id}/attachments/${first.attachment.id}/content`,
    headers: bearer(ownerA),
  });
  assert.equal(pendingDownload.statusCode, 423);
  assert.equal(pendingDownload.json().code, 'ATTACHMENT_SCAN_PENDING');

  const foreignRead = await app.inject({
    method: 'GET',
    url: `/v1/modules/tradeflowkit/jobs/${jobA.id}/attachments`,
    headers: bearer(ownerB),
  });
  assert.equal(foreignRead.statusCode, 404);
  assert.equal(foreignRead.json().code, 'JOB_NOT_FOUND');

  const viewerWrite = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/jobs/${jobA.id}/attachments`,
    headers: { ...bearer(viewer), 'idempotency-key': uniqueId('viewer-key') },
    payload: uploadBody,
  });
  assert.equal(viewerWrite.statusCode, 403);
  assert.equal(viewerWrite.json().code, 'TENANT_MODULE_WRITE_ACCESS_REQUIRED');

  await processSharedJobBatch({ workerId: 'route-proof-job-worker' });
  await processOutboxBatch({ workerId: 'route-proof-outbox-worker' });

  const download = await app.inject({
    method: 'GET',
    url: `/v1/modules/tradeflowkit/jobs/${jobA.id}/attachments/${first.attachment.id}/content`,
    headers: bearer(ownerA),
  });
  assert.equal(download.statusCode, 200, download.body);
  assert.equal(download.body, 'phase 3 route attachment');
  assert.equal(download.headers['cache-control'], 'private, no-store');

  const viewerRead = await app.inject({
    method: 'GET',
    url: `/v1/modules/tradeflowkit/jobs/${jobA.id}/attachments`,
    headers: bearer(viewer),
  });
  assert.equal(viewerRead.statusCode, 200, viewerRead.body);
  assert.equal(viewerRead.json().attachments.length, 1);

  // Confirm the second tenant's legitimate job remains independent and
  // does not accidentally satisfy tenant A's route query.
  const ownerAReadsJobB = await app.inject({
    method: 'GET', url: `/v1/modules/tradeflowkit/jobs/${jobB.id}/attachments`, headers: bearer(ownerA),
  });
  assert.equal(ownerAReadsJobB.statusCode, 404);

  const deletion = await app.inject({
    method: 'DELETE',
    url: `/v1/modules/tradeflowkit/jobs/${jobA.id}/attachments/${first.attachment.id}`,
    headers: bearer(ownerA),
    payload: { version: 2 },
  });
  assert.equal(deletion.statusCode, 200, deletion.body);
  assert.equal(deletion.json().attachment.version, 3);
});

test('module service routes expose only the authenticated user and tenant scope', async () => {
  const notifications = await app.inject({
    method: 'GET', url: '/v1/modules/tradeflowkit/services/notifications', headers: bearer(ownerA),
  });
  assert.equal(notifications.statusCode, 200, notifications.body);
  assert.equal(notifications.json().notifications.length, 1);
  const notificationId = notifications.json().notifications[0].id;

  const read = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/services/notifications/${notificationId}/read`,
    headers: bearer(ownerA),
  });
  assert.equal(read.statusCode, 200, read.body);

  const foreignNotification = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/services/notifications/${notificationId}/read`,
    headers: bearer(ownerB),
  });
  assert.equal(foreignNotification.statusCode, 404);
  assert.equal(foreignNotification.json().code, 'NOTIFICATION_NOT_FOUND');

  const activity = await app.inject({
    method: 'GET',
    url: `/v1/modules/tradeflowkit/services/activity?objectType=tradeflowkit_job&objectId=${jobA.id}`,
    headers: bearer(ownerA),
  });
  assert.equal(activity.statusCode, 200, activity.body);
  assert.deepEqual(
    activity.json().events.map((event: any) => event.event_type).sort(),
    ['attachment.deleted', 'attachment.uploaded'],
  );

  const foreignActivity = await app.inject({
    method: 'GET',
    url: `/v1/modules/tradeflowkit/services/activity?objectType=tradeflowkit_job&objectId=${jobA.id}`,
    headers: bearer(ownerB),
  });
  assert.equal(foreignActivity.statusCode, 200);
  assert.equal(foreignActivity.json().events.length, 0);

  const usage = await app.inject({
    method: 'GET', url: '/v1/modules/tradeflowkit/services/usage', headers: bearer(ownerA),
  });
  assert.equal(usage.statusCode, 200, usage.body);
  assert.equal(usage.json().usage.length, 1);
  assert.equal(usage.json().usage[0].operation, 'attachment.storage');

  const serviceStatus = await app.inject({
    method: 'GET', url: '/v1/modules/tradeflowkit/services/status', headers: bearer(ownerA),
  });
  assert.equal(serviceStatus.statusCode, 200, serviceStatus.body);
  assert.equal(serviceStatus.json().attachments.storage.adapter, 'postgres');
  assert.ok(serviceStatus.json().providers.every((provider: any) => provider.state === 'test'));

  const row = await db.select({ accessLevel: tenantUserModuleAccess.accessLevel })
    .from(tenantUserModuleAccess)
    .where(and(
      eq(tenantUserModuleAccess.tenantId, ownerA.currentTenantId!),
      eq(tenantUserModuleAccess.userId, viewer.id),
      eq(tenantUserModuleAccess.moduleId, moduleId),
    )).limit(1);
  assert.equal(row[0]?.accessLevel, 'viewer');
});
