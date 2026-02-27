import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import type { HealthResponse, ExecRequest } from '../../../packages/sdk/src/index.js';
import type { WebSocketMessage } from '../../../packages/sdk/src/events.js';
import {
  createWorkspaceRunner,
  stopWorkspaceRunner,
  getWorkspaceRunnerStatus,
  execInRunner,
} from './provisioner.js';
import { isCommandAllowed, clampTimeout, truncateOutput } from './safety.js';

const startTime = Date.now();

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  },
});

await app.register(cors, { origin: true });
await app.register(websocket);

const streamSubscribers = new Map<string, Set<import('ws').WebSocket>>();

app.get('/healthz', async (_req, reply) => {
  const response: HealthResponse = {
    status: 'healthy',
    service: 'veridian-runner-gateway',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };
  return reply.send(response);
});

app.get('/readyz', async (_req, reply) => {
  return reply.send({ ready: true });
});

app.post<{ Body: { workspaceId: string; profileId: string; profileImage: string; gitUrl: string; gitRef: string } }>(
  '/v1/runner/create',
  async (req, reply) => {
    const { workspaceId, profileId, profileImage, gitUrl, gitRef } = req.body;
    if (!workspaceId || !profileImage || !gitUrl || !gitRef) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    const result = await createWorkspaceRunner(workspaceId, profileId, profileImage, gitUrl, gitRef);
    return reply.status(result.success ? 201 : 500).send(result);
  },
);

app.post<{ Body: { workspaceId: string } }>(
  '/v1/runner/stop',
  async (req, reply) => {
    const { workspaceId } = req.body;
    if (!workspaceId) {
      return reply.status(400).send({ error: 'Missing workspaceId' });
    }

    const result = await stopWorkspaceRunner(workspaceId);
    return reply.status(result.success ? 200 : 500).send(result);
  },
);

app.get<{ Params: { workspaceId: string } }>(
  '/v1/runner/status/:workspaceId',
  async (req, reply) => {
    const { workspaceId } = req.params;
    const status = await getWorkspaceRunnerStatus(workspaceId);
    if (!status) {
      return reply.status(404).send({ error: 'Runner not found' });
    }
    return reply.send(status);
  },
);

app.post<{ Body: ExecRequest }>(
  '/v1/runner/exec',
  async (req, reply) => {
    const { workspaceId, cmd, timeoutSec } = req.body;
    if (!workspaceId || !cmd) {
      return reply.status(400).send({ error: 'Missing workspaceId or cmd' });
    }

    const safety = isCommandAllowed(cmd);
    if (!safety.allowed) {
      return reply.status(403).send({ error: safety.reason });
    }

    const timeout = clampTimeout(timeoutSec);

    const subscribers = streamSubscribers.get(workspaceId);

    const broadcast = (type: string, message: string) => {
      if (!subscribers || subscribers.size === 0) return;
      const event: WebSocketMessage = {
        type: type as WebSocketMessage['type'],
        payload: { workspaceId, message, ts: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      };
      const data = JSON.stringify(event);
      for (const ws of subscribers) {
        if (ws.readyState === 1) ws.send(data);
      }
    };

    const result = await execInRunner(
      workspaceId,
      cmd,
      timeout,
      (line) => broadcast('stream:stdout', line),
      (line) => broadcast('stream:stderr', line),
    );

    const stdoutResult = truncateOutput(result.stdout);
    const stderrResult = truncateOutput(result.stderr);

    if (subscribers && subscribers.size > 0) {
      const exitEvent: WebSocketMessage = {
        type: 'stream:exit',
        payload: { workspaceId, exitCode: result.exitCode, durationMs: result.durationMs },
        timestamp: new Date().toISOString(),
      };
      const exitData = JSON.stringify(exitEvent);
      for (const ws of subscribers) {
        if (ws.readyState === 1) ws.send(exitData);
      }
    }

    return reply.send({
      exitCode: result.exitCode,
      stdout: stdoutResult.text,
      stderr: stderrResult.text,
      durationMs: result.durationMs,
      truncated: stdoutResult.truncated || stderrResult.truncated,
    });
  },
);

app.get<{ Params: { workspaceId: string } }>(
  '/v1/runner/stream/:workspaceId',
  { websocket: true },
  (socket, req) => {
    const workspaceId = (req.params as { workspaceId: string }).workspaceId;

    if (!streamSubscribers.has(workspaceId)) {
      streamSubscribers.set(workspaceId, new Set());
    }
    streamSubscribers.get(workspaceId)!.add(socket);

    app.log.info({ workspaceId }, 'Stream subscriber connected');

    const ack: WebSocketMessage = {
      type: 'stream:status',
      payload: { workspaceId, message: 'subscribed', ts: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    };
    socket.send(JSON.stringify(ack));

    socket.on('close', () => {
      const subs = streamSubscribers.get(workspaceId);
      if (subs) {
        subs.delete(socket);
        if (subs.size === 0) streamSubscribers.delete(workspaceId);
      }
      app.log.info({ workspaceId }, 'Stream subscriber disconnected');
    });
  },
);

app.get('/v1/runner/sessions/active', async (_req, reply) => {
  const sessions = Array.from(streamSubscribers.entries()).map(([id, sockets]) => ({
    workspaceId: id,
    connections: sockets.size,
  }));
  return reply.send({ sessions, total: sessions.length });
});

app.get('/', async (_req, reply) => {
  return reply.send({
    name: 'VeridianCDE Runner Gateway',
    version: '0.1.0',
    endpoints: {
      health: '/healthz',
      ready: '/readyz',
      createRunner: 'POST /v1/runner/create',
      stopRunner: 'POST /v1/runner/stop',
      runnerStatus: 'GET /v1/runner/status/:workspaceId',
      exec: 'POST /v1/runner/exec',
      stream: 'WS /v1/runner/stream/:workspaceId',
    },
  });
});

const port = parseInt(process.env.GATEWAY_PORT ?? '5000', 10);
const host = '0.0.0.0';

try {
  await app.listen({ port, host });
  console.info(`VeridianCDE Runner Gateway listening on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
