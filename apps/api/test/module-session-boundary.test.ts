import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SESSION_SECRET ||= 'module-session-boundary-test-secret';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (repoPath: string) => readFileSync(resolve(root, repoPath), 'utf8');

test('module session token carries tenant/module binding and a new contract version', async () => {
  const { signToken, verifyToken, SESSION_CONTRACT_VERSION } = await import('../src/lib/auth.ts');
  const token = signToken({
    userId: 'user-1',
    email: 'operator@example.com',
    role: 'member',
    tokenVersion: 4,
    sessionType: 'module',
    tenantId: 'tenant-a',
    moduleId: 'tradeflowkit',
  });
  const claims = verifyToken(token);
  assert.equal(claims?.sessionVersion, SESSION_CONTRACT_VERSION);
  assert.equal(claims?.sessionType, 'module');
  assert.equal(claims?.tenantId, 'tenant-a');
  assert.equal(claims?.moduleId, 'tradeflowkit');
});

test('session signer and verifier reject missing or contradictory scope claims', async () => {
  const { signToken, verifyToken, SESSION_CONTRACT_VERSION } = await import('../src/lib/auth.ts');
  const jwt = (await import('jsonwebtoken')).default;
  const identity = {
    userId: 'user-1',
    email: 'operator@example.com',
    role: 'user',
    tokenVersion: 0,
  };
  const invalidPayloads = [
    { ...identity },
    { ...identity, sessionType: 'platform', tenantId: 'tenant-a', moduleId: 'tradeflowkit' },
    { ...identity, sessionType: 'module', tenantId: 'tenant-a' },
    { ...identity, sessionType: 'module', moduleId: 'tradeflowkit' },
  ];

  for (const payload of invalidPayloads) {
    assert.throws(
      () => signToken(payload as any),
      /Invalid OperatorOS session payload/,
    );
    const raw = jwt.sign(
      { ...payload, sessionVersion: SESSION_CONTRACT_VERSION },
      process.env.SESSION_SECRET!,
      { algorithm: 'HS256' },
    );
    assert.equal(verifyToken(raw), null);
  }
});

test('module session API allowlist excludes other modules, tenant switching, and platform routes', async () => {
  const { isModuleSessionPathAllowed } = await import('../src/lib/auth.ts');
  assert.equal(isModuleSessionPathAllowed('tradeflowkit', '/v1/auth/me'), true);
  assert.equal(isModuleSessionPathAllowed('tradeflowkit', '/v1/me/tenants'), true);
  assert.equal(isModuleSessionPathAllowed('tradeflowkit', '/v1/modules/tradeflowkit/leads'), true);
  assert.equal(isModuleSessionPathAllowed('tradeflowkit', '/v1/tenants/tenant-a/modules/tradeflowkit/rooms/room-a/socket'), true);
  assert.equal(isModuleSessionPathAllowed('tradeflowkit', '/v1/tenants/tenant-a/modules/techdeck/rooms/room-a/socket'), false);
  assert.equal(isModuleSessionPathAllowed('tradeflowkit', '/v1/modules/techdeck'), false);
  assert.equal(isModuleSessionPathAllowed('tradeflowkit', '/v1/tenants/tenant-b/switch'), false);
  assert.equal(isModuleSessionPathAllowed('tradeflowkit', '/v1/platform/tenants'), false);
});

test('exchange and tenant middleware enforce the sealed tenant/module context', () => {
  const sso = read('apps/api/src/routes/sso-routes.ts');
  const tenantAuth = read('apps/api/src/lib/tenant-auth.ts');
  const authRoutes = read('apps/api/src/routes/auth-routes.ts');

  assert.match(sso, /sessionType: 'module',[\s\S]*tenantId,[\s\S]*moduleId: module\.id/);
  assert.match(tenantAuth, /SESSION_TENANT_MISMATCH/);
  assert.match(tenantAuth, /SESSION_MODULE_MISMATCH/);
  assert.match(authRoutes, /user\.currentTenantId = session\.tenantId/);
});

test('production browser-code resolution never falls back to MODULE_SSO_SECRET', async () => {
  const previous = {
    appEnv: process.env.APP_ENV,
    nodeEnv: process.env.NODE_ENV,
    code: process.env.SSO_CODE_ENCRYPTION_SECRET,
    legacy: process.env.MODULE_SSO_SECRET,
  };
  try {
    process.env.APP_ENV = 'production';
    delete process.env.SSO_CODE_ENCRYPTION_SECRET;
    process.env.MODULE_SSO_SECRET = 'legacy-shared-secret-that-is-long-enough';
    const { resolveSsoCodeSecret } = await import('../../../packages/sso/index.ts');
    assert.equal(resolveSsoCodeSecret(), null);
    process.env.SSO_CODE_ENCRYPTION_SECRET = 'dedicated-hub-only-code-secret-32-plus';
    assert.equal(resolveSsoCodeSecret(), process.env.SSO_CODE_ENCRYPTION_SECRET);
  } finally {
    if (previous.appEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = previous.appEnv;
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.code === undefined) delete process.env.SSO_CODE_ENCRYPTION_SECRET; else process.env.SSO_CODE_ENCRYPTION_SECRET = previous.code;
    if (previous.legacy === undefined) delete process.env.MODULE_SSO_SECRET; else process.env.MODULE_SSO_SECRET = previous.legacy;
  }
});
