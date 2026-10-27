import { EventEmitter } from 'node:events';
import Fastify from 'fastify';
import { databasePool } from '../../src/db.js';
import {
  OpenAiRealtimeSipAdapter, type RealtimeSocket,
} from '../../src/lib/callcommand-realtime.js';
import { reconcileCallCommandTerminalUsage } from '../../src/lib/callcommand-capacity.js';
import {
  __setCallCommandRealtimeAdapterFactoryForTests, registerCallCommandRealtimeRoutes,
} from '../../src/routes/callcommand-realtime-routes.js';
import { hasCallCommandRealtimeSideband } from '../../src/lib/callcommand-realtime-session-registry.js';

const marker = process.env.CALLCOMMAND_RESTART_WORKER_MARKER;
if (!process.send || !marker || !/^[a-f0-9]{32}$/.test(marker)
  || process.env.APP_ENV !== 'test' || process.env.NODE_ENV !== 'test') {
  throw new Error('Explicit isolated restart worker required');
}

const actions: string[] = [];
const sentTypes: string[] = [];
let sockets = 0;
class SyntheticSocket extends EventEmitter implements RealtimeSocket {
  readyState = 0;
  constructor() {
    super(); sockets++;
    setImmediate(() => { this.readyState = 1; this.emit('open'); });
  }
  send(data: string, callback?: (error?: Error) => void): void {
    const parsed: unknown = JSON.parse(data);
    if (parsed && typeof parsed === 'object' && 'type' in parsed && typeof parsed.type === 'string') sentTypes.push(parsed.type);
    callback?.();
  }
  close(code = 1000): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close', code);
  }
}

const adapter = new OpenAiRealtimeSipAdapter({
  env: process.env,
  // The actual SDK verifies webhook signatures locally. Only remote actions
  // and media are replaced; no HTTP or websocket leaves this process.
  fetch: async input => {
    const url = new URL(String(input));
    if (url.origin !== 'https://api.openai.com' || !/^\/v1\/realtime\/calls\/[A-Za-z0-9_-]+\/(accept|reject|refer|hangup)$/.test(url.pathname)) {
      throw new Error('Unexpected synthetic provider operation');
    }
    actions.push(url.pathname.split('/').at(-1)!);
    return new Response(null, { status: 200 });
  },
  socketFactory: () => new SyntheticSocket(),
});
__setCallCommandRealtimeAdapterFactoryForTests(() => adapter);

const app = Fastify({ logger: false });
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
  (request as typeof request & { rawBody: Buffer }).rawBody = raw;
  try { done(null, JSON.parse(raw.toString('utf8'))); } catch { done(new Error('Invalid fixture JSON')); }
});
await registerCallCommandRealtimeRoutes(app);
await app.ready();
const stats = () => ({ actions: [...actions], sockets, greetings: sentTypes.filter(type => type === 'response.create').length });
const send = (value: unknown) => process.send?.(value);

interface InjectCommand {
  type: 'inject'; id: string; callId: string; rawBody: string; headers: Record<string, string>;
}
interface ReconcileCommand {
  type: 'reconcile'; id: string; callId: string; tenantId: string; eventId: string; startedAt: string;
}
interface StopCommand { type: 'stop'; id: string }
function command(value: unknown): InjectCommand | ReconcileCommand | StopCommand {
  if (!value || typeof value !== 'object' || !('type' in value) || !('id' in value) || typeof value.id !== 'string') throw new Error('Invalid restart command');
  if (value.type === 'stop') return { type: 'stop', id: value.id };
  if (value.type === 'inject' && 'callId' in value && typeof value.callId === 'string'
    && 'rawBody' in value && typeof value.rawBody === 'string' && 'headers' in value
    && value.headers && typeof value.headers === 'object' && !Array.isArray(value.headers)) {
    const headers = Object.fromEntries(Object.entries(value.headers).map(([name, content]) => {
      if (typeof content !== 'string') throw new Error('Invalid restart header');
      return [name, content];
    }));
    return { type: 'inject', id: value.id, callId: value.callId, rawBody: value.rawBody, headers };
  }
  if (value.type === 'reconcile' && 'callId' in value && typeof value.callId === 'string'
    && 'tenantId' in value && typeof value.tenantId === 'string' && 'eventId' in value && typeof value.eventId === 'string'
    && 'startedAt' in value && typeof value.startedAt === 'string') {
    return { type: 'reconcile', id: value.id, callId: value.callId, tenantId: value.tenantId, eventId: value.eventId, startedAt: value.startedAt };
  }
  throw new Error('Unsupported restart command');
}

let sequence = Promise.resolve();
process.on('message', value => {
  sequence = sequence.then(async () => {
    const input = command(value);
    if (input.type === 'stop') {
      await app.close(); await databasePool.end();
      send({ type: 'result', id: input.id, statusCode: 200, body: { stopped: true }, stats: stats(), registryActive: false });
      process.disconnect(); return;
    }
    if (input.type === 'inject') {
      const response = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/openai/realtime/incoming', headers: { 'content-type': 'application/json', ...input.headers }, payload: input.rawBody });
      send({ type: 'result', id: input.id, statusCode: response.statusCode, body: response.json<unknown>(), stats: stats(), registryActive: hasCallCommandRealtimeSideband(input.callId) });
      return;
    }
    const result = await reconcileCallCommandTerminalUsage({
      tenantId: input.tenantId, callId: input.callId, terminalEventId: input.eventId,
      providerSequence: 1, providerOutcome: 'completed',
      usage: { startedAt: input.startedAt, answeredAt: input.startedAt, endedAt: new Date().toISOString(), providerCostMinor: 0, aiInputTokens: 0, aiOutputTokens: 0, aiInputMinorPerMillion: 0, aiOutputMinorPerMillion: 0 },
    });
    send({ type: 'result', id: input.id, statusCode: 200, body: { duplicate: result.duplicate }, stats: stats(), registryActive: hasCallCommandRealtimeSideband(input.callId) });
  }).catch(error => {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'RESTART_WORKER_FAILURE';
    send({ type: 'failure', code });
    process.exitCode = 1;
  });
});
send({ type: 'ready', pid: process.pid, marker });
