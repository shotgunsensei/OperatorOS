import Fastify from 'fastify';
import cors from '@fastify/cors';
import { eq } from 'drizzle-orm';
import type { HealthResponse, CreateWorkspaceRequest } from '../../../packages/sdk/src/index.js';
import { getProfile, getProfileImage } from '../../../packages/profiles/src/index.js';
import { db } from './db.js';
import { workspaces } from './schema.js';

const startTime = Date.now();
const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:4001';

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
      createWorkspace: 'POST /v1/workspaces',
      listWorkspaces: 'GET /v1/workspaces',
      getWorkspace: 'GET /v1/workspaces/:id',
      startWorkspace: 'POST /v1/workspaces/:id/start',
      execInWorkspace: 'POST /v1/workspaces/:id/exec',
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

app.post<{ Body: CreateWorkspaceRequest }>(
  '/v1/workspaces',
  async (req, reply) => {
    const { gitUrl, gitRef, profileId } = req.body;
    if (!gitUrl) {
      return reply.status(400).send({ error: 'gitUrl is required' });
    }

    const profile = getProfile(profileId ?? 'node20');
    if (!profile) {
      return reply.status(400).send({ error: `Unknown profile: ${profileId}` });
    }

    const [ws] = await db.insert(workspaces).values({
      gitUrl,
      gitRef: gitRef ?? 'main',
      profileId: profileId ?? 'node20',
      status: 'pending',
    }).returning();

    return reply.status(201).send(ws);
  },
);

app.get('/v1/workspaces', async (_req, reply) => {
  const rows = await db.select().from(workspaces);
  return reply.send({ workspaces: rows, total: rows.length });
});

app.get<{ Params: { id: string } }>(
  '/v1/workspaces/:id',
  async (req, reply) => {
    const { id } = req.params;
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }
    return reply.send(ws);
  },
);

app.post<{ Params: { id: string } }>(
  '/v1/workspaces/:id/start',
  async (req, reply) => {
    const { id } = req.params;
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    const profileImage = getProfileImage(ws.profileId);

    await db.update(workspaces)
      .set({ status: 'provisioning', updatedAt: new Date() })
      .where(eq(workspaces.id, id));

    try {
      const resp = await fetch(`${GATEWAY_URL}/v1/runner/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: id,
          profileId: ws.profileId,
          profileImage,
          gitUrl: ws.gitUrl,
          gitRef: ws.gitRef,
        }),
      });
      const result = await resp.json() as { success: boolean; message: string };

      const newStatus = result.success ? 'running' : 'error';
      await db.update(workspaces)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(workspaces.id, id));

      return reply.status(resp.status).send(result);
    } catch (err) {
      await db.update(workspaces)
        .set({ status: 'error', updatedAt: new Date() })
        .where(eq(workspaces.id, id));

      return reply.status(502).send({
        error: 'Failed to contact runner-gateway',
        detail: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  },
);

app.post<{ Params: { id: string }; Body: { cmd: string; timeoutSec?: number } }>(
  '/v1/workspaces/:id/exec',
  async (req, reply) => {
    const { id } = req.params;
    const { cmd, timeoutSec } = req.body;

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    try {
      const resp = await fetch(`${GATEWAY_URL}/v1/runner/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: id, cmd, timeoutSec }),
      });
      const result = await resp.json();
      return reply.status(resp.status).send(result);
    } catch (err) {
      return reply.status(502).send({
        error: 'Failed to contact runner-gateway',
        detail: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  },
);

const port = parseInt(process.env.API_PORT ?? '5000', 10);
const host = '0.0.0.0';

try {
  await app.listen({ port, host });
  console.info(`VeridianCDE API listening on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
