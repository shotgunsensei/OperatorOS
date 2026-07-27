process.env.SESSION_SECRET ||= 'operatoros-ninjamation-phase12a-db-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
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
import { ensureNinjamationTables } from '../src/lib/ninjamation-db-init.js';

let app: ReturnType<typeof Fastify>;
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let viewer: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
let scriptId = '';

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
  const { registerNinjamationRoutes } = await import('../src/routes/ninjamation-routes.js');
  await registerNinjamationRoutes(instance);
  await instance.ready();
  return instance;
}

async function cleanTenant(tenantId: string) {
  await db.execute(sql`DELETE FROM ninjamation_generations WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM ninjamation_downloads WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM ninjamation_reviews WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM ninjamation_script_versions WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM ninjamation_scripts WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
}

before(async () => {
  await ensureSchemaReady();
  await ensureNinjamationTables();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();
  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'ninjamation')).limit(1);
  moduleRow = existing ?? await createTestModule('ninjamation');
  createdModule = !existing;
  await db.insert(tenantModules).values([
    {
      tenantId: ownerA.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
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
});

test('Ninjamation requires OperatorOS auth, entitlement, write access, and server tenant authority', async () => {
  const anonymous = await app.inject({
    method: 'GET',
    url: '/v1/modules/ninjamation/workspace',
  });
  assert.equal(anonymous.statusCode, 401, anonymous.body);

  const viewerRead = await app.inject({
    method: 'GET',
    url: '/v1/modules/ninjamation/workspace',
    headers: headers(viewer, ownerA.currentTenantId),
  });
  assert.equal(viewerRead.statusCode, 200, viewerRead.body);
  assert.equal(viewerRead.json().executionSupported, false);

  const viewerWrite = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninjamation/scripts',
    headers: headers(viewer, ownerA.currentTenantId),
    payload: {
      name: 'Unauthorized',
      language: 'powershell',
      content: 'Write-Output "blocked"',
    },
  });
  assert.equal(viewerWrite.statusCode, 403, viewerWrite.body);

  const tenantOverride = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninjamation/scripts',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      name: 'Rejected authority',
      language: 'powershell',
      content: 'Write-Output "blocked"',
      tenantId: ownerB.currentTenantId,
    },
  });
  assert.equal(tenantOverride.statusCode, 400, tenantOverride.body);
  assert.equal(tenantOverride.json().field, 'tenantId');
});

test('Ninjamation persists versions, blocks unsafe approval, and isolates foreign tenant records', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninjamation/scripts',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      name: 'Phase 12A inventory',
      description: 'Validated local inventory',
      language: 'powershell',
      category: 'Inventory',
      riskTier: 'low',
      content: 'param([string]$Path)\nGet-Item -LiteralPath $Path',
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  scriptId = created.json().script.id;
  assert.equal(created.json().script.status, 'draft');
  assert.equal(created.json().script.staticAnalysis.criticalCount, 0);

  const foreign = await app.inject({
    method: 'GET',
    url: `/v1/modules/ninjamation/scripts/${scriptId}`,
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreign.statusCode, 404, foreign.body);

  const unsafeUpdate = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninjamation/scripts/${scriptId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      expectedVersion: created.json().script.version,
      content: 'powershell -EncodedCommand ZQB2AGkAbAA=',
    },
  });
  assert.equal(unsafeUpdate.statusCode, 200, unsafeUpdate.body);
  assert.equal(unsafeUpdate.json().script.currentVersionNumber, 2);

  const submitted = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninjamation/scripts/${scriptId}/review`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: unsafeUpdate.json().script.version },
  });
  assert.equal(submitted.statusCode, 200, submitted.body);

  const blockedApproval = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninjamation/scripts/${scriptId}/approve`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: submitted.json().script.version },
  });
  assert.equal(blockedApproval.statusCode, 409, blockedApproval.body);
  assert.equal(blockedApproval.json().code, 'NINJAMATION_CRITICAL_FINDINGS');

  const rejected = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninjamation/scripts/${scriptId}/reject`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: submitted.json().script.version, note: 'Remove encoded execution' },
  });
  assert.equal(rejected.statusCode, 200, rejected.body);

  const safeUpdate = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninjamation/scripts/${scriptId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      expectedVersion: rejected.json().script.version,
      content: 'param([string]$Path)\nGet-ChildItem -LiteralPath $Path -ErrorAction Stop',
    },
  });
  assert.equal(safeUpdate.statusCode, 200, safeUpdate.body);
  assert.equal(safeUpdate.json().script.currentVersionNumber, 3);
});

test('Ninjamation requires admin approval and records an immutable approved download', async () => {
  const current = await app.inject({
    method: 'GET',
    url: `/v1/modules/ninjamation/scripts/${scriptId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  const submitted = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninjamation/scripts/${scriptId}/review`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: current.json().script.version },
  });
  assert.equal(submitted.statusCode, 200, submitted.body);

  const viewerApproval = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninjamation/scripts/${scriptId}/approve`,
    headers: headers(viewer, ownerA.currentTenantId),
    payload: { expectedVersion: submitted.json().script.version },
  });
  assert.equal(viewerApproval.statusCode, 403, viewerApproval.body);

  const approved = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninjamation/scripts/${scriptId}/approve`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: submitted.json().script.version, note: 'Reviewed for local use' },
  });
  assert.equal(approved.statusCode, 200, approved.body);
  assert.equal(approved.json().script.status, 'approved');

  const downloaded = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninjamation/scripts/${scriptId}/downloads`,
    headers: headers(viewer, ownerA.currentTenantId),
  });
  assert.equal(downloaded.statusCode, 200, downloaded.body);
  assert.match(downloaded.headers['content-disposition'] ?? '', /\.ps1"/);
  assert.match(downloaded.headers['x-ninjamation-content-sha256'] ?? '', /^[0-9a-f]{64}$/);
  assert.match(downloaded.body, /Get-ChildItem -LiteralPath/);

  const count = await db.execute(sql`
    SELECT COUNT(*)::integer AS count FROM ninjamation_downloads
    WHERE tenant_id=${ownerA.currentTenantId} AND script_id=${scriptId}
  `);
  assert.equal(Number(count.rows[0].count), 1);
});

test('Ninjamation AI generation is a persistent unapproved draft with one usage charge on replay', async () => {
  const idempotencyKey = `ninjamation-${crypto.randomUUID()}`;
  const payload = {
    idempotencyKey,
    name: `AI inventory ${crypto.randomUUID()}`,
    prompt: 'Validate a supplied local path and report its metadata without changing the file.',
    language: 'powershell',
    category: 'Inventory',
    riskTier: 'low',
  };
  const first = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninjamation/generations',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload,
  });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(first.json().script.status, 'draft');
  assert.equal(first.json().reviewRequired, true);
  assert.equal(first.json().executionSupported, false);

  const replay = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninjamation/generations',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload,
  });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.json().replayed, true);
  assert.equal(replay.json().script.id, first.json().script.id);

  const [generations, usage] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::integer AS count FROM ninjamation_generations
      WHERE tenant_id=${ownerA.currentTenantId} AND idempotency_key=${idempotencyKey}
    `),
    db.execute(sql`
      SELECT COUNT(*)::integer AS count FROM shared_usage_events
      WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id}
        AND operation='ninjamation.ai_generation'
        AND external_reference=${first.json().generation.id}
    `),
  ]);
  assert.equal(Number(generations.rows[0].count), 1);
  assert.equal(Number(usage.rows[0].count), 1);
});
