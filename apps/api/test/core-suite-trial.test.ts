import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  accountTrials,
  planModules,
  subscriptionPlans,
  subscriptions,
  tenantModules,
  tenants,
  tenantUsers,
  users,
} from '../src/schema.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
} from './_setup.js';

process.env.OPERATOROS_SELF_SERVICE_TRIALS_ENABLED = '1';
process.env.OPERATOROS_TRIAL_IDENTITY_HMAC_SECRET = 'core-suite-trial-test-hmac-secret-32-plus';
process.env.APP_ENV = 'test';

let user: Awaited<ReturnType<typeof createTestUser>>;
let secondUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
let trialId: string | null = null;
let mappingId: string | null = null;
const moduleRows: Array<Awaited<ReturnType<typeof createTestModule>>> = [];

before(async () => {
  await ensureSchemaReady();
  user = await createTestUser();
  for (const slug of ['tradeflowkit', 'techdeck', 'pulsedesk', 'snapproofos']) {
    moduleRows.push(await createTestModule(slug));
  }
});

after(async () => {
  if (mappingId) await db.delete(planModules).where(eq(planModules.id, mappingId));
  if (user) await db.delete(subscriptions).where(eq(subscriptions.userId, user.id));
  if (trialId) await db.delete(accountTrials).where(eq(accountTrials.id, trialId));
  if (secondUser) await cleanupUser(secondUser.id);
  if (user) await cleanupUser(user.id);
  for (const module of moduleRows.reverse()) await cleanupModule(module.id);
});

test('verified-email Core Suite trial is one-time, personal, exact, expiring, and subordinate to paid grants', async () => {
  const {
    CORE_SUITE_TRIAL_DURATION_HOURS,
    CORE_SUITE_TRIAL_MODULE_SLUGS,
    CoreSuiteTrialError,
    getCoreSuiteTrialStatus,
    resolveCoreSuiteTrialAccess,
    startCoreSuiteTrial,
  } = await import('../src/lib/core-suite-trial.js');
  const {
    confirmEmailVerificationToken,
    issueEmailVerificationToken,
  } = await import('../src/lib/email-verification.js');
  const { resolveTenantModuleAccess } = await import('../src/lib/tenant-entitlements.js');

  assert.deepEqual([...CORE_SUITE_TRIAL_MODULE_SLUGS], ['tradeflowkit', 'techdeck', 'pulsedesk']);
  assert.equal((await getCoreSuiteTrialStatus(user.id)).state, 'verification_required');
  await assert.rejects(
    () => startCoreSuiteTrial(user.id),
    (error: any) => error instanceof CoreSuiteTrialError && error.code === 'EMAIL_VERIFICATION_REQUIRED',
  );

  const verification = await issueEmailVerificationToken(user.id, '127.0.0.1');
  const confirmed = await confirmEmailVerificationToken(verification.token);
  assert.equal(confirmed?.userId, user.id);
  assert.equal(await confirmEmailVerificationToken(verification.token), null, 'verification links are single-use');
  assert.equal((await getCoreSuiteTrialStatus(user.id)).state, 'eligible');

  const startResult = await startCoreSuiteTrial(user.id);
  const started = startResult.trial;
  assert.equal(startResult.created, true);
  trialId = (await db.select({ id: accountTrials.id }).from(accountTrials)
    .where(eq(accountTrials.subjectUserId, user.id)).limit(1))[0]!.id;
  assert.equal(started.state, 'active');
  assert.equal(started.personalTenantId, user.currentTenantId);
  assert.ok(started.startedAt && started.endsAt);
  const hours = (Date.parse(started.endsAt!) - Date.parse(started.startedAt!)) / 3_600_000;
  assert.equal(hours, CORE_SUITE_TRIAL_DURATION_HOURS);

  const replayResult = await startCoreSuiteTrial(user.id);
  const replay = replayResult.trial;
  assert.equal(replayResult.created, false, 'an active retry does not emit another start event');
  assert.equal(replay.startedAt, started.startedAt, 'an active retry is idempotent');
  assert.equal(replay.endsAt, started.endsAt, 'a retry cannot extend the trial');

  for (const slug of CORE_SUITE_TRIAL_MODULE_SLUGS) {
    const access = await resolveTenantModuleAccess(user.id, user.currentTenantId, slug);
    assert.equal(access.hasAccess, true, slug);
    assert.equal(access.source, 'trial', slug);
    assert.equal(access.expiresAt?.toISOString(), started.endsAt, slug);
  }
  assert.deepEqual(
    await resolveCoreSuiteTrialAccess(user.id, user.currentTenantId, 'snapproofos'),
    { granted: false, expiresAt: null },
    'companion applications are outside the offer',
  );

  const [company] = await db.insert(tenants).values({
    name: 'Trial Isolation Company',
    slug: `trial-isolation-${user.id}`,
    type: 'company',
    ownerUserId: user.id,
  }).returning();
  await db.insert(tenantUsers).values({ tenantId: company.id, userId: user.id, role: 'owner' });
  const companyDecision = await resolveTenantModuleAccess(user.id, company.id, 'tradeflowkit');
  assert.equal(companyDecision.hasAccess, false, 'personal trial cannot flow into a company tenant');

  const [starter] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, 'starter')).limit(1);
  assert.ok(starter);
  const techDeck = moduleRows.find(module => module.slug === 'techdeck')!;
  const [mapping] = await db.insert(planModules).values({ planId: starter.id, moduleId: techDeck.id }).returning();
  mappingId = mapping.id;
  await db.insert(subscriptions).values({
    userId: user.id,
    planId: starter.id,
    status: 'active',
    tenantId: user.currentTenantId,
    scopeType: 'tenant',
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  const paidPlan = await resolveTenantModuleAccess(user.id, user.currentTenantId, 'techdeck');
  assert.equal(paidPlan.source, 'plan', 'server-persisted plan access takes precedence over trial');

  const pulseDesk = moduleRows.find(module => module.slug === 'pulsedesk')!;
  await db.insert(tenantModules).values({
    tenantId: user.currentTenantId,
    moduleId: pulseDesk.id,
    status: 'purchased',
    source: 'addon',
    allowAllMembers: true,
  });
  const paidAddon = await resolveTenantModuleAccess(user.id, user.currentTenantId, 'pulsedesk');
  assert.equal(paidAddon.source, 'addon', 'server-persisted add-on access takes precedence over trial');

  await db.update(accountTrials).set({
    startedAt: sql`NOW() - INTERVAL '8 days'`,
    endsAt: sql`NOW() - INTERVAL '1 day'`,
    updatedAt: new Date(),
  }).where(eq(accountTrials.id, trialId));
  assert.equal((await getCoreSuiteTrialStatus(user.id)).state, 'expired');
  assert.deepEqual(
    await resolveCoreSuiteTrialAccess(user.id, user.currentTenantId, 'tradeflowkit'),
    { granted: false, expiresAt: null },
  );
  assert.equal((await resolveTenantModuleAccess(user.id, user.currentTenantId, 'tradeflowkit')).hasAccess, false);
  assert.equal((await resolveTenantModuleAccess(user.id, user.currentTenantId, 'techdeck')).source, 'plan');
  assert.equal((await resolveTenantModuleAccess(user.id, user.currentTenantId, 'pulsedesk')).source, 'addon');

  const originalEmail = user.email;
  await db.update(users).set({ email: `prior-${originalEmail}`, emailVerifiedAt: null }).where(eq(users.id, user.id));
  secondUser = await createTestUser();
  await db.update(users).set({ email: originalEmail, emailVerifiedAt: new Date() }).where(eq(users.id, secondUser.id));
  const reused = await getCoreSuiteTrialStatus(secondUser.id);
  assert.equal(reused.state, 'already_used');
  await assert.rejects(
    () => startCoreSuiteTrial(secondUser!.id),
    (error: any) => error instanceof CoreSuiteTrialError && error.code === 'TRIAL_ALREADY_USED',
  );

  const ledger = await db.select().from(accountTrials).where(and(
    eq(accountTrials.id, trialId),
    eq(accountTrials.offerCode, started.offerCode),
  ));
  assert.equal(ledger.length, 1, 'expiration and access removal preserve the durable trial record');
});
