import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { ClientRequest, IncomingMessage } from 'node:http';
import Fastify from 'fastify';
import {
  FIELDNODE_GATEWAY_ROUTES, FieldNodeGatewayError, fieldNodeBoundedHttps,
  fieldNodeGatewayConfig, fieldNodeGatewayCookies, fieldNodeResponseCookies, isCurrentFieldNodeIdentity,
  type FieldNodeTransportRequest, type FieldNodeTransportResponse,
} from '../src/lib/fieldnode-management-gateway.js';
import { registerFieldNodeManagementGatewayRoutes } from '../src/routes/fieldnode-management-gateway-routes.js';
import { registerFieldNodeIdentityRoutes } from '../src/routes/fieldnode-identity-routes.js';
import { middleware } from '../../web/src/middleware.js';
import { fieldNodeManagementPath } from '../../../packages/modules/fieldnode-management-paths.js';

const publicOrigin = 'https://fieldnode.operatoros.net';
const config = fieldNodeGatewayConfig({
  FIELDNODE_OPERATOROS_AUTHORITY_ORIGIN: 'https://authority.example.invalid',
  FIELDNODE_MANAGEMENT_UPSTREAM_ORIGIN: 'https://field.example.invalid',
})!;
const consume = '/v1/modules/fieldnode/manage/api/auth/operatoros/consume';
const verify = '/v1/modules/fieldnode/manage/api/auth/operatoros/mfa/verify';
const requireWeb = createRequire(new URL('../../web/package.json', import.meta.url));
const { NextRequest } = requireWeb('next/server') as { NextRequest: new (...args: any[]) => any };
const cookie = 'operatoros_session=synthetic-current-module-session';
const localCookie = 'portal_operatoros_mfa=local-partial; Path=/manage; Secure; HttpOnly; SameSite=Strict';
const csrfCookie = 'portal_csrf=local-csrf; Path=/manage; Secure; SameSite=Strict';

function identity() {
  return {
    contractVersion: 1, issuer: 'https://operatoros.net', subject: 'user-a', tenantId: 'tenant-a', module: 'fieldnode',
    membershipRole: 'member', moduleAccessLevel: 'user', sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    authenticationAssurance: 'not_attested',
  };
}
function response(body: unknown, statusCode = 200, setCookies: string[] = []): FieldNodeTransportResponse {
  return { statusCode, body: JSON.stringify(body), contentType: 'application/json', setCookies };
}
interface Options {
  configured?: boolean;
  identityResponse?: FieldNodeTransportResponse;
  upstreamResponse?: FieldNodeTransportResponse;
  trustProxy?: boolean;
  onUpstream?: (request: FieldNodeTransportRequest) => void;
  closeDuringIdentity?: boolean;
  expireDuringUpstream?: boolean;
}
async function fixture(t: TestContext, options: Options = {}) {
  const app = Fastify({ logger: false });
  let currentReply: { raw: { emit(event: string): boolean } } | undefined;
  let clock = Date.now();
  let finishIdentity!: () => void;
  const identityFinished = new Promise<void>(resolve => { finishIdentity = resolve; });
  app.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/v1/modules/fieldnode/manage/')) currentReply = reply;
  });
  // Execute the actual frozen identity handler and its narrowed membership
  // policy. The credential/auth and row-loader ports here are synthetic; the
  // separate identity suite executes actual JWT/auth/tenant/resolver bodies.
  await registerFieldNodeIdentityRoutes(app, {
    async authenticate(request, reply) {
      if (request.headers.cookie !== cookie) return reply.code(401).send({ code: 'TOKEN_INVALID' });
      (request as any).user = { id: 'user-a', status: 'active' };
      (request as any).authSession = { userId: 'user-a', sessionType: 'module', tenantId: 'tenant-a', moduleId: 'fieldnode', exp: Math.floor(Date.now() / 1000) + 60 };
    },
    async requireTenantMember(request) { (request as any).tenantContext = { tenantId: 'tenant-a', status: 'active', viaPlatformRole: false }; },
    async requireModuleAccess(request) { (request as any).tenantModuleAccessLevel = 'user'; },
    readMembership: async () => ({ userId: 'user-a', tenantId: 'tenant-a', role: 'member' }),
    readModulePolicy: async () => ({ tenantModuleStatus: 'enabled', explicitAccessLevel: null }),
    now: Date.now,
  });
  const calls: FieldNodeTransportRequest[] = [];
  await registerFieldNodeManagementGatewayRoutes(app, {
    config: options.configured === false ? null : config, trustProxy: options.trustProxy ?? false, now: () => clock,
    transport: async request => {
      calls.push(request);
      if (request.url.origin === config.authorityOrigin) {
        if (options.closeDuringIdentity) currentReply?.raw.emit('close');
        if (options.identityResponse) return options.identityResponse;
        const result = await app.inject({ method: 'GET', url: request.url.pathname, headers: { cookie: request.headers.Cookie! } });
        finishIdentity();
        return { statusCode: result.statusCode, contentType: String(result.headers['content-type'] ?? ''), body: result.body, setCookies: [] };
      }
      options.onUpstream?.(request);
      if (options.expireDuringUpstream) clock += 120_000;
      return options.upstreamResponse ?? response({ mfa_required: true }, 200, [localCookie, csrfCookie]);
    },
  });
  t.after(() => app.close());
  const send = async (headers: Record<string, string> = {}, path = consume, payload: object | string = {}) => app.inject({
    method: 'POST', url: path, headers: { host: 'fieldnode.operatoros.net', origin: publicOrigin, cookie: `${cookie}; portal_csrf=csrf`, 'x-csrf-token': 'csrf', ...headers }, payload,
  });
  return { app, calls, send, identityFinished };
}

test('only explicit TLS server origins enable the gateway; no production defaults', () => {
  assert.equal(fieldNodeGatewayConfig({}), null);
  for (const value of ['http://field.invalid', 'https://user:pass@field.invalid', 'https://field.invalid/path', 'https://field.invalid/?x=1', 'https://field.invalid/#x', ' https://field.invalid', 'https://field.invalid\\other']) {
    assert.equal(fieldNodeGatewayConfig({ FIELDNODE_OPERATOROS_AUTHORITY_ORIGIN: value, FIELDNODE_MANAGEMENT_UPSTREAM_ORIGIN: 'https://field.invalid' }), null, value);
  }
  assert.equal(fieldNodeGatewayConfig({ FIELDNODE_OPERATOROS_AUTHORITY_ORIGIN: 'https://same.invalid', FIELDNODE_MANAGEMENT_UPSTREAM_ORIGIN: 'https://same.invalid' }), null);
  assert.ok(Object.isFrozen(config));
});

test('consume revalidates actual identity handler before forwarding exactly one fixed upstream POST', async t => {
  const f = await fixture(t);
  const result = await f.send({
    cookie: `analytics=not-forwarded; ${cookie}; portal_operatoros_mfa=partial; portal_csrf=csrf; operatoros_sso_state=private-state`,
    'x-csrf-token': 'csrf', authorization: 'Bearer not-forwarded', 'x-tenant-id': 'foreign-tenant',
    'x-forwarded-host': 'attacker.invalid', 'x-forwarded-proto': 'http', 'x-user-id': 'foreign-user',
  }, consume, {});
  assert.equal(result.statusCode, 200, result.body);
  assert.deepEqual(result.json(), { mfa_required: true });
  assert.deepEqual(f.calls.map(call => [call.method, call.url.href]), [
    ['GET', 'https://authority.example.invalid/v1/modules/fieldnode/identity'],
    ['POST', 'https://field.example.invalid/portal/auth/operatoros/consume'],
  ]);
  assert.deepEqual(f.calls[0]!.headers, { Cookie: cookie, Accept: 'application/json' });
  assert.equal(f.calls[0]!.timeoutMs, 2000);
  assert.equal(f.calls[0]!.maxBytes, 8192);
  const headers = f.calls[1]!.headers;
  assert.equal(headers.Cookie, `${cookie}; portal_operatoros_mfa=partial; portal_csrf=csrf`);
  assert.equal(headers.Authorization, undefined);
  assert.equal(headers['X-Tenant-Id'], undefined);
  assert.equal(headers['X-Forwarded-Host'], 'fieldnode.operatoros.net');
  assert.equal(headers['X-Forwarded-Proto'], 'https');
  assert.equal(headers['x-csrf-token'], 'csrf');
  assert.equal(f.calls[1]!.body, '');
  assert.equal(headers['Content-Length'], '0');
  assert.equal(headers.Origin, publicOrigin);
  assert.deepEqual(result.headers['set-cookie'], [localCookie, csrfCookie]);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.headers['referrer-policy'], 'no-referrer');
});

test('missing configuration makes confirmed routes unavailable without any transport', async t => {
  const f = await fixture(t, { configured: false });
  const result = await f.send();
  assert.equal(result.statusCode, 503);
  assert.equal(result.json().code, 'FIELDNODE_GATEWAY_UNCONFIGURED');
  assert.equal(f.calls.length, 0);
});

for (const origin of ['', 'null', 'http://fieldnode.operatoros.net', 'https://app.operatoros.net', 'https://fieldnode.operatoros.net.attacker.invalid']) {
  test(`browser Origin ${JSON.stringify(origin)} is rejected before identity/upstream reads`, async t => {
    const f = await fixture(t);
    const result = await f.send({ origin });
    assert.equal(result.statusCode, 403);
    assert.equal(result.json().code, 'FIELDNODE_ORIGIN_REJECTED');
    assert.equal(f.calls.length, 0);
  });
}

test('explicit trusted proxy host must agree with the fixed public origin', async t => {
  const f = await fixture(t, { trustProxy: true });
  assert.equal((await f.send({ host: 'internal:5001', 'x-forwarded-host': 'fieldnode.operatoros.net' })).statusCode, 200);
  const count = f.calls.length;
  assert.equal((await f.send({ 'x-forwarded-host': 'attacker.invalid' })).statusCode, 403);
  assert.equal((await f.send({ 'x-forwarded-host': 'fieldnode.operatoros.net, attacker.invalid' })).statusCode, 403);
  assert.equal(f.calls.length, count);
});

test('a bearer header does not replace the required current central cookie', async t => {
  const f = await fixture(t);
  assert.equal((await f.send({ cookie: '', authorization: 'Bearer synthetic' })).statusCode, 401);
  assert.equal(f.calls.length, 0);
});

for (const raw of [`${cookie}; operatoros_session=second`, 'operatoros_session=', `${cookie}; portal_mfa=a; portal_mfa=b`, `${cookie}; portal_csrf="quoted"`, `${cookie}; portal_session=a,b`]) {
  test(`ambiguous/malformed accepted cookie is rejected: ${raw}`, () => {
    assert.throws(() => fieldNodeGatewayCookies(raw), FieldNodeGatewayError);
  });
}

test('unknown cookies and SSO transaction cookies are removed, not reinterpreted as credentials', () => {
  assert.deepEqual(fieldNodeGatewayCookies(`${cookie}; unused=x; operatoros_sso_nonce=secret`), {
    central: cookie, upstream: cookie, csrf: null,
  });
});

test('MFA verify retains required local CSRF cookie and token header', async t => {
  const f = await fixture(t);
  assert.equal((await f.send({ cookie }, verify, { code: '123456', csrf: 'csrf' })).statusCode, 403);
  assert.equal((await f.send({ cookie: `${cookie}; portal_csrf=csrf`, 'x-csrf-token': '' }, verify, { code: '123456', csrf: '' })).statusCode, 403);
  assert.equal(f.calls.length, 0);
  const result = await f.send({ cookie: `${cookie}; portal_csrf=csrf; portal_operatoros_mfa=partial`, 'x-csrf-token': 'csrf' }, verify, { code: '123456', csrf: 'csrf' });
  assert.equal(result.statusCode, 200);
  assert.equal(f.calls[1]!.url.pathname, '/portal/auth/operatoros/mfa/verify');
});

for (const statusCode of [401, 403, 404, 500, 302]) {
  test(`central identity status ${statusCode} cannot reach FieldNode`, async t => {
    const f = await fixture(t, { identityResponse: response({ code: 'synthetic-denial' }, statusCode) });
    const result = await f.send();
    assert.equal(result.statusCode, [401, 403, 404].includes(statusCode) ? statusCode : 503);
    assert.equal(f.calls.length, 1);
    assert.equal(result.headers['set-cookie'], undefined);
  });
}

for (const change of [{ issuer: 'https://attacker.invalid' }, { tenantId: '' }, { module: 'techdeck' }, { moduleAccessLevel: 'none' }, { authenticationAssurance: 'mfa' }, { sessionExpiresAt: '2000-01-01T00:00:00.000Z' }, { extra: true }]) {
  test(`invalid authenticated identity data is rejected: ${JSON.stringify(change)}`, async t => {
    const f = await fixture(t, { identityResponse: response({ ...identity(), ...change }) });
    const result = await f.send();
    assert.equal(result.statusCode, 503, result.body);
    assert.equal(f.calls.length, 1);
  });
}

test('identity helper retains not_attested and viewer instead of inventing MFA or write authority', () => {
  assert.equal(isCurrentFieldNodeIdentity({ ...identity(), membershipRole: 'viewer', moduleAccessLevel: 'viewer' }), true);
  assert.equal(isCurrentFieldNodeIdentity({ ...identity(), authenticationAssurance: 'mfa' }), false);
});

for (const [field, validValue] of [['membershipRole', 'member'], ['moduleAccessLevel', 'user']] as const) {
  for (const [label, value] of [
    ['singleton array', [validValue]], ['multiple-value array', [validValue, 'viewer']],
    ['empty array', []], ['object', {}], ['named object', { value: validValue }],
    ['null', null], ['number', 0], ['boolean', true],
  ] as const) {
    test(`authenticated identity ${field} rejects ${label} before any FieldNode POST`, async t => {
      const invalid = { ...identity(), [field]: value };
      const f = await fixture(t, { identityResponse: response(invalid) });
      const result = await f.send();
      assert.equal(result.statusCode, 503, result.body);
      assert.equal(result.json().code, 'FIELDNODE_IDENTITY_REJECTED');
      assert.deepEqual(f.calls.map(call => [call.method, call.url.pathname]), [
        ['GET', '/v1/modules/fieldnode/identity'],
      ]);
      assert.equal(result.headers['set-cookie'], undefined);
      assert.equal(isCurrentFieldNodeIdentity(invalid), false);
    });
  }
}

for (const [membershipRole, moduleAccessLevel] of [
  ['owner', 'manager'], ['admin', 'manager'], ['member', 'user'], ['viewer', 'viewer'],
] as const) {
  test(`authenticated identity retains exact string ${membershipRole}/${moduleAccessLevel}`, async t => {
    const current = { ...identity(), membershipRole, moduleAccessLevel };
    assert.equal(isCurrentFieldNodeIdentity(current), true);
    const f = await fixture(t, { identityResponse: response(current) });
    assert.equal((await f.send()).statusCode, 200);
    assert.deepEqual(f.calls.map(call => call.method), ['GET', 'POST']);
  });
}

for (const header of [
  'operatoros_session=evil; Path=/manage; Secure; HttpOnly; SameSite=Lax',
  'portal_session=local; Domain=operatoros.net; Path=/manage; Secure; HttpOnly; SameSite=Lax',
  'portal_session=local; Path=/; Secure; HttpOnly; SameSite=Lax',
  'portal_session=local; Path=/manage; HttpOnly; SameSite=Lax',
  'portal_session=local; Path=/manage; Secure; SameSite=Lax',
  'portal_session=local; Path=/manage; Secure; HttpOnly; SameSite=None',
  'unregistered=local; Path=/manage; Secure; HttpOnly; SameSite=Lax',
]) {
  test(`upstream cannot set an unsafe/unregistered cookie: ${header}`, async t => {
    const f = await fixture(t, { upstreamResponse: response({ ok: true }, 200, [header]) });
    const result = await f.send();
    assert.equal(result.statusCode, 502, result.body);
    assert.equal(result.headers['set-cookie'], undefined);
  });
}

test('duplicate upstream cookie names fail closed before any cookie is returned', () => {
  assert.throws(() => fieldNodeResponseCookies([localCookie, localCookie]), FieldNodeGatewayError);
});

for (const status of [301, 302, 303, 307, 308, 500, 503]) {
  test(`upstream ${status} is sanitized, never followed or retried`, async t => {
    const f = await fixture(t, { upstreamResponse: response({ private_trace: 'must-not-leak' }, status, [localCookie]) });
    const result = await f.send();
    assert.equal(result.statusCode, 502);
    assert.equal(result.body.includes('private_trace'), false);
    assert.equal(result.headers['set-cookie'], undefined);
    assert.equal(f.calls.length, 2);
  });
}

test('upstream local-auth denial is preserved without claiming successful MFA', async t => {
  const f = await fixture(t, { upstreamResponse: response({ detail: 'Invalid MFA code' }, 403) });
  const result = await f.send();
  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.json(), { detail: 'Invalid MFA code' });
});

test('HTML, oversized and identity-cookie responses fail closed', async t => {
  for (const invalid of [
    { ...response({ ok: true }), contentType: 'text/html' },
    { ...response({ ok: true }), body: 'x'.repeat(70_000) },
  ]) {
    const f = await fixture(t, { upstreamResponse: invalid });
    assert.equal((await f.send()).statusCode, 502);
  }
  const f = await fixture(t, { identityResponse: response(identity(), 200, [localCookie]) });
  assert.equal((await f.send()).statusCode, 503);
  assert.equal(f.calls.length, 1);
});

test('only registered method/path/body/query combinations reach transport', async t => {
  const f = await fixture(t);
  for (const path of ['/v1/modules/fieldnode/manage/unregistered', `${consume}/extra`, '/v1/modules/fieldnode/manage/api/fleet', '/v1/modules/fieldnode/manage/assets/app.js']) {
    assert.equal((await f.send({}, path)).statusCode, 404, path);
  }
  assert.equal((await f.app.inject({ method: 'GET', url: consume })).statusCode, 404);
  assert.equal((await f.send({}, `${consume}?target=https://attacker.invalid`)).statusCode, 404);
  assert.equal((await f.send({}, consume, [])).statusCode, 400);
  assert.equal((await f.send({}, '/v1/modules/fieldnode/manage/api/auth/operatoros/signup', { tooLarge: 'x'.repeat(65536) })).statusCode, 413);
  assert.equal(f.calls.length, 0);
});

test('client closure during authority read cannot start a later FieldNode POST', { timeout: 2000 }, async t => {
  const f = await fixture(t, { closeDuringIdentity: true });
  await assert.rejects(f.send(), { code: 'LIGHT_ECONNRESET' });
  await f.identityFinished;
  // Finish the real authority continuation's microtasks before checking that
  // a closed client did not dispatch any subsequent upstream operation.
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]!.signal?.aborted, true);
});

test('an upstream completion after central expiry cannot issue local session cookies', async t => {
  const f = await fixture(t, { expireDuringUpstream: true });
  const result = await f.send();
  assert.equal(result.statusCode, 401);
  assert.equal(result.headers['set-cookie'], undefined);
  assert.equal(f.calls.length, 2);
});

const transportInput: FieldNodeTransportRequest = {
  url: new URL('https://field.example.invalid/portal/auth/operatoros/consume'), method: 'POST',
  headers: { Cookie: cookie }, body: '{}', timeoutMs: 25, maxBytes: 16,
};
function socketFixture() {
  const request = new EventEmitter() as EventEmitter & { end(body?: string): void; destroy(): void; destroyed: boolean };
  request.destroyed = false;
  request.end = () => {};
  request.destroy = () => { request.destroyed = true; };
  const received = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, any>; destroy(): void; destroyed: boolean };
  received.statusCode = 200;
  received.headers = { 'content-type': 'application/json' };
  received.destroyed = false;
  received.destroy = () => { received.destroyed = true; };
  return { request, received };
}

test('actual native transport uses TLS verification and collects only a bounded response', async () => {
  const f = socketFixture();
  const promise = fieldNodeBoundedHttps(transportInput, (url, options, callback) => {
    assert.equal(url.origin, config.upstreamOrigin);
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.maxHeaderSize, 16384);
    queueMicrotask(() => { callback(f.received as unknown as IncomingMessage); f.received.emit('data', Buffer.from('{}')); f.received.emit('end'); });
    return f.request as unknown as ClientRequest;
  });
  assert.deepEqual(await promise, response({}));
});

test('never-settling native request terminates on its completion deadline; late reply is discarded', async () => {
  const f = socketFixture();
  let callback: ((response: IncomingMessage) => void) | undefined;
  const promise = fieldNodeBoundedHttps(transportInput, (_url, _options, listener) => {
    callback = listener;
    return f.request as unknown as ClientRequest;
  });
  await assert.rejects(promise, (error: unknown) => error instanceof FieldNodeGatewayError && error.code === 'FIELDNODE_UPSTREAM_UNAVAILABLE');
  assert.equal(f.request.destroyed, true);
  callback!(f.received as unknown as IncomingMessage);
  assert.equal(f.received.destroyed, true);
  f.request.emit('error', new Error('late private transport error'));
});

test('native transport aborts an oversized body and caller cancellation without retry', async () => {
  const f = socketFixture();
  const promise = fieldNodeBoundedHttps(transportInput, (_url, _options, callback) => {
    queueMicrotask(() => { callback(f.received as unknown as IncomingMessage); f.received.emit('data', Buffer.alloc(17)); });
    return f.request as unknown as ClientRequest;
  });
  await assert.rejects(promise, (error: unknown) => error instanceof FieldNodeGatewayError && error.code === 'FIELDNODE_UPSTREAM_INVALID');
  assert.equal(f.received.destroyed, true);
  const controller = new AbortController();
  const other = socketFixture();
  const cancelled = fieldNodeBoundedHttps({ ...transportInput, signal: controller.signal }, () => other.request as unknown as ClientRequest);
  controller.abort();
  await assert.rejects(cancelled, FieldNodeGatewayError);
  assert.equal(other.request.destroyed, true);
});

test('trickling response data cannot extend the hard native completion deadline', async () => {
  const f = socketFixture();
  let trickle: ReturnType<typeof setInterval> | undefined;
  try {
    const promise = fieldNodeBoundedHttps({ ...transportInput, maxBytes: 4096 }, (_url, _options, callback) => {
      queueMicrotask(() => {
        callback(f.received as unknown as IncomingMessage);
        trickle = setInterval(() => f.received.emit('data', Buffer.from('x')), 2);
      });
      return f.request as unknown as ClientRequest;
    });
    await assert.rejects(promise, (error: unknown) => error instanceof FieldNodeGatewayError && error.code === 'FIELDNODE_UPSTREAM_UNAVAILABLE');
    assert.equal(f.received.destroyed, true);
  } finally { if (trickle) clearInterval(trickle); }
});

test('a pre-cancelled native operation creates no request', async () => {
  const controller = new AbortController();
  controller.abort();
  let created = false;
  await assert.rejects(fieldNodeBoundedHttps({ ...transportInput, signal: controller.signal }, () => {
    created = true;
    return socketFixture().request as unknown as ClientRequest;
  }), FieldNodeGatewayError);
  assert.equal(created, false);
});

test('real Next middleware preserves only the exact POST ceremonies and leaves SSO/root ownership central', async () => {
  for (const path of Object.keys(FIELDNODE_GATEWAY_ROUTES)) {
    const request = new NextRequest(`${publicOrigin}/manage${path}`, { method: 'POST', headers: { host: 'fieldnode.operatoros.net' } });
    const result = await middleware(request);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('x-middleware-next'), '1');
    assert.equal(result.headers.get('location'), null);
  }
  for (const path of ['/manage/api/fleet', '/manage/api/auth/operatoros/consume/extra', '/manage/fleet', '/manage/ws', '/manage/assets/unregistered']) {
    const result = await middleware(new NextRequest(`${publicOrigin}${path}`, { headers: { host: 'fieldnode.operatoros.net' } }));
    assert.equal(result.status, 404);
  }
  const callback = await middleware(new NextRequest(`${publicOrigin}/sso`, { headers: { host: 'fieldnode.operatoros.net' } }));
  assert.equal(callback.headers.get('x-middleware-next'), '1');
});

test('actual Next configuration has only frozen exact-host management families, no arbitrary upstream', async () => {
  const previous = process.env.INTERNAL_API_URL;
  process.env.INTERNAL_API_URL = 'http://127.0.0.1:51999';
  try {
    const loaded = requireWeb(fileURLToPath(new URL('../../web/next.config.js', import.meta.url))) as { default: { rewrites(): Promise<{ beforeFiles: Array<any> }> } };
    const rewrites = (await loaded.default.rewrites()).beforeFiles.filter(row => row.source.startsWith('/manage'));
    assert.equal(rewrites.length, 24);
    for (const row of rewrites) {
      assert.equal(row.has.length, 1);
      assert.equal(row.has[0].type, 'header');
      assert.equal(row.has[0].key, 'host');
      assert.equal(new RegExp(`^${row.has[0].value}$`).test('fieldnode.operatoros.net'), true);
      assert.equal(row.destination, `http://127.0.0.1:51999/v1/modules/fieldnode${row.source}`);
      if (row.source.includes('*')) assert.equal(row.source, '/manage/nodes/:nodeId([0-9a-fA-F-]{36})/api/v1/:path*');
    }
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_API_URL;
    else process.env.INTERNAL_API_URL = previous;
  }
});

test('actual pinned Next matching and destination preparation preserve an empty management query', async () => {
  const framework = requireWeb('next/dist/shared/lib/router/utils/prepare-destination.js') as {
    matchHas(request: { headers: Record<string, string> }, query: object, has: object[]): false | Record<string, string>;
    prepareDestination(input: { destination: string; params: object; query: object; appendParamsToQuery: boolean }): { parsedDestination: { pathname: string; query: object } };
  };
  const loaded = requireWeb(fileURLToPath(new URL('../../web/next.config.js', import.meta.url))) as { default: { rewrites(): Promise<{ beforeFiles: Array<any> }> } };
  const row = (await loaded.default.rewrites()).beforeFiles.find(rule => rule.source === '/manage')!;
  for (const host of ['fieldnode.operatoros.net', 'FIELDNODE.OPERATOROS.NET', 'fieldnode.operatoros.net:443']) {
    const matched = framework.matchHas({ headers: { host } }, {}, row.has);
    assert.deepEqual(matched, {}, host);
    const prepared = framework.prepareDestination({ destination: row.destination, params: matched || {}, query: {}, appendParamsToQuery: true });
    assert.deepEqual(prepared.parsedDestination.query, {}, host);
    assert.equal(prepared.parsedDestination.pathname, '/v1/modules/fieldnode/manage');
    assert.equal(fieldNodeManagementPath('GET', `/manage${prepared.parsedDestination.pathname.slice('/v1/modules/fieldnode/manage'.length)}`)?.kind, 'html');
  }
  for (const host of ['attacker.invalid', 'fieldnode.operatoros.net.attacker.invalid', 'fieldnode.operatoros.net:54432']) {
    assert.equal(framework.matchHas({ headers: { host } }, {}, row.has), false, host);
  }
  assert.equal(fieldNodeManagementPath('GET', '/manage?host=fieldnode.operatoros.net'), null);
});

test('nonproduction module-prefixed API maps to the same central gateway, never directly to FieldNode', async () => {
  const result = await middleware(new NextRequest('http://localhost:3000/modules/fieldnode/manage/api/auth/operatoros/consume', {
    method: 'POST', headers: { host: 'localhost:3000' },
  }));
  assert.equal(new URL(result.headers.get('x-middleware-rewrite')!).pathname, '/api/modules/fieldnode/manage/api/auth/operatoros/consume');
});
