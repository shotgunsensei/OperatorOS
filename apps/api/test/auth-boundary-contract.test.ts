process.env.SESSION_SECRET ||= 'auth-boundary-contract-test-secret-with-entropy';

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('P22-ADAPTER-SSO-001: production public auth accepts only the exact platform identity hosts', async () => {
  const {
    isPlatformPublicAuthHostAllowed,
    resolvePlatformPublicAuthHost,
  } = await import('../src/lib/public-auth-host.ts');

  for (const host of ['operatoros.net', 'app.operatoros.net', 'auth.operatoros.net']) {
    assert.equal(isPlatformPublicAuthHostAllowed({ host, production: true, trustProxy: false }), true, host);
  }

  for (const host of [
    'techdeck.operatoros.net',
    'operator-os.replit.app',
    'api.operatoros.net',
    'www.operatoros.net',
    'unknown.operatoros.net',
  ]) {
    assert.equal(isPlatformPublicAuthHostAllowed({ host, production: true, trustProxy: false }), false, host);
  }

  assert.equal(resolvePlatformPublicAuthHost({
    host: 'internal-replit:5000',
    forwardedHost: 'auth.operatoros.net, internal-replit:5000',
    production: true,
    trustProxy: true,
  }), 'auth.operatoros.net');
  assert.equal(isPlatformPublicAuthHostAllowed({
    host: 'internal-replit:5000',
    forwardedHost: 'auth.operatoros.net',
    production: true,
    trustProxy: true,
  }), true);
  assert.equal(isPlatformPublicAuthHostAllowed({
    host: 'internal-replit:5000',
    forwardedHost: 'auth.operatoros.net',
    production: true,
    trustProxy: false,
  }), false, 'untrusted forwarded host must be ignored');
  assert.equal(isPlatformPublicAuthHostAllowed({
    host: 'auth.operatoros.net',
    forwardedHost: 'techdeck.operatoros.net',
    production: true,
    trustProxy: true,
  }), false, 'trusted forwarded host is the public security boundary');
  assert.equal(isPlatformPublicAuthHostAllowed({
    host: 'localhost:5000',
    production: false,
    trustProxy: false,
  }), true, 'development and loopback flows remain available');
  assert.equal(isPlatformPublicAuthHostAllowed({
    host: 'preview.replit.dev',
    production: false,
    trustProxy: false,
  }), false, 'unregistered public preview hosts cannot receive credentials');
});

test('OperatorOS browser client builds a platform token while child clients stay tenant scoped', async () => {
  const { getModuleById } = await import('../../../packages/modules/registry.ts');
  const {
    buildBrowserSessionPayload,
    mapSsoModuleAccessDenial,
    ssoEnvironmentMatchesRuntime,
  } = await import('../src/lib/sso-session-scope.ts');
  const { signToken, verifyToken } = await import('../src/lib/auth.ts');
  const user = {
    userId: 'user-1',
    email: 'operator@example.com',
    role: 'user',
    tokenVersion: 2,
  };

  const operatoros = getModuleById('operatoros');
  assert.ok(operatoros);
  const platformPayload = buildBrowserSessionPayload(user, operatoros, null);
  assert.deepEqual(platformPayload, { ...user, sessionType: 'platform' });
  const platformClaims = verifyToken(signToken(platformPayload));
  assert.equal(platformClaims?.sessionType, 'platform');
  assert.equal(platformClaims?.tenantId, undefined);
  assert.equal(platformClaims?.moduleId, undefined);

  const techdeck = getModuleById('techdeck');
  assert.ok(techdeck);
  assert.throws(
    () => buildBrowserSessionPayload(user, techdeck, null),
    /requires tenantId/,
  );
  const modulePayload = buildBrowserSessionPayload(user, techdeck, 'tenant-1');
  assert.equal(modulePayload.sessionType, 'module');
  assert.equal(modulePayload.tenantId, 'tenant-1');
  assert.equal(modulePayload.moduleId, 'techdeck');

  assert.equal(mapSsoModuleAccessDenial('module_archived', 'fallback').code, 'MODULE_ARCHIVED');
  assert.equal(mapSsoModuleAccessDenial('module_disabled', 'fallback').code, 'MODULE_DISABLED');
  assert.equal(mapSsoModuleAccessDenial('module_unavailable', 'fallback').code, 'MODULE_UNAVAILABLE');
  assert.deepEqual(mapSsoModuleAccessDenial('no_plan_grant', 'fallback'), {
    code: 'MODULE_ACCESS_DENIED',
    error: 'fallback',
  });

  assert.equal(ssoEnvironmentMatchesRuntime('prod', 'production'), true);
  assert.equal(ssoEnvironmentMatchesRuntime('staging', 'stage'), true);
  assert.equal(ssoEnvironmentMatchesRuntime('dev', 'development'), true);
  assert.equal(ssoEnvironmentMatchesRuntime('staging', 'production'), false);
  assert.equal(ssoEnvironmentMatchesRuntime('unexpected', 'development'), false);
});

test('the password login route explicitly mints a platform session', () => {
  const source = readFileSync(resolve(repoRoot, 'apps/api/src/routes/auth-routes.ts'), 'utf8');
  const loginStart = source.indexOf("app.post('/v1/auth/login'");
  const loginEnd = source.indexOf('const logoutHandler', loginStart);
  assert.ok(loginStart >= 0 && loginEnd > loginStart);
  const loginRoute = source.slice(loginStart, loginEnd);
  assert.match(loginRoute, /enforcePlatformPublicAuthHost\(request, reply\)/);
  assert.match(loginRoute, /sessionType:\s*'platform'/);
  assert.doesNotMatch(loginRoute, /sessionType:\s*'module'/);
});

test('global account mutations are unavailable on child module hosts', () => {
  const source = readFileSync(resolve(repoRoot, 'apps/api/src/routes/auth-routes.ts'), 'utf8');
  for (const route of [
    "app.put('/v1/auth/profile'",
    "app.put('/v1/auth/change-password'",
    "app.put('/v1/auth/change-email'",
    "app.post('/v1/auth/request-deletion'",
  ]) {
    const start = source.indexOf(route);
    assert.ok(start >= 0, route);
    const nextRoute = source.indexOf('app.', start + route.length);
    const block = source.slice(start, nextRoute >= 0 ? nextRoute : undefined);
    assert.match(block, /enforcePlatformPublicAuthHost\(request, reply\)/, route);
  }
});

test('rejected public auth hosts return the sent reply without a second response attempt', () => {
  const source = readFileSync(resolve(repoRoot, 'apps/api/src/routes/auth-routes.ts'), 'utf8');
  const guardedRoutes = source.match(/if \(!enforcePlatformPublicAuthHost\(request, reply\)\) return reply;/g) ?? [];
  assert.equal(guardedRoutes.length, 12, 'every public auth host guard must return the already-sent reply');
  assert.doesNotMatch(
    source,
    /if \(!enforcePlatformPublicAuthHost\(request, reply\)\) return;/,
    'returning undefined after reply.send can make Fastify attempt a second response',
  );
});

test('public auth routes reject child and unknown production hosts before validation or DB work', async () => {
  const previous = {
    appEnv: process.env.APP_ENV,
    nodeEnv: process.env.NODE_ENV,
    trustProxy: process.env.TRUST_PROXY,
  };
  const Fastify = (await import('fastify')).default;
  const { registerAuthRoutes } = await import('../src/routes/auth-routes.ts');
  const app = Fastify();

  try {
    process.env.APP_ENV = 'production';
    process.env.TRUST_PROXY = 'true';
    await registerAuthRoutes(app);
    await app.ready();

    for (const url of [
      '/v1/auth/register',
      '/v1/auth/login',
      '/v1/auth/forgot-password',
      '/v1/auth/reset-password',
    ]) {
      const rejected = await app.inject({
        method: 'POST',
        url,
        headers: {
          host: 'internal-replit:5000',
          'x-forwarded-host': 'techdeck.operatoros.net',
        },
        payload: {},
      });
      assert.equal(rejected.statusCode, 403, url);
      assert.equal(rejected.json().code, 'AUTH_HOST_NOT_ALLOWED', url);
      assert.equal(rejected.headers['cache-control'], 'no-store', url);
      assert.equal(rejected.headers.pragma, 'no-cache', url);
    }

    for (const forwardedHost of ['operator-os.replit.app', 'unknown.operatoros.net']) {
      const rejected = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        headers: {
          host: 'internal-replit:5000',
          'x-forwarded-host': forwardedHost,
        },
        payload: {},
      });
      assert.equal(rejected.statusCode, 403, forwardedHost);
      assert.equal(rejected.json().code, 'AUTH_HOST_NOT_ALLOWED', forwardedHost);
    }

    const canonical = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: {
        host: 'internal-replit:5000',
        'x-forwarded-host': 'auth.operatoros.net',
      },
      payload: {},
    });
    assert.equal(canonical.statusCode, 400);
    assert.equal(canonical.json().code, 'VALIDATION_ERROR');
    assert.equal(canonical.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
    if (previous.appEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = previous.appEnv;
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.trustProxy === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = previous.trustProxy;
  }
});
