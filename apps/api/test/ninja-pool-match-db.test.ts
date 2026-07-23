import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  ninjaPoolMatchEvents,
  ninjaPoolMatchSessions,
  ninjaPoolPlayerProfiles,
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
let sameTenantSecondCookie: string;

async function moduleCookie(user: Awaited<ReturnType<typeof createTestUser>>, tenantId = user.currentTenantId) {
  const { signToken } = await import('../src/lib/auth.js');
  return `operatoros_session=${signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
    sessionType: 'module',
    tenantId,
    moduleId: 'ninja-pool-hall',
  })}`;
}

const shotEvents = (overrides: Record<string, unknown> = {}) => ({
  pocketed: [],
  firstContact: 1,
  cueHitCushion: false,
  cushionAfterContact: true,
  railsHitAfterContact: 4,
  objectBallsToRail: 4,
  ...overrides,
});

before(async () => {
  await ensureSchemaReady();
  moduleRow = await createTestModule('ninja-pool-hall');
  firstUser = await createTestUser();
  secondUser = await createTestUser();
  await db.insert(tenantModules).values([
    { tenantId: firstUser.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'included', allowAllMembers: true },
    { tenantId: secondUser.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'included', allowAllMembers: true },
  ]);
  await db.insert(tenantUsers).values({
    tenantId: firstUser.currentTenantId,
    userId: secondUser.id,
    role: 'member',
  });
  firstCookie = await moduleCookie(firstUser);
  secondCookie = await moduleCookie(secondUser);
  sameTenantSecondCookie = await moduleCookie(secondUser, firstUser.currentTenantId);
  app = Fastify();
  await app.register(cookie);
  const { registerNinjaPoolHallRoutes } = await import('../src/routes/ninja-pool-hall-routes.js');
  await registerNinjaPoolHallRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  for (const user of [firstUser, secondUser]) {
    if (!user) continue;
    await db.delete(ninjaPoolMatchEvents).where(eq(ninjaPoolMatchEvents.userId, user.id));
    await db.delete(ninjaPoolMatchSessions).where(eq(ninjaPoolMatchSessions.userId, user.id));
    await db.delete(ninjaPoolPlayerProfiles).where(eq(ninjaPoolPlayerProfiles.userId, user.id));
    await cleanupUser(user.id);
  }
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('profile, match lifecycle, server rules, idempotency, and persistence are tenant/user scoped', async () => {
  const anonymous = await app.inject({ method: 'GET', url: '/v1/modules/ninja-pool-hall/profile' });
  assert.equal(anonymous.statusCode, 401);

  const virtualProfile = await app.inject({
    method: 'GET',
    url: '/v1/modules/ninja-pool-hall/profile',
    headers: { cookie: firstCookie },
  });
  assert.equal(virtualProfile.statusCode, 200, virtualProfile.body);
  assert.equal(virtualProfile.json().profile.version, 0);
  assert.equal(virtualProfile.json().profile.persisted, false);

  const savedProfile = await app.inject({
    method: 'PUT',
    url: '/v1/modules/ninja-pool-hall/profile',
    headers: { cookie: firstCookie },
    payload: {
      expectedVersion: 0,
      displayName: 'Rack Runner',
      preferences: {
        aimGuide: true,
        tableSpeed: 1,
        sound: false,
        vibration: false,
        callShotOn8: false,
        threeFoulRule: true,
      },
    },
  });
  assert.equal(savedProfile.statusCode, 200, savedProfile.body);
  assert.equal(savedProfile.json().displayName, 'Rack Runner');
  assert.equal(savedProfile.json().version, 1);

  const started = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninja-pool-hall/matches',
    headers: { cookie: firstCookie },
    payload: { mode: 'bot', opponentName: 'CPU', clientStartId: 'start-db-match-0001' },
  });
  assert.equal(started.statusCode, 201, started.body);
  const matchId = started.json().id as string;
  assert.equal(started.json().logicalState.players[0].name, 'Rack Runner');
  assert.equal(started.json().evidence, 'client_reported_server_rules');

  const duplicateStart = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninja-pool-hall/matches',
    headers: { cookie: firstCookie },
    payload: { mode: 'bot', opponentName: 'CPU', clientStartId: 'start-db-match-0001' },
  });
  assert.equal(duplicateStart.statusCode, 200, duplicateStart.body);
  assert.equal(duplicateStart.json().id, matchId);

  const conflictingStart = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninja-pool-hall/matches',
    headers: { cookie: firstCookie },
    payload: { mode: 'local', opponentName: 'Different player', clientStartId: 'start-db-match-0001' },
  });
  assert.equal(conflictingStart.statusCode, 409, conflictingStart.body);
  assert.equal(conflictingStart.json().code, 'NINJA_POOL_IDEMPOTENCY_CONFLICT');

  const otherActiveStart = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninja-pool-hall/matches',
    headers: { cookie: firstCookie },
    payload: { mode: 'local', opponentName: 'Guest', clientStartId: 'start-db-match-0002' },
  });
  assert.equal(otherActiveStart.statusCode, 200, otherActiveStart.body);
  assert.equal(otherActiveStart.json().id, matchId);
  assert.equal(otherActiveStart.json().recovered, true);

  const breakShot = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-pool-hall/matches/${matchId}/shots`,
    headers: { cookie: firstCookie },
    payload: {
      expectedVersion: 1,
      clientShotId: 'shot-db-match-0001',
      shooterSeat: 0,
      events: shotEvents(),
    },
  });
  assert.equal(breakShot.statusCode, 200, breakShot.body);
  assert.equal(breakShot.json().match.version, 2);
  assert.equal(breakShot.json().outcome.currentPlayer, 1);

  const duplicateShot = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-pool-hall/matches/${matchId}/shots`,
    headers: { cookie: firstCookie },
    payload: {
      expectedVersion: 1,
      clientShotId: 'shot-db-match-0001',
      shooterSeat: 0,
      events: shotEvents(),
    },
  });
  assert.equal(duplicateShot.statusCode, 200, duplicateShot.body);
  assert.equal(duplicateShot.json().idempotent, true);

  const conflictingShot = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-pool-hall/matches/${matchId}/shots`,
    headers: { cookie: firstCookie },
    payload: {
      expectedVersion: 1,
      clientShotId: 'shot-db-match-0001',
      shooterSeat: 0,
      events: shotEvents({ railsHitAfterContact: 5 }),
    },
  });
  assert.equal(conflictingShot.statusCode, 409, conflictingShot.body);
  assert.equal(conflictingShot.json().code, 'NINJA_POOL_IDEMPOTENCY_CONFLICT');

  const illegalEight = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-pool-hall/matches/${matchId}/shots`,
    headers: { cookie: firstCookie },
    payload: {
      expectedVersion: 2,
      clientShotId: 'shot-db-match-0002',
      shooterSeat: 1,
      events: shotEvents({ pocketed: [8] }),
    },
  });
  assert.equal(illegalEight.statusCode, 200, illegalEight.body);
  assert.equal(illegalEight.json().match.status, 'completed');
  assert.equal(illegalEight.json().match.winnerSeat, 0);
  assert.equal(illegalEight.json().match.result, 'win');

  const detail = await app.inject({
    method: 'GET',
    url: `/v1/modules/ninja-pool-hall/matches/${matchId}`,
    headers: { cookie: firstCookie },
  });
  assert.equal(detail.statusCode, 200, detail.body);
  assert.equal(detail.json().events.length, 2);
  assert.deepEqual(detail.json().events.map((event: any) => event.sequenceNumber), [1, 2]);

  const persistedProfile = await app.inject({
    method: 'GET',
    url: '/v1/modules/ninja-pool-hall/profile',
    headers: { cookie: firstCookie },
  });
  assert.equal(persistedProfile.statusCode, 200, persistedProfile.body);
  assert.equal(persistedProfile.json().profile.displayName, 'Rack Runner');
  assert.equal(persistedProfile.json().progression.matchesCompleted, 1);
  assert.equal(persistedProfile.json().progression.wins, 1);
  assert.equal(persistedProfile.json().progression.competitiveRanking, false);

  const choiceMatch = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninja-pool-hall/matches',
    headers: { cookie: firstCookie },
    payload: { mode: 'bot', opponentName: 'CPU', clientStartId: 'start-db-choice-0001' },
  });
  assert.equal(choiceMatch.statusCode, 201, choiceMatch.body);
  const choiceMatchId = choiceMatch.json().id as string;
  const failedBreak = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-pool-hall/matches/${choiceMatchId}/shots`,
    headers: { cookie: firstCookie },
    payload: {
      expectedVersion: 1,
      clientShotId: 'shot-db-choice-0001',
      shooterSeat: 0,
      events: shotEvents({ cushionAfterContact: false, railsHitAfterContact: 0, objectBallsToRail: 0 }),
    },
  });
  assert.equal(failedBreak.statusCode, 200, failedBreak.body);
  assert.ok(failedBreak.json().outcome.pendingChoice);

  const choicePayload = {
    expectedVersion: 2,
    clientActionId: 'choice-db-match-0001',
    action: 'accept',
  };
  const acceptedChoice = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-pool-hall/matches/${choiceMatchId}/choices`,
    headers: { cookie: firstCookie },
    payload: choicePayload,
  });
  assert.equal(acceptedChoice.statusCode, 200, acceptedChoice.body);
  const duplicateChoice = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-pool-hall/matches/${choiceMatchId}/choices`,
    headers: { cookie: firstCookie },
    payload: choicePayload,
  });
  assert.equal(duplicateChoice.statusCode, 200, duplicateChoice.body);
  assert.equal(duplicateChoice.json().idempotent, true);
  const conflictingChoice = await app.inject({
    method: 'POST',
    url: `/v1/modules/ninja-pool-hall/matches/${choiceMatchId}/choices`,
    headers: { cookie: firstCookie },
    payload: { ...choicePayload, action: 'rerack' },
  });
  assert.equal(conflictingChoice.statusCode, 409, conflictingChoice.body);
  assert.equal(conflictingChoice.json().code, 'NINJA_POOL_IDEMPOTENCY_CONFLICT');

  for (const cookieHeader of [secondCookie, sameTenantSecondCookie]) {
    const foreign = await app.inject({
      method: 'GET',
      url: `/v1/modules/ninja-pool-hall/matches/${matchId}`,
      headers: { cookie: cookieHeader },
    });
    assert.equal(foreign.statusCode, 404, foreign.body);
    assert.equal(foreign.json().code, 'NINJA_POOL_MATCH_NOT_FOUND');
  }
});

test('viewer can read their own history but cannot create or mutate pool records', async () => {
  await db.insert(tenantUserModuleAccess).values({
    tenantId: firstUser.currentTenantId,
    userId: secondUser.id,
    moduleId: moduleRow.id,
    accessLevel: 'viewer',
  });
  const read = await app.inject({
    method: 'GET',
    url: '/v1/modules/ninja-pool-hall/matches',
    headers: { cookie: sameTenantSecondCookie },
  });
  assert.equal(read.statusCode, 200, read.body);
  const write = await app.inject({
    method: 'POST',
    url: '/v1/modules/ninja-pool-hall/matches',
    headers: { cookie: sameTenantSecondCookie },
    payload: { mode: 'bot', opponentName: 'CPU', clientStartId: 'start-viewer-0001' },
  });
  assert.equal(write.statusCode, 403, write.body);
  assert.equal(write.json().code, 'TENANT_MODULE_WRITE_ACCESS_REQUIRED');
  await db.delete(tenantUserModuleAccess).where(and(
    eq(tenantUserModuleAccess.tenantId, firstUser.currentTenantId),
    eq(tenantUserModuleAccess.userId, secondUser.id),
  ));
});
