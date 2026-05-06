import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users as usersTable, billingEvents, addonSubscriptions } from '../src/schema.js';
import {
  classifyWebhookEvent,
  claimStripeEvent,
  processAddonWebhookEvent,
  markStripeEventProcessed,
  markStripeEventFailed,
  retryBillingEvent,
} from '../src/lib/billing-service.js';
import { signToken } from '../src/lib/auth.js';
import {
  ensureSchemaReady,
  createTestUser,
  createTestModule,
  cleanupUser,
  cleanupModule,
  buildAddonCheckoutEvent,
  uniqueId,
} from './_setup.js';

let userId: string;
let adminId: string;
let adminToken: string;
let moduleId: string;
let moduleSlug: string;
let app: any;

before(async () => {
  await ensureSchemaReady();
  const u = await createTestUser();
  userId = u.id;
  // Promote a second test user to admin so we can hit requireAdmin routes.
  const a = await createTestUser();
  adminId = a.id;
  await db.update(usersTable).set({ role: 'admin' }).where(eq(usersTable.id, adminId));
  adminToken = signToken({ userId: adminId, email: a.email, role: 'admin' });

  const m = await createTestModule();
  moduleId = m.id;
  moduleSlug = m.slug;

  // Stand up a Fastify app with admin routes registered so the retry
  // endpoint is exercised end-to-end (preHandler auth + handler + DB).
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerAdminRoutes } = await import('../src/routes/admin-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerAdminRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (userId) await cleanupUser(userId);
  if (adminId) await cleanupUser(adminId);
  if (moduleId) await cleanupModule(moduleId);
});

test('success path: claim persists metadata.rawEvent and processAddonWebhookEvent activates addon', async () => {
  const event = buildAddonCheckoutEvent({ userId, moduleSlug });
  const cls = classifyWebhookEvent(event);
  assert.equal(cls.isAddon, true, 'classification should detect addon metadata');
  assert.equal(cls.userId, userId);
  assert.equal(cls.moduleSlug, moduleSlug);

  const { claimedRowId, isDuplicate } = await claimStripeEvent(event, cls);
  assert.equal(isDuplicate, false);
  assert.ok(claimedRowId, 'claim should return a row id');

  const [claimRow] = await db.select().from(billingEvents).where(eq(billingEvents.id, claimedRowId!));
  const md = (claimRow.metadata ?? {}) as any;
  assert.deepEqual(md.rawEvent, event, 'rawEvent must be persisted on claim');
  assert.equal(md.kind, 'addon');

  const result = await processAddonWebhookEvent(event);
  assert.equal(result.handled, true, 'addon processor should handle a valid event');

  await markStripeEventProcessed(claimedRowId!, result.action);

  const [after] = await db.select().from(billingEvents).where(eq(billingEvents.id, claimedRowId!));
  assert.ok(after.processedAt, 'processedAt should be set on success');
  const afterMd = (after.metadata ?? {}) as any;
  assert.deepEqual(afterMd.rawEvent, event, 'rawEvent must STILL be present after success update');

  const addons = await db.select().from(addonSubscriptions).where(eq(addonSubscriptions.userId, userId));
  const active = addons.find(a => a.moduleId === moduleId && a.status === 'active');
  assert.ok(active, 'active addon row should exist after success');
});

test('failure path: unknown module slug — claim still persists rawEvent and markStripeEventFailed preserves it', async () => {
  const bogusSlug = uniqueId('does-not-exist');
  const event = buildAddonCheckoutEvent({ userId, moduleSlug: bogusSlug });
  const cls = classifyWebhookEvent(event);
  assert.equal(cls.isAddon, true);
  assert.equal(cls.moduleSlug, bogusSlug);

  const { claimedRowId, isDuplicate } = await claimStripeEvent(event, cls);
  assert.equal(isDuplicate, false);
  assert.ok(claimedRowId);

  const [beforeRow] = await db.select().from(billingEvents).where(eq(billingEvents.id, claimedRowId!));
  const beforeMd = (beforeRow.metadata ?? {}) as any;
  assert.deepEqual(beforeMd.rawEvent, event, 'failure-path claim must persist rawEvent');

  const result = await processAddonWebhookEvent(event);
  assert.equal(result.handled, false, 'unknown module should not be handled');
  assert.match(result.error ?? '', /not found/i);

  await markStripeEventFailed(claimedRowId!, result.error ?? 'not_handled');

  const [afterRow] = await db.select().from(billingEvents).where(eq(billingEvents.id, claimedRowId!));
  const afterMd = (afterRow.metadata ?? {}) as any;
  assert.deepEqual(
    afterMd.rawEvent, event,
    'REGRESSION GUARD: markStripeEventFailed must NOT clobber metadata.rawEvent',
  );
  assert.ok(afterMd.lastFailureAt, 'lastFailureAt should be merged into metadata');
  assert.equal(afterRow.errorMessage, result.error ?? 'not_handled');
  assert.equal(afterRow.processedAt, null, 'failed event must remain in DLQ (processedAt=null)');
});

test('POST /v1/admin/billing-events/:id/retry performs true replay; second retry returns duplicate_ignored', async () => {
  const event = buildAddonCheckoutEvent({
    userId,
    moduleSlug,
    stripeSubId: uniqueId('sub-replay'),
  });

  const cls = classifyWebhookEvent(event);
  const { claimedRowId } = await claimStripeEvent(event, cls);
  assert.ok(claimedRowId);

  // Simulate a failure — DLQ row sits unprocessed with rawEvent intact.
  await markStripeEventFailed(claimedRowId!, 'simulated_transient_failure');

  // Sanity: addon has no row for this stripeSubId yet.
  const beforeAddons = await db.select().from(addonSubscriptions)
    .where(eq(addonSubscriptions.stripeSubscriptionId, event.data.object.subscription));
  assert.equal(beforeAddons.length, 0);

  // First retry — true replay through the actual HTTP route. This
  // exercises requireAdmin auth + the route handler + retryBillingEvent
  // + processAddonWebhookEvent end-to-end.
  const res1 = await app.inject({
    method: 'POST',
    url: `/v1/admin/billing-events/${claimedRowId}/retry`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res1.statusCode, 200, `first retry HTTP should be 200, got ${res1.statusCode}: ${res1.payload}`);
  const body1 = res1.json();
  assert.equal(body1.ok, true);
  assert.equal(body1.replayed, true, 'first retry must be a TRUE replay (not just mark-resolved)');
  assert.equal(body1.replayResult?.handled, true);

  const afterAddons = await db.select().from(addonSubscriptions)
    .where(eq(addonSubscriptions.stripeSubscriptionId, event.data.object.subscription));
  assert.equal(afterAddons.length, 1, 'replay must create the addon row');
  assert.equal(afterAddons[0].status, 'active');

  const [rowAfterReplay] = await db.select().from(billingEvents).where(eq(billingEvents.id, claimedRowId!));
  assert.ok(rowAfterReplay.processedAt, 'replay must set processedAt');
  assert.equal(rowAfterReplay.errorMessage, null);
  const replayMd = (rowAfterReplay.metadata ?? {}) as any;
  assert.deepEqual(replayMd.rawEvent, event, 'rawEvent must remain after replay');
  assert.ok(replayMd.replayedAt, 'replayedAt should be recorded');

  // Second retry — must be an idempotent no-op via the route. The
  // contract is `action: 'duplicate_ignored'` so callers can treat
  // it the same as a redelivered live webhook.
  const res2 = await app.inject({
    method: 'POST',
    url: `/v1/admin/billing-events/${claimedRowId}/retry`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res2.statusCode, 200);
  const body2 = res2.json();
  assert.equal(body2.ok, true, 'second retry should be ok (idempotent), not an error');
  assert.equal(body2.replayed, false, 'second retry must NOT replay a processed event');
  assert.equal(
    body2.replayResult?.action, 'duplicate_ignored',
    'second retry must return duplicate_ignored action (idempotency contract)',
  );

  const afterAddons2 = await db.select().from(addonSubscriptions)
    .where(eq(addonSubscriptions.stripeSubscriptionId, event.data.object.subscription));
  assert.equal(afterAddons2.length, 1, 'second retry must not create duplicate addon rows');
});
