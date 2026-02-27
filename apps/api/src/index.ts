import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { HealthResponse } from '../../../packages/sdk/src/index.js';

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

app.get('/', async (_req, reply) => {
  return reply.send({
    name: 'VeridianCDE API',
    version: '0.1.0',
    endpoints: {
      health: '/healthz',
      ready: '/readyz',
      workspaces: '/api/v1/workspaces',
      sessions: '/api/v1/sessions',
    },
  });
});

app.get('/healthz', async (_req, reply) => {
  const response: HealthResponse = {
    status: 'healthy',
    service: 'veridian-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };
  return reply.send(response);
});

app.get('/readyz', async (_req, reply) => {
  return reply.send({ ready: true });
});

app.get('/api/v1/workspaces', async (_req, reply) => {
  return reply.send({ workspaces: [], total: 0 });
});

app.get('/api/v1/sessions', async (_req, reply) => {
  return reply.send({ sessions: [], total: 0 });
});

const port = parseInt(process.env.API_PORT ?? '5000', 10);
const host = '0.0.0.0';

try {
  await app.listen({ port, host });
  console.info(`VeridianCDE API listening on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
