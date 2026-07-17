process.env.SESSION_SECRET ||= 'test-session-secret-shared-sso-routes';
process.env.MODULE_SSO_SECRET = 'shared-sso-routes-secret-1234567890';
process.env.OPERATOROS_SSO_CLIENT_SECRET_TECHDECK = 'techdeck-client-secret-1234567890';
process.env.OPERATOROS_BASE_URL = 'https://operatoros.test';
process.env.APP_ENV = 'dev';
process.env.TRUST_PROXY = '1';

import crypto from 'node:crypto';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { ssoHandoffTokens, tenantEntitlements, tenants, users } from '../src/schema.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
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
let techdeckModule: any;
let pulsedeskModule: any;
let dbReady = false;
let setupFailure: unknown = null;

async function tokenFor(user: any): Promise<string> {
  const { signToken } = await import('../src/lib/auth.js');
  return signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
    sessionType: 'platform',
  });
}

before(async () => {
  try {
    await ensureSchemaReady();
  } catch (err) {
    setupFailure = err;
    return;
  }

  // The integration suite must be hermetic: a brand-new test database has
  // schema but no production seed data. Create only the globally enabled
  // module rows exercised below instead of depending on a developer's local
  // database or running the full production account/plan seeder.
  techdeckModule = await createTestModule('techdeck');
  pulsedeskModule = await createTestModule('pulsedesk');

  owner = await createTestUser();
  // A paid/companion entitlement is still subject to the tenant's active
  // seat allocation. Give this one-member fixture one seat so the positive
  // SSO cases exercise code issuance instead of the billing seat gate.
  await db.update(tenants)
    .set({ seatLimit: 1, updatedAt: new Date() })
    .where(eq(tenants.id, owner.currentTenantId));
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
  const { registerModuleRoutes } = await import('../src/routes/module-routes.js');
  const { registerPlatformRoutes } = await import('../src/routes/platform-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerAuthRoutes(app);
  await registerSsoRoutes(app);
  await registerModuleRoutes(app);
  await registerPlatformRoutes(app);
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
  if (techdeckModule) await cleanupModule(techdeckModule.id);
  if (pulsedeskModule) await cleanupModule(pulsedeskModule.id);
});

function skipWithoutDb(t: any): boolean {
  if (dbReady) return false;
  t.skip(`Postgres unavailable for DB-backed SSO route test: ${(setupFailure as Error | null)?.message ?? 'unknown setup failure'}`);
  return true;
}

async function issue(body: unknown, token?: string, url = '/v1/sso/issue') {
  const record = body as Record<string, unknown>;
  const moduleId = typeof record?.moduleId === 'string' ? record.moduleId : null;
  const module = moduleId ? getModuleById(moduleId) : null;
  const verifier = 'v'.repeat(64);
  const redirectUri = module && typeof record.redirectUri === 'string'
    ? record.redirectUri
    : module?.exactRedirectUris[0];
  const returnTo = module && typeof record.returnTo === 'string'
    ? record.returnTo
    : module
      ? `${module.productionBaseUrl}/dashboard`
      : undefined;
  const authorization = module ? {
    clientId: module.clientId,
    redirectUri,
    returnTo,
    state: 's'.repeat(43),
    nonce: 'n'.repeat(43),
    codeChallenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
    codeChallengeMethod: 'S256',
  } : {};
  return app.inject({
    method: 'POST',
    url,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'x-forwarded-for': '10.44.0.1',
    },
    payload: { ...record, ...authorization },
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

async function exchange(body: unknown) {
  return app.inject({
    method: 'POST',
    url: '/v1/modules/sso/exchange',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPERATOROS_SSO_CLIENT_SECRET_TECHDECK}`,
      'x-module-slug': 'techdeck',
      'x-forwarded-for': '10.44.0.2',
    },
    payload: body,
  });
}

test('shared SSO issues and exchanges an opaque code for an entitled tenant user', async (t) => {
  if (skipWithoutDb(t)) return;
  const issued = await issue({
    moduleId: 'techdeck',
    tenantId: owner.currentTenantId,
  }, ownerToken, '/api/sso/issue');
  assert.equal(issued.statusCode, 200);
  const issueBody = issued.json();
  assert.equal(issueBody.module.id, 'techdeck');
  assert.equal(issueBody.audience, 'techdeck');
  assert.match(issueBody.launchUrl, /^https:\/\/techdeck\.operatoros\.net\/sso\?code=/);
  assert.ok(issueBody.code);
  assert.equal(issueBody.token, undefined);

  const consumed = await exchange({ code: issueBody.code, aud: 'techdeck', env: 'dev' });
  assert.equal(consumed.statusCode, 200);
  const consumeBody = consumed.json();
  assert.equal(consumeBody.ok, true);
  assert.equal(
    consumeBody.sessionEstablished,
    undefined,
    'server-to-server exchange returns verified identity; the receiver establishes its host session',
  );
  assert.equal(consumeBody.user.id, owner.id);
  assert.equal(consumeBody.tenant.id, owner.currentTenantId);
  assert.equal(consumeBody.moduleSlug, 'techdeck');
  assert.ok(
    consumeBody.modules.some((module: { slug?: string }) => module.slug === 'techdeck'),
    'canonical entitlement snapshot should include TechDeck',
  );
  assert.equal(consumed.headers['set-cookie'], undefined, 'the module creates its own local session');
});

test('browser exchange binds host, state, nonce, and PKCE before setting a host-only session', async (t) => {
  if (skipWithoutDb(t)) return;
  const issued = await issue({
    moduleId: 'techdeck',
    tenantId: owner.currentTenantId,
  }, ownerToken);
  assert.equal(issued.statusCode, 200);
  const callback = new URL(issued.json().launchUrl);
  const verifier = 'v'.repeat(64);

  const exchanged = await app.inject({
    method: 'POST',
    url: '/v1/sso/browser-exchange',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-host': 'techdeck.operatoros.net',
      cookie: [
        `operatoros_sso_state=${callback.searchParams.get('state')}`,
        `operatoros_sso_nonce=${'n'.repeat(43)}`,
        `operatoros_sso_verifier=${verifier}`,
      ].join('; '),
    },
    payload: {
      code: callback.searchParams.get('code'),
      state: callback.searchParams.get('state'),
    },
  });

  assert.equal(exchanged.statusCode, 200);
  assert.equal(exchanged.json().ok, true);
  assert.equal(exchanged.json().returnTo, '/dashboard');
  const setCookie = exchanged.headers['set-cookie'];
  assert.match(String(setCookie), /operatoros_session=/);
  assert.doesNotMatch(String(setCookie), /Domain=/i);
  const moduleCookie = String(setCookie).match(/operatoros_session=[^;,\s]+/)?.[0];
  assert.ok(moduleCookie, 'browser exchange should return the module host session cookie');

  const me = await app.inject({
    method: 'GET',
    url: '/v1/auth/me',
    headers: { cookie: moduleCookie },
  });
  assert.equal(me.statusCode, 200);
  assert.deepEqual(me.json().session, {
    type: 'module',
    tenantId: owner.currentTenantId,
    moduleId: 'techdeck',
  });
  assert.equal(me.json().user.currentTenantId, owner.currentTenantId);

  for (const deniedUrl of ['/v1/modules/pulsedesk', '/v1/platform/tenants']) {
    const denied = await app.inject({
      method: 'GET',
      url: deniedUrl,
      headers: { cookie: moduleCookie },
    });
    assert.equal(denied.statusCode, 403, `${deniedUrl} must reject a TechDeck module session`);
    assert.equal(denied.json().code, 'SESSION_SCOPE_DENIED');
  }

  const wrongTenant = await app.inject({
    method: 'GET',
    url: '/v1/modules/techdeck',
    headers: { cookie: moduleCookie, 'x-tenant-id': '00000000-0000-0000-0000-000000000099' },
  });
  assert.equal(wrongTenant.statusCode, 403);
  assert.equal(wrongTenant.json().code, 'SESSION_TENANT_MISMATCH');

  const replay = await app.inject({
    method: 'POST',
    url: '/v1/sso/browser-exchange',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-host': 'techdeck.operatoros.net',
      cookie: `operatoros_sso_state=${callback.searchParams.get('state')}; operatoros_sso_nonce=${'n'.repeat(43)}; operatoros_sso_verifier=${verifier}`,
    },
    payload: { code: callback.searchParams.get('code'), state: callback.searchParams.get('state') },
  });
  assert.equal(replay.statusCode, 409);
  assert.equal(replay.json().code, 'CODE_REPLAYED');
});

test('browser exchange rejects a handoff persisted for another environment without consuming it', async (t) => {
  if (skipWithoutDb(t)) return;
  const issued = await issue({
    moduleId: 'techdeck',
    tenantId: owner.currentTenantId,
  }, ownerToken);
  assert.equal(issued.statusCode, 200);
  const issueBody = issued.json();
  const callback = new URL(issueBody.launchUrl);
  const verifier = 'v'.repeat(64);

  await db.update(ssoHandoffTokens)
    .set({ env: 'staging' })
    .where(eq(ssoHandoffTokens.jti, issueBody.jti));

  const exchanged = await app.inject({
    method: 'POST',
    url: '/v1/sso/browser-exchange',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-host': 'techdeck.operatoros.net',
      cookie: [
        `operatoros_sso_state=${callback.searchParams.get('state')}`,
        `operatoros_sso_nonce=${'n'.repeat(43)}`,
        `operatoros_sso_verifier=${verifier}`,
      ].join('; '),
    },
    payload: {
      code: callback.searchParams.get('code'),
      state: callback.searchParams.get('state'),
    },
  });

  assert.equal(exchanged.statusCode, 400);
  assert.equal(exchanged.json().code, 'ENV_MISMATCH');
  assert.equal(exchanged.headers['set-cookie'], undefined);
  const [row] = await db.select().from(ssoHandoffTokens)
    .where(eq(ssoHandoffTokens.jti, issueBody.jti))
    .limit(1);
  assert.ok(row);
  assert.equal(row.consumedAt, null);
});

test('OperatorOS root and app callbacks establish platform sessions without tenant or module claims', async (t) => {
  if (skipWithoutDb(t)) return;
  const verifier = 'v'.repeat(64);
  const { verifyToken } = await import('../src/lib/auth.js');

  for (const origin of ['https://operatoros.net', 'https://app.operatoros.net']) {
    const issued = await issue({
      moduleId: 'operatoros',
      redirectUri: `${origin}/sso`,
      returnTo: `${origin}/app`,
    }, ownerToken);
    assert.equal(issued.statusCode, 200, origin);
    assert.equal(issued.json().tenantId, null, origin);

    const callback = new URL(issued.json().launchUrl);
    const exchanged = await app.inject({
      method: 'POST',
      url: '/v1/sso/browser-exchange',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-host': new URL(origin).hostname,
        cookie: [
          `operatoros_sso_state=${callback.searchParams.get('state')}`,
          `operatoros_sso_nonce=${'n'.repeat(43)}`,
          `operatoros_sso_verifier=${verifier}`,
        ].join('; '),
      },
      payload: {
        code: callback.searchParams.get('code'),
        state: callback.searchParams.get('state'),
      },
    });

    assert.equal(exchanged.statusCode, 200, origin);
    assert.deepEqual(exchanged.json().session, { type: 'platform' }, origin);
    assert.equal(exchanged.json().tenant, null, origin);
    const cookiePair = String(exchanged.headers['set-cookie'])
      .match(/operatoros_session=([^;,\s]+)/);
    assert.ok(cookiePair?.[1], `platform session cookie missing for ${origin}`);
    const claims = verifyToken(cookiePair[1]);
    assert.equal(claims?.sessionType, 'platform', origin);
    assert.equal(claims?.tenantId, undefined, origin);
    assert.equal(claims?.moduleId, undefined, origin);

    const me = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: `operatoros_session=${cookiePair[1]}` },
    });
    assert.equal(me.statusCode, 200, origin);
    assert.deepEqual(me.json().session, { type: 'platform' }, origin);
  }
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
  assert.ok(body.code);
  assert.equal(body.token, undefined);
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

test('shared SSO exchange rejects the wrong audience', async (t) => {
  if (skipWithoutDb(t)) return;
  const issued = await issue({
    moduleId: 'techdeck',
    tenantId: owner.currentTenantId,
  }, ownerToken);
  assert.equal(issued.statusCode, 200);

  const res = await exchange({ code: issued.json().code, aud: 'pulsedesk', env: 'dev' });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'BINDING_MISMATCH');
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
