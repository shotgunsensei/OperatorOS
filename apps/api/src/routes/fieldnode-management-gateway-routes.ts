import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type {} from '@fastify/websocket';
import { fieldNodeManagementPath, type FieldNodeManagementPath } from '../../../../packages/modules/fieldnode-management-paths.js';
import type { FieldNodeIdentityResponse } from '../../../../packages/sdk/src/fieldnode-identity.js';
import { runtimeTrustsProxy } from '../lib/proxy-trust.js';
import {
  FieldNodeGatewayError, fieldNodeBoundedHttps, fieldNodeGatewayConfig, fieldNodeGatewayCookies,
  fieldNodeResponseCookies, isCurrentFieldNodeIdentity,
  type FieldNodeGatewayConfig, type FieldNodeTransport, type FieldNodeTransportResponse,
} from '../lib/fieldnode-management-gateway.js';
import {
  FIELDNODE_AUTHORITY_RECHECK_MS, FIELDNODE_RELAY_NODE_CHANNELS,
  fieldNodeOpenSocket, fieldNodeOpenStream, fieldNodeRelaySerial, fieldNodeCollectError, fieldNodeLimitClientSocket,
  type FieldNodeSocketFactory,
} from '../lib/fieldnode-management-streams.js';

export interface FieldNodeGatewayDependencies {
  readonly config: FieldNodeGatewayConfig | null;
  readonly transport: FieldNodeTransport;
  readonly trustProxy: boolean;
  readonly now: () => number;
  readonly openStream?: typeof fieldNodeOpenStream;
  readonly openSocket?: FieldNodeSocketFactory;
  /** Test clock port; production never exceeds the frozen three-second cadence. */
  readonly recheckMs?: number;
}
const prefix = '/v1/modules/fieldnode/manage';
const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type Cookies = ReturnType<typeof fieldNodeGatewayCookies>;

function json(response: FieldNodeTransportResponse, limit: number): unknown {
  if (!/^application\/json(?:\s*;|$)/iu.test(response.contentType) || Buffer.byteLength(response.body) > limit) throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID');
  try {
    const parsed: unknown = JSON.parse(response.body);
    if (!parsed || typeof parsed !== 'object') throw new Error('Object or array required');
    return parsed;
  } catch { throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID'); }
}
function publicRequestAllowed(request: FastifyRequest, config: FieldNodeGatewayConfig, trustProxy: boolean) {
  const rawHost = trustProxy ? request.headers['x-forwarded-host'] ?? request.headers.host : request.headers.host;
  if (typeof rawHost !== 'string' || rawHost.includes(',') || /[\s\\/#?@]/u.test(rawHost)) return false;
  const origin = request.headers.origin;
  return rawHost.toLowerCase() === new URL(config.publicOrigin).host
    && (['GET', 'HEAD'].includes(request.method) && origin === undefined || origin === config.publicOrigin);
}
function fingerprint(identity: FieldNodeIdentityResponse): string {
  return JSON.stringify([identity.issuer, identity.subject, identity.tenantId, identity.module, identity.membershipRole, identity.moduleAccessLevel]);
}
function forwardedHeaders(request: FastifyRequest, config: FieldNodeGatewayConfig, cookies: Cookies, body?: string | Buffer) {
  const headers: Record<string, string> = {
    Cookie: cookies.upstream, Origin: config.publicOrigin,
    'X-Forwarded-Host': 'fieldnode.operatoros.net', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Prefix': '/manage',
  };
  for (const name of ['content-type', 'accept', 'last-event-id', 'range', 'idempotency-key', 'x-csrf-token']) {
    const value = request.headers[name];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > 1024 || /[\u0000-\u001f\u007f]/u.test(value)) throw new FieldNodeGatewayError(400, 'FIELDNODE_REQUEST_INVALID');
    headers[name] = value;
  }
  if (body !== undefined) headers['Content-Length'] = String(Buffer.byteLength(body));
  return headers;
}

export async function registerFieldNodeManagementGatewayRoutes(
  app: FastifyInstance,
  dependencies: FieldNodeGatewayDependencies = {
    config: fieldNodeGatewayConfig(), transport: fieldNodeBoundedHttps, trustProxy: runtimeTrustsProxy(), now: Date.now,
  },
) {
  const channels = new Map<string, number>();
  const activeStops = new Set<() => void>();
  const readIdentity = async (config: FieldNodeGatewayConfig, cookies: Cookies, signal: AbortSignal) => {
    try {
      const response = await dependencies.transport({
        url: new URL('/v1/modules/fieldnode/identity', config.authorityOrigin), method: 'GET',
        headers: { Cookie: cookies.central, Accept: 'application/json' }, timeoutMs: 2000, maxBytes: 8192, signal,
      });
      if (signal.aborted) throw new Error('Closed');
      if (response.statusCode !== 200) throw new FieldNodeGatewayError([401, 403, 404].includes(response.statusCode) ? response.statusCode : 503, 'FIELDNODE_IDENTITY_REJECTED', true);
      const identity = json(response, 8192);
      if (response.setCookies.length || !isCurrentFieldNodeIdentity(identity, dependencies.now())) throw new Error('Invalid identity');
      return identity;
    } catch (error) {
      if (error instanceof FieldNodeGatewayError && error.signInRequired) throw error;
      throw new FieldNodeGatewayError(503, 'FIELDNODE_IDENTITY_REJECTED', true);
    }
  };
  const authorize = async (request: FastifyRequest, path: FieldNodeManagementPath, lifetime: AbortController) => {
    const config = dependencies.config;
    if (!config) throw new FieldNodeGatewayError(503, 'FIELDNODE_GATEWAY_UNCONFIGURED', true);
    if (!publicRequestAllowed(request, config, dependencies.trustProxy)) throw new FieldNodeGatewayError(403, 'FIELDNODE_ORIGIN_REJECTED');
    if (path.kind === 'serial' && request.headers.origin !== config.publicOrigin) throw new FieldNodeGatewayError(403, 'FIELDNODE_ORIGIN_REJECTED');
    let cookies: Cookies;
    try { cookies = fieldNodeGatewayCookies(request.headers.cookie); }
    catch { throw new FieldNodeGatewayError(401, 'FIELDNODE_SESSION_REQUIRED', true); }
    if (!['GET', 'HEAD'].includes(request.method)) {
      const csrf = request.headers['x-csrf-token'];
      if (!cookies.csrf || typeof csrf !== 'string' || csrf !== cookies.csrf || csrf.length > 1024 || /[\s,;\u0000-\u001f\u007f]/u.test(csrf)) throw new FieldNodeGatewayError(403, 'FIELDNODE_CSRF_REJECTED');
    }
    const identity = await readIdentity(config, cookies, lifetime.signal);
    if (lifetime.signal.aborted) throw new FieldNodeGatewayError(503, 'FIELDNODE_IDENTITY_REJECTED', true);
    if (path.nodeId && (channels.get(path.nodeId) ?? 0) >= FIELDNODE_RELAY_NODE_CHANNELS) throw new FieldNodeGatewayError(429, 'FIELDNODE_CHANNEL_LIMIT');
    return { config, cookies, identity };
  };
  const watch = (nodeId: string, config: FieldNodeGatewayConfig, cookies: Cookies, identity: FieldNodeIdentityResponse, lifetime: AbortController) => {
    if ((channels.get(nodeId) ?? 0) >= FIELDNODE_RELAY_NODE_CHANNELS) throw new FieldNodeGatewayError(429, 'FIELDNODE_CHANNEL_LIMIT');
    channels.set(nodeId, (channels.get(nodeId) ?? 0) + 1);
    let stopped = false;
    let pending = false;
    const expiry = setTimeout(() => lifetime.abort(), Math.max(0, Date.parse(identity.sessionExpiresAt) - dependencies.now()));
    const timer = setInterval(() => {
      if (pending || lifetime.signal.aborted) return;
      pending = true;
      void readIdentity(config, cookies, lifetime.signal).then(current => {
        if (fingerprint(current) !== fingerprint(identity)) lifetime.abort();
      }, () => lifetime.abort()).finally(() => { pending = false; });
    }, Math.min(dependencies.recheckMs ?? FIELDNODE_AUTHORITY_RECHECK_MS, FIELDNODE_AUTHORITY_RECHECK_MS));
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      clearTimeout(expiry);
      lifetime.signal.removeEventListener('abort', stop);
      lifetime.abort();
      const remaining = (channels.get(nodeId) ?? 1) - 1;
      if (remaining) channels.set(nodeId, remaining); else channels.delete(nodeId);
      activeStops.delete(stop);
    };
    activeStops.add(stop);
    lifetime.signal.addEventListener('abort', stop, { once: true });
    if (lifetime.signal.aborted) stop();
    return stop;
  };
  await app.register(async scope => {
    const parseJson = scope.getDefaultJsonParser('error', 'error');
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
      // The frozen managed UI has five exact method/path bodyless operations.
      // Only that classified allowlist accepts empty JSON; other routes retain
      // default prototype-poisoning and malformed/empty JSON rejection.
      if (!Buffer.isBuffer(body)) { done(new FieldNodeGatewayError(400, 'FIELDNODE_REQUEST_INVALID')); return; }
      const path = fieldNodeManagementPath(request.method, `/manage${request.url.slice(prefix.length)}`);
      if (body.length > (path?.bodyLimit ?? 0)) { done(new FieldNodeGatewayError(413, 'FIELDNODE_REQUEST_INVALID')); return; }
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(body); }
      catch { done(new FieldNodeGatewayError(400, 'FIELDNODE_REQUEST_INVALID')); return; }
      if (text === '' && path?.bodyless) done(null, {});
      else parseJson(request, text, done);
    });
    scope.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    scope.addHook('onRequest', async (request, reply) => {
      reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache').header('Referrer-Policy', 'no-referrer').header('X-Content-Type-Options', 'nosniff');
      if (!fieldNodeManagementPath(request.method, `/manage${request.url.slice(prefix.length)}`, request.headers.upgrade?.toLowerCase() === 'websocket')) throw new FieldNodeGatewayError(404, 'FIELDNODE_GATEWAY_ROUTE_NOT_REGISTERED');
    });
    scope.setErrorHandler((error, _request, reply) => {
      reply.removeHeader('Set-Cookie');
      const value = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
      const statusCode = error instanceof FieldNodeGatewayError ? error.statusCode : typeof value === 'number' && value >= 400 && value < 500 ? value : 503;
      const code = error instanceof FieldNodeGatewayError ? error.code : statusCode < 500 ? 'FIELDNODE_REQUEST_INVALID' : 'FIELDNODE_UPSTREAM_UNAVAILABLE';
      return reply.code(statusCode).send({ error: 'FieldNode management request could not be completed', code,
        ...(error instanceof FieldNodeGatewayError && error.signInRequired ? { sign_in_required: true } : {}),
      });
    });
    scope.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'FieldNode management route is not registered', code: 'FIELDNODE_GATEWAY_ROUTE_NOT_REGISTERED' }));
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
      const path = fieldNodeManagementPath(request.method, `/manage${request.url.slice(prefix.length)}`);
      if (!path) throw new FieldNodeGatewayError(404, 'FIELDNODE_GATEWAY_ROUTE_NOT_REGISTERED');
      const lifetime = new AbortController();
      const clientClosed = () => lifetime.abort();
      reply.raw.once('close', clientClosed);
      let detached = false;
      let stop: (() => void) | undefined;
      try {
        let body: string | Buffer | undefined;
        if (!['GET', 'HEAD'].includes(request.method)) {
          if (path.kind === 'portal') {
            if (!/^application\/json(?:\s*;|$)/iu.test(String(request.headers['content-type'] ?? '')) || !request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw new FieldNodeGatewayError(400, 'FIELDNODE_REQUEST_INVALID');
            if (path.bodyless && Object.keys(request.body).length !== 0) throw new FieldNodeGatewayError(400, 'FIELDNODE_REQUEST_INVALID');
            if (path.upstreamPath.endsWith('/mfa/verify') && (request.body as Record<string, unknown>).csrf !== request.headers['x-csrf-token']) throw new FieldNodeGatewayError(403, 'FIELDNODE_CSRF_REJECTED');
          }
          body = Buffer.isBuffer(request.body) ? request.body : typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
          if (path.bodyless) body = '';
          if (Buffer.byteLength(body) > path.bodyLimit) throw new FieldNodeGatewayError(413, 'FIELDNODE_REQUEST_INVALID');
        }
        const { config, cookies, identity } = await authorize(request, path, lifetime);
        const headers = forwardedHeaders(request, config, cookies, body);
        const remaining = Date.parse(identity.sessionExpiresAt) - dependencies.now();
        if (path.kind === 'console') {
          stop = watch(path.nodeId!, config, cookies, identity, lifetime);
          const result = await (dependencies.openStream ?? fieldNodeOpenStream)({
            url: new URL(path.upstreamPath, config.upstreamOrigin), method: request.method as typeof methods[number], headers, body,
            timeoutMs: Math.min(120000, remaining), maxBytes: 32768, signal: lifetime.signal,
          });
          if (lifetime.signal.aborted || result.statusCode < 200 || result.statusCode >= 300 && result.statusCode < 400) {
            result.body.destroy();
            throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID');
          }
          if (result.statusCode >= 400) {
            const collected = await fieldNodeCollectError(result.body);
            if (lifetime.signal.aborted) throw new FieldNodeGatewayError(503, 'FIELDNODE_IDENTITY_REJECTED', true);
            const payload = json({ statusCode: result.statusCode, contentType: String(result.headers['content-type'] ?? ''), body: collected, setCookies: [] }, 65536);
            if (result.statusCode >= 500) throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID', (payload as { sign_in_required?: unknown }).sign_in_required === true);
            const rawCookies = result.headers['set-cookie'];
            const outgoing = fieldNodeResponseCookies(Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : []);
            if (lifetime.signal.aborted) throw new FieldNodeGatewayError(503, 'FIELDNODE_IDENTITY_REJECTED', true);
            if (!isCurrentFieldNodeIdentity(identity, dependencies.now())) throw new FieldNodeGatewayError(401, 'FIELDNODE_IDENTITY_REJECTED', true);
            if (outgoing.length) reply.header('Set-Cookie', outgoing);
            return reply.code(result.statusCode).send(payload);
          }
          if (result.headers['set-cookie']) { result.body.destroy(); throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID'); }
          if (lifetime.signal.aborted) { result.body.destroy(); throw new FieldNodeGatewayError(503, 'FIELDNODE_IDENTITY_REJECTED', true); }
          if (!isCurrentFieldNodeIdentity(identity, dependencies.now())) { result.body.destroy(); throw new FieldNodeGatewayError(401, 'FIELDNODE_IDENTITY_REJECTED', true); }
          const contentType = String(result.headers['content-type'] ?? '').split(';', 1)[0]!.toLowerCase();
          const safeType = ['application/json', 'text/event-stream', 'application/octet-stream', 'text/plain'].includes(contentType) ? String(result.headers['content-type']) : 'text/plain; charset=utf-8';
          reply.type(safeType);
          for (const name of ['content-length', 'content-disposition']) {
            const value = result.headers[name];
            if (typeof value === 'string' && value.length < 1024 && !/[\u0000-\u001f\u007f]/u.test(value)
              && (name === 'content-length' ? /^\d+$/u.test(value) : value.startsWith('attachment'))) reply.header(name, value);
          }
          if (contentType === 'application/octet-stream' && !reply.hasHeader('Content-Disposition')) reply.header('Content-Disposition', 'attachment');
          reply.code(result.statusCode);
          detached = true;
          const finish = () => { stop?.(); reply.raw.removeListener('close', clientClosed); };
          result.body.once('close', finish);
          reply.raw.once('close', () => { result.body.destroy(); finish(); });
          return reply.send(result.body);
        }
        const result = await dependencies.transport({
          url: new URL(path.upstreamPath, config.upstreamOrigin), method: request.method as typeof methods[number], headers, body,
          timeoutMs: Math.min(3000, remaining), maxBytes: path.kind === 'portal' ? 65536 : 4 * 1024 * 1024, signal: lifetime.signal,
        });
        if (lifetime.signal.aborted) throw new FieldNodeGatewayError(503, 'FIELDNODE_UPSTREAM_UNAVAILABLE');
        if (result.statusCode < 200 || result.statusCode >= 500 || result.statusCode >= 300 && result.statusCode < 400) {
          let signInRequired = false;
          try { signInRequired = (json(result, 65536) as { sign_in_required?: unknown }).sign_in_required === true; } catch { /* fixed error below */ }
          throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID', signInRequired);
        }
        const outgoingCookies = fieldNodeResponseCookies(result.setCookies);
        const payload = path.kind === 'portal' ? json(result, 65536) : undefined;
        if (lifetime.signal.aborted) throw new FieldNodeGatewayError(503, 'FIELDNODE_IDENTITY_REJECTED', true);
        if (!isCurrentFieldNodeIdentity(identity, dependencies.now())) throw new FieldNodeGatewayError(401, 'FIELDNODE_IDENTITY_REJECTED', true);
        if (path.kind === 'portal') {
          if (outgoingCookies.length) reply.header('Set-Cookie', outgoingCookies);
          return reply.code(result.statusCode).send(payload);
        }
        const expected = path.kind === 'html' ? /^text\/html(?:\s*;|$)/iu : path.upstreamPath.endsWith('.js') ? /^(?:text|application)\/javascript(?:\s*;|$)/iu : /^text\/css(?:\s*;|$)/iu;
        if (!expected.test(result.contentType) || result.setCookies.length) throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID');
        return reply.code(result.statusCode).type(result.contentType).send(request.method === 'HEAD' ? '' : result.body);
      } finally { if (!detached) { stop?.(); reply.raw.removeListener('close', clientClosed); } }
    };
    for (const url of ['/', '/*']) scope.route({ method: [...methods], url, bodyLimit: 1048576, handler });
    const authorized = new WeakMap<FastifyRequest, Awaited<ReturnType<typeof authorize>> & { stop(): void; lifetime: AbortController; path: FieldNodeManagementPath }>();
    scope.addHook('onResponse', async request => { const context = authorized.get(request); if (context) { authorized.delete(request); context.stop(); } });
    scope.route({ method: 'GET', url: '/nodes/:nodeId/api/v1/serial/connect',
      preValidation: async (request, reply) => {
        const path = fieldNodeManagementPath('GET', `/manage${request.url.slice(prefix.length)}`, true);
        if (!path || request.headers.upgrade?.toLowerCase() !== 'websocket') throw new FieldNodeGatewayError(426, 'FIELDNODE_WEBSOCKET_REQUIRED');
        const lifetime = new AbortController();
        const closed = () => lifetime.abort();
        // The public reply socket also exists for in-memory Fastify upgrades,
        // whose synthetic IncomingMessage may not have its own .socket.
        const rawSocket = reply.raw.socket ?? request.raw.socket;
        rawSocket?.once('close', closed);
        try {
          const context = await authorize(request, path, lifetime);
          // Do not reserve a channel until the WS library has accepted the
          // handshake. Invalid keys/protocols never enter wsHandler.
          const stop = () => { rawSocket?.removeListener('close', closed); lifetime.abort(); };
          authorized.set(request, { ...context, stop, lifetime, path });
        } catch (error) { rawSocket?.removeListener('close', closed); throw error; }
      },
      handler: async (_request, reply) => reply.code(426).send({ code: 'FIELDNODE_WEBSOCKET_REQUIRED' }),
      wsHandler: (socket, request) => {
        const context = authorized.get(request);
        if (!context) { socket.close(1008); return; }
        authorized.delete(request);
        if (context.lifetime.signal.aborted || !isCurrentFieldNodeIdentity(context.identity, dependencies.now()) || !fieldNodeLimitClientSocket(socket)) { context.stop(); socket.close(1008, 'FieldNode serial transport unavailable'); return; }
        const url = new URL(context.path.upstreamPath, context.config.upstreamOrigin);
        url.protocol = 'wss:';
        try {
          watch(context.path.nodeId!, context.config, context.cookies, context.identity, context.lifetime);
          const upstream = (dependencies.openSocket ?? fieldNodeOpenSocket)(url, forwardedHeaders(request, context.config, context.cookies), Math.min(120000, Date.parse(context.identity.sessionExpiresAt) - dependencies.now()));
          const close = fieldNodeRelaySerial(socket, upstream, async () => !context.lifetime.signal.aborted, dependencies.recheckMs);
          context.lifetime.signal.addEventListener('abort', close, { once: true });
          for (const peer of [socket, upstream]) peer.once('close', context.stop);
        } catch { context.stop(); socket.close(1008, 'FieldNode channel unavailable'); }
      },
    });
    scope.addHook('onClose', async () => { for (const stop of [...activeStops]) stop(); });
  }, { prefix });
}
