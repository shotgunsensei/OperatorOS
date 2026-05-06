// Make module-routes.ts trust x-forwarded-for so each test can use a
// distinct source IP (the rate-limit map is keyed by source IP and is
// process-global). Must be set BEFORE importing the routes module.
process.env.TRUST_PROXY = '1';
process.env.APP_ENV = process.env.APP_ENV ?? 'dev';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { ssoHandoffTokens } from '../src/schema.js';
import {
  ensureSchemaReady,
  createTestUser,
  createTestModule,
  cleanupUser,
  cleanupModule,
  captureConsole,
  uniqueId,
} from './_setup.js';

let app: any;
let userId: string;
let moduleId: string;
let moduleSlug: string;

before(async () => {
  await ensureSchemaReady();
  const u = await createTestUser();
  userId = u.id;
  const m = await createTestModule();
  moduleId = m.id;
  moduleSlug = m.slug;

  const Fastify = (await import('fastify')).default;
  const { registerModuleRoutes } = await import('../src/routes/module-routes.js');
  app = Fastify();
  await registerModuleRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (userId) await cleanupUser(userId);
  if (moduleId) await cleanupModule(moduleId);
});

async function insertToken(opts: {
  jti?: string;
  aud?: string;
  env?: string;
  expired?: boolean;
  consumed?: boolean;
}) {
  const jti = opts.jti ?? crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  await db.insert(ssoHandoffTokens).values({
    jti,
    userId,
    moduleSlug,
    aud: opts.aud ?? moduleSlug,
    env: opts.env ?? 'dev',
    issuedIp: '10.0.0.1',
    issuedAt: new Date(now),
    expiresAt: new Date(opts.expired ? now - 60_000 : now + 90_000),
    consumedAt: opts.consumed ? new Date(now) : null,
    consumedIp: opts.consumed ? '10.0.0.1' : null,
  });
  return jti;
}

function findAuditLine(logs: { line: string }[], action: string) {
  return logs.find(l => l.line.startsWith('[AUDIT sso]') && l.line.includes(`"action":"${action}"`));
}

async function consume(body: unknown, ip: string) {
  const cap = captureConsole();
  const res = await app.inject({
    method: 'POST',
    url: '/v1/modules/sso/consume',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    payload: body as any,
  });
  cap.restore();
  return { res, logs: cap.logs };
}

test('BAD_REQUEST: missing jti/aud/env emits [AUDIT sso] module_consume_bad_request', async () => {
  const { res, logs } = await consume({}, '10.99.0.1');
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'BAD_REQUEST');
  assert.ok(findAuditLine(logs, 'module_consume_bad_request'), 'audit line for bad_request must be emitted');
});

test('TOKEN_UNKNOWN: unknown jti emits [AUDIT sso] module_consume_unknown_jti', async () => {
  const { res, logs } = await consume(
    { jti: 'definitely-not-a-real-jti-' + uniqueId('x'), aud: moduleSlug, env: 'dev' },
    '10.99.0.2',
  );
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'TOKEN_UNKNOWN');
  assert.ok(findAuditLine(logs, 'module_consume_unknown_jti'), 'audit line for unknown_jti must be emitted');
});

test('AUDIENCE_MISMATCH: wrong aud emits [AUDIT sso] module_consume_audience_mismatch', async () => {
  const jti = await insertToken({ aud: moduleSlug });
  const { res, logs } = await consume(
    { jti, aud: 'some-other-module', env: 'dev' },
    '10.99.0.3',
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'AUDIENCE_MISMATCH');
  assert.ok(findAuditLine(logs, 'module_consume_audience_mismatch'), 'audit line for audience_mismatch must be emitted');
});

test('ENV_MISMATCH: wrong env emits [AUDIT sso] module_consume_env_mismatch', async () => {
  const jti = await insertToken({ env: 'dev' });
  const { res, logs } = await consume(
    { jti, aud: moduleSlug, env: 'prod' },
    '10.99.0.4',
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'ENV_MISMATCH');
  assert.ok(findAuditLine(logs, 'module_consume_env_mismatch'), 'audit line for env_mismatch must be emitted');
});

test('TOKEN_REPLAYED: already-consumed token emits [AUDIT sso] module_handoff_replay_blocked', async () => {
  const jti = await insertToken({ consumed: true });
  const { res, logs } = await consume(
    { jti, aud: moduleSlug, env: 'dev' },
    '10.99.0.5',
  );
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().code, 'TOKEN_REPLAYED');
  assert.ok(findAuditLine(logs, 'module_handoff_replay_blocked'), 'audit line for replay_blocked must be emitted');
});

test('RATE_LIMITED: 11th request from same IP emits [AUDIT sso] module_consume_rate_limited', async () => {
  const ip = '10.99.0.6';
  // Burn through the per-IP allowance with cheap unknown-jti requests.
  for (let i = 0; i < 10; i++) {
    await consume({ jti: 'rl-burn-' + i, aud: moduleSlug, env: 'dev' }, ip);
  }
  const { res, logs } = await consume(
    { jti: 'rl-burn-final', aud: moduleSlug, env: 'dev' }, ip,
  );
  assert.equal(res.statusCode, 429);
  assert.equal(res.json().code, 'RATE_LIMITED');
  assert.ok(findAuditLine(logs, 'module_consume_rate_limited'), 'audit line for rate_limited must be emitted');
});

// Cleanup any tokens created
after(async () => {
  if (userId) {
    try { await db.delete(ssoHandoffTokens).where(eq(ssoHandoffTokens.userId, userId)); } catch {}
  }
});
