process.env.SESSION_SECRET ||= 'operatoros-techdeck-ops-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  activityFeed,
  techdeckAssets,
  techdeckRunbooks,
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

let app: any;
let ownerA: any;
let ownerB: any;
let member: any;
let viewer: any;
let moduleRow: any;
let signToken: typeof import('../src/lib/auth.js').signToken;

function headers(user: any, tenantId: string) {
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

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  member = await createTestUser();
  viewer = await createTestUser();
  moduleRow = await createTestModule('techdeck');

  await db.insert(tenantUsers).values([
    { tenantId: ownerA.currentTenantId, userId: member.id, role: 'member' },
    { tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'viewer' },
  ]);
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUserModuleAccess).values([
    { tenantId: ownerA.currentTenantId, userId: member.id, moduleId: moduleRow.id, accessLevel: 'user' },
    { tenantId: ownerA.currentTenantId, userId: viewer.id, moduleId: moduleRow.id, accessLevel: 'viewer' },
  ]);

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerModuleShellRoutes } = await import('../src/routes/module-shell-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerModuleShellRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (ownerA) {
    try { await db.delete(activityFeed).where(eq(activityFeed.tenantId, ownerA.currentTenantId)); } catch {}
    try { await db.delete(techdeckAssets).where(eq(techdeckAssets.tenantId, ownerA.currentTenantId)); } catch {}
    try { await db.delete(techdeckRunbooks).where(eq(techdeckRunbooks.tenantId, ownerA.currentTenantId)); } catch {}
  }
  for (const user of [viewer, member, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('TechDeck asset posture is versioned, tenant-isolated, and derives health alerts', async () => {
  const authorityInjection = await app.inject({
    method: 'POST',
    url: '/v1/modules/techdeck/assets',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { name: 'Injected asset', tenantId: ownerB.currentTenantId },
  });
  assert.equal(authorityInjection.statusCode, 400, authorityInjection.body);
  assert.equal(authorityInjection.json().code, 'SERVER_OWNED_FIELD');

  const create = await app.inject({
    method: 'POST',
    url: '/v1/modules/techdeck/assets',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      name: 'Core firewall',
      type: 'network',
      hostname: 'edge-fw-01',
      health: 'critical',
      notes: 'WAN failover is degraded',
    },
  });
  assert.equal(create.statusCode, 201, create.body);
  const asset = create.json();
  assert.equal(asset.version, 1);
  assert.equal(asset.tenantId, ownerA.currentTenantId);

  const foreignOps = await app.inject({
    method: 'GET', url: '/v1/modules/techdeck/ops',
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreignOps.statusCode, 200, foreignOps.body);
  assert.equal(foreignOps.json().assets.length, 0);
  assert.equal(foreignOps.json().alerts.length, 0);

  const ops = await app.inject({
    method: 'GET', url: '/v1/modules/techdeck/ops',
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(ops.statusCode, 200, ops.body);
  assert.equal(ops.json().executionEnabled, false);
  assert.equal(ops.json().alerts.length, 1);
  assert.equal(ops.json().alerts[0].assetId, asset.id);

  const update = await app.inject({
    method: 'PATCH', url: `/v1/modules/techdeck/assets/${asset.id}`,
    headers: headers(member, ownerA.currentTenantId),
    payload: { expectedVersion: 1, health: 'healthy', lastSeenAt: '2026-07-14T16:00:00.000Z' },
  });
  assert.equal(update.statusCode, 200, update.body);
  assert.equal(update.json().version, 2);
  assert.equal(update.json().health, 'healthy');

  const stale = await app.inject({
    method: 'PATCH', url: `/v1/modules/techdeck/assets/${asset.id}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: 1, health: 'offline' },
  });
  assert.equal(stale.statusCode, 409, stale.body);
  assert.equal(stale.json().code, 'ASSET_VERSION_CONFLICT');

  const viewerRead = await app.inject({
    method: 'GET', url: '/v1/modules/techdeck/ops',
    headers: headers(viewer, ownerA.currentTenantId),
  });
  assert.equal(viewerRead.statusCode, 200, viewerRead.body);
  const viewerWrite = await app.inject({
    method: 'POST', url: '/v1/modules/techdeck/assets',
    headers: headers(viewer, ownerA.currentTenantId),
    payload: { name: 'Unauthorized endpoint' },
  });
  assert.equal(viewerWrite.statusCode, 403, viewerWrite.body);
});

test('TechDeck runbooks require tenant-admin approval and never expose an execution route', async () => {
  const scriptText = 'Get-Service | Where-Object Status -eq Stopped # unique-secret-marker';
  const create = await app.inject({
    method: 'POST', url: '/v1/modules/techdeck/runbooks',
    headers: headers(member, ownerA.currentTenantId),
    payload: {
      name: 'Stopped service inventory',
      platform: 'powershell',
      purpose: 'Review stopped Windows services before an approved maintenance window.',
      scriptText,
      riskLevel: 'low',
    },
  });
  assert.equal(create.statusCode, 201, create.body);
  const runbook = create.json();
  assert.equal(runbook.status, 'draft');
  assert.equal(runbook.version, 1);

  const memberApproval = await app.inject({
    method: 'POST', url: `/v1/modules/techdeck/runbooks/${runbook.id}/approve`,
    headers: headers(member, ownerA.currentTenantId),
    payload: { expectedVersion: 1 },
  });
  assert.equal(memberApproval.statusCode, 403, memberApproval.body);
  assert.equal(memberApproval.json().code, 'TENANT_ROLE_INSUFFICIENT');

  const approval = await app.inject({
    method: 'POST', url: `/v1/modules/techdeck/runbooks/${runbook.id}/approve`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: 1 },
  });
  assert.equal(approval.statusCode, 200, approval.body);
  assert.equal(approval.json().status, 'approved');
  assert.equal(approval.json().approvedByUserId, ownerA.id);
  assert.equal(approval.json().version, 2);

  const events = await db.select().from(activityFeed).where(and(
    eq(activityFeed.tenantId, ownerA.currentTenantId),
    eq(activityFeed.entityId, runbook.id),
  ));
  assert.ok(events.length >= 2);
  assert.equal(JSON.stringify(events).includes('unique-secret-marker'), false);

  const routes = readFileSync(new URL('../src/routes/module-shell-routes.ts', import.meta.url), 'utf8');
  assert.equal(routes.includes('/v1/modules/techdeck/runbooks/:id/execute'), false);
  const execute = await app.inject({
    method: 'POST', url: `/v1/modules/techdeck/runbooks/${runbook.id}/execute`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: 2 },
  });
  assert.equal(execute.statusCode, 404);
});
