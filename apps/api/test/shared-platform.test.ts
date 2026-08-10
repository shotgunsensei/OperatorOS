import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules } from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady, uniqueId } from './_setup.js';
import { ensureSharedPlatformTables } from '../src/lib/shared-platform-db-init.js';
import { getSharedSecretVaultReadiness, resolveEncryptedSecretReference, storeEncryptedSecretReference } from '../src/lib/shared-secret-vault.js';
import {
  createAttachmentDownloadGrant,
  createServiceIdentityAndToken,
  authenticateSharedApiToken,
  listProviderConfigurations,
  retryDeadLetter,
  revokeApiToken,
  saveProviderConfiguration,
  searchSharedDocuments,
  upsertSharedSearchDocument,
} from '../src/lib/shared-platform-control-plane.js';
import { runDeterministicConnectorForTests } from '../src/lib/shared-provider-adapters.js';
import { enqueueOutboxMessage, suppressNotificationDestination } from '../src/lib/shared-notification-outbox.js';
import {
  createOutboundWebhookEndpoint,
  enqueueOutboundWebhook,
  processOutboundWebhookBatch,
  validateOutboundWebhookUrl,
} from '../src/lib/shared-outbound-webhooks.js';
import {
  normalizeLegacyModuleIdentifier,
  resolveLegacyReference,
  upsertLegacyReference,
} from '../src/lib/shared-compatibility-adapters.js';
import { createSharedSchedule, enqueueDueSchedules } from '../src/lib/shared-schedules-exports.js';
import { processSharedJobBatch, registerSharedJobHandler } from '../src/lib/shared-background-jobs.js';

process.env.APP_ENV = 'test';
process.env.NODE_ENV = 'test';

let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let moduleId: string;
let insertedModule = false;

async function cleanupTenant(tenantId: string) {
  await db.execute(sql`DELETE FROM shared_download_grants WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_delivery_attempts WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_webhook_deliveries WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_webhook_endpoints WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_api_tokens WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_service_identities WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_feature_flags WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_search_documents WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_legacy_references WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_notification_suppressions WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_provider_configs WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_secret_references WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_schedules WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_exports WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_notifications WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_outbox_messages WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_webhook_receipts WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_attachment_blobs WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_attachments WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_jobs WHERE tenant_id = ${tenantId}`);
}

before(async () => {
  await ensureSchemaReady();
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  let [moduleRow] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, 'tradeflowkit')).limit(1);
  if (!moduleRow) { moduleRow = await createTestModule('tradeflowkit'); insertedModule = true; }
  moduleId = moduleRow.id;
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId!, moduleId, status: 'enabled', source: 'included', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId!, moduleId, status: 'enabled', source: 'included', allowAllMembers: true },
  ]).onConflictDoNothing();
});

after(async () => {
  if (ownerA) { await cleanupTenant(ownerA.currentTenantId!); await cleanupUser(ownerA.id); }
  if (ownerB) { await cleanupTenant(ownerB.currentTenantId!); await cleanupUser(ownerB.id); }
  if (insertedModule && moduleId) await cleanupModule(moduleId);
});

test('P22-MIGRATION-001: Phase 22 schema clean apply and idempotent reapply expose every control table', async () => {
  await ensureSharedPlatformTables();
  await ensureSharedPlatformTables();
  const result = await db.execute(sql`
    SELECT to_regclass('shared_provider_configs') IS NOT NULL AS providers,
      to_regclass('shared_webhook_deliveries') IS NOT NULL AS webhooks,
      to_regclass('shared_exports') IS NOT NULL AS exports,
      to_regclass('shared_api_tokens') IS NOT NULL AS tokens,
      to_regclass('shared_search_documents') IS NOT NULL AS search
  `);
  assert.deepEqual(result.rows[0], { providers: true, webhooks: true, exports: true, tokens: true, search: true });
});

test('P22-SECRET-001: encrypted references decrypt only server-side and never appear in provider responses', async () => {
  const reference = `vault://phase22/${uniqueId('secret')}`;
  const stored: any = await storeEncryptedSecretReference({
    tenantId: ownerA.currentTenantId!, moduleId, purpose: 'phase22-test', reference, actorUserId: ownerA.id,
  });
  assert.equal(stored.fingerprint.length, 64);
  assert.equal('ciphertext' in stored, false);
  assert.equal(await resolveEncryptedSecretReference({ tenantId: ownerA.currentTenantId!, moduleId, id: stored.id }), reference);
  assert.equal(await resolveEncryptedSecretReference({ tenantId: ownerB.currentTenantId!, moduleId, id: stored.id }), null);
  const readiness = getSharedSecretVaultReadiness();
  assert.notEqual(readiness.mode, 'disabled');
  assert.equal(readiness.configured, Boolean(process.env.SHARED_SECRET_ENCRYPTION_KEY?.trim()));
});

test('P22-PROVIDER-001: live readiness fails closed while deterministic mode is explicitly non-delivery', async () => {
  const key = uniqueId('email.primary');
  const blocked = await saveProviderConfiguration({
    tenantId: ownerA.currentTenantId!, actorUserId: ownerA.id,
    providerKey: key, kind: 'email', mode: 'live', callbackReady: true,
  });
  assert.equal(blocked.state, 'blocked');
  assert.equal(blocked.reasonCode, 'LIVE_CREDENTIAL_REFERENCE_MISSING');
  assert.equal(blocked.externalDelivery, false);
  const deterministic = await saveProviderConfiguration({
    tenantId: ownerA.currentTenantId!, actorUserId: ownerA.id,
    providerKey: key, kind: 'email', mode: 'test', callbackReady: true,
  });
  assert.equal(deterministic.state, 'degraded');
  assert.equal(deterministic.reasonCode, 'DETERMINISTIC_TEST_ADAPTER');
  assert.equal(deterministic.externalDelivery, false);
  const rows = await listProviderConfigurations(ownerA.currentTenantId!);
  assert.equal(JSON.stringify(rows).includes('ciphertext'), false);
  assert.equal((await listProviderConfigurations(ownerB.currentTenantId!)).some(row => row.providerKey === key), false);
  for (const kind of ['email', 'sms', 'ai', 'storage', 'webhook', 'oauth'] as const) {
    const result = runDeterministicConnectorForTests({ kind, payload: { operation: 'phase22', apiToken: 'removed' }, idempotencyKey: `test-${kind}` });
    assert.equal(result.externalDelivery, false);
    assert.equal(result.state, 'recorded_not_delivered');
    assert.equal('apiToken' in result.payload, false);
  }
});

test('P22-NOTIFICATION-001: suppression is tenant-scoped and creates an honest cancelled outbox state', async () => {
  const destination = `${uniqueId('suppressed')}@example.test`;
  await suppressNotificationDestination({
    tenantId: ownerA.currentTenantId!, channel: 'email', destination,
    reasonCode: 'USER_UNSUBSCRIBED', source: 'phase22-test', actorUserId: ownerA.id,
  });
  const queued: any = await enqueueOutboxMessage({
    tenantId: ownerA.currentTenantId!, moduleId, requestedByUserId: ownerA.id,
    channel: 'email', destination, body: 'This must not deliver.', idempotencyKey: uniqueId('suppressed-outbox'),
  });
  assert.equal(queued.message.status, 'cancelled');
  assert.equal(queued.message.last_error_code, 'DESTINATION_SUPPRESSED');
  const foreign: any = await enqueueOutboxMessage({
    tenantId: ownerB.currentTenantId!, moduleId, requestedByUserId: ownerB.id,
    channel: 'email', destination, body: 'Tenant B remains independent.', idempotencyKey: uniqueId('foreign-outbox'),
  });
  assert.equal(foreign.message.status, 'pending');
});

test('P22-WEBHOOK-001: SSRF is blocked and deterministic HMAC delivery records payload without fake external success', async () => {
  assert.throws(() => validateOutboundWebhookUrl('http://127.0.0.1:5000/hook'), (error: any) => error.code === 'WEBHOOK_URL_UNSAFE');
  assert.throws(() => validateOutboundWebhookUrl('https://localhost/hook'), (error: any) => error.code === 'WEBHOOK_SSRF_BLOCKED');
  const endpoint: any = await createOutboundWebhookEndpoint({
    tenantId: ownerA.currentTenantId!, moduleId, actorUserId: ownerA.id,
    name: 'Phase 22 test endpoint', endpointUrl: 'https://hooks.example.test/operatoros',
    signingSecret: uniqueId('hmac'), eventTypes: ['record.updated'],
  });
  const key = uniqueId('webhook');
  const queued: any = await enqueueOutboundWebhook({
    tenantId: ownerA.currentTenantId!, moduleId, endpointId: endpoint.id,
    eventType: 'record.updated', payload: { recordId: 'r-1', password: 'redacted' }, idempotencyKey: key,
  });
  const duplicate = await enqueueOutboundWebhook({
    tenantId: ownerA.currentTenantId!, moduleId, endpointId: endpoint.id,
    eventType: 'record.updated', payload: { recordId: 'r-1' }, idempotencyKey: key,
  });
  assert.equal(duplicate.duplicate, true);
  await processOutboundWebhookBatch({ workerId: 'phase22-webhook-worker' });
  const delivery = await db.execute(sql`SELECT status FROM shared_webhook_deliveries WHERE id = ${String(queued.delivery.id)}`);
  assert.equal(delivery.rows[0]?.status, 'recorded');
  const attempt = await db.execute(sql`SELECT external_delivery, result_state FROM shared_delivery_attempts WHERE tenant_id = ${ownerA.currentTenantId!} AND delivery_id = ${String(queued.delivery.id)}`);
  assert.deepEqual(attempt.rows[0], { external_delivery: false, result_state: 'recorded_not_delivered' });
});

test('P22-TOKEN-001: service tokens are returned once, hashed at rest, scoped, tenant-isolated, and revocable', async () => {
  const created: any = await createServiceIdentityAndToken({
    tenantId: ownerA.currentTenantId!, moduleId, actorUserId: ownerA.id,
    identityName: uniqueId('reporter'), tokenName: 'primary', scopes: ['usage:read', 'exports:read'],
  });
  assert.match(created.rawToken, /^oos_/);
  const stored = await db.execute(sql`SELECT token_hash, token_prefix, scopes_json FROM shared_api_tokens WHERE tenant_id = ${ownerA.currentTenantId!} AND id = ${String(created.token.id)}`);
  assert.equal(JSON.stringify(stored.rows[0]).includes(created.rawToken), false);
  assert.equal(String(stored.rows[0]?.token_hash).length, 64);
  assert.deepEqual(stored.rows[0]?.scopes_json, ['usage:read', 'exports:read']);
  const foreign = await db.execute(sql`SELECT id FROM shared_api_tokens WHERE tenant_id = ${ownerB.currentTenantId!} AND id = ${String(created.token.id)}`);
  assert.equal(foreign.rows.length, 0);
  const authenticated = await authenticateSharedApiToken({ rawToken: created.rawToken, requiredScope: 'usage:read', tenantId: ownerA.currentTenantId! });
  assert.equal(authenticated?.tenantId, ownerA.currentTenantId!);
  assert.equal(await authenticateSharedApiToken({ rawToken: created.rawToken, requiredScope: 'search:read', tenantId: ownerA.currentTenantId! }), null);
  assert.ok(await revokeApiToken({ tenantId: ownerA.currentTenantId!, tokenId: String(created.token.id) }));
  assert.equal(await authenticateSharedApiToken({ rawToken: created.rawToken, requiredScope: 'usage:read', tenantId: ownerA.currentTenantId! }), null);
});

test('P22-ADAPTER-SEARCH-001: legacy identifiers, reference adapters, search, and deep links remain tenant-isolated', async () => {
  assert.equal(normalizeLegacyModuleIdentifier('trade_flow_kit'), 'tradeflowkit');
  assert.equal(normalizeLegacyModuleIdentifier('automationpacks'), 'ninjamation');
  await upsertLegacyReference({
    tenantId: ownerA.currentTenantId!, moduleId, sourceSystem: 'tradeflowkit-v1', sourceType: 'customer',
    sourceId: 'legacy-42', targetType: 'directory_organization', targetId: 'directory-42', provenance: { importBatch: 'phase22' },
  });
  assert.equal((await resolveLegacyReference({ tenantId: ownerA.currentTenantId!, moduleId, sourceSystem: 'tradeflowkit-v1', sourceType: 'customer', sourceId: 'legacy-42' }) as any)?.target_id, 'directory-42');
  assert.equal(await resolveLegacyReference({ tenantId: ownerB.currentTenantId!, moduleId, sourceSystem: 'tradeflowkit-v1', sourceType: 'customer', sourceId: 'legacy-42' }), null);
  await upsertSharedSearchDocument({
    tenantId: ownerA.currentTenantId!, moduleId, objectType: 'customer', objectId: 'legacy-42',
    title: 'Acme Isolation Proof', summary: 'Phase 22 tenant-safe search', deepLink: '/app/apps/tradeflowkit/customers/legacy-42',
  });
  assert.equal((await searchSharedDocuments({ tenantId: ownerA.currentTenantId!, query: 'Acme' })).length, 1);
  assert.equal((await searchSharedDocuments({ tenantId: ownerB.currentTenantId!, query: 'Acme' })).length, 0);
});

test('P22-JOB-001: schedules persist, enqueue idempotently, and dead letters recover only inside the tenant', async () => {
  const handlerKey = uniqueId('phase22.schedule');
  let calls = 0;
  registerSharedJobHandler(handlerKey, async () => { calls += 1; });
  await createSharedSchedule({
    tenantId: ownerA.currentTenantId!, moduleId, actorUserId: ownerA.id,
    name: uniqueId('daily-export'), handlerKey, payload: { safe: true }, intervalSeconds: 60,
    nextRunAt: new Date(Date.now() - 1000),
  });
  assert.equal(await enqueueDueSchedules(), 1);
  const advancedSchedule = await db.execute(sql`SELECT interval_seconds, next_run_at, NOW() AS database_now FROM shared_schedules WHERE tenant_id = ${ownerA.currentTenantId!} AND handler_key = ${handlerKey}`);
  assert.ok(new Date(advancedSchedule.rows[0]!.next_run_at as any).getTime() > new Date(advancedSchedule.rows[0]!.database_now as any).getTime(), JSON.stringify(advancedSchedule.rows[0]));
  const allSchedules = await db.execute(sql`SELECT tenant_id, handler_key, next_run_at, NOW() AS database_now, next_run_at <= NOW() AS due FROM shared_schedules`);
  assert.ok(allSchedules.rows.every((row: any) => row.due === false), JSON.stringify(allSchedules.rows));
  assert.equal(await enqueueDueSchedules(), 0);
  await processSharedJobBatch({ workerId: 'phase22-schedule-worker' });
  assert.equal(calls, 1);
  const dead = await db.execute(sql`
    INSERT INTO shared_jobs (tenant_id, module_id, requested_by_user_id, handler_key, idempotency_key, status)
    VALUES (${ownerA.currentTenantId!}, ${moduleId}, ${ownerA.id}, 'phase22.dead', ${uniqueId('dead')}, 'dead_letter') RETURNING id
  `);
  const id = String(dead.rows[0]!.id);
  assert.equal(await retryDeadLetter({ tenantId: ownerB.currentTenantId!, kind: 'job', id }), null);
  assert.equal((await retryDeadLetter({ tenantId: ownerA.currentTenantId!, kind: 'job', id }) as any)?.status, 'retry');
});

test('P22-NEGATIVE-001: unscanned attachments cannot receive signed retrieval grants', async () => {
  const fake = await db.execute(sql`
    INSERT INTO shared_attachments (
      tenant_id, module_id, object_type, object_id, original_name, storage_key, size_bytes,
      detected_mime_type, sha256, created_by_user_id, scan_status
    ) VALUES (${ownerA.currentTenantId!}, ${moduleId}, 'phase22', 'pending', 'pending.txt', ${uniqueId('storage')}, 1,
      'text/plain', ${'a'.repeat(64)}, ${ownerA.id}, 'pending') RETURNING id
  `);
  await assert.rejects(
    () => createAttachmentDownloadGrant({ tenantId: ownerA.currentTenantId!, moduleId, attachmentId: String(fake.rows[0]!.id), actorUserId: ownerA.id }),
    (error: any) => error.code === 'ATTACHMENT_DOWNLOAD_UNAVAILABLE',
  );
});
