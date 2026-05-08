import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../src/db.js';
import { ssoHandoffTokens } from '../src/schema.js';
import { cleanupExpiredSsoTokens } from '../src/lib/sso-cleanup.js';
import {
  ensureSchemaReady,
  createTestUser,
  createTestModule,
  cleanupUser,
  cleanupModule,
  uniqueId,
} from './_setup.js';

let userId: string;
let moduleId: string;
let moduleSlug: string;

const DAY_MS = 24 * 60 * 60 * 1000;

const insertedJtis: string[] = [];

async function seed(jti: string, opts: {
  expiresAt: Date;
  consumedAt: Date | null;
}) {
  await db.insert(ssoHandoffTokens).values({
    jti,
    userId,
    moduleSlug,
    aud: moduleSlug,
    env: 'dev',
    issuedIp: '10.0.0.1',
    issuedAt: new Date(opts.expiresAt.getTime() - 60_000),
    expiresAt: opts.expiresAt,
    consumedAt: opts.consumedAt,
    consumedIp: opts.consumedAt ? '10.0.0.1' : null,
  });
  insertedJtis.push(jti);
}

before(async () => {
  await ensureSchemaReady();
  const u = await createTestUser();
  userId = u.id;
  const m = await createTestModule();
  moduleId = m.id;
  moduleSlug = m.slug;
});

after(async () => {
  if (insertedJtis.length) {
    try { await db.delete(ssoHandoffTokens).where(inArray(ssoHandoffTokens.jti, insertedJtis)); } catch {}
  }
  if (userId) await cleanupUser(userId);
  if (moduleId) await cleanupModule(moduleId);
});

test('cleanupExpiredSsoTokens deletes only rows past 7-day retention; preserves fresh and recently-consumed', async () => {
  const now = Date.now();

  // Use a unique tag prefix per run so we can isolate this test's rows
  // even if other tests in the suite leave behind sso rows.
  const tag = uniqueId('sso-cleanup');

  const freshUnconsumed = `${tag}-fresh-unconsumed`;
  const freshConsumed = `${tag}-fresh-consumed`;
  const recentlyConsumedExpiredYesterday = `${tag}-recent-consumed-old-expiry`;
  const longExpiredUnconsumed = `${tag}-long-expired-unconsumed`;
  const longExpiredLongConsumed = `${tag}-long-expired-long-consumed`;
  const longExpiredButRecentlyConsumed = `${tag}-long-expired-recent-consumed`;
  const justBarelyExpiredUnconsumed = `${tag}-barely-expired-unconsumed`;

  // 1. Fresh unconsumed token (expires in the future) — must survive
  await seed(freshUnconsumed, {
    expiresAt: new Date(now + 60_000),
    consumedAt: null,
  });

  // 2. Fresh token, consumed just now, still valid — must survive
  await seed(freshConsumed, {
    expiresAt: new Date(now + 60_000),
    consumedAt: new Date(now),
  });

  // 3. Token whose expiry is older than 7 days but was consumed within the
  //    retention window (yesterday) — must survive (consumed_at branch
  //    keeps it).
  await seed(recentlyConsumedExpiredYesterday, {
    expiresAt: new Date(now - 8 * DAY_MS),
    consumedAt: new Date(now - 1 * DAY_MS),
  });

  // 4. Token expired more than 7 days ago, never consumed — must be deleted
  //    (covers the isNull(consumedAt) branch).
  await seed(longExpiredUnconsumed, {
    expiresAt: new Date(now - 8 * DAY_MS),
    consumedAt: null,
  });

  // 5. Token expired AND consumed both more than 7 days ago — must be deleted.
  await seed(longExpiredLongConsumed, {
    expiresAt: new Date(now - 10 * DAY_MS),
    consumedAt: new Date(now - 9 * DAY_MS),
  });

  // 6. Token whose expiry is long past but was consumed within retention
  //    window — duplicate of (3) but with much older expiry to confirm
  //    consumed_at gating dominates the decision when present.
  await seed(longExpiredButRecentlyConsumed, {
    expiresAt: new Date(now - 30 * DAY_MS),
    consumedAt: new Date(now - 2 * DAY_MS),
  });

  // 7. Token expired ~6 days ago, never consumed — must survive
  //    (expires_at not yet beyond the 7-day cutoff).
  await seed(justBarelyExpiredUnconsumed, {
    expiresAt: new Date(now - 6 * DAY_MS),
    consumedAt: null,
  });

  await cleanupExpiredSsoTokens();

  const remaining = await db
    .select({ jti: ssoHandoffTokens.jti })
    .from(ssoHandoffTokens)
    .where(inArray(ssoHandoffTokens.jti, insertedJtis));
  const remainingSet = new Set(remaining.map(r => r.jti));

  // Survivors
  assert.ok(remainingSet.has(freshUnconsumed), 'fresh unconsumed token must survive');
  assert.ok(remainingSet.has(freshConsumed), 'fresh consumed token must survive');
  assert.ok(
    remainingSet.has(recentlyConsumedExpiredYesterday),
    'token consumed within 7d must survive even if expires_at is older',
  );
  assert.ok(
    remainingSet.has(longExpiredButRecentlyConsumed),
    'token consumed within 7d must survive regardless of how old expires_at is',
  );
  assert.ok(
    remainingSet.has(justBarelyExpiredUnconsumed),
    'token expired <7d ago must survive (expires_at side of cutoff)',
  );

  // Deletions
  assert.ok(
    !remainingSet.has(longExpiredUnconsumed),
    'long-expired unconsumed token must be deleted (isNull branch)',
  );
  assert.ok(
    !remainingSet.has(longExpiredLongConsumed),
    'long-expired long-consumed token must be deleted (consumed_at < cutoff branch)',
  );
});
