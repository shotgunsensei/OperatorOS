import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  ninjaPoolPracticeSessions,
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
let moduleRow: Awaited<ReturnType<typeof createTestModule>>;
let firstUser: Awaited<ReturnType<typeof createTestUser>>;
let secondUser: Awaited<ReturnType<typeof createTestUser>>;
let firstCookie: string;
let secondCookie: string;
let sameTenantSecondUserCookie: string;

async function moduleCookie(
  user: Awaited<ReturnType<typeof createTestUser>>,
  tenantId = user.currentTenantId,
): Promise<string> {
  const { signToken } = await import('../src/lib/auth.js');
  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
    sessionType: 'module',
    tenantId,
    moduleId: 'ninja-pool-hall',
  });
  return `operatoros_session=${token}`;
}

before(async () => {
  await ensureSchemaReady();
  const { ensureModuleShellTables } = await import('../src/lib/saas-db-init.js');
  await ensureModuleShellTables();

  moduleRow = await createTestModule('ninja-pool-hall');
  firstUser = await createTestUser();
  secondUser = await createTestUser();

  await db.insert(tenantModules).values([
    {
      tenantId: firstUser.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'included',
      allowAllMembers: true,
      metadata: { freeWithAnyAccount: true, test: true },
    },
    {
      tenantId: secondUser.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'included',
      allowAllMembers: true,
      metadata: { freeWithAnyAccount: true, test: true },
    },
  ]);
  await db.insert(tenantUsers).values({
    tenantId: firstUser.currentTenantId,
    userId: secondUser.id,
    role: 'member',
  });

  firstCookie = await moduleCookie(firstUser);
  secondCookie = await moduleCookie(secondUser);
  sameTenantSecondUserCookie = await moduleCookie(secondUser, firstUser.currentTenantId);

  app = Fastify();
  await app.register(cookie);
  const { registerNinjaPoolHallRoutes } = await import(
    '../src/routes/ninja-pool-hall-routes.js'
  );
  await registerNinjaPoolHallRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (firstUser) {
    await db.delete(ninjaPoolPracticeSessions)
      .where(eq(ninjaPoolPracticeSessions.userId, firstUser.id));
    await cleanupUser(firstUser.id);
  }
  if (secondUser) {
    await db.delete(ninjaPoolPracticeSessions)
      .where(eq(ninjaPoolPracticeSessions.userId, secondUser.id));
    await cleanupUser(secondUser.id);
  }
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('Ninja Pool practice enforces module sessions, tenant isolation, and server-owned lifecycle', async () => {
  const anonymous = await app.inject({
    method: 'GET',
    url: '/v1/modules/ninja-pool-hall/practice-sessions',
  });
  assert.equal(anonymous.statusCode, 401);

  const created = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninja-pool-hall/practice-sessions',
    headers: { cookie: firstCookie },
    payload: {},
  });
  assert.equal(created.statusCode, 201);
  assert.deepEqual(created.json(), {
    id: created.json().id,
    status: 'active',
    shots: 0,
    objectBallsPocketed: 0,
    scratches: 0,
    version: 1,
    startedAt: created.json().startedAt,
    completedAt: null,
    updatedAt: created.json().updatedAt,
  });
  assert.equal(created.json().tenantId, undefined);
  assert.equal(created.json().userId, undefined);
  const sessionId = created.json().id as string;

  const ownerList = await app.inject({
    method: 'GET',
    url: '/v1/modules/ninja-pool-hall/practice-sessions',
    headers: { cookie: firstCookie },
  });
  assert.equal(ownerList.statusCode, 200);
  assert.deepEqual(ownerList.json().sessions.map((row: { id: string }) => row.id), [sessionId]);

  const foreignList = await app.inject({
    method: 'GET',
    url: '/v1/modules/ninja-pool-hall/practice-sessions',
    headers: { cookie: secondCookie },
  });
  assert.equal(foreignList.statusCode, 200);
  assert.deepEqual(foreignList.json().sessions, []);

  const foreignMutation = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninja-pool-hall/practice-sessions/${sessionId}`,
    headers: { cookie: secondCookie },
    payload: {
      expectedVersion: 1,
      shots: 1,
      objectBallsPocketed: 15,
      scratches: 0,
    },
  });
  assert.equal(foreignMutation.statusCode, 404);
  assert.equal(foreignMutation.json().code, 'NINJA_POOL_PRACTICE_NOT_FOUND');

  const sameTenantForeignMutation = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninja-pool-hall/practice-sessions/${sessionId}`,
    headers: { cookie: sameTenantSecondUserCookie },
    payload: {
      expectedVersion: 1,
      shots: 1,
      objectBallsPocketed: 15,
      scratches: 0,
    },
  });
  assert.equal(sameTenantForeignMutation.statusCode, 404);
  assert.equal(sameTenantForeignMutation.json().code, 'NINJA_POOL_PRACTICE_NOT_FOUND');

  const tenantOverride = await app.inject({
    method: 'GET',
    url: '/v1/modules/ninja-pool-hall/practice-sessions',
    headers: {
      cookie: secondCookie,
      'x-tenant-id': firstUser.currentTenantId,
    },
  });
  assert.equal(tenantOverride.statusCode, 403);
  assert.equal(tenantOverride.json().code, 'SESSION_TENANT_MISMATCH');

  const firstShot = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninja-pool-hall/practice-sessions/${sessionId}`,
    headers: { cookie: firstCookie },
    payload: {
      expectedVersion: 1,
      shots: 1,
      objectBallsPocketed: 2,
      scratches: 0,
    },
  });
  assert.equal(firstShot.statusCode, 200);
  assert.equal(firstShot.json().version, 2);
  assert.equal(firstShot.json().status, 'active');

  const lostResponseRetry = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninja-pool-hall/practice-sessions/${sessionId}`,
    headers: { cookie: firstCookie },
    payload: {
      expectedVersion: 1,
      shots: 1,
      objectBallsPocketed: 2,
      scratches: 0,
    },
  });
  assert.equal(lostResponseRetry.statusCode, 200);
  assert.equal(lostResponseRetry.json().version, 2);

  const stale = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninja-pool-hall/practice-sessions/${sessionId}`,
    headers: { cookie: firstCookie },
    payload: {
      expectedVersion: 1,
      shots: 2,
      objectBallsPocketed: 3,
      scratches: 0,
    },
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().code, 'NINJA_POOL_PRACTICE_VERSION_CONFLICT');
  assert.equal(stale.json().session.id, sessionId);
  assert.equal(stale.json().session.version, 2);

  const completed = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninja-pool-hall/practice-sessions/${sessionId}`,
    headers: { cookie: firstCookie },
    payload: {
      expectedVersion: 2,
      shots: 2,
      objectBallsPocketed: 15,
      scratches: 0,
    },
  });
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.json().status, 'completed');
  assert.equal(completed.json().version, 3);
  assert.ok(completed.json().completedAt);

  const finalized = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/ninja-pool-hall/practice-sessions/${sessionId}`,
    headers: { cookie: firstCookie },
    payload: {
      expectedVersion: 3,
      shots: 3,
      objectBallsPocketed: 15,
      scratches: 0,
    },
  });
  assert.equal(finalized.statusCode, 409);
  assert.equal(finalized.json().code, 'NINJA_POOL_PRACTICE_FINALIZED');

  const [stored] = await db.select().from(ninjaPoolPracticeSessions).where(and(
    eq(ninjaPoolPracticeSessions.id, sessionId),
    eq(ninjaPoolPracticeSessions.tenantId, firstUser.currentTenantId),
    eq(ninjaPoolPracticeSessions.userId, firstUser.id),
  ));
  assert.equal(stored.status, 'completed');
  assert.equal(stored.shots, 2);
  assert.equal(stored.objectBallsPocketed, 15);

  const concurrentStarts = await Promise.all([
    app.inject({
      method: 'POST',
      url: '/v1/modules/ninja-pool-hall/practice-sessions',
      headers: { cookie: firstCookie },
      payload: {},
    }),
    app.inject({
      method: 'POST',
      url: '/v1/modules/ninja-pool-hall/practice-sessions',
      headers: { cookie: firstCookie },
      payload: {},
    }),
  ]);
  assert.deepEqual(
    concurrentStarts.map((response) => response.statusCode).sort(),
    [200, 201],
  );
  assert.equal(concurrentStarts[0].json().id, concurrentStarts[1].json().id);

  let active = concurrentStarts[0].json();
  const firstAbandon = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-pool-hall/practice-sessions/${active.id}/abandon`,
    headers: { cookie: firstCookie },
    payload: { expectedVersion: active.version },
  });
  assert.equal(firstAbandon.statusCode, 200);
  const abandonRetry = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-pool-hall/practice-sessions/${active.id}/abandon`,
    headers: { cookie: firstCookie },
    payload: { expectedVersion: active.version },
  });
  assert.equal(abandonRetry.statusCode, 200);
  assert.equal(abandonRetry.json().status, 'abandoned');

  // The initial completed session plus the concurrent start account for two
  // starts. Eight additional finalized starts reach the rolling-hour cap.
  for (let index = 0; index < 8; index += 1) {
    const start = await app.inject({
      method: 'POST',
      url: '/v1/modules/ninja-pool-hall/practice-sessions',
      headers: { cookie: firstCookie },
      payload: {},
    });
    assert.equal(start.statusCode, 201);
    active = start.json();
    const abandoned = await app.inject({
      method: 'POST',
      url: `/v1/modules/ninja-pool-hall/practice-sessions/${active.id}/abandon`,
      headers: { cookie: firstCookie },
      payload: { expectedVersion: active.version },
    });
    assert.equal(abandoned.statusCode, 200);
  }
  const rateLimited = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninja-pool-hall/practice-sessions',
    headers: { cookie: firstCookie },
    payload: {},
  });
  assert.equal(rateLimited.statusCode, 429);
  assert.equal(rateLimited.json().code, 'NINJA_POOL_PRACTICE_START_RATE_LIMITED');
  assert.equal(rateLimited.headers['retry-after'], '3600');

  const oldStart = new Date(Date.now() - 2 * 60 * 60 * 1_000);
  await db.insert(ninjaPoolPracticeSessions).values(
    Array.from({ length: 105 }, () => ({
      tenantId: secondUser.currentTenantId,
      userId: secondUser.id,
      status: 'completed' as const,
      shots: 1,
      objectBallsPocketed: 15,
      scratches: 0,
      version: 2,
      startedAt: oldStart,
      completedAt: oldStart,
      updatedAt: oldStart,
    })),
  );
  const retainedStart = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninja-pool-hall/practice-sessions',
    headers: { cookie: secondCookie },
    payload: {},
  });
  assert.equal(retainedStart.statusCode, 201);
  const retained = await db.select({ id: ninjaPoolPracticeSessions.id })
    .from(ninjaPoolPracticeSessions)
    .where(and(
      eq(ninjaPoolPracticeSessions.tenantId, secondUser.currentTenantId),
      eq(ninjaPoolPracticeSessions.userId, secondUser.id),
    ));
  assert.equal(retained.length, 100);

  await db.insert(tenantUserModuleAccess).values({
    tenantId: firstUser.currentTenantId,
    userId: secondUser.id,
    moduleId: moduleRow.id,
    accessLevel: 'viewer',
  });
  const viewerRead = await app.inject({
    method: 'GET',
    url: '/v1/modules/ninja-pool-hall/practice-sessions',
    headers: { cookie: sameTenantSecondUserCookie },
  });
  assert.equal(viewerRead.statusCode, 200);
  const viewerWrite = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninja-pool-hall/practice-sessions',
    headers: { cookie: sameTenantSecondUserCookie },
    payload: {},
  });
  assert.equal(viewerWrite.statusCode, 403);
  assert.equal(viewerWrite.json().code, 'TENANT_MODULE_WRITE_ACCESS_REQUIRED');

  await db.update(tenantUserModuleAccess).set({ accessLevel: 'manager' }).where(and(
    eq(tenantUserModuleAccess.tenantId, firstUser.currentTenantId),
    eq(tenantUserModuleAccess.userId, secondUser.id),
  ));
  await db.update(tenantUsers).set({ role: 'viewer' }).where(and(
    eq(tenantUsers.tenantId, firstUser.currentTenantId),
    eq(tenantUsers.userId, secondUser.id),
  ));
  const tenantViewerRead = await app.inject({
    method: 'GET',
    url: '/v1/modules/ninja-pool-hall/practice-sessions',
    headers: { cookie: sameTenantSecondUserCookie },
  });
  assert.equal(tenantViewerRead.statusCode, 200);
  const tenantViewerWrite = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninja-pool-hall/practice-sessions',
    headers: { cookie: sameTenantSecondUserCookie },
    payload: {},
  });
  assert.equal(tenantViewerWrite.statusCode, 403);
  assert.equal(tenantViewerWrite.json().code, 'TENANT_WRITE_ACCESS_REQUIRED');
});
