import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules } from '../src/schema.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
  uniqueId,
} from './_setup.js';
import {
  createAttachment,
  getAttachmentContent,
  purgeExpiredAttachmentBlobs,
  setAttachmentScannerForTests,
  softDeleteAttachment,
} from '../src/lib/shared-attachments.js';
import {
  enqueueOutboxMessage,
  enqueueTemplatedOutboxMessage,
  listUserNotifications,
  processOutboxBatch,
  saveNotificationTemplate,
  setOutboundAdapterResolverForTests,
} from '../src/lib/shared-notification-outbox.js';
import {
  claimSharedJobs,
  enqueueSharedJob,
  processSharedJob,
  processSharedJobBatch,
  registerSharedJobHandler,
} from '../src/lib/shared-background-jobs.js';
import {
  appendActivityEvent,
  beginIdempotentOperation,
  completeIdempotentOperation,
  listActivityEvents,
  recordUsageEvent,
  summarizeUsage,
} from '../src/lib/shared-usage-activity.js';
import {
  processWebhookBatch,
  receiveVerifiedWebhook,
  registerSharedWebhookHandler,
} from '../src/lib/shared-webhooks.js';
import { ProviderDisabledError } from '../src/lib/shared-provider-adapters.js';
import { sanitizeSharedMetadata } from '../src/lib/shared-service-safety.js';

let user: Awaited<ReturnType<typeof createTestUser>>;
let foreignUser: Awaited<ReturnType<typeof createTestUser>>;
let moduleId: string;
let insertedModule = false;

async function cleanupSharedTenant(tenantId: string) {
  await db.execute(sql`DELETE FROM shared_notifications WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_outbox_messages WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_jobs WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_webhook_receipts WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_notification_templates WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_attachment_blobs WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_attachments WHERE tenant_id = ${tenantId}`);
}

before(async () => {
  await ensureSchemaReady();
  user = await createTestUser();
  foreignUser = await createTestUser();
  let [moduleRow] = await db.select({ id: modules.id }).from(modules)
    .where(eq(modules.slug, 'tradeflowkit')).limit(1);
  if (!moduleRow) {
    moduleRow = await createTestModule('tradeflowkit');
    insertedModule = true;
  }
  moduleId = moduleRow.id;
  setAttachmentScannerForTests({
    name: 'deterministic-clean',
    configured: true,
    async scan() { return 'clean'; },
  });
});

after(async () => {
  setAttachmentScannerForTests(null);
  setOutboundAdapterResolverForTests(null);
  if (user) {
    await cleanupSharedTenant(user.currentTenantId!);
    await cleanupUser(user.id);
  }
  if (foreignUser) {
    await cleanupSharedTenant(foreignUser.currentTenantId!);
    await cleanupUser(foreignUser.id);
  }
  if (insertedModule && moduleId) await cleanupModule(moduleId);
});

test('shared metadata removes secrets and bounds nested payloads', () => {
  const safe = sanitizeSharedMetadata({
    ok: 'visible',
    apiKey: 'must-not-survive',
    nested: { cookie: 'nope', count: 2 },
  });
  assert.equal(safe.ok, 'visible');
  assert.equal('apiKey' in safe, false);
  assert.deepEqual(safe.nested, { count: 2 });
  const prototypeKeys = sanitizeSharedMetadata(JSON.parse('{"__proto__":{"polluted":true},"constructor":{"unsafe":true},"safe":1}'));
  assert.deepEqual(prototypeKeys, { safe: 1 });
  assert.equal(({} as any).polluted, undefined);
});

test('soft-deleted attachments purge private blobs only after retention expires', async () => {
  const attachment = await db.transaction(tx => createAttachment({
    tenantId: user.currentTenantId!,
    moduleId,
    objectType: 'test_object',
    objectId: 'retention-proof',
    originalName: 'retention.txt',
    declaredMimeType: 'text/plain',
    content: Buffer.from('retention proof', 'utf8'),
    createdByUserId: user.id,
  }, tx));
  const deleted = await softDeleteAttachment({
    tenantId: user.currentTenantId!,
    moduleId,
    attachmentId: String(attachment.id),
    deletedByUserId: user.id,
    version: Number(attachment.version),
    retentionUntil: new Date(Date.now() - 1_000),
  });
  assert.ok(deleted);
  assert.equal(await purgeExpiredAttachmentBlobs(), 1);
  const state = await db.execute(sql`
    SELECT a.blob_purged_at, b.attachment_id
    FROM shared_attachments a
    LEFT JOIN shared_attachment_blobs b ON b.attachment_id = a.id
    WHERE a.id = ${String(attachment.id)} AND a.tenant_id = ${user.currentTenantId!}
  `);
  assert.ok(state.rows[0]?.blob_purged_at);
  assert.equal(state.rows[0]?.attachment_id, null);
});

test('attachment, scan job, outbox, usage, and activity survive independent queue cycles', async () => {
  const content = Buffer.from('phase three attachment proof', 'utf8');
  const created = await db.transaction(async tx => {
    const attachment = await createAttachment({
      tenantId: user.currentTenantId!,
      moduleId,
      objectType: 'test_object',
      objectId: 'proof-1',
      originalName: '../proof.txt',
      declaredMimeType: 'text/plain',
      content,
      createdByUserId: user.id,
      correlationId: 'phase3-test',
    }, tx);
    await recordUsageEvent({
      tenantId: user.currentTenantId!,
      moduleId,
      userId: user.id,
      operation: 'attachment.storage',
      units: content.length,
      unitKind: 'bytes',
      idempotencyKey: `attachment:${attachment.id}`,
      metadata: { token: 'redacted', safe: true },
    }, tx);
    await appendActivityEvent({
      tenantId: user.currentTenantId!,
      moduleId,
      actorUserId: user.id,
      objectType: 'test_object',
      objectId: 'proof-1',
      eventType: 'attachment.uploaded',
      summary: 'Proof attachment uploaded.',
      metadata: { attachmentId: attachment.id, password: 'redacted' },
    }, tx);
    await enqueueOutboxMessage({
      tenantId: user.currentTenantId!,
      moduleId,
      requestedByUserId: user.id,
      recipientUserId: user.id,
      channel: 'in_app',
      subject: 'Proof ready',
      body: 'The proof attachment was received.',
      idempotencyKey: `notice:${attachment.id}`,
    }, tx);
    return attachment;
  });

  assert.equal(created.scan_status, 'pending');
  await processSharedJobBatch({ workerId: 'phase3-job-worker' });
  await processOutboxBatch({ workerId: 'phase3-outbox-worker' });

  const stored = await getAttachmentContent({
    tenantId: user.currentTenantId!, moduleId, attachmentId: String(created.id),
  });
  assert.equal(stored?.content.toString('utf8'), content.toString('utf8'));
  assert.equal(stored?.metadata.scan_status, 'clean');
  const foreign = await getAttachmentContent({
    tenantId: foreignUser.currentTenantId!, moduleId, attachmentId: String(created.id),
  });
  assert.equal(foreign, null);

  const notifications = await listUserNotifications({
    tenantId: user.currentTenantId!, moduleId, userId: user.id,
  });
  assert.equal(notifications.length, 1);

  const duplicateUsage = await recordUsageEvent({
    tenantId: user.currentTenantId!,
    moduleId,
    userId: user.id,
    operation: 'attachment.storage',
    units: content.length,
    unitKind: 'bytes',
    idempotencyKey: `attachment:${created.id}`,
  });
  assert.equal(duplicateUsage.duplicate, true);
  const usage = await summarizeUsage({ tenantId: user.currentTenantId!, moduleId, userId: user.id });
  assert.equal(usage.length, 1);
  assert.equal(Number(usage[0]!.units), content.length);

  const timeline = await listActivityEvents({
    tenantId: user.currentTenantId!, moduleId, objectType: 'test_object', objectId: 'proof-1',
  });
  assert.equal(timeline.events.length, 1);
  assert.equal('password' in (timeline.events[0]!.metadata_json as Record<string, unknown>), false);

  await assert.rejects(
    () => createAttachment({
      tenantId: user.currentTenantId!,
      moduleId,
      objectType: 'test_object',
      objectId: 'bad-signature',
      originalName: 'bad.pdf',
      declaredMimeType: 'application/pdf',
      content: Buffer.from('not a pdf'),
      createdByUserId: user.id,
    }),
    (error: any) => error.code === 'ATTACHMENT_SIGNATURE_INVALID',
  );
});

test('outbox disabled state is terminal and does not pretend a message was sent', async () => {
  setOutboundAdapterResolverForTests(async channel => ({
    status: { kind: channel, name: 'disabled', state: 'disabled' },
    async send() { throw new ProviderDisabledError(channel); },
  }));
  const key = uniqueId('disabled-email');
  const queued = await enqueueOutboxMessage({
    tenantId: user.currentTenantId!, moduleId, requestedByUserId: user.id,
    channel: 'email', destination: 'recipient@example.test', subject: 'Disabled proof',
    body: 'No delivery should occur.', idempotencyKey: key,
  });
  await processOutboxBatch({ workerId: 'disabled-provider-worker' });
  const status = await db.execute(sql`SELECT status, last_error_code FROM shared_outbox_messages WHERE id = ${String((queued.message as any).id)}`);
  assert.equal(status.rows[0]?.status, 'disabled');
  assert.equal(status.rows[0]?.last_error_code, 'PROVIDER_DISABLED');
  setOutboundAdapterResolverForTests(null);
});

test('notification templates are versioned, bounded, redacted, and enqueue through the outbox', async () => {
  const templateKey = uniqueId('phase3.notice').replace(/_/g, '.');
  const created = await saveNotificationTemplate({
    tenantId: user.currentTenantId!, moduleId, templateKey, channel: 'in_app',
    name: 'Phase 3 notice', subjectTemplate: 'Hello {{recipient.name}}',
    bodyTemplate: 'Job {{job.number}} is ready.', actorUserId: user.id,
  });
  assert.equal(Number(created.version), 1);
  await assert.rejects(
    () => saveNotificationTemplate({
      tenantId: user.currentTenantId!, moduleId, templateKey, channel: 'in_app',
      name: 'Stale update', bodyTemplate: 'stale', actorUserId: user.id,
    }),
    (error: any) => error.code === 'NOTIFICATION_TEMPLATE_VERSION_CONFLICT',
  );
  const updated = await saveNotificationTemplate({
    tenantId: user.currentTenantId!, moduleId, templateKey, channel: 'in_app',
    name: 'Phase 3 notice', subjectTemplate: 'Hello {{recipient.name}}',
    bodyTemplate: 'Job {{job.number}} is ready.', actorUserId: user.id, expectedVersion: 1,
  });
  assert.equal(Number(updated.version), 2);
  const queued = await enqueueTemplatedOutboxMessage({
    tenantId: user.currentTenantId!, moduleId, requestedByUserId: user.id,
    recipientUserId: user.id, channel: 'in_app', templateKey,
    variables: {
      recipient: { name: 'Operator' },
      job: { number: 42 },
      apiToken: 'must-be-redacted',
    },
    idempotencyKey: uniqueId('templated-notice'),
  });
  await processOutboxBatch({ workerId: 'template-proof-worker' });
  const notifications = await listUserNotifications({
    tenantId: user.currentTenantId!, moduleId, userId: user.id,
  });
  const notice = notifications.find(row => String(row.id) === String((queued.message as any).id))
    ?? notifications.find(row => row.title === 'Hello Operator');
  assert.equal(notice?.title, 'Hello Operator');
  assert.equal(notice?.message, 'Job 42 is ready.');
});

test('leased jobs recover after a worker restart and retry to completion', async () => {
  const handlerKey = uniqueId('phase3.job');
  let attempts = 0;
  registerSharedJobHandler(handlerKey, async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('retry'), { code: 'TRANSIENT_TEST_FAILURE' });
  });
  const queued = await enqueueSharedJob({
    tenantId: user.currentTenantId!, moduleId, requestedByUserId: user.id,
    handlerKey, payload: { safe: true }, idempotencyKey: uniqueId('job'), maxAttempts: 3,
  });
  const claimed = await claimSharedJobs({ workerId: 'crashed-worker', limit: 1 });
  assert.equal(claimed.length, 1);
  await db.execute(sql`UPDATE shared_jobs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = ${String((queued.job as any).id)}`);
  await processSharedJobBatch({ workerId: 'replacement-worker' });
  await db.execute(sql`UPDATE shared_jobs SET run_at = NOW() WHERE id = ${String((queued.job as any).id)}`);
  await processSharedJobBatch({ workerId: 'replacement-worker' });
  const status = await db.execute(sql`SELECT status, attempt_count FROM shared_jobs WHERE id = ${String((queued.job as any).id)}`);
  assert.equal(status.rows[0]?.status, 'completed');
  assert.equal(Number(status.rows[0]?.attempt_count), 2);
});

test('a stale job worker cannot overwrite a replacement worker lease', async () => {
  const handlerKey = uniqueId('phase3.lease');
  registerSharedJobHandler(handlerKey, async () => {});
  const queued = await enqueueSharedJob({
    tenantId: user.currentTenantId!, moduleId, requestedByUserId: user.id,
    handlerKey, idempotencyKey: uniqueId('lease-job'),
  });
  const stale = await claimSharedJobs({ workerId: 'stale-worker', limit: 1 });
  assert.equal(stale.length, 1);
  await db.execute(sql`
    UPDATE shared_jobs SET lease_expires_at = NOW() - INTERVAL '1 second'
    WHERE id = ${String((queued.job as any).id)}
  `);
  const replacement = await claimSharedJobs({ workerId: 'replacement-worker', limit: 1 });
  assert.equal(replacement.length, 1);
  await processSharedJob(stale[0]!);
  const stillOwned = await db.execute(sql`
    SELECT status, lease_owner FROM shared_jobs WHERE id = ${String((queued.job as any).id)}
  `);
  assert.equal(stillOwned.rows[0]?.status, 'processing');
  assert.equal(stillOwned.rows[0]?.lease_owner, 'replacement-worker');
  await processSharedJob(replacement[0]!);
  const completed = await db.execute(sql`
    SELECT status FROM shared_jobs WHERE id = ${String((queued.job as any).id)}
  `);
  assert.equal(completed.rows[0]?.status, 'completed');
});

test('verified webhook receipt retries, deduplicates, and rejects event-id payload conflicts', async () => {
  const handlerKey = uniqueId('phase3.webhook');
  let attempts = 0;
  registerSharedWebhookHandler(handlerKey, async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('transient'), { code: 'WEBHOOK_TRANSIENT_TEST' });
  });
  const eventId = uniqueId('provider-event');
  const input = {
    tenantId: user.currentTenantId!,
    moduleId,
    provider: 'test-provider',
    providerEventId: eventId,
    eventType: 'proof.created',
    handlerKey,
    rawBody: Buffer.from('{"safe":true}'),
    safePayload: { safe: true, authorization: 'removed' },
    maxAttempts: 3,
  };
  const first = await receiveVerifiedWebhook(input);
  assert.equal(first.status, 'retry');
  await db.execute(sql`UPDATE shared_webhook_receipts SET next_attempt_at = NOW() WHERE id = ${String((first.receipt as any).id)}`);
  await processWebhookBatch({ workerId: 'webhook-recovery-worker' });
  const duplicate = await receiveVerifiedWebhook(input);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.status, 'processed');
  assert.equal(attempts, 2);
  await assert.rejects(
    () => receiveVerifiedWebhook({ ...input, rawBody: Buffer.from('{"safe":false}') }),
    (error: any) => error.code === 'WEBHOOK_EVENT_CONFLICT',
  );
});

test('generic idempotency claims replay the same request and reject a changed request', async () => {
  const key = uniqueId('idempotency');
  const first = await beginIdempotentOperation({
    tenantId: user.currentTenantId!, moduleId, scope: 'phase3.proof', idempotencyKey: key,
    request: { a: 1, b: 2 },
  });
  assert.equal(first.state, 'acquired');
  if (first.state !== 'acquired') return;
  await completeIdempotentOperation({
    tenantId: user.currentTenantId!, id: first.id, leaseExpiresAt: first.leaseExpiresAt,
    responseStatus: 201, responseJson: { id: 'proof' },
  });
  const replay = await beginIdempotentOperation({
    tenantId: user.currentTenantId!, moduleId, scope: 'phase3.proof', idempotencyKey: key,
    request: { b: 2, a: 1 },
  });
  assert.equal(replay.state, 'replay');
  const conflict = await beginIdempotentOperation({
    tenantId: user.currentTenantId!, moduleId, scope: 'phase3.proof', idempotencyKey: key,
    request: { a: 9 },
  });
  assert.equal(conflict.state, 'conflict');
});

test('a reclaimed idempotency lease rejects completion by the stale caller', async () => {
  const key = uniqueId('idempotency-lease');
  const stale = await beginIdempotentOperation({
    tenantId: user.currentTenantId!, moduleId, scope: 'phase3.lease', idempotencyKey: key,
    request: { stable: true }, leaseMs: 5_000,
  });
  assert.equal(stale.state, 'acquired');
  if (stale.state !== 'acquired') return;
  await db.execute(sql`
    UPDATE shared_idempotency_keys SET locked_until = NOW() - INTERVAL '1 second'
    WHERE id = ${stale.id}
  `);
  const replacement = await beginIdempotentOperation({
    tenantId: user.currentTenantId!, moduleId, scope: 'phase3.lease', idempotencyKey: key,
    request: { stable: true }, leaseMs: 5_000,
  });
  assert.equal(replacement.state, 'acquired');
  if (replacement.state !== 'acquired') return;
  await assert.rejects(
    () => completeIdempotentOperation({
      tenantId: user.currentTenantId!, id: stale.id, leaseExpiresAt: stale.leaseExpiresAt,
      responseStatus: 200, responseJson: { owner: 'stale' },
    }),
    (error: any) => error.code === 'IDEMPOTENCY_LEASE_LOST',
  );
  await completeIdempotentOperation({
    tenantId: user.currentTenantId!, id: replacement.id,
    leaseExpiresAt: replacement.leaseExpiresAt,
    responseStatus: 200, responseJson: { owner: 'replacement' },
  });
});
