import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { eq, desc } from 'drizzle-orm';
import type {
  HealthResponse,
  CreateWorkspaceRequest,
  ApplyPatchResult,
  VerifyResult,
  VerifyCheckResult,
} from '../../../packages/sdk/src/index.js';
import { validatePatchPaths, MAX_PATCH_SIZE } from '../../../packages/sdk/src/index.js';
import type { WebSocketMessage } from '../../../packages/sdk/src/events.js';
import { getProfile, getProfileImage, getVerifyPlan, listProfiles } from '../../../packages/profiles/src/index.js';
import {
  createWorkspaceRunner,
  stopWorkspaceRunner,
  getWorkspaceRunnerStatus,
  execInRunner,
  getRunnerMode,
} from '../../../apps/runner-gateway/src/provisioner.js';
import { isCommandAllowed, clampTimeout, truncateOutput } from '../../../apps/runner-gateway/src/safety.js';
import { db } from './db.js';
import { workspaces, runners, tasks, taskEvents, toolTraces } from './schema.js';
import { serveUI } from './ui.js';

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

async function ensureTables() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      git_url TEXT NOT NULL,
      git_ref TEXT NOT NULL DEFAULT 'main',
      profile_id TEXT NOT NULL DEFAULT 'node20',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);

    CREATE TABLE IF NOT EXISTS runners (
      workspace_id VARCHAR(36) PRIMARY KEY REFERENCES workspaces(id),
      mode TEXT NOT NULL DEFAULT 'docker',
      pod_name TEXT,
      namespace TEXT,
      pvc_name TEXT,
      container_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TIMESTAMP,
      stopped_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      required_checks JSONB,
      check_results JSONB,
      result_summary TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      started_at TIMESTAMP,
      finished_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);

    CREATE TABLE IF NOT EXISTS task_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(36) NOT NULL REFERENCES tasks(id),
      ts TIMESTAMP DEFAULT NOW() NOT NULL,
      type TEXT NOT NULL,
      payload JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_task_events_task_ts ON task_events(task_id, ts);

    CREATE TABLE IF NOT EXISTS tool_traces (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(36) NOT NULL REFERENCES tasks(id),
      ts TIMESTAMP DEFAULT NOW() NOT NULL,
      tool_name TEXT NOT NULL,
      input JSONB,
      output JSONB,
      success BOOLEAN,
      duration_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tool_traces_task_ts ON tool_traces(task_id, ts);

    CREATE TABLE IF NOT EXISTS workspace_ports (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
      port INTEGER NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'http',
      is_primary BOOLEAN NOT NULL DEFAULT false,
      health_path TEXT,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);
}

await ensureTables();

const streamSubscribers = new Map<string, Set<import('ws').WebSocket>>();

function broadcastToStream(workspaceId: string, type: string, message: string) {
  const subs = streamSubscribers.get(workspaceId);
  if (!subs || subs.size === 0) return;
  const event: WebSocketMessage = {
    type: type as WebSocketMessage['type'],
    payload: { workspaceId, message, ts: new Date().toISOString() },
    timestamp: new Date().toISOString(),
  };
  const data = JSON.stringify(event);
  for (const ws of subs) {
    if (ws.readyState === 1) ws.send(data);
  }
}

function broadcastExitEvent(workspaceId: string, exitCode: number, durationMs: number) {
  const subs = streamSubscribers.get(workspaceId);
  if (!subs || subs.size === 0) return;
  const event: WebSocketMessage = {
    type: 'stream:exit',
    payload: { workspaceId, exitCode, durationMs },
    timestamp: new Date().toISOString(),
  };
  const data = JSON.stringify(event);
  for (const ws of subs) {
    if (ws.readyState === 1) ws.send(data);
  }
}

async function localExec(workspaceId: string, cmd: string, timeoutSec = 30, stdin?: string) {
  const safety = isCommandAllowed(cmd);
  if (!safety.allowed) {
    return { exitCode: 126, stdout: '', stderr: safety.reason ?? 'Command blocked', durationMs: 0, truncated: false };
  }
  const timeout = clampTimeout(timeoutSec);
  const result = await execInRunner(
    workspaceId,
    cmd,
    timeout,
    (line) => broadcastToStream(workspaceId, 'stream:stdout', line),
    (line) => broadcastToStream(workspaceId, 'stream:stderr', line),
    stdin,
  );

  const stdoutResult = truncateOutput(result.stdout);
  const stderrResult = truncateOutput(result.stderr);

  broadcastExitEvent(workspaceId, result.exitCode, result.durationMs);

  return {
    exitCode: result.exitCode,
    stdout: stdoutResult.text,
    stderr: stderrResult.text,
    durationMs: result.durationMs,
    truncated: stdoutResult.truncated || stderrResult.truncated,
  };
}

async function addTaskEvent(taskId: string, type: string, payload: Record<string, unknown> = {}) {
  await db.insert(taskEvents).values({ taskId, type, payload });
}

async function addToolTrace(taskId: string, toolName: string, input: Record<string, unknown>, output: Record<string, unknown>, success: boolean, durationMs: number) {
  await db.insert(toolTraces).values({ taskId, toolName, input, output, success, durationMs });
}

async function runVerifyWithFallbacks(workspaceId: string, commands: string[]): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> {
  let lastResult: { exitCode: number; stdout: string; stderr: string; durationMs: number } | null = null;
  for (const cmd of commands) {
    lastResult = await localExec(workspaceId, `cd /workspace && ${cmd}`, 120);
    if (lastResult.exitCode === 0) return lastResult;
  }
  return lastResult!;
}

app.get('/', async (_req, reply) => {
  return reply.send({
    name: 'OperatorOS API',
    version: '0.2.0',
    tagline: 'Powered by Shotgun Ninjas',
    runnerMode: getRunnerMode(),
    endpoints: {
      health: '/healthz',
      ui: '/ui',
      profiles: 'GET /v1/profiles',
      workspaces: 'GET /v1/workspaces',
      createWorkspace: 'POST /v1/workspaces',
      getWorkspace: 'GET /v1/workspaces/:id',
      startWorkspace: 'POST /v1/workspaces/:id/start',
      stopWorkspace: 'POST /v1/workspaces/:id/stop',
      execInWorkspace: 'POST /v1/workspaces/:id/exec',
      applyPatch: 'POST /v1/workspaces/:id/apply-patch',
      gitStatus: 'POST /v1/workspaces/:id/git-status',
      createBranch: 'POST /v1/workspaces/:id/create-branch',
      commit: 'POST /v1/workspaces/:id/commit',
      verify: 'POST /v1/workspaces/:id/verify',
      createTask: 'POST /v1/tasks',
      runTask: 'POST /v1/tasks/:taskId/run',
      getTask: 'GET /v1/tasks/:taskId',
      taskEvents: 'GET /v1/tasks/:taskId/events',
      stream: 'WS /v1/runner/stream/:workspaceId',
    },
  });
});

app.get('/healthz', async (_req, reply) => {
  const response: HealthResponse = {
    status: 'healthy',
    service: 'operatoros-api',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };
  return reply.send(response);
});

app.get('/readyz', async (_req, reply) => {
  return reply.send({ ready: true });
});

app.get('/v1/profiles', async (_req, reply) => {
  return reply.send({ profiles: listProfiles() });
});

app.post<{ Body: CreateWorkspaceRequest }>(
  '/v1/workspaces',
  async (req, reply) => {
    const { gitUrl, gitRef, profileId } = req.body;
    if (!gitUrl) return reply.status(400).send({ error: 'gitUrl is required' });

    const profile = getProfile(profileId ?? 'node20');
    if (!profile) return reply.status(400).send({ error: `Unknown profile: ${profileId}` });

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
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    let runnerStatus = null;
    try {
      runnerStatus = await getWorkspaceRunnerStatus(id);
    } catch {}

    return reply.send({ ...ws, runner: runnerStatus });
  },
);

app.post<{ Params: { id: string } }>(
  '/v1/workspaces/:id/start',
  async (req, reply) => {
    const { id } = req.params;
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    const profileImage = getProfileImage(ws.profileId);
    await db.update(workspaces).set({ status: 'provisioning', updatedAt: new Date() }).where(eq(workspaces.id, id));

    try {
      const result = await createWorkspaceRunner(id, ws.profileId, profileImage, ws.gitUrl, ws.gitRef);
      const newStatus = result.success ? 'running' : 'error';
      await db.update(workspaces).set({ status: newStatus, updatedAt: new Date() }).where(eq(workspaces.id, id));

      if (result.success) {
        await db.insert(runners).values({
          workspaceId: id,
          mode: getRunnerMode(),
          containerId: result.containerId ?? null,
          status: 'running',
          startedAt: new Date(),
        }).onConflictDoUpdate({
          target: runners.workspaceId,
          set: { status: 'running', containerId: result.containerId ?? null, startedAt: new Date(), stoppedAt: null },
        });
      }

      return reply.status(result.success ? 201 : 500).send(result);
    } catch (err) {
      await db.update(workspaces).set({ status: 'error', updatedAt: new Date() }).where(eq(workspaces.id, id));
      return reply.status(500).send({
        error: 'Runner provisioning failed',
        detail: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  },
);

app.post<{ Params: { id: string } }>(
  '/v1/workspaces/:id/stop',
  async (req, reply) => {
    const { id } = req.params;
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    try {
      const result = await stopWorkspaceRunner(id);
      if (result.success) {
        await db.update(workspaces).set({ status: 'stopped', updatedAt: new Date() }).where(eq(workspaces.id, id));
        try {
          await db.update(runners).set({ status: 'stopped', stoppedAt: new Date() }).where(eq(runners.workspaceId, id));
        } catch {}
      }
      return reply.status(result.success ? 200 : 500).send(result);
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to stop runner', detail: err instanceof Error ? err.message : 'Unknown' });
    }
  },
);

app.post<{ Params: { id: string }; Body: { cmd: string; timeoutSec?: number } }>(
  '/v1/workspaces/:id/exec',
  async (req, reply) => {
    const { id } = req.params;
    const { cmd, timeoutSec } = req.body;
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    try {
      const result = await localExec(id, cmd, timeoutSec);
      return reply.send(result);
    } catch (err) {
      return reply.status(500).send({ error: 'Exec failed', detail: err instanceof Error ? err.message : 'Unknown' });
    }
  },
);

app.post<{ Params: { id: string }; Body: { diff: string } }>(
  '/v1/workspaces/:id/apply-patch',
  async (req, reply) => {
    const { id } = req.params;
    const { diff } = req.body;

    if (!diff) return reply.status(400).send({ error: 'diff is required' });
    if (Buffer.byteLength(diff) > MAX_PATCH_SIZE) {
      return reply.status(400).send({ error: `Patch exceeds max size of ${MAX_PATCH_SIZE} bytes` });
    }

    const pathCheck = validatePatchPaths(diff);
    if (!pathCheck.valid) {
      return reply.status(400).send({ error: 'Patch modifies denied paths', deniedPaths: pathCheck.deniedPaths });
    }

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    try {
      const writeTemp = await localExec(id, `cat > /tmp/_patch.diff`, 10, diff);
      if (writeTemp.exitCode !== 0) {
        return reply.send({ success: false, changedFiles: [], gitStatus: '', error: `Failed to write patch: ${writeTemp.stderr}` } as ApplyPatchResult);
      }

      const applyResult = await localExec(id, 'cd /workspace && git apply --whitespace=nowarn /tmp/_patch.diff && rm /tmp/_patch.diff', 30);
      if (applyResult.exitCode !== 0) {
        return reply.send({ success: false, changedFiles: [], gitStatus: '', error: applyResult.stderr || applyResult.stdout } as ApplyPatchResult);
      }

      const statusResult = await localExec(id, 'cd /workspace && git status --porcelain', 10);
      const changedFiles = statusResult.stdout.split('\n').filter(Boolean).map((l) => l.trim().split(/\s+/).slice(1).join(' '));

      return reply.send({ success: true, changedFiles, gitStatus: statusResult.stdout } as ApplyPatchResult);
    } catch (err) {
      return reply.status(500).send({ error: 'Exec failed', detail: err instanceof Error ? err.message : 'Unknown' });
    }
  },
);

app.post<{ Params: { id: string } }>(
  '/v1/workspaces/:id/git-status',
  async (req, reply) => {
    const { id } = req.params;
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    try {
      const result = await localExec(id, 'cd /workspace && git status --porcelain', 10);
      return reply.send({ exitCode: result.exitCode, status: result.stdout });
    } catch (err) {
      return reply.status(500).send({ error: 'Exec failed' });
    }
  },
);

app.post<{ Params: { id: string }; Body: { name: string } }>(
  '/v1/workspaces/:id/create-branch',
  async (req, reply) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return reply.status(400).send({ error: 'Branch name required' });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    try {
      const result = await localExec(id, `cd /workspace && git checkout -b '${name.replace(/'/g, "'\\''")}'`, 10);
      return reply.send({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
    } catch (err) {
      return reply.status(500).send({ error: 'Exec failed' });
    }
  },
);

app.post<{ Params: { id: string }; Body: { message: string } }>(
  '/v1/workspaces/:id/commit',
  async (req, reply) => {
    const { id } = req.params;
    const { message } = req.body;
    if (!message) return reply.status(400).send({ error: 'Commit message required' });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    try {
      const safeMsg = message.replace(/'/g, "'\\''");
      const result = await localExec(id, `cd /workspace && git add -A && git diff --cached --quiet && echo "nothing to commit" || git commit -m '${safeMsg}'`, 30);
      return reply.send({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
    } catch (err) {
      return reply.status(500).send({ error: 'Exec failed' });
    }
  },
);

app.post<{ Params: { id: string } }>(
  '/v1/workspaces/:id/verify',
  async (req, reply) => {
    const { id } = req.params;
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    const profile = getProfile(ws.profileId);
    if (!profile) return reply.status(400).send({ error: `Unknown profile: ${ws.profileId}` });

    const results: VerifyCheckResult[] = [];
    for (const vc of profile.verifyCommands) {
      try {
        const result = await runVerifyWithFallbacks(id, vc.commands);
        results.push({
          name: vc.name,
          label: vc.label,
          passed: result.exitCode === 0,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          durationMs: result.durationMs,
        });
      } catch {
        results.push({
          name: vc.name,
          label: vc.label,
          passed: false,
          exitCode: -1,
          stdout: '',
          stderr: 'Runner unreachable',
          durationMs: 0,
          skipped: true,
        });
      }
    }

    const verifyResult: VerifyResult = {
      checks: results,
      allPassed: results.every((r) => r.passed || r.skipped),
    };
    return reply.send(verifyResult);
  },
);

app.post<{ Body: { workspaceId: string; title: string } }>(
  '/v1/tasks',
  async (req, reply) => {
    const { workspaceId, title } = req.body;
    if (!workspaceId || !title) return reply.status(400).send({ error: 'workspaceId and title required' });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    const plan = getVerifyPlan(ws.profileId);
    const requiredChecks = plan.map((p) => p.name);

    const [task] = await db.insert(tasks).values({
      workspaceId,
      title,
      requiredChecks,
    }).returning();

    return reply.status(201).send(task);
  },
);

app.post<{ Params: { taskId: string } }>(
  '/v1/tasks/:taskId/run',
  async (req, reply) => {
    const { taskId } = req.params;
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, task.workspaceId));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    await db.update(tasks).set({ status: 'running', startedAt: new Date() }).where(eq(tasks.id, taskId));
    await addTaskEvent(taskId, 'PLAN', { message: 'Starting verification task', checks: task.requiredChecks });

    reply.send({ status: 'running', taskId });

    (async () => {
      try {
        const branchName = `task/${taskId}`;
        const branchResult = await localExec(ws.id, `cd /workspace && git checkout -b '${branchName}' 2>/dev/null || git checkout '${branchName}'`, 10);
        await addTaskEvent(taskId, 'COMMAND', { tool: 'create-branch', branch: branchName, exitCode: branchResult.exitCode });

        const profile = getProfile(ws.profileId);
        if (!profile) throw new Error(`Unknown profile: ${ws.profileId}`);

        const checkResults: Record<string, { passed: boolean; output: string }> = {};

        for (const vc of profile.verifyCommands) {
          await addTaskEvent(taskId, 'VERIFY', { check: vc.name, label: vc.label, status: 'running' });
          const start = Date.now();
          const result = await runVerifyWithFallbacks(ws.id, vc.commands);
          const durationMs = Date.now() - start;

          const passed = result.exitCode === 0;
          checkResults[vc.name] = { passed, output: (result.stdout + '\n' + result.stderr).trim() };

          await addToolTrace(taskId, `verify:${vc.name}`, { commands: vc.commands }, { exitCode: result.exitCode, stdout: result.stdout.slice(0, 500), stderr: result.stderr.slice(0, 500) }, passed, durationMs);
          await addTaskEvent(taskId, 'VERIFY', { check: vc.name, passed, durationMs });
        }

        const allPassed = Object.values(checkResults).every((r) => r.passed);
        const summary = allPassed
          ? `All ${Object.keys(checkResults).length} checks passed`
          : `${Object.values(checkResults).filter((r) => !r.passed).length} check(s) failed`;

        await db.update(tasks).set({
          status: allPassed ? 'succeeded' : 'failed',
          checkResults,
          resultSummary: summary,
          finishedAt: new Date(),
        }).where(eq(tasks.id, taskId));

        await addTaskEvent(taskId, 'DONE', { allPassed, summary });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        await db.update(tasks).set({
          status: 'failed',
          resultSummary: `Error: ${errMsg}`,
          finishedAt: new Date(),
        }).where(eq(tasks.id, taskId));
        await addTaskEvent(taskId, 'ERROR', { error: errMsg });
      }
    })();
  },
);

app.get<{ Params: { taskId: string } }>(
  '/v1/tasks/:taskId',
  async (req, reply) => {
    const { taskId } = req.params;
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    return reply.send(task);
  },
);

app.get<{ Params: { taskId: string } }>(
  '/v1/tasks/:taskId/events',
  async (req, reply) => {
    const { taskId } = req.params;
    const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, taskId)).orderBy(taskEvents.ts);
    return reply.send({ events, total: events.length });
  },
);

app.get<{ Params: { taskId: string } }>(
  '/v1/tasks/:taskId/traces',
  async (req, reply) => {
    const { taskId } = req.params;
    const traces = await db.select().from(toolTraces).where(eq(toolTraces.taskId, taskId)).orderBy(toolTraces.ts);
    return reply.send({ traces, total: traces.length });
  },
);

app.get('/v1/tasks', async (req, reply) => {
  const wsId = (req.query as any).workspaceId;
  let rows;
  if (wsId) {
    rows = await db.select().from(tasks).where(eq(tasks.workspaceId, wsId)).orderBy(desc(tasks.createdAt));
  } else {
    rows = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
  }
  return reply.send({ tasks: rows, total: rows.length });
});

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

serveUI(app);

const port = parseInt(process.env.API_PORT ?? '5000', 10);
const host = '0.0.0.0';

try {
  await app.listen({ port, host });
  console.info(`OperatorOS API listening on http://${host}:${port} [runner=${getRunnerMode()}]`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
