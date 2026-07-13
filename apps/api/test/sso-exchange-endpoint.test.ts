// Task #140 — POST /v1/modules/sso/exchange (+ legacy /modules/sso/exchange).
//
// The exchange endpoint is the receiver's server-to-server redemption of an
// opaque `?code=` handoff. This suite locks its security contract:
//   1. bearer-gated (only a caller holding MODULE_SSO_SECRET may redeem)
//   2. codes are integrity-protected (tampered/garbage codes are rejected)
//   3. codes are module-bound (a code minted for module A cannot be redeemed
//      by a receiver asserting a different aud)
//   4. redemption delegates to the exact single-use consume logic (so replay
//      of a spent handoff is blocked identically to the token path)
//
// MODULE_SSO_SECRET is captured at import time in module-routes.ts, so it must
// be set BEFORE the dynamic import below.
process.env.MODULE_SSO_SECRET = 'exchange-endpoint-test-secret-1234567890';
process.env.APP_ENV = process.env.APP_ENV ?? 'dev';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { ssoHandoffTokens } from '../src/schema.js';
import { createSsoExchangeCode } from '../../../packages/sso/index.js';
import {
  ensureSchemaReady,
  createTestUser,
  createTestModule,
  cleanupUser,
  cleanupModule,
  uniqueId,
} from './_setup.js';

const SECRET = process.env.MODULE_SSO_SECRET as string;

let app: any;
let userId: string;
let tenantId: string;
let moduleId: string;
let moduleSlug: string;

async function mintHandoff(opts: { consumed?: boolean } = {}) {
  const jti = uniqueId('jti');
  const now = Date.now();
  await db.insert(ssoHandoffTokens).values({
    jti,
    userId,
    tenantId,
    moduleSlug,
    aud: moduleSlug,
    env: 'dev',
    issuedIp: '127.0.0.1',
    issuedAt: new Date(now),
    expiresAt: new Date(now + 90_000),
    consumedAt: opts.consumed ? new Date(now) : null,
    consumedIp: opts.consumed ? '127.0.0.1' : null,
  });
  return jti;
}

async function exchange(payload: unknown, bearer: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (bearer !== null) headers['authorization'] = `Bearer ${bearer}`;
  return app.inject({
    method: 'POST',
    url: '/v1/modules/sso/exchange',
    headers,
    payload: JSON.stringify(payload),
  });
}

before(async () => {
  await ensureSchemaReady();
  const u = await createTestUser();
  userId = u.id;
  tenantId = u.currentTenantId;
  const m = await createTestModule(`exch-${Date.now()}`);
  moduleId = m.id;
  moduleSlug = m.slug;

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerModuleRoutes } = await import('../src/routes/module-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  await registerModuleRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  try { await db.delete(ssoHandoffTokens).where(eq(ssoHandoffTokens.userId, userId)); } catch {}
  if (moduleId) await cleanupModule(moduleId);
  if (userId) await cleanupUser(userId);
});

test('wrong bearer token is rejected with 401 UNAUTHORIZED', async () => {
  const jti = await mintHandoff();
  const code = createSsoExchangeCode({ jti, aud: moduleSlug }, SECRET);
  const res = await exchange({ code, env: 'dev' }, 'not-the-real-secret');
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().code, 'UNAUTHORIZED');
});

test('missing bearer token is rejected with 401 UNAUTHORIZED', async () => {
  const jti = await mintHandoff();
  const code = createSsoExchangeCode({ jti, aud: moduleSlug }, SECRET);
  const res = await exchange({ code, env: 'dev' }, null);
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().code, 'UNAUTHORIZED');
});

test('tampered code is rejected with 400 INVALID_CODE', async () => {
  const jti = await mintHandoff();
  const code = createSsoExchangeCode({ jti, aud: moduleSlug }, SECRET);
  // Flip a bit in the auth tag → decryption fails closed.
  const raw = Buffer.from(code, 'base64url');
  raw[raw.length - 1] ^= 0xff;
  const res = await exchange({ code: raw.toString('base64url'), env: 'dev' }, SECRET);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'INVALID_CODE');
});

test('garbage / missing code is rejected with 400 INVALID_CODE', async () => {
  const res = await exchange({ code: 'not-a-real-code', env: 'dev' }, SECRET);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'INVALID_CODE');

  const resMissing = await exchange({ env: 'dev' }, SECRET);
  assert.equal(resMissing.statusCode, 400);
  assert.equal(resMissing.json().code, 'INVALID_CODE');
});

test('module-bound code cannot be redeemed under a different aud (403 BINDING_MISMATCH)', async () => {
  const jti = await mintHandoff();
  // Code is bound to the real module slug...
  const code = createSsoExchangeCode({ jti, aud: moduleSlug }, SECRET);
  // ...but the receiver asserts a different aud. The mismatch is caught BEFORE
  // consume runs, so the handoff is never spent.
  const res = await exchange({ code, aud: 'some-other-module', env: 'dev' }, SECRET);
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'BINDING_MISMATCH');

  // Handoff must remain unconsumed (mismatch rejected before the atomic claim).
  const [row] = await db
    .select()
    .from(ssoHandoffTokens)
    .where(eq(ssoHandoffTokens.jti, jti));
  assert.equal(row.consumedAt, null, 'a binding-mismatched code must not spend the handoff');
});

test('a valid code delegates to consume — replay of a spent handoff is blocked (409 TOKEN_REPLAYED)', async () => {
  // Pre-spent handoff proves the exchange path reaches the same single-use
  // consume logic: it must surface the replay guard, not a bespoke code error.
  const jti = await mintHandoff({ consumed: true });
  const code = createSsoExchangeCode({ jti, aud: moduleSlug }, SECRET);
  const res = await exchange({ code, aud: moduleSlug, env: 'dev' }, SECRET);
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().code, 'TOKEN_REPLAYED');
});

test('exchange(code) and consume({jti,aud,env}) return the same status + shape', async () => {
  // Two identically-provisioned handoffs: one redeemed via the opaque-code
  // exchange path, one via the canonical consume path. Same handler, so the
  // outcome must be identical — guarding against logic drift between paths.
  const jtiExchange = await mintHandoff();
  const jtiConsume = await mintHandoff();
  const code = createSsoExchangeCode({ jti: jtiExchange, aud: moduleSlug }, SECRET);

  const resExchange = await exchange({ code, aud: moduleSlug, env: 'dev' }, SECRET);
  const resConsume = await app.inject({
    method: 'POST',
    url: '/v1/modules/sso/consume',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ jti: jtiConsume, aud: moduleSlug, env: 'dev' }),
  });

  // Reached consume (not stranded at bearer/code/binding gates).
  assert.ok(![400, 401].includes(resExchange.statusCode), 'exchange must pass the pre-consume gates');
  assert.equal(resExchange.statusCode, resConsume.statusCode, 'both paths share one handler');
  assert.deepEqual(
    Object.keys(resExchange.json()).sort(),
    Object.keys(resConsume.json()).sort(),
    'both paths must return the same top-level shape',
  );
});
