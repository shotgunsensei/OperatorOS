process.env.SESSION_SECRET ||= 'operatoros-ninjamation-phase36-db-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules } from '../src/schema.js';
import { ensureNinjamationTables } from '../src/lib/ninjamation-db-init.js';
import { ensureNinjamationPhase36Tables } from '../src/lib/ninjamation-phase36-db-init.js';
import { NINJAMATION_REPOSITORY, NINJAMATION_REPOSITORY_BRANCH, type CatalogSnapshot } from '../src/lib/ninjamation-phase36.js';
import { runNinjamationCatalogSync } from '../src/lib/ninjamation-sync.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: ReturnType<typeof Fastify>;
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
let setSharedAiProviderAdapterForTests: typeof import('../src/lib/shared-provider-adapters.js').setSharedAiProviderAdapterForTests;
let consumeNinjamationUsage: typeof import('../src/lib/ninjamation-access.js').consumeNinjamationUsage;
let catalogScriptId = '';

function headers(user: typeof ownerA) {
  return {
    authorization: `Bearer ${signToken({ userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion, sessionType: 'platform' })}`,
    'x-tenant-id': user.currentTenantId,
  };
}

function snapshot(commitCharacter: string, entries: Array<{ path: string; content: string; blob: string }>): CatalogSnapshot {
  return {
    repository: NINJAMATION_REPOSITORY,
    branch: NINJAMATION_REPOSITORY_BRANCH,
    commit: commitCharacter.repeat(40),
    entries: entries.map((entry) => ({ path: entry.path, content: entry.content, sha: entry.blob.repeat(40), type: 'blob' })),
  };
}

async function runSync(key: string, data: CatalogSnapshot) {
  const inserted = await db.execute(sql`INSERT INTO ninjamation_sync_runs(tenant_id,requested_by_user_id,idempotency_key,repository,branch,requested_commit,status) VALUES (${ownerA.currentTenantId},${ownerA.id},${key},${NINJAMATION_REPOSITORY},${NINJAMATION_REPOSITORY_BRANCH},${data.commit},'queued') RETURNING id`);
  return runNinjamationCatalogSync({ tenantId: ownerA.currentTenantId, userId: ownerA.id, moduleId: moduleRow.id, runId: String(inserted.rows[0].id), snapshot: data });
}

async function clean(tenantId: string) {
  await db.execute(sql`DELETE FROM ninjamation_sync_items WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM ninjamation_sync_runs WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM ninjamation_favorites WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM ninjamation_usage_counters WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM ninjamation_generations WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM ninjamation_downloads WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM ninjamation_reviews WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM ninjamation_script_versions WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM ninjamation_scripts WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM tenant_entitlements WHERE tenant_id=${tenantId} AND entitlement_key LIKE 'ninjamation.%'`);
}

before(async () => {
  await ensureSchemaReady();
  await ensureNinjamationTables();
  await ensureNinjamationPhase36Tables();
  ({ signToken } = await import('../src/lib/auth.js'));
  ({ setSharedAiProviderAdapterForTests } = await import('../src/lib/shared-provider-adapters.js'));
  ({ consumeNinjamationUsage } = await import('../src/lib/ninjamation-access.js'));
  ownerA = await createTestUser(); ownerB = await createTestUser();
  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'ninjamation')).limit(1);
  moduleRow = existing ?? await createTestModule('ninjamation'); createdModule = !existing;
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.execute(sql`INSERT INTO tenant_entitlements(tenant_id,entitlement_key,entitlement_type,source,active) VALUES (${ownerA.currentTenantId},'ninjamation.pro','companion_module','admin',TRUE)`);
  app = Fastify(); await app.register(cookie);
  const { registerNinjamationRoutes } = await import('../src/routes/ninjamation-routes.js');
  const { registerNinjamationPhase36Routes } = await import('../src/routes/ninjamation-phase36-routes.js');
  await registerNinjamationRoutes(app); await registerNinjamationPhase36Routes(app); await app.ready();
});

after(async () => {
  setSharedAiProviderAdapterForTests(null);
  if (app) await app.close();
  if (ownerA) await clean(ownerA.currentTenantId); if (ownerB) await clean(ownerB.currentTenantId);
  if (moduleRow) await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id));
  if (ownerA) await cleanupUser(ownerA.id); if (ownerB) await cleanupUser(ownerB.id);
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('Phase 36 initial and incremental sync versions updates, deprecates removals, restores paths, and never duplicates', async () => {
  const first = await runSync('phase36-sync-initial', snapshot('a', [
    { path: 'Windows/Inventory.ps1', content: 'Get-ComputerInfo', blob: '1' },
    { path: 'Linux/inspect.py', content: 'from pathlib import Path\nprint(Path.cwd())', blob: '2' },
  ]));
  assert.equal(Number(first.created_count), 2); assert.equal(Number(first.discovered_count), 2);
  const initial = await db.execute(sql`SELECT id,source_path,current_version_number FROM ninjamation_scripts WHERE tenant_id=${ownerA.currentTenantId} AND source='catalog_import' ORDER BY source_path`);
  assert.equal(initial.rows.length, 2); catalogScriptId = String(initial.rows.find((row) => row.source_path === 'Windows/Inventory.ps1')?.id);

  const second = await runSync('phase36-sync-update', snapshot('b', [
    { path: 'Windows/Inventory.ps1', content: 'Get-ComputerInfo | Select-Object OsName', blob: '3' },
  ]));
  assert.equal(Number(second.updated_count), 1); assert.equal(Number(second.deprecated_count), 1);
  const changed = await db.execute(sql`SELECT current_version_number,status,sync_state FROM ninjamation_scripts WHERE tenant_id=${ownerA.currentTenantId} AND id=${catalogScriptId}`);
  assert.equal(Number(changed.rows[0].current_version_number), 2); assert.equal(changed.rows[0].status, 'draft');

  const third = await runSync('phase36-sync-restore', snapshot('c', [
    { path: 'Windows/Inventory.ps1', content: 'Get-ComputerInfo | Select-Object OsName', blob: '3' },
    { path: 'Linux/inspect.py', content: 'from pathlib import Path\nprint(Path.cwd())', blob: '2' },
  ]));
  assert.equal(Number(third.unchanged_count), 1); assert.equal(Number(third.restored_count), 1);
  const finalRows = await db.execute(sql`SELECT COUNT(*)::integer AS count FROM ninjamation_scripts WHERE tenant_id=${ownerA.currentTenantId} AND source='catalog_import'`);
  assert.equal(Number(finalRows.rows[0].count), 2);
});

test('Phase 36 library, favorites, provenance, tenant isolation, approval, and exact checksum download are real', async () => {
  const account = await app.inject({ method: 'GET', url: '/v1/modules/ninjamation/product/account', headers: headers(ownerA) });
  assert.equal(account.statusCode, 200, account.body); assert.equal(account.json().profile.email, ownerA.email);
  const admin = await app.inject({ method: 'GET', url: '/v1/modules/ninjamation/product/admin', headers: headers(ownerA) });
  assert.equal(admin.statusCode, 200, admin.body); assert.ok(admin.json().users.some((user: { email: string }) => user.email === ownerA.email));
  const library = await app.inject({ method: 'GET', url: '/v1/modules/ninjamation/product/scripts?format=powershell&search=Inventory', headers: headers(ownerA) });
  assert.equal(library.statusCode, 200, library.body); assert.equal(library.json().scripts.length, 1);
  const foreign = await app.inject({ method: 'GET', url: '/v1/modules/ninjamation/product/scripts?includeDeprecated=true', headers: headers(ownerB) });
  assert.equal(foreign.statusCode, 200, foreign.body); assert.equal(foreign.json().scripts.length, 0);
  const favorite = await app.inject({ method: 'POST', url: `/v1/modules/ninjamation/product/scripts/${catalogScriptId}/favorite`, headers: headers(ownerA), payload: {} });
  assert.equal(favorite.statusCode, 201, favorite.body); assert.equal(favorite.json().favorite, true);
  const detail = await app.inject({ method: 'GET', url: `/v1/modules/ninjamation/product/scripts/${catalogScriptId}`, headers: headers(ownerA) });
  assert.equal(detail.statusCode, 200, detail.body); assert.equal(detail.json().script.sourceCommit, 'c'.repeat(40)); assert.equal(detail.json().versions.length, 2);

  const legacy = await app.inject({ method: 'GET', url: `/v1/modules/ninjamation/scripts/${catalogScriptId}`, headers: headers(ownerA) });
  const submitted = await app.inject({ method: 'POST', url: `/v1/modules/ninjamation/scripts/${catalogScriptId}/review`, headers: headers(ownerA), payload: { expectedVersion: legacy.json().script.version } });
  assert.equal(submitted.statusCode, 200, submitted.body);
  const approved = await app.inject({ method: 'POST', url: `/v1/modules/ninjamation/scripts/${catalogScriptId}/approve`, headers: headers(ownerA), payload: { expectedVersion: submitted.json().script.version, note: 'Fixture reviewed' } });
  assert.equal(approved.statusCode, 200, approved.body);
  const download = await app.inject({ method: 'POST', url: `/v1/modules/ninjamation/product/scripts/${catalogScriptId}/download`, headers: headers(ownerA), payload: {} });
  assert.equal(download.statusCode, 200, download.body);
  const hash = createHash('sha256').update(download.rawPayload).digest('hex');
  assert.equal(hash, download.headers['x-ninjamation-content-sha256']);
  assert.equal(download.headers['x-ninjamation-version'], '2');
});

test('Phase 36 generates validated, unapproved, metered scripts in all four formats with idempotent replay', async () => {
  for (const language of ['powershell', 'python', 'batch', 'bash']) {
    const payload = { idempotencyKey: `phase36-ai-${language}`, name: `Phase 36 ${language}`, prompt: 'Inspect a caller-supplied local path without modifying it.', language };
    const first = await app.inject({ method: 'POST', url: '/v1/modules/ninjamation/product/generations', headers: headers(ownerA), payload });
    assert.equal(first.statusCode, 201, first.body); assert.equal(first.json().script.language, language); assert.equal(first.json().script.status, 'draft'); assert.equal(first.json().reviewRequired, true);
    const replay = await app.inject({ method: 'POST', url: '/v1/modules/ninjamation/product/generations', headers: headers(ownerA), payload });
    assert.equal(replay.statusCode, 201, replay.body); assert.equal(replay.json().replayed, true); assert.equal(replay.json().script.id, first.json().script.id);
  }
  const rows = await db.execute(sql`SELECT COUNT(*)::integer AS count FROM ninjamation_generations WHERE tenant_id=${ownerA.currentTenantId}`);
  assert.equal(Number(rows.rows[0].count), 4);
  const usage = await db.execute(sql`SELECT generation_count FROM ninjamation_usage_counters WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
  assert.equal(Number(usage.rows[0].generation_count), 4);
});

test('Phase 36 rejects invalid/provider-failed generation, enforces plan gates, and atomically caps usage', async () => {
  const starter = await app.inject({ method: 'POST', url: '/v1/modules/ninjamation/product/generations', headers: headers(ownerB), payload: {
    idempotencyKey: 'phase36-starter-denial', prompt: 'Inspect a supplied local path safely.', language: 'powershell',
  } });
  assert.equal(starter.statusCode, 403, starter.body); assert.equal(starter.json().code, 'NINJAMATION_AI_ENTITLEMENT_REQUIRED');

  setSharedAiProviderAdapterForTests({ status: { kind: 'ai', name: 'invalid-fixture', state: 'test' }, async complete() {
    return { text: 'not-json', tokenCount: 1, durationMs: 1, provider: 'invalid-fixture', model: 'fixture', version: '1' };
  } });
  const invalid = await app.inject({ method: 'POST', url: '/v1/modules/ninjamation/product/generations', headers: headers(ownerA), payload: {
    idempotencyKey: 'phase36-invalid-output', prompt: 'Inspect a supplied local path safely.', language: 'python',
  } });
  assert.equal(invalid.statusCode, 502, invalid.body); assert.equal(invalid.json().code, 'NINJAMATION_GENERATED_OUTPUT_INVALID');

  setSharedAiProviderAdapterForTests({ status: { kind: 'ai', name: 'failing-fixture', state: 'test' }, async complete() {
    throw Object.assign(new Error('Fixture provider failed'), { code: 'AI_PROVIDER_FIXTURE_FAILED', statusCode: 502 });
  } });
  const failed = await app.inject({ method: 'POST', url: '/v1/modules/ninjamation/product/generations', headers: headers(ownerA), payload: {
    idempotencyKey: 'phase36-provider-failure', prompt: 'Inspect a supplied local path safely.', language: 'bash',
  } });
  assert.equal(failed.statusCode, 502, failed.body); assert.equal(failed.json().code, 'AI_PROVIDER_FIXTURE_FAILED');
  setSharedAiProviderAdapterForTests(null);

  await consumeNinjamationUsage({ tenantId: ownerB.currentTenantId, userId: ownerB.id, kind: 'download', limit: 1 });
  await assert.rejects(
    () => consumeNinjamationUsage({ tenantId: ownerB.currentTenantId, userId: ownerB.id, kind: 'download', limit: 1 }),
    (error: unknown) => (error as { code?: string }).code === 'NINJAMATION_DOWNLOAD_LIMIT_REACHED',
  );
  const failedRows = await db.execute(sql`SELECT COUNT(*)::integer AS count FROM ninjamation_generations WHERE tenant_id=${ownerA.currentTenantId} AND provider IN ('invalid-fixture','failing-fixture')`);
  assert.equal(Number(failedRows.rows[0].count), 0);
});
