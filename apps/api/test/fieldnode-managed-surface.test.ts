import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { once } from 'node:events';
import { Readable, PassThrough } from 'node:stream';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import type { IncomingMessage, ClientRequest } from 'node:http';
import { FIELDNODE_PORTAL_ROUTES, FIELDNODE_MANAGED_ASSETS, fieldNodeAllowedConsolePath, fieldNodeManagementPath } from '../../../packages/modules/fieldnode-management-paths.js';
import { fieldNodeGatewayConfig, fieldNodeResponseCookies, type FieldNodeTransportRequest, type FieldNodeTransportResponse } from '../src/lib/fieldnode-management-gateway.js';
import { fieldNodeChunkStream, fieldNodeOpenStream, fieldNodeRelaySerial, fieldNodeCollectError, fieldNodeLimitClientSocket, type FieldNodeStreamResponse } from '../src/lib/fieldnode-management-streams.js';
import { registerFieldNodeManagementGatewayRoutes } from '../src/routes/fieldnode-management-gateway-routes.js';

const nodeId = '12345678-1234-4123-8123-123456789012';
const base = '/v1/modules/fieldnode/manage';
const origin = 'https://fieldnode.operatoros.net';
const central = 'operatoros_session=synthetic-central';
const headers = { host: 'fieldnode.operatoros.net', origin, cookie: `${central}; portal_csrf=nonce; portal_session=osso_synthetic`, 'x-csrf-token': 'nonce' };
const config = fieldNodeGatewayConfig({ FIELDNODE_OPERATOROS_AUTHORITY_ORIGIN: 'https://authority.invalid', FIELDNODE_MANAGEMENT_UPSTREAM_ORIGIN: 'https://consumer.invalid' })!;
const currentIdentity = () => ({ contractVersion: 1, issuer: 'https://operatoros.net', subject: 'u-a', tenantId: 't-a', module: 'fieldnode', membershipRole: 'owner', moduleAccessLevel: 'manager', sessionExpiresAt: new Date(Date.now() + 60000).toISOString(), authenticationAssurance: 'not_attested' });
const json = (value: unknown, statusCode = 200, setCookies: string[] = []): FieldNodeTransportResponse => ({ statusCode, body: JSON.stringify(value), contentType: 'application/json', setCookies });
async function fixture(t: TestContext, options: {
  upstream?: FieldNodeTransportResponse;
  stream?: (input: FieldNodeTransportRequest) => Promise<FieldNodeStreamResponse>;
  identity?: () => unknown;
  authority?: () => Promise<FieldNodeTransportResponse>;
  openSocket?: (url: URL, sentHeaders: Readonly<Record<string, string>>) => WebSocket;
} = {}) {
  const app = Fastify({ logger: false });
  app.post('/v1/unrelated-json', async request => request.body);
  await app.register(websocket);
  const calls: FieldNodeTransportRequest[] = [];
  await registerFieldNodeManagementGatewayRoutes(app, { config, trustProxy: false, now: Date.now, recheckMs: 5,
    transport: async input => {
      calls.push(input);
      return input.url.origin === config.authorityOrigin ? options.authority ? options.authority() : json(await (options.identity?.() ?? currentIdentity())) : options.upstream ?? json({ ok: true });
    },
    openStream: options.stream,
    openSocket: options.openSocket,
  });
  await app.ready();
  t.after(() => app.close());
  return { app, calls };
}

for (const [method, path] of FIELDNODE_PORTAL_ROUTES) {
  test(`frozen portal mapping ${method} ${path}`, async t => {
    const actual = path.replace(':uuid', nodeId);
    const f = await fixture(t, { upstream: json([{ id: nodeId }]) });
    const payload = path.endsWith('/mfa/verify') ? { code: '123456', csrf: 'nonce' } : {};
    const result = await f.app.inject({ method, url: base + actual, headers, ...(['GET', 'HEAD'].includes(method) ? {} : { payload }) });
    assert.equal(result.statusCode, 200, result.body);
    assert.deepEqual(result.json(), [{ id: nodeId }]);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1]!.url.pathname, actual.replace(/^\/api/u, '/portal'));
    assert.equal(f.calls[1]!.method, method);
    assert.deepEqual(f.calls[0]!.headers, { Cookie: central, Accept: 'application/json' });
    if (path.endsWith('/consume')) { assert.equal(f.calls[1]!.body, ''); assert.equal(f.calls[1]!.headers['Content-Length'], '0'); }
  });
}

test('status can establish Strict setup and readable nonce without prior local cookies', async t => {
  const cookies = [
    'portal_operatoros_setup=setup; Path=/manage; Secure; HttpOnly; SameSite=Strict',
    'portal_csrf=nonce; Path=/manage; Secure; SameSite=Strict',
  ];
  const f = await fixture(t, { upstream: json({ status: 'unmapped' }, 200, cookies) });
  const result = await f.app.inject({ method: 'GET', url: `${base}/api/auth/operatoros/status`, headers: { ...headers, cookie: central } });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.headers['set-cookie'], cookies);
  assert.equal(f.calls[1]!.headers.Cookie, central);
});

test('captured Starlette deletion flags are normalized; one clear then valid issue coalesces nonce rotation', async t => {
  // Starlette 1.6.0 Response.delete_cookie capture, receipt in joint evidence.
  const clear = 'portal_csrf=""; expires=Tue, 20 Oct 2026 22:30:13 GMT; Max-Age=0; Path=/manage; SameSite=lax';
  const issued = 'portal_csrf=new-nonce; Path=/manage; Secure; SameSite=Strict';
  assert.deepEqual(fieldNodeResponseCookies([clear]), ['portal_csrf=; Max-Age=0; Path=/manage; Secure; SameSite=Strict']);
  assert.deepEqual(fieldNodeResponseCookies([clear.replace('portal_csrf=', 'portal_session=')]), ['portal_session=; Max-Age=0; Path=/manage; Secure; SameSite=Strict; HttpOnly']);
  const f = await fixture(t, { upstream: json({ mfa_required: true }, 200, [clear, issued]) });
  const result = await f.app.inject({ method: 'POST', url: `${base}/api/auth/operatoros/consume`, headers, payload: {} });
  assert.equal(result.statusCode, 200, result.body);
  assert.deepEqual(result.headers['set-cookie'], [issued]);
  for (const invalid of [
    [clear, clear], [issued, clear], [issued, issued], [clear, issued, issued],
    [clear.replace('Path=/manage', 'Path=/')], [clear + '; Domain=operatoros.net'],
    [clear.replace('Max-Age=0', 'Max-Age=1').replace('Tue, 20 Oct 2026 22:30:13 GMT', 'Wed, 20 Oct 2100 22:30:13 GMT')],
    ['portal_session=new; Path=/manage; SameSite=lax'],
    ['operatoros_session=""; Max-Age=0; Path=/manage'],
  ]) assert.throws(() => fieldNodeResponseCookies(invalid), Error, JSON.stringify(invalid));
});

test('consume requires nonce and empty public object; no identity body crosses to consumer', async t => {
  const f = await fixture(t);
  for (const [sentHeaders, payload, expected] of [
    [{ ...headers, cookie: central }, {}, 403],
    [{ ...headers, 'x-csrf-token': 'wrong' }, {}, 403],
    [headers, { subject: 'attacker', tenantId: 'foreign' }, 400],
  ] as const) {
    const result = await f.app.inject({ method: 'POST', url: `${base}/api/auth/operatoros/consume`, headers: sentHeaders, payload });
    assert.equal(result.statusCode, expected);
  }
  assert.equal(f.calls.filter(call => call.url.origin === config.upstreamOrigin).length, 0);
});

test('actual frozen UI empty JSON consume forwards zero bytes; other empty/malformed JSON stays rejected', async t => {
  const f = await fixture(t);
  const result = await f.app.inject({ method: 'POST', url: `${base}/api/auth/operatoros/consume`, headers: { ...headers, 'content-type': 'application/json' } });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(f.calls[1]!.body, '');
  assert.equal(f.calls[1]!.headers['Content-Length'], '0');
  for (const path of ['/api/auth/operatoros/signup', '/api/auth/operatoros/mfa/verify']) {
    assert.equal((await f.app.inject({ method: 'POST', url: base + path, headers: { ...headers, 'content-type': 'application/json' } })).statusCode, 400);
  }
  for (const value of ['{', '{"__proto__":{"x":true}}', '{"subject":"foreign"}']) {
    assert.equal((await f.app.inject({ method: 'POST', url: `${base}/api/auth/operatoros/consume`, headers: { ...headers, 'content-type': 'application/json' }, payload: value })).statusCode, 400);
  }
  for (const payload of [undefined, '{', '{"__proto__":{"x":true}}']) {
    assert.equal((await f.app.inject({ method: 'POST', url: '/v1/unrelated-json', headers: { 'content-type': 'application/json' }, payload })).statusCode, 400);
  }
  assert.deepEqual((await f.app.inject({ method: 'POST', url: '/v1/unrelated-json', payload: { unchanged: true } })).json(), { unchanged: true });
  assert.equal((await f.app.inject({ method: 'POST', url: `${base}/api/auth/operatoros/consume`, headers: { ...headers, 'content-type': 'application/json' }, payload: Buffer.from([0xff]) })).statusCode, 400);
  assert.equal((await f.app.inject({ method: 'POST', url: `${base}/api/auth/operatoros/consume`, headers: { ...headers, 'content-type': 'application/json' }, payload: ' '.repeat(65536) + '{}' })).statusCode, 413);
  assert.equal(f.calls.filter(call => call.url.origin === config.upstreamOrigin).length, 1);
});

for (const [method, path] of [
  ['POST', '/api/auth/logout'], ['POST', `/api/nodes/${nodeId}/enrollment`],
  ['POST', `/api/nodes/${nodeId}/revoke`], ['DELETE', `/api/nodes/${nodeId}`],
] as const) {
  test(`actual frozen UI bodyless ${method} ${path} accepts only no-body or empty object`, async t => {
    const f = await fixture(t);
    for (const payload of [undefined, {}]) {
      const result = await f.app.inject({ method, url: base + path, headers: { ...headers, 'content-type': 'application/json' }, payload });
      assert.equal(result.statusCode, 200, result.body);
      const sent = f.calls.at(-1)!;
      assert.equal(sent.url.origin, config.upstreamOrigin);
      assert.equal(sent.body, '');
      assert.equal(sent.headers['Content-Length'], '0');
    }
    const before = f.calls.length;
    assert.equal((await f.app.inject({ method, url: base + path, headers, payload: { identity: 'untrusted' } })).statusCode, 400);
    assert.equal(f.calls.length, before);
    if (path.includes(nodeId)) {
      assert.equal((await f.app.inject({ method, url: base + path.replace(nodeId, 'invalid-uuid'), headers: { ...headers, 'content-type': 'application/json' } })).statusCode, 404);
    }
    const wrongMethod = method === 'DELETE' ? 'POST' : 'PUT';
    assert.equal((await f.app.inject({ method: wrongMethod, url: base + path, headers: { ...headers, 'content-type': 'application/json' } })).statusCode, 404);
  });
}

for (const [path, contentType, body] of [
  ['/api/auth/me', 'application/json', 'not-json'],
  ['', 'text/html', '<html>valid-but-cookie-forbidden</html>'],
  ['/assets/index-BWuDwhpj.js', 'application/javascript', 'console.log("static")'],
] as const) {
  test(`rejected upstream ${path || 'HTML'} cannot issue a cookie`, async t => {
    const f = await fixture(t, { upstream: { statusCode: 200, contentType, body, setCookies: ['portal_session=must-not-commit; Path=/manage; Secure; HttpOnly; SameSite=Strict'] } });
    const result = await f.app.inject({ method: 'GET', url: base + path, headers });
    assert.equal(result.statusCode, 502, result.body);
    assert.equal(result.json().code, 'FIELDNODE_UPSTREAM_INVALID');
    assert.equal(result.headers['set-cookie'], undefined);
  });
}

test('bad local TOTP stays retryable; upstream authority-outage marker survives sanitized 503', async t => {
  const f = await fixture(t, { upstream: json({ sign_in_required: true, private_trace: 'hidden' }, 503) });
  const result = await f.app.inject({ method: 'POST', url: `${base}/api/auth/operatoros/consume`, headers, payload: {} });
  assert.equal(result.statusCode, 502);
  assert.equal(result.json().sign_in_required, true);
  assert.equal(result.body.includes('private_trace'), false);
  const bad = await fixture(t, { upstream: json({ detail: 'Invalid factor' }, 403) });
  const denied = await bad.app.inject({ method: 'POST', url: `${base}/api/auth/operatoros/mfa/verify`, headers, payload: { code: 'bad', csrf: 'nonce' } });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().sign_in_required, undefined);
});

for (const malformed of [null, { ...currentIdentity(), sessionExpiresAt: '2000-01-01T00:00:00.000Z' }, { ...currentIdentity(), tenantId: '' }]) {
  test(`invalid current identity clears private-state authority: ${JSON.stringify(malformed)}`, async t => {
    const f = await fixture(t, { identity: () => malformed ?? false });
    const result = await f.app.inject({ method: 'GET', url: `${base}/api/auth/operatoros/status`, headers });
    assert.equal(result.statusCode, 503);
    assert.equal(result.json().sign_in_required, true);
    assert.equal(f.calls.length, 1);
  });
}

for (const [method, path, type] of [
  ['GET', '', 'text/html'], ['HEAD', '/', 'text/html'],
  ['GET', `/nodes/${nodeId}/console`, 'text/html'],
  ...FIELDNODE_MANAGED_ASSETS.flatMap(file => ['GET', 'HEAD'].map(method => [method, `/assets/${file}`, file.endsWith('.js') ? 'application/javascript' : 'text/css'])),
] as const) {
  test(`frozen HTML/asset ${method} ${path}`, async t => {
    const f = await fixture(t, { upstream: { statusCode: 200, contentType: type!, body: 'frozen-static-bytes', setCookies: [] } });
    const result = await f.app.inject({ method: method as 'GET' | 'HEAD', url: base + path, headers });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.body, method === 'HEAD' ? '' : 'frozen-static-bytes');
    assert.equal(f.calls.length, 2);
  });
}

test('appliance policy mirrors exact frozen allowed_path exclusions without decoding', () => {
  for (const path of ['/api/v1/status', '/api/v1/events?after=2', '/api/v1/library/item/content?offset=1']) assert.equal(fieldNodeAllowedConsolePath(path), true);
  for (const path of ['/api/v1/auth/bootstrap', '/api/v1/auth/login?x=1', '/api/v1/auth/logout', '/api/v1/auth/mfa/status', '/api/v1/portal/session', '/api/v1/a/../b', '/api/v1//a', '/api/v1/%61uth/login', '/api/v1/x?url=https://host', '/api/v1/']) assert.equal(fieldNodeAllowedConsolePath(path), false, path);
  assert.equal(fieldNodeManagementPath('POST', '/manage/api/users'), null);
  assert.equal(fieldNodeManagementPath('GET', '/manage/api/auth/login'), null);
  assert.equal(fieldNodeManagementPath('POST', '/manage/api/device/enroll'), null);
  assert.equal(fieldNodeManagementPath('GET', `/manage/nodes/${nodeId}/api/v1/serial/connect`), null);
  assert.equal(fieldNodeManagementPath('GET', `/manage/nodes/${nodeId}/api/v1/serial/connect`, true)?.kind, 'serial');
});

test('console relay preserves exact bounded headers and bytes with library-specific 1MiB cap', async t => {
  let captured: FieldNodeTransportRequest | undefined;
  const f = await fixture(t, { stream: async input => {
    captured = input;
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: Readable.from(['{"ok":true}']) };
  } });
  const body = Buffer.alloc(1048576, 97);
  const result = await f.app.inject({ method: 'PUT', url: `${base}/nodes/${nodeId}/api/v1/library/item/content?offset=0`, headers: { ...headers, 'content-type': 'application/octet-stream', range: 'bytes=0-', 'last-event-id': 'id-1', 'idempotency-key': 'bounded-key', 'x-fieldnode-grant': 'not-forwarded' }, payload: body });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(captured!.body instanceof Buffer, true);
  assert.equal(Buffer.byteLength(captured!.body!), 1048576);
  assert.equal(captured!.headers['x-fieldnode-grant'], undefined);
  assert.equal(captured!.headers.range, 'bytes=0-');
  assert.equal(captured!.headers['last-event-id'], 'id-1');
  assert.equal(captured!.headers['idempotency-key'], 'bounded-key');
  const denied = await f.app.inject({ method: 'PUT', url: `${base}/nodes/${nodeId}/api/v1/settings`, headers: { ...headers, 'content-type': 'application/octet-stream' }, payload: Buffer.alloc(65537) });
  assert.equal(denied.statusCode, 413);
});

test('stream splitting and backpressure retain at most four queued 32KiB frames', async () => {
  const stream = fieldNodeChunkStream(Readable.from([Buffer.alloc(1024 * 1024)]));
  stream.read(0);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.ok(stream.readableLength <= 4);
  let bytes = 0;
  for await (const chunk of stream) { assert.ok(chunk.length <= 32768); bytes += chunk.length; }
  assert.equal(bytes, 1048576);
});

test('stream error payloads are completion-bounded and size-bounded', async () => {
  await assert.rejects(fieldNodeCollectError(new PassThrough(), 65536, 5));
  await assert.rejects(fieldNodeCollectError(Readable.from([Buffer.alloc(65537)])));
  assert.equal(await fieldNodeCollectError(Readable.from(['{"sign_in_required":true}'])), '{"sign_in_required":true}');
});

test('console strips executable content types and preserves authority-error markers', async t => {
  const f = await fixture(t, { stream: async () => ({ statusCode: 200, headers: { 'content-type': 'text/html' }, body: Readable.from(['<script>untrusted</script>']) }) });
  const result = await f.app.inject({ method: 'GET', url: `${base}/nodes/${nodeId}/api/v1/status`, headers });
  assert.equal(result.statusCode, 200);
  assert.match(String(result.headers['content-type']), /^text\/plain/u);
  const denied = await fixture(t, { stream: async () => ({ statusCode: 503, headers: { 'content-type': 'application/json' }, body: Readable.from(['{"sign_in_required":true,"private_trace":"hidden"}']) }) });
  const error = await denied.app.inject({ method: 'GET', url: `${base}/nodes/${nodeId}/api/v1/events`, headers });
  assert.equal(error.statusCode, 502);
  assert.equal(error.json().sign_in_required, true);
  assert.equal(error.body.includes('private_trace'), false);
});

test('known central rejection at native error-body close cannot commit a local cookie', { timeout: 2000 }, async t => {
  let calls = 0;
  let finishRecheck!: (value: FieldNodeTransportResponse) => void;
  let recheckStarted!: () => void;
  const started = new Promise<void>(resolve => { recheckStarted = resolve; });
  const held = new Promise<FieldNodeTransportResponse>(resolve => { finishRecheck = resolve; });
  const raw = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string | string[]> };
  raw.statusCode = 403;
  raw.headers = { 'content-type': 'application/json', 'set-cookie': ['portal_session=must-not-commit; Path=/manage; Secure; HttpOnly; SameSite=Strict'] };
  raw.once('close', () => finishRecheck(json({ code: 'SESSION_REVOKED' }, 401)));
  let signal: AbortSignal | undefined;
  const f = await fixture(t, {
    authority: async () => { if (++calls === 1) return json(currentIdentity()); recheckStarted(); return held; },
    stream: input => {
      signal = input.signal;
      return fieldNodeOpenStream(input, (_url, _options, callback) => {
        const request = new EventEmitter() as EventEmitter & { end(): void; destroy(): void };
        request.end = () => queueMicrotask(() => callback(raw as unknown as IncomingMessage));
        request.destroy = () => {};
        return request as unknown as ClientRequest;
      });
    },
  });
  const sent = f.app.inject({ method: 'GET', url: `${base}/nodes/${nodeId}/api/v1/events`, headers }).then(value => value);
  await started;
  raw.end('{"detail":"Local factor denied"}');
  const result = await sent;
  assert.equal(signal?.aborted, true);
  assert.equal(result.statusCode, 503, result.body);
  assert.equal(result.json().sign_in_required, true);
  assert.equal(result.headers['set-cookie'], undefined);
  assert.equal(result.body.includes('Local factor denied'), false);
});

test('sixteen active streams per node is an atomic cap; closing channels releases reservations', { timeout: 3000 }, async t => {
  const bodies: PassThrough[] = [];
  const waiting: (() => void)[] = [];
  const f = await fixture(t, { stream: async input => {
    const body = new PassThrough();
    input.signal?.addEventListener('abort', () => body.destroy());
    bodies.push(body); waiting.shift()?.();
    return { statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body };
  } });
  const pending: Promise<unknown>[] = [];
  for (let i = 0; i < 16; i++) {
    const started = new Promise<void>(resolve => waiting.push(resolve));
    pending.push(f.app.inject({ method: 'GET', url: `${base}/nodes/${nodeId}/api/v1/events`, headers }).catch(() => null));
    await started;
  }
  const denied = await f.app.inject({ method: 'GET', url: `${base}/nodes/${nodeId}/api/v1/events`, headers });
  assert.equal(denied.statusCode, 429);
  assert.equal(bodies.length, 16);
  for (const body of bodies) body.end();
  await Promise.all(pending);
  const next = f.app.inject({ method: 'GET', url: `${base}/nodes/${nodeId}/api/v1/events`, headers });
  await new Promise<void>(resolve => waiting.push(resolve));
  bodies[16]!.end();
  assert.equal((await next).statusCode, 200);
});

test('stream header deadline never retries; cancellation destroys a late response', async () => {
  const request = new EventEmitter() as EventEmitter & { end(): void; destroy(): void; destroyed: boolean };
  request.end = () => {}; request.destroyed = false; request.destroy = () => { request.destroyed = true; };
  let deliver!: (response: IncomingMessage) => void;
  const input: FieldNodeTransportRequest = { url: new URL('https://consumer.invalid/nodes/x'), method: 'GET', headers: {}, timeoutMs: 10, maxBytes: 32768 };
  await assert.rejects(fieldNodeOpenStream(input, (_url, options, callback) => {
    deliver = callback; assert.equal(options.rejectUnauthorized, true); return request as unknown as ClientRequest;
  }));
  assert.equal(request.destroyed, true);
  const late = new PassThrough() as PassThrough & { headers: object; statusCode: number };
  late.headers = {}; late.statusCode = 200;
  deliver(late as unknown as IncomingMessage);
  assert.equal(late.destroyed, true);
});

test('pending stream ends on changed central tenant while no device bytes arrive', { timeout: 2000 }, async t => {
  let identity = currentIdentity();
  let signal: AbortSignal | undefined;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const body = new PassThrough();
  const f = await fixture(t, { identity: () => identity, stream: async input => {
    signal = input.signal;
    signal?.addEventListener('abort', () => body.destroy());
    started();
    return { statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body };
  } });
  const sent = f.app.inject({ method: 'GET', url: `${base}/nodes/${nodeId}/api/v1/events`, headers }).catch(() => null);
  await ready;
  identity = { ...identity, tenantId: 'other-tenant' };
  await once(body, 'close');
  await sent;
  assert.equal(signal?.aborted, true);
});

function fakeSocket(state: number = WebSocket.OPEN) {
  const socket = new EventEmitter() as unknown as WebSocket;
  Object.assign(socket, { readyState: state, bufferedAmount: 0, sent: [] as string[],
    send(value: string, _options: object, callback: (error?: Error) => void) { (socket as any).sent.push(value); callback(); },
    close() { Object.assign(socket, { readyState: WebSocket.CLOSED }); socket.emit('close'); },
    terminate() { Object.assign(socket, { readyState: WebSocket.CLOSED }); socket.emit('close'); },
  });
  return socket;
}
test('serial relay bounds messages and pre-open queue; binary/oversize/authority loss close both peers', async () => {
  for (const cause of ['binary', 'oversize', 'queue', 'authority'] as const) {
    const client = fakeSocket();
    const upstream = fakeSocket(cause === 'queue' ? WebSocket.CONNECTING : WebSocket.OPEN);
    const close = fieldNodeRelaySerial(client, upstream, async () => cause !== 'authority', 5);
    if (cause === 'binary') client.emit('message', Buffer.from('x'), true);
    if (cause === 'oversize') client.emit('message', Buffer.alloc(4097), false);
    if (cause === 'queue') for (let i = 0; i < 5; i++) client.emit('message', Buffer.from('x'), false);
    if (cause === 'authority') await once(client, 'close');
    assert.equal(client.readyState, WebSocket.CLOSED);
    assert.equal(upstream.readyState, WebSocket.CLOSED);
    close();
  }
});
test('serial text up to 4096 bytes passes both ways, and one bounded pre-open queue is drained once', () => {
  const client = fakeSocket();
  const upstream = fakeSocket(WebSocket.CONNECTING);
  const close = fieldNodeRelaySerial(client, upstream, async () => true);
  client.emit('message', Buffer.alloc(4096, 97), false);
  Object.assign(upstream, { readyState: WebSocket.OPEN });
  upstream.emit('open');
  upstream.emit('message', Buffer.from('reply'), false);
  assert.equal((upstream as any).sent.length, 1);
  assert.equal((upstream as any).sent[0].length, 4096);
  assert.deepEqual((client as any).sent, ['reply']);
  close();
});
test('actual Fastify serial upgrade forwards only the sole fixed WSS path and closes on central revoke', { timeout: 2000 }, async t => {
  let identity: unknown = currentIdentity();
  const upstream = fakeSocket();
  let captured = '';
  const f = await fixture(t, { identity: () => identity, openSocket: (url, sentHeaders) => {
    captured = url.href;
    assert.equal(sentHeaders.Cookie, headers.cookie);
    assert.equal(sentHeaders.Origin, origin);
    return upstream;
  } });
  const client = await f.app.injectWS(`${base}/nodes/${nodeId}/api/v1/serial/connect`, { headers });
  t.after(() => client.terminate());
  assert.equal(captured, `wss://consumer.invalid/nodes/${nodeId}/api/v1/serial/connect`);
  const ended = once(client, 'close');
  identity = false;
  await ended;
  assert.equal(upstream.readyState, WebSocket.CLOSED);
});

test('sixteen malformed actual handshakes release every reservation before a valid seventeenth upgrade', { timeout: 4000 }, async t => {
  let upstreamOpens = 0;
  const upstream = fakeSocket();
  const f = await fixture(t, { openSocket: () => { upstreamOpens++; return upstream; } });
  for (let i = 0; i < 16; i++) {
    f.app.server.prependOnceListener('upgrade', (request: IncomingMessage) => { request.headers['sec-websocket-key'] = 'invalid'; });
    await assert.rejects(f.app.injectWS(`${base}/nodes/${nodeId}/api/v1/serial/connect`, { headers }), /Unexpected server response: 400/u);
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  assert.equal(upstreamOpens, 0);
  const client = await f.app.injectWS(`${base}/nodes/${nodeId}/api/v1/serial/connect`, { headers });
  t.after(() => client.terminate());
  assert.equal(upstreamOpens, 1);
  const closed = once(client, 'close');
  client.close();
  await closed;
});

test('serial upgrades always require exact Origin; ordinary GET navigation keeps its separate rule', async t => {
  const f = await fixture(t, { openSocket: () => fakeSocket() });
  for (const sentOrigin of [undefined, 'null', 'https://app.operatoros.net']) {
    const sentHeaders: Record<string, string> = { host: headers.host, cookie: headers.cookie };
    if (sentOrigin !== undefined) sentHeaders.origin = sentOrigin;
    await assert.rejects(f.app.injectWS(`${base}/nodes/${nodeId}/api/v1/serial/connect`, { headers: sentHeaders }), /Unexpected server response: 403/u);
  }
  assert.equal(f.calls.length, 0);
  assert.equal((await f.app.inject({ method: 'GET', url: `${base}/api/auth/operatoros/status`, headers: { host: headers.host, cookie: headers.cookie } })).statusCode, 200);
});

for (const mode of ['single', 'fragmented'] as const) {
test(`actual serial receiver rejects ${mode} 4097 bytes before relay delivery, with no global WS limit change`, { timeout: 2000 }, async t => {
  const upstream = fakeSocket();
  const f = await fixture(t, { openSocket: () => upstream });
  const previous = f.app.websocketServer.options.maxPayload;
  const client = await f.app.injectWS(`${base}/nodes/${nodeId}/api/v1/serial/connect`, { headers });
  t.after(() => client.terminate());
  const closed = once(client, 'close');
  if (mode === 'single') client.send('x'.repeat(4097));
  else { client.send('x'.repeat(2048), { fin: false }); client.send('x'.repeat(2049), { fin: true }); }
  const [code] = await closed;
  assert.equal(code, 1009);
  assert.deepEqual((upstream as any).sent, []);
  assert.equal(f.app.websocketServer.options.maxPayload, previous);
  assert.equal(fieldNodeLimitClientSocket(fakeSocket()), false);
});
}
