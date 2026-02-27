import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import type { HealthResponse } from '../../../packages/sdk/src/index.js';
import type { WebSocketMessage, RunnerConnectPayload, RunnerOutputPayload } from '../../../packages/sdk/src/events.js';

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

const activeSessions = new Map<string, Set<import('ws').WebSocket>>();

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

app.get('/ws', { websocket: true }, (socket, _req) => {
  let sessionId: string | null = null;

  socket.on('message', (raw: Buffer) => {
    try {
      const msg: WebSocketMessage = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'runner:connect': {
          const payload = msg.payload as RunnerConnectPayload;
          sessionId = payload.sessionId;

          if (!activeSessions.has(sessionId)) {
            activeSessions.set(sessionId, new Set());
          }
          activeSessions.get(sessionId)!.add(socket);

          const ack: WebSocketMessage = {
            type: 'runner:connect',
            payload: { sessionId, status: 'connected' },
            timestamp: new Date().toISOString(),
            correlationId: msg.correlationId,
          };
          socket.send(JSON.stringify(ack));
          break;
        }

        case 'runner:output': {
          const outputPayload = msg.payload as RunnerOutputPayload;
          const listeners = activeSessions.get(outputPayload.sessionId);
          if (listeners) {
            const broadcast = JSON.stringify(msg);
            for (const listener of listeners) {
              if (listener !== socket && listener.readyState === 1) {
                listener.send(broadcast);
              }
            }
          }
          break;
        }

        default: {
          app.log.warn({ type: msg.type }, 'Unhandled WebSocket message type');
        }
      }
    } catch (err) {
      app.log.error({ err }, 'Failed to parse WebSocket message');
      const errorMsg: WebSocketMessage = {
        type: 'runner:error',
        payload: { error: 'Invalid message format' },
        timestamp: new Date().toISOString(),
      };
      socket.send(JSON.stringify(errorMsg));
    }
  });

  socket.on('close', () => {
    if (sessionId && activeSessions.has(sessionId)) {
      const listeners = activeSessions.get(sessionId)!;
      listeners.delete(socket);
      if (listeners.size === 0) {
        activeSessions.delete(sessionId);
      }
    }
  });
});

app.get('/api/v1/sessions/active', async (_req, reply) => {
  const sessions = Array.from(activeSessions.entries()).map(([id, sockets]) => ({
    sessionId: id,
    connections: sockets.size,
  }));
  return reply.send({ sessions, total: sessions.length });
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
