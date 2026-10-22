import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import ts from 'typescript';
import { and, eq, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { hasPlatformAdminAuthority } from '../../../packages/auth/index.js';
import { FIELDNODE_IDENTITY_ISSUER } from '../../../packages/sdk/src/fieldnode-identity.js';
import { isIndependentToolModuleSlug } from '../../../packages/sdk/src/tool-modules.js';
import { tenantRoleToEffective, moduleAccessLevelToEffective } from '../src/lib/role-aliases.js';
import { tenants, tenantUsers, users, revokedSessionTokens, modules, tenantModules, tenantUserModuleAccess } from '../src/schema.js';
import { registerFieldNodeIdentityRoutes, type FieldNodeIdentityDependencies } from '../src/routes/fieldnode-identity-routes.js';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const authSource = source('../src/lib/auth.ts');
const tenantSource = source('../src/lib/tenant-auth.ts');
const entitlementSource = source('../src/lib/tenant-entitlements.ts');
const routeSource = source('../src/routes/fieldnode-identity-routes.ts');
const dialect = new PgDialect();
const testSecret = crypto.randomBytes(48).toString('hex');

// Compile the named, complete production declarations. Only storage, browser
// bookkeeping and the central entitlement decision are modeled. These are
// actual guard-body/real JWT tests, not execution against SQL or a live session.
function declarations(text: string, names: string[], bindings: Record<string, unknown>) {
  const file = ts.createSourceFile('actual-source.ts', text, ts.ScriptTarget.Latest, true);
  const selected = names.map(name => {
    const matches = file.statements.filter(node => (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name?.text === name);
    assert.equal(matches.length, 1, `one actual declaration: ${name}`);
    return matches[0]!.getText(file);
  });
  const compiled = ts.transpileModule(`${selected.join('\n')}\nexports.selected = {${names.join(',')}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(compiled, { ...bindings, exports, Date, Set, Map, Symbol, encodeURIComponent }, { filename: 'actual-fieldnode-guards.js' });
  return exports.selected as Record<string, any>;
}

interface FixtureOptions {
  memberRole?: string | null;
  platformAdmin?: boolean;
  tenantStatus?: string;
  explicitAccess?: string | null;
  tenantModuleStatus?: string | null;
  guardAccess?: string;
  guardDenial?: boolean;
  userStatus?: string;
  revoked?: boolean;
  tokenVersion?: number;
  membershipOverride?: { userId: string; tenantId: string; role: string } | null;
  policyMissing?: boolean;
  lookupFailure?: boolean;
  expireDuringLookup?: boolean;
  promoteAt?: 'third-authenticate' | 'central-resolver';
  actualCentralDecision?: boolean;
}

async function fixture(t: TestContext, options: FixtureOptions = {}) {
  const user = {
    id: 'user-a', email: 'synthetic-a@example.invalid', role: 'user', tokenVersion: 0,
    status: options.userStatus ?? 'active', platformRole: options.platformAdmin ? 'super_admin' : 'user',
    currentTenantId: 'unrelated-current-tenant', lockedUntil: null,
  };
  const tenant = { id: 'tenant-a', slug: 'synthetic-a', type: 'company', status: options.tenantStatus ?? 'active' };
  const member = options.memberRole === null ? null : { userId: user.id, tenantId: tenant.id, role: options.memberRole ?? 'member' };
  const storageReads: string[] = [];
  const identityReads: Array<[string, string, string]> = [];
  const modeledDb = {
    select() {
      return { from(table: unknown) { return { where(condition: SQL) { return { async limit() {
        const params = dialect.sqlToQuery(condition).params;
        if (table === revokedSessionTokens) { storageReads.push('revocation'); return options.revoked ? [{ tokenHash: params[0] }] : []; }
        if (table === users) {
          storageReads.push('user');
          if (options.promoteAt === 'third-authenticate' && storageReads.filter(read => read === 'user').length === 3) {
            user.platformRole = 'super_admin';
          }
          return params[0] === user.id ? [{ ...user }] : [];
        }
        if (table === tenants) { storageReads.push('tenant'); return params[0] === tenant.id ? [tenant] : []; }
        if (table === tenantUsers) {
          storageReads.push('membership');
          return member && params[0] === tenant.id && params[1] === user.id ? [member] : [];
        }
        throw new Error('Unexpected modeled storage read');
      } }; } }; } };
    },
  };
  const auth = declarations(authSource, [
    'isModuleSessionPathAllowed', 'isJwtPayload', 'signToken', 'verifyToken', 'sessionTokenFingerprint', 'authenticate',
  ], {
    jwt, crypto, db: modeledDb, users, revokedSessionTokens, eq,
    JWT_SECRET: testSecret, JWT_EXPIRY: '7d', JWT_ALGORITHM: 'HS256', SESSION_CONTRACT_VERSION: 1,
    SESSION_COOKIE_NAME: 'operatoros_session',
    resolveTorqueShedNativeAccessToken: async () => null,
    observeBrowserSession: async () => {},
  });
  const { TenantEntitlementError } = declarations(entitlementSource, ['TenantEntitlementError'], {});
  const tenantGuards = declarations(tenantSource, [
    'cacheFor', 'loadTenant', 'loadMembership', 'resolveEffectiveTenantAuthority', 'resolveTenantContext',
    'denyTenantNotFound', 'denySessionTenantMismatch', 'requireTenantRole', 'requireTenantModuleAccess',
  ], {
    db: modeledDb, tenants, tenantUsers, eq, and, authenticate: auth.authenticate,
    hasPlatformAdminAuthority, tenantRoleToEffective, TenantEntitlementError,
    CACHE_KEY: Symbol.for('operatoros.tenantAuthCache'), TENANT_ROLE_RANK: { viewer: -1, member: 0, admin: 1, owner: 2 },
    // Central entitlement storage is deliberately modeled. Its real wrapper
    // and the route's additional persisted-policy predicates are checked below.
    requireTenantModuleAccessDecision: async (_request: unknown, tenantId: string, module: string) => {
      assert.equal(tenantId, tenant.id);
      assert.equal(module, 'fieldnode');
      if (options.guardDenial) throw new TenantEntitlementError(403, 'MODULE_ACCESS_DENIED', 'Module access denied');
      if (options.promoteAt || options.actualCentralDecision) {
        const central = declarations(entitlementSource, [
          'globalModuleUnavailableReason', 'sourceFromTenantModule', 'resolveTenantModuleAccess',
          'accessErrorFor', 'requireTenantModuleAccess',
        ], {
          async getUserRow() {
            if (options.promoteAt === 'central-resolver') user.platformRole = 'super_admin';
            return { ...user };
          },
          getTenantRow: async () => ({ ...tenant }),
          resolveModule: async () => ({ id: 'module-fieldnode', slug: 'fieldnode', status: 'live', archivedAt: null }),
          getTenantMembership: async () => member,
          getTenantModuleRow: async () => null,
          getUserModuleAccessRow: async () => options.explicitAccess ? { accessLevel: options.explicitAccess } : null,
          moduleConsumesApplicationStackSeat: async () => false,
          tenantHasActiveEntitlement: async () => true,
          FREE_ACCOUNT_MODULE_KEYS: new Set(['fieldnode']),
          LAUNCHABLE_GLOBAL_MODULE_STATUSES: new Set(['live', 'active', 'beta']),
          LAUNCHABLE_TENANT_MODULE_STATUSES: ['enabled', 'trial', 'purchased', 'beta'],
          hasPlatformAdminAuthority, tenantRoleToEffective, TenantEntitlementError,
          moduleAccessLevelToEffective, isIndependentToolModuleSlug,
        });
        return central.requireTenantModuleAccess(_request, tenantId, module);
      }
      return { accessLevel: options.guardAccess ?? (options.platformAdmin ? 'manager' : 'user') };
    },
  });
  let clock = Date.now();
  const expiresAt = Math.floor(clock / 1000) + 3600;
  const dependencies: FieldNodeIdentityDependencies = {
    authenticate: auth.authenticate,
    requireTenantMember: tenantGuards.requireTenantRole('member'),
    requireModuleAccess: tenantGuards.requireTenantModuleAccess('fieldnode'),
    async readMembership(userId, tenantId) {
      identityReads.push(['membership', userId, tenantId]);
      if (options.lookupFailure) throw new Error('synthetic private database detail');
      if (options.expireDuringLookup) clock = (expiresAt + 1) * 1000;
      return Object.hasOwn(options, 'membershipOverride') ? options.membershipOverride! : member;
    },
    async readModulePolicy(userId, tenantId) {
      identityReads.push(['policy', userId, tenantId]);
      return options.policyMissing ? null : {
        tenantModuleStatus: options.tenantModuleStatus ?? null,
        explicitAccessLevel: options.explicitAccess ?? null,
      };
    },
    now: () => clock,
  };
  const app = Fastify({ logger: false });
  await registerFieldNodeIdentityRoutes(app, dependencies);
  t.after(() => app.close());
  const token = (changes: Record<string, unknown> = {}) => {
    const payload = {
      userId: user.id, email: user.email, role: user.role, tokenVersion: options.tokenVersion ?? 0,
      sessionVersion: 1, sessionType: 'module', moduleId: 'fieldnode', tenantId: tenant.id, exp: expiresAt,
      ...changes,
    };
    for (const key of Object.keys(payload)) if ((payload as Record<string, unknown>)[key] === undefined) delete (payload as Record<string, unknown>)[key];
    return jwt.sign(payload, testSecret, { algorithm: 'HS256' });
  };
  const request = async (changes: Record<string, unknown> = {}, headers: Record<string, string> = {}) => app.inject({
    method: 'GET', url: '/v1/modules/fieldnode/identity', headers: { authorization: `Bearer ${token(changes)}`, ...headers },
  });
  return { app, request, token, user, tenant, expiresAt, storageReads, identityReads };
}

function denied(response: Awaited<ReturnType<Awaited<ReturnType<typeof fixture>>['request']>>, status: number, code: string) {
  assert.equal(response.statusCode, status, response.body);
  assert.equal(response.json().code, code);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers.pragma, 'no-cache');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(Object.hasOwn(response.json(), 'subject'), false);
}

test('actual route and guard bodies return only current persisted identity and bounded authority', async t => {
  const f = await fixture(t);
  const response = await f.request({}, { host: 'untrusted.example.invalid', 'x-forwarded-host': 'spoof.invalid' });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), {
    contractVersion: 1, issuer: 'https://operatoros.net', subject: 'user-a', tenantId: 'tenant-a', module: 'fieldnode',
    membershipRole: 'member', moduleAccessLevel: 'user', sessionExpiresAt: new Date(f.expiresAt * 1000).toISOString(),
    authenticationAssurance: 'not_attested',
  });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.includes(f.user.email), false);
  assert.equal(response.body.includes(f.token()), false);
  assert.deepEqual(f.identityReads, [['membership', 'user-a', 'tenant-a'], ['policy', 'user-a', 'tenant-a']]);
  assert.ok(f.storageReads.includes('revocation'));
});

test('unauthenticated request is rejected by the actual authentication guard', async t => {
  const f = await fixture(t);
  denied(await f.app.inject({ method: 'GET', url: '/v1/modules/fieldnode/identity' }), 401, 'AUTH_REQUIRED');
  assert.deepEqual(f.identityReads, []);
});

test('platform session cannot be used as a FieldNode identity session', async t => {
  const f = await fixture(t);
  denied(await f.request({ sessionType: 'platform', moduleId: undefined, tenantId: undefined }), 403, 'FIELDNODE_MODULE_SESSION_REQUIRED');
  assert.deepEqual(f.identityReads, []);
});

test('wrong-module session is rejected by the actual API path-scope guard', async t => {
  const f = await fixture(t);
  denied(await f.request({ moduleId: 'techdeck' }), 403, 'SESSION_SCOPE_DENIED');
  assert.deepEqual(f.identityReads, []);
});

test('foreign tenant header cannot override sealed FieldNode tenant', async t => {
  const f = await fixture(t);
  denied(await f.request({}, { 'x-tenant-id': 'tenant-b' }), 403, 'SESSION_TENANT_MISMATCH');
  assert.deepEqual(f.identityReads, []);
});

for (const [name, options, claims, status, code] of [
  ['expired', {}, { exp: 1 }, 401, 'TOKEN_INVALID'],
  ['revoked', { revoked: true }, {}, 401, 'SESSION_REVOKED'],
  ['invalidated version', { tokenVersion: 1 }, {}, 401, 'TOKEN_REVOKED'],
  ['suspended user', { userStatus: 'suspended' }, {}, 403, 'ACCOUNT_SUSPENDED'],
  ['deleted user', { userStatus: 'deleted' }, {}, 401, 'ACCOUNT_DELETED'],
  ['missing expiry', {}, { exp: undefined }, 403, 'FIELDNODE_MODULE_SESSION_REQUIRED'],
] as const) {
  test(`${name} session cannot expose an identity`, async t => {
    const f = await fixture(t, options);
    denied(await f.request(claims), status, code);
    assert.deepEqual(f.identityReads, []);
  });
}

for (const platformAdmin of [false, true]) {
  test(`missing persisted membership denies identity even with platformAdmin=${platformAdmin}`, async t => {
    const f = await fixture(t, { memberRole: null, platformAdmin });
    denied(await f.request(), 404, 'TENANT_NOT_FOUND');
  });
}

for (const role of ['owner', 'admin', 'member', 'viewer'] as const) {
  test(`persisted ${role} is preserved; platform override cannot synthesize local owner/manager`, async t => {
    const f = await fixture(t, { memberRole: role, platformAdmin: true });
    const response = await f.request();
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().membershipRole, role);
    assert.equal(response.json().moduleAccessLevel, 'viewer');
  });
}

test('viewer membership remains viewer even when the central decision is manager', async t => {
  const f = await fixture(t, { memberRole: 'viewer', guardAccess: 'manager', explicitAccess: 'manager' });
  const response = await f.request();
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().membershipRole, 'viewer');
  assert.equal(response.json().moduleAccessLevel, 'viewer');
});

for (const promoteAt of ['third-authenticate', 'central-resolver'] as const) {
  test(`fresh admin_role provenance bounds identity after promotion at ${promoteAt}`, async t => {
    const f = await fixture(t, { promoteAt });
    const response = await f.request();
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().membershipRole, 'member');
    assert.equal(response.json().moduleAccessLevel, 'viewer');
  });
}

test('actual central free-account decision preserves ordinary member user access', async t => {
  const f = await fixture(t, { actualCentralDecision: true });
  const response = await f.request();
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().membershipRole, 'member');
  assert.equal(response.json().moduleAccessLevel, 'user');
});

test('actual central explicit grant preserves ordinary member manager access', async t => {
  const f = await fixture(t, { actualCentralDecision: true, explicitAccess: 'manager' });
  const response = await f.request();
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().membershipRole, 'member');
  assert.equal(response.json().moduleAccessLevel, 'manager');
});

for (const [explicitAccess, expected] of [['viewer', 'viewer'], ['user', 'user'], ['module_user', 'user'], ['manager', 'manager'], ['module_admin', 'manager']] as const) {
  test(`explicit persisted ${explicitAccess} bounds platform-admin module access to ${expected}`, async t => {
    const f = await fixture(t, { platformAdmin: true, explicitAccess });
    const response = await f.request();
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().membershipRole, 'member');
    assert.equal(response.json().moduleAccessLevel, expected);
  });
}

test('explicit grant cannot elevate a narrower central decision', async t => {
  const f = await fixture(t, { guardAccess: 'viewer', explicitAccess: 'manager' });
  const response = await f.request();
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().moduleAccessLevel, 'viewer');
});

for (const explicitAccess of ['none', 'unknown']) {
  test(`explicit ${explicitAccess} is denied even for a persisted platform-admin member`, async t => {
    const f = await fixture(t, { platformAdmin: true, explicitAccess });
    denied(await f.request(), 403, 'FIELDNODE_MODULE_ACCESS_DENIED');
  });
}

for (const tenantModuleStatus of ['disabled', 'archived', 'unknown']) {
  test(`tenant module ${tenantModuleStatus} is denied despite platform override`, async t => {
    const f = await fixture(t, { platformAdmin: true, tenantModuleStatus });
    denied(await f.request(), 403, 'FIELDNODE_MODULE_ACCESS_DENIED');
  });
}

for (const tenantStatus of ['suspended', 'archived']) {
  test(`inactive ${tenantStatus} tenant cannot map a FieldNode workspace through platform override`, async t => {
    const f = await fixture(t, { platformAdmin: true, tenantStatus });
    denied(await f.request(), 403, 'FIELDNODE_TENANT_INACTIVE');
  });
}

test('actual module guard retains explicit central denial response', async t => {
  const f = await fixture(t, { guardDenial: true });
  denied(await f.request(), 403, 'MODULE_ACCESS_DENIED');
  assert.deepEqual(f.identityReads, []);
});

test('unknown central module decision fails closed', async t => {
  const f = await fixture(t, { guardAccess: 'unknown' });
  denied(await f.request(), 403, 'FIELDNODE_MODULE_ACCESS_DENIED');
});

test('unsupported persisted membership role fails closed rather than mapping to owner', async t => {
  const f = await fixture(t, { memberRole: 'unknown' });
  denied(await f.request(), 403, 'FIELDNODE_MEMBERSHIP_ROLE_UNSUPPORTED');
});

for (const membershipOverride of [
  { userId: 'user-b', tenantId: 'tenant-a', role: 'owner' },
  { userId: 'user-a', tenantId: 'tenant-b', role: 'owner' },
  null,
]) {
  test(`fresh membership lookup must match both sealed identity fields: ${JSON.stringify(membershipOverride)}`, async t => {
    const f = await fixture(t, { membershipOverride });
    denied(await f.request(), 404, 'TENANT_NOT_FOUND');
  });
}

test('lookup outage is sanitized and cannot return stale identity', async t => {
  const f = await fixture(t, { lookupFailure: true });
  const response = await f.request();
  denied(response, 503, 'FIELDNODE_IDENTITY_UNAVAILABLE');
  assert.equal(response.body.includes('private database'), false);
});

test('missing FieldNode policy fails closed', async t => {
  const f = await fixture(t, { policyMissing: true });
  denied(await f.request(), 503, 'FIELDNODE_IDENTITY_UNAVAILABLE');
});

test('identity read cannot outlive the sealed session expiry', async t => {
  const f = await fixture(t, { expireDuringLookup: true });
  denied(await f.request(), 401, 'FIELDNODE_SESSION_INVALID');
});

test('the next request rechecks session revocation instead of reusing a prior identity response', async t => {
  const options: FixtureOptions = {};
  const f = await fixture(t, options);
  assert.equal((await f.request()).statusCode, 200);
  options.revoked = true;
  denied(await f.request(), 401, 'SESSION_REVOKED');
});

test('the next request rechecks explicit access denial instead of caching an earlier grant', async t => {
  const options: FixtureOptions = { platformAdmin: true, explicitAccess: 'user' };
  const f = await fixture(t, options);
  assert.equal((await f.request()).statusCode, 200);
  options.explicitAccess = 'none';
  denied(await f.request(), 403, 'FIELDNODE_MODULE_ACCESS_DENIED');
});

test('the next request rechecks persisted membership even when platform inspection still succeeds', async t => {
  const options: FixtureOptions = { platformAdmin: true };
  const f = await fixture(t, options);
  assert.equal((await f.request()).statusCode, 200);
  options.membershipOverride = null;
  denied(await f.request(), 404, 'TENANT_NOT_FOUND');
});

test('endpoint has no mutation/provisioning method', async t => {
  const f = await fixture(t);
  const response = await f.app.inject({ method: 'POST', url: '/v1/modules/fieldnode/identity', headers: { authorization: `Bearer ${f.token()}` } });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(f.identityReads, []);
});

test('actual policy SELECT binds exact FieldNode slug and tenant/user in both joins (no SQL execution)', async () => {
  const file = ts.createSourceFile('route.ts', routeSource, ts.ScriptTarget.Latest, true);
  const methods: ts.MethodDeclaration[] = [];
  function visit(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(file) === 'readModulePolicy') methods.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(methods.length, 1);
  const compiled = ts.transpileModule(`exports.read = ({ ${methods[0]!.getText(file)} }).readModulePolicy;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const recorded: Array<{ kind: string; table?: unknown; query?: ReturnType<PgDialect['sqlToQuery']> }> = [];
  const query = {
    from(table: unknown) { recorded.push({ kind: 'from', table }); return query; },
    leftJoin(table: unknown, condition: SQL) { recorded.push({ kind: 'join', table, query: dialect.sqlToQuery(condition) }); return query; },
    where(condition: SQL) { recorded.push({ kind: 'where', query: dialect.sqlToQuery(condition) }); return query; },
    async limit(count: number) { assert.equal(count, 1); return [{ tenantModuleStatus: 'enabled', explicitAccessLevel: 'user' }]; },
  };
  const exports: Record<string, any> = {};
  runInNewContext(compiled, { exports, db: { select: () => query }, modules, tenantModules, tenantUserModuleAccess, and, eq });
  const result = await exports.read('trusted-user', 'trusted-tenant');
  assert.equal(result.explicitAccessLevel, 'user');
  assert.equal(recorded[0]?.table, modules);
  assert.equal(recorded[1]?.table, tenantModules);
  assert.deepEqual(recorded[1]?.query?.params, ['trusted-tenant']);
  assert.equal(recorded[2]?.table, tenantUserModuleAccess);
  assert.deepEqual(recorded[2]?.query?.params, ['trusted-tenant', 'trusted-user']);
  assert.deepEqual(recorded[3]?.query?.params, ['fieldnode']);
  assert.match(recorded[2]!.query!.sql, /"tenant_user_module_access"\."module_id" = "modules"\."id"/);
});

test('production registration uses existing central guards and membership reader; issuer agrees with canonical SSO namespace', () => {
  assert.match(routeSource, /requireTenantMember: tenantAuth\.requireTenantMember/);
  assert.match(routeSource, /requireModuleAccess: tenantAuth\.requireTenantModuleAccess\('fieldnode'\)/);
  assert.match(routeSource, /readMembership: getTenantMembership/);
  const index = source('../src/index.ts');
  assert.match(index, /await registerFieldNodeIdentityRoutes\(app\)/);
  const contract = JSON.parse(source('../../../config/operatoros-sso-contract.json'));
  assert.equal(FIELDNODE_IDENTITY_ISSUER, contract.issuer);
  assert.doesNotMatch(routeSource, /\.insert\(|\.update\(|\.delete\(|signToken\(|setCookie\(/);
});
