process.env.SESSION_SECRET ||= 'test-session-secret-shared-sso-routes';
process.env.MODULE_SSO_SECRET = 'shared-sso-routes-secret-1234567890';
process.env.OPERATOROS_BASE_URL = 'https://operatoros.test';
process.env.APP_ENV = 'dev';
process.env.TRUST_PROXY = '1';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { ssoHandoffTokens, tenantEntitlements, users } from '../src/schema.js';
import {
  cleanupUser,
  createTestUser,
  ensureSchemaReady,
} from './_setup.js';
import { ROOT_SUPER_ADMIN_EMAIL } from '../../../packages/auth/index.js';
import { getModuleById } from '../../../packages/modules/registry.js';
import {
  createSsoHandoffClaims,
  signSsoHandoffToken,
} from '../../../packages/sso/index.js';

let app: any;
let owner: any;
let ownerToken: string;
let rootUser: any;
let rootToken: string;
let rootCreated = false;
let dbReady = false;
let setupFailure: unknown = null;

async function tokenFor(user: any): Promise<string> {
  const { signToken } = await import('../src/lib/auth.js');
  return signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });
}

before(async () => {
  try {
    await ensureSchemaReady();
  } catch (err) {
    setupFailure = err;
    return;
  }

  owner = await createTestUser();
  ownerToken = await tokenFor(owner);
  await db.insert(tenantEntitlements).values({
    tenantId: owner.currentTenantId,
    entitlementKey: 'techdeck',
    entitlementType: 'companion_module',
    source: 'manual',
    active: true,
    metadata: { test: 'shared-sso-routes' },
  });

  const [existingRoot] = await db.select().from(users)
    .where(eq(users.email, ROOT_SUPER_ADMIN_EMAIL))
    .limit(1);
  if (existingRoot) {
    rootUser = existingRoot;
  } else {
    const created = await createTestUser();
    await db.update(users)
      .set({ email: ROOT_SUPER_ADMIN_EMAIL, updatedAt: new Date() })
      .where(eq(users.id, created.id));
    [rootUser] = await db.select().from(users).where(eq(users.id, created.id)).limit(1);
    rootCreated = true;
  }
  rootToken = await tokenFor(rootUser);

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerAuthRoutes } = await import('../src/routes/auth-routes.js');
  const { registerSsoRoutes } = await import('../src/routes/sso-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerAuthRoutes(app);
  await registerSsoRoutes(app);
  await app.ready();
  dbReady = true;
});

after(async () => {
  if (!dbReady) return;
  if (app) await app.close();
  if (owner) {
    try { await db.delete(ssoHandoffTokens).where(eq(ssoHandoffTokens.userId, owner.id)); } catch {}
    try { await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, owner.currentTenantId)); } catch {}
    await cleanupUser(owner.id);
  }
  if (rootUser) {
    try { await db.delete(ssoHandoffTokens).where(eq(ssoHandoffTokens.userId, rootUser.id)); } catch {}
    if (rootCreated) await cleanupUser(rootUser.id);
  }
});

function skipWithoutDb(t: any): boolean {
  if (dbReady) return false;
  t.skip(`Postgres unavailable for DB-backed SSO route test: ${(setupFailure as Error | null)?.message ?? 'unknown setup failure'}`);
  return true;
}

async function issue(body: unknown, token?: string, url = '/v1/sso/issue') {
  return app.inject({
    method: 'POST',
    url,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'x-forwarded-for': '10.44.0.1',
    },
    payload: body,
  });
}

async function consume(body: unknown) {
  return app.inject({
    method: 'POST',
    url: '/v1/sso/consume',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '10.44.0.2',
    },
    payload: body,
  });
}

test('shared SSO issues and consumes a token for an entitled tenant user', async (t) => {
  if (skipWithoutDb(t)) return;
  const issued = await issue({
    moduleId: 'techdeck',
    tenantId: owner.currentTenantId,
  }, ownerToken, '/api/sso/issue');
  assert.equal(issued.statusCode, 200);
  const issueBody = issued.json();
  assert.equal(issueBody.module.id, 'techdeck');
  assert.equal(issueBody.audience, 'techdeck');
  assert.match(issueBody.launchUrl, /^https:\/\/techdeck\.operatoros\.net\/sso\?token=/);
  assert.ok(issueBody.token);

  const consumed = await consume({ token: issueBody.token, moduleId: 'techdeck' });
  assert.equal(consumed.statusCode, 200);
  const consumeBody = consumed.json();
  assert.equal(consumeBody.ok, true);
  assert.equal(consumeBody.sessionEstablished, true);
  assert.equal(consumeBody.user.id, owner.id);
  assert.equal(consumeBody.tenant.id, owner.currentTenantId);
  assert.equal(consumeBody.module.id, 'techdeck');
  assert.match(String(consumed.headers['set-cookie']), /token=/);
});

test('shared SSO denies issue when tenant lacks the module entitlement', async (t) => {
  if (skipWithoutDb(t)) return;
  const res = await issue({
    moduleId: 'pulsedesk',
    tenantId: owner.currentTenantId,
  }, ownerToken);
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'MODULE_ACCESS_DENIED');
});

test('root super-admin can issue without a tenant module entitlement', async (t) => {
  if (skipWithoutDb(t)) return;
  const res = await issue({
    moduleId: 'pulsedesk',
    tenantId: owner.currentTenantId,
  }, rootToken);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.module.id, 'pulsedesk');
  assert.ok(body.token);
});

test('shared SSO consume rejects an expired token', async (t) => {
  if (skipWithoutDb(t)) return;
  const module = getModuleById('techdeck');
  assert.ok(module);
  const now = Math.floor(Date.now() / 1000) - 120;
  const claims = createSsoHandoffClaims({
    user: owner,
    tenant: { id: owner.currentTenantId, role: 'owner' },
    module,
    isPlatformAdmin: false,
    now,
    ttlSeconds: 1,
  });
  const token = signSsoHandoffToken(claims, process.env.MODULE_SSO_SECRET!);
  await db.insert(ssoHandoffTokens).values({
    jti: claims.jti,
    userId: owner.id,
    tenantId: owner.currentTenantId,
    moduleSlug: module.id,
    aud: module.id,
    env: claims.env,
    issuedAt: new Date(claims.iat * 1000),
    expiresAt: new Date(claims.exp * 1000),
  });

  const res = await consume({ token, moduleId: 'techdeck' });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().code, 'TOKEN_EXPIRED');
});

test('shared SSO consume rejects the wrong audience', async (t) => {
  if (skipWithoutDb(t)) return;
  const issued = await issue({
    moduleId: 'techdeck',
    tenantId: owner.currentTenantId,
  }, ownerToken);
  assert.equal(issued.statusCode, 200);

  const res = await consume({ token: issued.json().token, moduleId: 'pulsedesk' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'AUDIENCE_MISMATCH');
});

test('shared SSO issue rejects unauthenticated requests', async (t) => {
  if (skipWithoutDb(t)) return;
  const res = await issue({ moduleId: 'techdeck', tenantId: owner.currentTenantId });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().code, 'AUTH_REQUIRED');
});

test('direct /api/auth/me and /api/auth/logout aliases are available', async (t) => {
  if (skipWithoutDb(t)) return;
  const me = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.id, owner.id);

  const logout = await app.inject({
    method: 'POST',
    url: '/api/auth/logout',
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(logout.statusCode, 200);
  assert.equal(logout.json().ok, true);
});
