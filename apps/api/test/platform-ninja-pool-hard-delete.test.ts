import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  adminAuditLogs,
  moduleAutomations,
  moduleCallLogs,
  moduleScaffolds,
  moduleStudySessions,
  ninjaPoolMatchEvents,
  ninjaPoolMatchSessions,
  ninjaPoolPlayerProfiles,
  ninjaPoolPracticeSessions,
  saasWorkspaces,
  tenants,
  users,
} from '../src/schema.js';
import {
  cleanupUser,
  createTestUser,
  ensureSchemaReady,
  uniqueId,
} from './_setup.js';
import { makeLogicalBalls } from '../src/lib/ninja-pool-game.js';
import { makeInitialGameState } from '../src/lib/ninja-pool-rules.js';

let app: ReturnType<typeof Fastify>;
let admin: Awaited<ReturnType<typeof createTestUser>>;
let signToken: typeof import('../src/lib/auth.js').signToken;

const bearer = () => ({
  authorization: `Bearer ${signToken({
    userId: admin.id,
    email: admin.email,
    role: admin.role,
    tokenVersion: admin.tokenVersion,
    sessionType: 'platform',
  })}`,
});

async function createDeletedTarget() {
  const target = await createTestUser();
  const [deleted] = await db.update(users).set({
    name: 'Ninja Pool Delete Target',
    status: 'deleted',
    deletedAt: new Date(),
  }).where(eq(users.id, target.id)).returning();
  return deleted;
}

interface SeededModuleRows {
  callLogId: string;
  studySessionId: string;
  automationId: string;
  scaffoldId: string;
}

async function seedModuleRows(userId: string): Promise<SeededModuleRows> {
  const [callLog] = await db.insert(moduleCallLogs).values({
    tenantId: admin.currentTenantId,
    userId,
    phone: '+15555550123',
    callerName: 'Delete Lifecycle Caller',
    persona: 'receptionist',
    provider: 'stub',
  }).returning();
  const [studySession] = await db.insert(moduleStudySessions).values({
    tenantId: admin.currentTenantId,
    userId,
    source: 'A bounded study source used to verify atomic user hard-delete cleanup.',
    cards: [{ id: 'delete-card', question: 'What is atomic cleanup?', answer: 'All related rows commit or roll back together.' }],
  }).returning();
  const [automation] = await db.insert(moduleAutomations).values({
    tenantId: admin.currentTenantId,
    userId,
    templateId: 'delete-lifecycle-template',
    name: 'Delete lifecycle automation',
    trigger: 'User hard-delete begins',
    action: 'Remove module-owned rows atomically',
    modules: ['callcommand-ai'],
  }).returning();
  const [scaffold] = await db.insert(moduleScaffolds).values({
    tenantId: admin.currentTenantId,
    userId,
    slug: 'delete-lifecycle-scaffold',
    stackId: 'next-fastify',
    stackName: 'Next + Fastify',
    files: ['README.md'],
  }).returning();

  return {
    callLogId: callLog.id,
    studySessionId: studySession.id,
    automationId: automation.id,
    scaffoldId: scaffold.id,
  };
}

async function assertModuleRows(rows: SeededModuleRows, expectedCount: number) {
  const counts = await Promise.all([
    db.select().from(moduleCallLogs).where(eq(moduleCallLogs.id, rows.callLogId)),
    db.select().from(moduleStudySessions).where(eq(moduleStudySessions.id, rows.studySessionId)),
    db.select().from(moduleAutomations).where(eq(moduleAutomations.id, rows.automationId)),
    db.select().from(moduleScaffolds).where(eq(moduleScaffolds.id, rows.scaffoldId)),
  ]);
  assert.deepEqual(
    counts.map((result) => result.length),
    [expectedCount, expectedCount, expectedCount, expectedCount],
  );
}

async function cleanupModuleRows(rows: SeededModuleRows) {
  await db.delete(moduleCallLogs).where(eq(moduleCallLogs.id, rows.callLogId));
  await db.delete(moduleStudySessions).where(eq(moduleStudySessions.id, rows.studySessionId));
  await db.delete(moduleAutomations).where(eq(moduleAutomations.id, rows.automationId));
  await db.delete(moduleScaffolds).where(eq(moduleScaffolds.id, rows.scaffoldId));
}

async function seedStructuredPoolRows(userId: string) {
  const [profile] = await db.insert(ninjaPoolPlayerProfiles).values({
    tenantId: admin.currentTenantId,
    userId,
    displayName: 'Delete Lifecycle Player',
    preferences: {
      aimGuide: true,
      tableSpeed: 1,
      sound: false,
      vibration: false,
      callShotOn8: false,
      threeFoulRule: false,
    },
  }).returning();
  const [match] = await db.insert(ninjaPoolMatchSessions).values({
    tenantId: admin.currentTenantId,
    userId,
    mode: 'bot',
    opponentName: 'CPU',
    rulesSettings: profile.preferences,
    logicalState: makeInitialGameState(makeLogicalBalls(), ['Delete Lifecycle Player', 'CPU']),
    clientStartId: `delete-start-${userId}`,
  }).returning();
  const [event] = await db.insert(ninjaPoolMatchEvents).values({
    tenantId: admin.currentTenantId,
    matchId: match.id,
    userId,
    sequenceNumber: 1,
    clientActionId: `delete-shot-${userId}`,
    eventKind: 'shot',
    input: { shooterSeat: 0 },
    outcome: { currentPlayer: 1, evidence: 'client_reported_server_rules' },
  }).returning();
  return { profileId: profile.id, matchId: match.id, eventId: event.id };
}

async function cleanupStructuredPoolRows(userId: string) {
  await db.delete(ninjaPoolMatchEvents).where(eq(ninjaPoolMatchEvents.userId, userId));
  await db.delete(ninjaPoolMatchSessions).where(eq(ninjaPoolMatchSessions.userId, userId));
  await db.delete(ninjaPoolPlayerProfiles).where(eq(ninjaPoolPlayerProfiles.userId, userId));
}

before(async () => {
  await ensureSchemaReady();
  const { ensureModuleShellTables } = await import('../src/lib/saas-db-init.js');
  await ensureModuleShellTables();
  const { ensureNinjaPoolHallTables } = await import('../src/lib/ninja-pool-hall-db-init.js');
  await ensureNinjaPoolHallTables();
  ({ signToken } = await import('../src/lib/auth.js'));

  admin = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, admin.id));

  const { registerPlatformRoutes } = await import('../src/routes/platform-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  await registerPlatformRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (admin) {
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.adminId, admin.id));
    await cleanupUser(admin.id);
  }
});

test('user hard-delete removes native module rows and commits its audit atomically', async () => {
  const target = await createDeletedTarget();
  const personalTenantId = target.currentTenantId!;
  const moduleRows = await seedModuleRows(target.id);
  const [practice] = await db.insert(ninjaPoolPracticeSessions).values({
    tenantId: admin.currentTenantId,
    userId: target.id,
    shots: 4,
    objectBallsPocketed: 3,
  }).returning();
  const [personalPractice] = await db.insert(ninjaPoolPracticeSessions).values({
    tenantId: personalTenantId,
    userId: target.id,
    shots: 3,
    objectBallsPocketed: 2,
  }).returning();
  const [workspace] = await db.insert(saasWorkspaces).values({
    ownerId: target.id,
    tenantId: personalTenantId,
    name: 'Delete Lifecycle Workspace',
    slug: uniqueId('delete-workspace'),
  }).returning();
  const structured = await seedStructuredPoolRows(target.id);
  const [targetAuthoredAudit] = await db.insert(adminAuditLogs).values({
    adminId: target.id,
    actorEmailSnapshot: target.email,
    action: 'target_preexisting_audit',
    targetUserId: target.id,
    tenantId: personalTenantId,
  }).returning();

  try {
    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/platform/users/${target.id}/hard`,
      headers: bearer(),
    });

    assert.equal(response.statusCode, 200, response.body);
    assert.equal((await db.select().from(users).where(eq(users.id, target.id))).length, 0);
    assert.equal((await db.select().from(tenants).where(eq(tenants.id, personalTenantId))).length, 0,
      'owned personal tenant must be removed with the user');
    assert.equal((await db.select().from(ninjaPoolPracticeSessions)
      .where(eq(ninjaPoolPracticeSessions.id, practice.id))).length, 0);
    assert.equal((await db.select().from(ninjaPoolPracticeSessions)
      .where(eq(ninjaPoolPracticeSessions.id, personalPractice.id))).length, 0,
      'personal-tenant product rows must be cascaded');
    assert.equal((await db.select().from(saasWorkspaces)
      .where(eq(saasWorkspaces.id, workspace.id))).length, 0,
      'legacy workspace dependents must no longer block user deletion');
    assert.equal((await db.select().from(ninjaPoolPlayerProfiles)
      .where(eq(ninjaPoolPlayerProfiles.id, structured.profileId))).length, 0);
    assert.equal((await db.select().from(ninjaPoolMatchSessions)
      .where(eq(ninjaPoolMatchSessions.id, structured.matchId))).length, 0);
    assert.equal((await db.select().from(ninjaPoolMatchEvents)
      .where(eq(ninjaPoolMatchEvents.id, structured.eventId))).length, 0);
    await assertModuleRows(moduleRows, 0);

    const audits = await db.select().from(adminAuditLogs).where(and(
      eq(adminAuditLogs.adminId, admin.id),
      eq(adminAuditLogs.targetUserId, target.id),
      eq(adminAuditLogs.action, 'user_hard_deleted'),
    ));
    assert.equal(audits.length, 1);
    assert.equal((audits[0].details as Record<string, unknown>).targetId, target.id);
    const [retainedAudit] = await db.select().from(adminAuditLogs)
      .where(eq(adminAuditLogs.id, targetAuthoredAudit.id));
    assert.ok(retainedAudit, 'historical audit event must survive the identity purge');
    assert.equal(retainedAudit.adminId, null);
    assert.equal(retainedAudit.actorEmailSnapshot, target.email);
  } finally {
    await cleanupModuleRows(moduleRows);
    await cleanupStructuredPoolRows(target.id);
    await db.delete(ninjaPoolPracticeSessions).where(eq(ninjaPoolPracticeSessions.id, practice.id));
    await db.delete(ninjaPoolPracticeSessions).where(eq(ninjaPoolPracticeSessions.id, personalPractice.id));
    await db.delete(saasWorkspaces).where(eq(saasWorkspaces.id, workspace.id));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.targetUserId, target.id));
    await db.delete(users).where(eq(users.id, target.id));
  }
});

test('user hard-delete refuses company-tenant ownership before destructive work begins', async () => {
  const target = await createDeletedTarget();
  const moduleRows = await seedModuleRows(target.id);
  const [practice] = await db.insert(ninjaPoolPracticeSessions).values({
    tenantId: admin.currentTenantId,
    userId: target.id,
    shots: 5,
    objectBallsPocketed: 4,
  }).returning();
  const structured = await seedStructuredPoolRows(target.id);
  const [ownedTenant] = await db.insert(tenants).values({
    name: 'Intentional Delete Blocker',
    slug: `nph-user-block-${uniqueId('t').replace(/_/g, '-')}`,
    type: 'company',
    ownerUserId: target.id,
    status: 'archived',
  }).returning();

  try {
    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/platform/users/${target.id}/hard`,
      headers: bearer(),
    });

    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().code, 'USER_OWNS_COMPANY_TENANTS');
    assert.equal((await db.select().from(users).where(eq(users.id, target.id))).length, 1);
    assert.equal((await db.select().from(ninjaPoolPracticeSessions)
      .where(eq(ninjaPoolPracticeSessions.id, practice.id))).length, 1);
    assert.equal((await db.select().from(ninjaPoolPlayerProfiles)
      .where(eq(ninjaPoolPlayerProfiles.id, structured.profileId))).length, 1);
    assert.equal((await db.select().from(ninjaPoolMatchSessions)
      .where(eq(ninjaPoolMatchSessions.id, structured.matchId))).length, 1);
    assert.equal((await db.select().from(ninjaPoolMatchEvents)
      .where(eq(ninjaPoolMatchEvents.id, structured.eventId))).length, 1);
    await assertModuleRows(moduleRows, 1);
    const audits = await db.select().from(adminAuditLogs).where(and(
      eq(adminAuditLogs.adminId, admin.id),
      eq(adminAuditLogs.targetUserId, target.id),
      eq(adminAuditLogs.action, 'user_hard_deleted'),
    ));
    assert.equal(audits.length, 0, 'ownership precondition must reject before writing a delete audit');
  } finally {
    await cleanupModuleRows(moduleRows);
    await cleanupStructuredPoolRows(target.id);
    await db.delete(ninjaPoolPracticeSessions).where(eq(ninjaPoolPracticeSessions.id, practice.id));
    await db.delete(tenants).where(eq(tenants.id, ownedTenant.id));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.targetUserId, target.id));
    await cleanupUser(target.id);
  }
});
