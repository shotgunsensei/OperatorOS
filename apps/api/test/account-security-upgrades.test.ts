import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, closeDatabasePool } from '../src/db.js';
import { createTestUser, ensureSchemaReady } from './_setup.js';
import { checkPersistentAuthRateLimit } from '../src/lib/auth-request-limits.js';
import { issueEmailChange, confirmEmailChange } from '../src/lib/auth-email-change.js';
import { beginAuthMfaEnrollment, confirmAuthMfaEnrollment, generateTotpForTest, verifySensitiveActionMfa } from '../src/lib/auth-mfa.js';

let app: any, user: any, recovery: string[], secret: string;
let signToken: typeof import('../src/lib/auth.js').signToken;
const password = 'Test-only-account-password-2026';
function headers() { return { authorization: `Bearer ${signToken({ userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion, sessionType: 'platform' })}` }; }
before(async () => {
  assert.equal(process.env.PARITY_DATABASE_IS_DISPOSABLE, '1');
  await ensureSchemaReady(); user = await createTestUser();
  const auth = await import('../src/lib/auth.js'); signToken = auth.signToken;
  await db.execute(sql`UPDATE users SET password_hash=${await auth.hashPassword(password)} WHERE id=${user.id}`);
  const setup = await beginAuthMfaEnrollment({ userId: user.id, email: user.email }); secret = setup.secret;
  recovery = (await confirmAuthMfaEnrollment({ userId: user.id, code: generateTotpForTest(secret) })).recoveryCodes;
  app = (await import('fastify')).default(); await app.register((await import('@fastify/cookie')).default);
  await (await import('../src/routes/auth-routes.js')).registerAuthRoutes(app); await app.ready();
});
after(async () => { await app?.close(); await closeDatabasePool(); });

test('Persistent limits enforce one shared budget under concurrent requests and reset after expiration', async () => {
  const key = `test-limit:${randomUUID()}`;
  const results = await Promise.all(Array.from({ length: 20 }, () => checkPersistentAuthRateLimit(key, 5, 60_000)));
  assert.equal(results.filter(Boolean).length, 5);
  assert.equal(await checkPersistentAuthRateLimit(key, 5, 60_000), false);
  assert.equal(await checkPersistentAuthRateLimit(key + ':different', 5, 60_000), true);
  await db.execute(sql`UPDATE auth_request_limits SET resets_at=NOW()-INTERVAL '1 second'`);
  assert.equal(await checkPersistentAuthRateLimit(key, 5, 60_000), true);
  const rows = await db.execute(sql`SELECT * FROM auth_request_limits`);
  assert.equal(JSON.stringify(rows.rows).includes(key), false);
});

test('Sensitive account changes require a current second factor when enrolled', async () => {
  const before = await db.execute(sql`SELECT email,token_version FROM users WHERE id=${user.id}`);
  const response = await app.inject({ method: 'PUT', url: '/v1/auth/change-email', headers: headers(), payload: { password, newEmail: `pending-${user.email}` } });
  assert.equal(response.statusCode, 403, response.body); assert.equal(response.json().code, 'MFA_VERIFICATION_REQUIRED');
  const after = await db.execute(sql`SELECT email,token_version FROM users WHERE id=${user.id}`);
  assert.deepEqual(after.rows, before.rows);
  const requested = await app.inject({ method: 'PUT', url: '/v1/auth/change-email', headers: headers(), payload: { password, newEmail: `pending-${user.email}`, code: generateTotpForTest(secret) } });
  assert.equal(requested.statusCode, 202, requested.body);
  assert.equal(requested.json().pendingVerification, true);
  const unchanged = await db.execute(sql`SELECT email FROM users WHERE id=${user.id}`);
  assert.equal(unchanged.rows[0].email, user.email);
  assert.equal(requested.body.includes('change_email_'), false);
});

test('A recovery code can authorize only one concurrent sensitive change', async () => {
  const results = await Promise.all([1, 2].map(() => verifySensitiveActionMfa(user.id, { recoveryCode: recovery[0] })));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await verifySensitiveActionMfa(user.id, { recoveryCode: recovery[0] }), false);
});

test('Browsers have distinct sessions; individual sign-out is private and leaves the other browser working', async () => {
  const firstHeaders = { ...headers(), 'user-agent': 'Mozilla/5.0 Windows Chrome/130.0' };
  const secondHeaders = { ...headers(), 'user-agent': 'Mozilla/5.0 Macintosh Firefox/130.0' };
  assert.notEqual(firstHeaders.authorization, secondHeaders.authorization, 'same-second sign-ins have distinct session IDs');
  assert.equal((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: firstHeaders })).statusCode, 200);
  const list = await app.inject({ method: 'GET', url: '/v1/auth/sessions', headers: secondHeaders });
  assert.equal(list.statusCode, 200, list.body);
  const target = list.json().sessions.find((row: any) => row.deviceLabel === 'Chrome on Windows');
  assert.ok(target); assert.equal(target.current, false);
  assert.equal(list.body.includes('token_hash'), false); assert.equal(list.body.includes(firstHeaders.authorization), false);
  const other = await createTestUser();
  const foreignHeaders = { authorization: `Bearer ${signToken({ userId: other.id, email: other.email, role: other.role, tokenVersion: other.tokenVersion, sessionType: 'platform' })}` };
  const forbidden = await app.inject({ method: 'POST', url: `/v1/auth/sessions/${target.id}/revoke`, headers: foreignHeaders });
  assert.equal(forbidden.statusCode, 404, forbidden.body);
  const revoked = await app.inject({ method: 'POST', url: `/v1/auth/sessions/${target.id}/revoke`, headers: secondHeaders });
  assert.equal(revoked.statusCode, 200, revoked.body);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: firstHeaders })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: secondHeaders })).statusCode, 200);
});

test('Email confirmation is single-use, replaces previous links, and invalidates existing sessions', async () => {
  const first = await issueEmailChange(user.id, `oldrequest-${user.email}`);
  const next = await issueEmailChange(user.id, `confirmed-${user.email}`);
  assert.equal(await confirmEmailChange(first.token), null);
  const stored = await db.execute(sql`SELECT token_hash FROM auth_pending_email_changes WHERE user_id=${user.id}`);
  assert.equal(JSON.stringify(stored.rows).includes(next.token), false);
  const response = await app.inject({ method: 'POST', url: '/v1/auth/email-verification/confirm', payload: { token: next.token } });
  assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().emailChanged, true);
  const changed = await db.execute(sql`SELECT email,email_verified_at,token_version FROM users WHERE id=${user.id}`);
  assert.equal(changed.rows[0].email, `confirmed-${user.email}`); assert.ok(changed.rows[0].email_verified_at);
  const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: headers() }); assert.equal(me.statusCode, 401);
  assert.equal(await confirmEmailChange(next.token), null);
});

test('Expired links and links issued before a global session reset cannot change an address', async () => {
  const expired = await issueEmailChange(user.id, `expired-${user.email}`);
  await db.execute(sql`UPDATE auth_pending_email_changes SET expires_at=NOW()-INTERVAL '1 second' WHERE id=${expired.id}`);
  assert.equal(await confirmEmailChange(expired.token), null);
  const stale = await issueEmailChange(user.id, `stale-${user.email}`);
  await db.execute(sql`UPDATE users SET token_version=token_version+1 WHERE id=${user.id}`);
  assert.equal(await confirmEmailChange(stale.token), null);
});
