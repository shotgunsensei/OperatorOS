import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users } from '../src/schema.js';
import { generateTotpForTest } from '../src/lib/auth-mfa.js';
import { hashPassword } from '../src/lib/auth.js';
import { cleanupUser, createTestUser, ensureSchemaReady } from './_setup.js';

process.env.SESSION_SECRET ||= 'auth-mfa-test-session-secret-32-plus';
process.env.SHARED_SECRET_ENCRYPTION_KEY ||= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function cookie(response: any, name: string): string {
  const raw = response.headers['set-cookie'];
  const values = Array.isArray(raw) ? raw : [String(raw ?? '')];
  const match = values.find(value => value.startsWith(`${name}=`));
  assert.ok(match, `expected ${name} cookie`);
  return String(match).split(';', 1)[0]!;
}

let app: any;
let user: any;
const password = 'mfa-correct-password';

before(async () => {
  await ensureSchemaReady();
  user = await createTestUser();
  await db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(sql`${users.id} = ${user.id}`);
  const Fastify = (await import('fastify')).default;
  const fastifyCookie = (await import('@fastify/cookie')).default;
  const { registerAuthRoutes } = await import('../src/routes/auth-routes.js');
  app = Fastify();
  await app.register(fastifyCookie);
  await registerAuthRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (user) await cleanupUser(user.id);
});

test('TOTP generator follows the RFC 6238 SHA-1 vector at 59 seconds', () => {
  assert.equal(generateTotpForTest('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000), '287082');
});

test('OperatorOS owns encrypted MFA enrollment, single-use login challenge, recovery, regeneration, and disable', async () => {
  const passwordLogin = await app.inject({
    method: 'POST', url: '/v1/auth/login', payload: { email: user.email, password },
  });
  assert.equal(passwordLogin.statusCode, 200, passwordLogin.body);
  const firstSession = cookie(passwordLogin, 'operatoros_session');

  const setup = await app.inject({ method: 'POST', url: '/v1/auth/mfa/setup', headers: { cookie: firstSession } });
  assert.equal(setup.statusCode, 200);
  const setupBody = setup.json();
  assert.match(setupBody.secret, /^[A-Z2-7]{32}$/);
  assert.match(setupBody.otpauthUrl, /^otpauth:\/\/totp\/OperatorOS%3A/);
  assert.match(setupBody.qrDataUrl, /^data:image\/png;base64,/);

  const encrypted = await db.execute(sql`
    SELECT encode(ciphertext, 'hex') AS ciphertext, enabled_at
    FROM auth_mfa_totp WHERE user_id = ${user.id}
  `);
  assert.equal(encrypted.rows.length, 1);
  assert.equal(JSON.stringify(encrypted.rows).includes(setupBody.secret), false);
  assert.equal((encrypted.rows[0] as any).enabled_at, null);

  const rejected = await app.inject({
    method: 'POST', url: '/v1/auth/mfa/verify', headers: { cookie: firstSession }, payload: { code: '000000' },
  });
  assert.equal(rejected.statusCode, 401);
  assert.equal(rejected.json().code, 'MFA_CODE_INVALID');

  const enrollmentCode = generateTotpForTest(setupBody.secret);
  const verified = await app.inject({
    method: 'POST', url: '/v1/auth/mfa/verify', headers: { cookie: firstSession }, payload: { code: enrollmentCode },
  });
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.json().recoveryCodes.length, 10);
  const firstRecoveryCode = verified.json().recoveryCodes[0];

  const challengedLogin = await app.inject({
    method: 'POST', url: '/v1/auth/login', payload: { email: user.email, password },
  });
  assert.equal(challengedLogin.statusCode, 200);
  assert.equal(challengedLogin.json().mfaRequired, true);
  assert.equal(challengedLogin.json().user, undefined);
  const challenge = cookie(challengedLogin, 'operatoros_mfa_challenge');

  const badCode = await app.inject({
    method: 'POST', url: '/v1/auth/login/mfa', headers: { cookie: challenge }, payload: { code: '000000' },
  });
  assert.equal(badCode.statusCode, 401);
  assert.equal(badCode.json().attemptsRemaining, 4);

  const completed = await app.inject({
    method: 'POST', url: '/v1/auth/login/mfa', headers: { cookie: challenge }, payload: { code: generateTotpForTest(setupBody.secret) },
  });
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.json().mfaVerified, true);
  const mfaSession = cookie(completed, 'operatoros_session');

  const replay = await app.inject({
    method: 'POST', url: '/v1/auth/login/mfa', headers: { cookie: challenge }, payload: { code: generateTotpForTest(setupBody.secret) },
  });
  assert.equal(replay.statusCode, 401);
  assert.equal(replay.json().code, 'MFA_CHALLENGE_INVALID');

  const recoveryLogin = await app.inject({
    method: 'POST', url: '/v1/auth/login', payload: { email: user.email, password },
  });
  const recoveryChallenge = cookie(recoveryLogin, 'operatoros_mfa_challenge');
  const recovered = await app.inject({
    method: 'POST', url: '/v1/auth/login/mfa', headers: { cookie: recoveryChallenge }, payload: { recoveryCode: firstRecoveryCode },
  });
  assert.equal(recovered.statusCode, 200);

  const status = await app.inject({ method: 'GET', url: '/v1/auth/mfa/status', headers: { cookie: mfaSession } });
  assert.equal(status.statusCode, 200);
  assert.equal(status.json().enabled, true);
  assert.equal(status.json().recoveryCodesRemaining, 9);

  const regenerated = await app.inject({
    method: 'POST', url: '/v1/auth/mfa/recovery-codes', headers: { cookie: mfaSession }, payload: { code: generateTotpForTest(setupBody.secret) },
  });
  assert.equal(regenerated.statusCode, 200);
  assert.equal(regenerated.json().recoveryCodes.length, 10);
  assert.equal(regenerated.json().recoveryCodes.includes(firstRecoveryCode), false);

  const disabled = await app.inject({
    method: 'POST', url: '/v1/auth/mfa/disable', headers: { cookie: mfaSession },
    payload: { password, code: generateTotpForTest(setupBody.secret) },
  });
  assert.equal(disabled.statusCode, 200);
  assert.equal(disabled.json().signedOutEverywhere, true);

  const oldSession = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie: mfaSession } });
  assert.equal(oldSession.statusCode, 401);
  const rows = await db.execute(sql`SELECT COUNT(*)::integer AS count FROM auth_mfa_totp WHERE user_id = ${user.id}`);
  assert.equal(Number((rows.rows[0] as any).count), 0);
});
