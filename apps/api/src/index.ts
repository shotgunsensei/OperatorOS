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
import { workspaces, runners, tasks, taskEvents, toolTraces, publishRuns } from './schema.js';
import { serveUI } from './ui.js';
import { ensureExtendedTables } from './lib/db-init.js';
import { registerOsRoutes } from './routes/os-routes.js';
import { runAgentLoop } from './agent.js';
import type { AgentEvent } from './agent.js';
import { analyzeWorkspace, generatePlan, generateArtifacts, runProof } from './publish/index.js';
import type { DetectionResult } from './publish/types.js';

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
await registerOsRoutes(app);

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
      goal TEXT,
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

    CREATE TABLE IF NOT EXISTS publish_runs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
      status TEXT NOT NULL DEFAULT 'analyzing',
      detected_json JSONB,
      plan_json JSONB,
      proof_json JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_publish_runs_workspace ON publish_runs(workspace_id);
  `);
}

await ensureTables();
await ensureExtendedTables();

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

app.get('/', async (req, reply) => {
  const accept = req.headers.accept ?? '';
  if (accept.includes('text/html')) {
    return reply.redirect('/ui');
  }
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
      verifyRun: 'POST /v1/verify/run',
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

app.get<{ Params: { id: string }; Querystring: { path?: string; depth?: string } }>(
  '/v1/workspaces/:id/tree',
  async (req, reply) => {
    const { id } = req.params;
    const subPath = req.query.path ?? '.';
    const depth = Math.min(parseInt(req.query.depth ?? '2', 10), 5);

    if (subPath.includes('..') || subPath.startsWith('/')) {
      return reply.status(400).send({ error: 'Invalid path: must be relative, no ..' });
    }
    if (!/^[a-zA-Z0-9._\-/]+$/.test(subPath) && subPath !== '.') {
      return reply.status(400).send({ error: 'Invalid path characters' });
    }

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    try {
      const safePath = subPath.replace(/'/g, "'\\''");
      const result = await localExec(id, `cd /workspace && find '${safePath}' -maxdepth ${depth} -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/.next/*' -printf '%y %p\\n' | head -500 | sort -k2`, 10);
      const entries = result.stdout.split('\n').filter(Boolean).map((line) => {
        const typeChar = line.charAt(0);
        const path = line.substring(2);
        return { path, type: typeChar === 'd' ? 'dir' as const : 'file' as const };
      }).filter((e) => e.path !== subPath && e.path !== '.');
      return reply.send({ entries });
    } catch (err) {
      return reply.status(500).send({ error: 'Tree failed' });
    }
  },
);

app.post<{ Params: { id: string }; Body: { path: string } }>(
  '/v1/workspaces/:id/read-file',
  async (req, reply) => {
    const { id } = req.params;
    const { path: filePath } = req.body;
    if (!filePath) return reply.status(400).send({ error: 'path is required' });
    if (filePath.includes('..') || filePath.startsWith('/')) {
      return reply.status(400).send({ error: 'Invalid path' });
    }
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    try {
      const result = await localExec(id, `cd /workspace && cat ${JSON.stringify(filePath)}`, 10);
      if (result.exitCode !== 0) {
        return reply.status(404).send({ error: 'File not found or unreadable', stderr: result.stderr });
      }
      return reply.send({ path: filePath, content: result.stdout });
    } catch (err) {
      return reply.status(500).send({ error: 'Read failed' });
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

app.post<{ Body: { workspaceId: string; profileId?: string } }>(
  '/v1/verify/run',
  async (req, reply) => {
    const { workspaceId, profileId } = req.body;
    if (!workspaceId) return reply.status(400).send({ error: 'workspaceId required' });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    const profile = getProfile(profileId ?? ws.profileId);
    if (!profile) return reply.status(400).send({ error: `Unknown profile: ${profileId ?? ws.profileId}` });

    const steps: Array<{ name: string; ok: boolean; exitCode: number; durationMs: number; tail: string }> = [];
    for (const vc of profile.verifyCommands) {
      try {
        const result = await runVerifyWithFallbacks(workspaceId, vc.commands);
        const tail = (result.stdout + '\n' + result.stderr).trim().split('\n').slice(-20).join('\n');
        steps.push({
          name: vc.name,
          ok: result.exitCode === 0,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          tail,
        });
      } catch {
        steps.push({
          name: vc.name,
          ok: false,
          exitCode: -1,
          durationMs: 0,
          tail: 'Runner unreachable',
        });
      }
    }

    return reply.send({ ok: steps.every((s) => s.ok), steps });
  },
);

app.post<{ Body: { workspaceId: string; title?: string; goal?: string; profileId?: string } }>(
  '/v1/tasks',
  async (req, reply) => {
    const { workspaceId, title, goal, profileId } = req.body;
    if (!workspaceId) return reply.status(400).send({ error: 'workspaceId required' });
    if (!goal && !title) return reply.status(400).send({ error: 'goal or title required' });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    const pid = profileId ?? ws.profileId;
    const plan = getVerifyPlan(pid);
    const requiredChecks = plan.map((p) => p.name);

    const [task] = await db.insert(tasks).values({
      workspaceId,
      title: title ?? (goal ? `Agent: ${goal.slice(0, 80)}` : 'Untitled task'),
      goal: goal ?? null,
      requiredChecks,
    }).returning();

    return reply.send({ taskId: task.id, ...task });
  },
);

const taskEventSubscribers = new Map<string, Set<(event: string) => void>>();

function broadcastTaskEvent(taskId: string, eventData: Record<string, unknown>) {
  const subs = taskEventSubscribers.get(taskId);
  if (!subs) return;
  const data = `data: ${JSON.stringify(eventData)}\n\n`;
  for (const send of subs) {
    try { send(data); } catch { /* ignore closed */ }
  }
}

app.post<{ Params: { taskId: string } }>(
  '/v1/tasks/:taskId/run',
  async (req, reply) => {
    const { taskId } = req.params;
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    if (task.status === 'running') return reply.status(409).send({ error: 'Task already running' });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, task.workspaceId));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    await db.update(tasks).set({ status: 'running', startedAt: new Date() }).where(eq(tasks.id, taskId));

    reply.send({ status: 'running', taskId });

    if (task.goal) {
      (async () => {
        try {
          const branchName = `agent/${taskId.slice(0, 8)}`;
          await localExec(ws.id, `cd /workspace && git checkout -b '${branchName}' 2>/dev/null || git checkout '${branchName}'`, 10);
          await addTaskEvent(taskId, 'PLAN', { message: `Agent starting: ${task.goal}`, branch: branchName });
          broadcastTaskEvent(taskId, { type: 'PLAN', payload: { message: `Agent starting: ${task.goal}` } });

          const profileId = ws.profileId;

          const executeTool = async (name: string, args: Record<string, unknown>) => {
            const start = Date.now();
            let result = { success: false, output: '', changedFiles: [] as string[] };

            try {
              if (name === 'read_file') {
                const filePath = String(args.path ?? '');
                if (!filePath || filePath.includes('..') || filePath.startsWith('/') || /\.(env|pem|key)/.test(filePath) || filePath.includes('.git/')) {
                  result = { success: false, output: 'Path blocked: unsafe or forbidden path', changedFiles: [] };
                } else {
                  const fileResult = await localExec(ws.id, `cat /workspace/${filePath}`, 15);
                  result = { success: fileResult.exitCode === 0, output: fileResult.stdout || fileResult.stderr, changedFiles: [] };
                }
              } else if (name === 'apply_patch') {
                const diff = String(args.diff ?? '');
                if (diff.length > MAX_PATCH_SIZE) {
                  result = { success: false, output: `Patch exceeds ${MAX_PATCH_SIZE / 1024}KB limit`, changedFiles: [] };
                } else {
                  const pathValidation = validatePatchPaths(diff);
                  if (!pathValidation.valid) {
                    result = { success: false, output: `Patch path blocked: ${pathValidation.reason}`, changedFiles: [] };
                  } else {
                    const patchResult = await localExec(ws.id, `cd /workspace && git apply --stat -`, 30, diff);
                    const applyResult = await localExec(ws.id, `cd /workspace && git apply -`, 30, diff);
                    const changedFiles = patchResult.stdout.split('\n').filter(Boolean).map((l: string) => l.trim().split('|')[0]?.trim()).filter(Boolean);
                    result = { success: applyResult.exitCode === 0, output: applyResult.exitCode === 0 ? `Patch applied: ${changedFiles.join(', ')}` : applyResult.stderr, changedFiles };
                  }
                }
              } else if (name === 'run_verify') {
                const profile = getProfile(profileId);
                if (!profile) {
                  result = { success: false, output: `Unknown profile: ${profileId}`, changedFiles: [] };
                } else {
                  const steps: Array<{ name: string; ok: boolean; exitCode: number; tail: string }> = [];
                  for (const vc of profile.verifyCommands) {
                    const r = await runVerifyWithFallbacks(ws.id, vc.commands);
                    const tail = (r.stdout + '\n' + r.stderr).trim().split('\n').slice(-15).join('\n');
                    steps.push({ name: vc.name, ok: r.exitCode === 0, exitCode: r.exitCode, tail });
                  }
                  const allOk = steps.every((s) => s.ok);
                  result = { success: true, output: JSON.stringify({ ok: allOk, steps }), changedFiles: [] };
                }
              } else if (name === 'exec') {
                const cmd = String(args.cmd ?? '');
                const execResult = await localExec(ws.id, `cd /workspace && ${cmd}`, 60);
                result = { success: execResult.exitCode === 0, output: (execResult.stdout + '\n' + execResult.stderr).trim(), changedFiles: [] };
              } else {
                result = { success: false, output: `Unknown tool: ${name}`, changedFiles: [] };
              }
            } catch (err) {
              result = { success: false, output: err instanceof Error ? err.message : 'Tool error', changedFiles: [] };
            }

            const durationMs = Date.now() - start;
            await addToolTrace(taskId, name, args, { success: result.success, output: result.output.slice(0, 500) }, result.success, durationMs);
            return result;
          };

          const onEvent = async (event: AgentEvent) => {
            await addTaskEvent(taskId, event.type, event.payload);
            broadcastTaskEvent(taskId, { type: event.type, payload: event.payload, ts: new Date().toISOString() });
          };

          const agentResult = await runAgentLoop(task.goal, profileId, {}, onEvent, executeTool);

          await db.update(tasks).set({
            status: agentResult.success ? 'succeeded' : 'failed',
            resultSummary: agentResult.success
              ? `Agent fixed issues in ${agentResult.iterations} iterations. Changed: ${agentResult.changedFiles.join(', ') || 'none'}`
              : `Agent exhausted after ${agentResult.iterations} iterations (${agentResult.totalTokens} tokens)`,
            finishedAt: new Date(),
          }).where(eq(tasks.id, taskId));
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          await db.update(tasks).set({ status: 'failed', resultSummary: `Error: ${errMsg}`, finishedAt: new Date() }).where(eq(tasks.id, taskId));
          await addTaskEvent(taskId, 'ERROR', { error: errMsg });
          broadcastTaskEvent(taskId, { type: 'ERROR', payload: { error: errMsg } });
        }
      })();
    } else {
      await addTaskEvent(taskId, 'PLAN', { message: 'Starting verification task', checks: task.requiredChecks });
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
          await db.update(tasks).set({ status: 'failed', resultSummary: `Error: ${errMsg}`, finishedAt: new Date() }).where(eq(tasks.id, taskId));
          await addTaskEvent(taskId, 'ERROR', { error: errMsg });
        }
      })();
    }
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
  '/v1/tasks/:taskId/events/stream',
  async (req, reply) => {
    const { taskId } = req.params;
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const existingEvents = await db.select().from(taskEvents).where(eq(taskEvents.taskId, taskId)).orderBy(taskEvents.ts);
    for (const evt of existingEvents) {
      reply.raw.write(`data: ${JSON.stringify({ type: evt.type, payload: evt.payload, ts: evt.ts })}\n\n`);
    }

    if (task.status === 'succeeded' || task.status === 'failed') {
      reply.raw.write(`data: ${JSON.stringify({ type: 'STREAM_END', payload: { status: task.status, summary: task.resultSummary } })}\n\n`);
      reply.raw.end();
      return;
    }

    if (!taskEventSubscribers.has(taskId)) {
      taskEventSubscribers.set(taskId, new Set());
    }

    const send = (data: string) => {
      reply.raw.write(data);
    };
    taskEventSubscribers.get(taskId)!.add(send);

    const cleanup = () => {
      const subs = taskEventSubscribers.get(taskId);
      if (subs) {
        subs.delete(send);
        if (subs.size === 0) taskEventSubscribers.delete(taskId);
      }
    };

    req.raw.on('close', cleanup);
    req.raw.on('error', cleanup);

    const checkInterval = setInterval(async () => {
      try {
        const [current] = await db.select().from(tasks).where(eq(tasks.id, taskId));
        if (current && (current.status === 'succeeded' || current.status === 'failed')) {
          reply.raw.write(`data: ${JSON.stringify({ type: 'STREAM_END', payload: { status: current.status, summary: current.resultSummary } })}\n\n`);
          clearInterval(checkInterval);
          cleanup();
          reply.raw.end();
        }
      } catch { /* ignore */ }
    }, 3000);

    req.raw.on('close', () => clearInterval(checkInterval));
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

app.post<{ Body: { workspaceId: string } }>(
  '/v1/publish/analyze',
  async (req, reply) => {
    const { workspaceId } = req.body;
    if (!workspaceId) return reply.status(400).send({ error: 'workspaceId is required' });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    const exec = async (cmd: string, timeoutSec = 30) => {
      const r = await localExec(workspaceId, cmd, timeoutSec);
      return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, durationMs: r.durationMs };
    };

    const detection = await analyzeWorkspace(workspaceId, exec);

    const [run] = await db.insert(publishRuns).values({
      workspaceId,
      status: 'analyzing',
      detectedJson: detection as any,
    }).returning();

    return reply.send(detection);
  },
);

app.post<{ Body: { workspaceId: string; intent: 'web-domain' | 'mobile-store' | 'pwa'; preferences?: { platform?: string } } }>(
  '/v1/publish/plan',
  async (req, reply) => {
    const { workspaceId, intent, preferences } = req.body;
    if (!workspaceId || !intent) return reply.status(400).send({ error: 'workspaceId and intent are required' });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    const existingRuns = await db.select().from(publishRuns)
      .where(eq(publishRuns.workspaceId, workspaceId))
      .orderBy(desc(publishRuns.createdAt))
      .limit(1);

    if (!existingRuns.length || !existingRuns[0].detectedJson) {
      return reply.status(400).send({ error: 'Run /v1/publish/analyze first' });
    }

    const detection = existingRuns[0].detectedJson as unknown as DetectionResult;
    const plan = generatePlan(detection, intent, preferences);

    await db.update(publishRuns)
      .set({ status: 'planned', planJson: plan as any, updatedAt: new Date() })
      .where(eq(publishRuns.id, existingRuns[0].id));

    return reply.send(plan);
  },
);

app.post<{ Body: { workspaceId: string; platform: string } }>(
  '/v1/publish/artifacts',
  async (req, reply) => {
    const { workspaceId, platform } = req.body;
    if (!workspaceId || !platform) return reply.status(400).send({ error: 'workspaceId and platform are required' });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    const existingRuns = await db.select().from(publishRuns)
      .where(eq(publishRuns.workspaceId, workspaceId))
      .orderBy(desc(publishRuns.createdAt))
      .limit(1);

    if (!existingRuns.length || !existingRuns[0].detectedJson) {
      return reply.status(400).send({ error: 'Run /v1/publish/analyze first' });
    }

    const detection = existingRuns[0].detectedJson as unknown as DetectionResult;
    const artifacts = generateArtifacts(detection, platform);

    if (artifacts.proposedChanges.diff) {
      if (Buffer.byteLength(artifacts.proposedChanges.diff) > MAX_PATCH_SIZE) {
        return reply.status(400).send({ error: `Generated artifacts exceed max patch size of ${MAX_PATCH_SIZE} bytes` });
      }
      const pathCheck = validatePatchPaths(artifacts.proposedChanges.diff);
      if (!pathCheck.valid) {
        return reply.status(400).send({ error: 'Generated artifacts modify denied paths', deniedPaths: pathCheck.deniedPaths });
      }
    }

    await db.update(publishRuns)
      .set({ status: 'artifacts_generated', updatedAt: new Date() })
      .where(eq(publishRuns.id, existingRuns[0].id));

    return reply.send(artifacts);
  },
);

app.post<{ Body: { workspaceId: string; planId?: string } }>(
  '/v1/publish/proof',
  async (req, reply) => {
    const { workspaceId } = req.body;
    if (!workspaceId) return reply.status(400).send({ error: 'workspaceId is required' });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    const existingRuns = await db.select().from(publishRuns)
      .where(eq(publishRuns.workspaceId, workspaceId))
      .orderBy(desc(publishRuns.createdAt))
      .limit(1);

    let detection: DetectionResult;
    if (existingRuns.length && existingRuns[0].detectedJson) {
      detection = existingRuns[0].detectedJson as unknown as DetectionResult;
    } else {
      const exec = async (cmd: string, timeoutSec = 30) => {
        const r = await localExec(workspaceId, cmd, timeoutSec);
        return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, durationMs: r.durationMs };
      };
      detection = await analyzeWorkspace(workspaceId, exec);
    }

    const runId = existingRuns.length ? existingRuns[0].id : undefined;
    if (runId) {
      await db.update(publishRuns)
        .set({ status: 'proof_running', updatedAt: new Date() })
        .where(eq(publishRuns.id, runId));
    }

    const exec = async (cmd: string, timeoutSec = 30) => {
      const r = await localExec(workspaceId, cmd, timeoutSec);
      return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, durationMs: r.durationMs };
    };

    const proof = await runProof(workspaceId, exec, detection);

    if (runId) {
      await db.update(publishRuns)
        .set({ status: proof.ok ? 'proof_done' : 'failed', proofJson: proof as any, updatedAt: new Date() })
        .where(eq(publishRuns.id, runId));
    }

    return reply.send(proof);
  },
);

app.post<{ Body: { workspaceId: string; planId: string } }>(
  '/v1/publish/explain',
  async (req, reply) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return reply.status(501).send({ error: 'OPENAI_API_KEY not configured' });

    const { workspaceId, planId } = req.body;
    if (!workspaceId) return reply.status(400).send({ error: 'workspaceId is required' });

    const existingRuns = await db.select().from(publishRuns)
      .where(eq(publishRuns.workspaceId, workspaceId))
      .orderBy(desc(publishRuns.createdAt))
      .limit(1);

    if (!existingRuns.length) return reply.status(400).send({ error: 'No publish analysis found' });

    const run = existingRuns[0];
    const detection = run.detectedJson as unknown as DetectionResult;
    const plan = run.planJson as any;

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a deployment advisor. Explain deployment plans in plain English. Be concise. Never mention secrets or API keys in your response.',
        },
        {
          role: 'user',
          content: `Explain this deployment plan for a ${detection.detected.framework} project:\n\nDetection: ${JSON.stringify(detection.detected, null, 2)}\nRisks: ${JSON.stringify(detection.risks)}\nPlan: ${JSON.stringify(plan, null, 2)}`,
        },
      ],
      max_tokens: 800,
    });

    const text = response.choices[0]?.message?.content ?? 'No explanation generated';
    const risks = detection.risks.map((r) => r.message);

    return reply.send({
      plainEnglishSummary: text,
      risksExplained: risks,
      recommendedEnvVarsExplained: plan?.requiredEnvVars?.map((e: any) => `${e.key}: ${e.description}`) ?? [],
    });
  },
);

app.get<{ Params: { workspaceId: string } }>(
  '/v1/publish/runs/:workspaceId',
  async (req, reply) => {
    const { workspaceId } = req.params;
    const runs = await db.select().from(publishRuns)
      .where(eq(publishRuns.workspaceId, workspaceId))
      .orderBy(desc(publishRuns.createdAt))
      .limit(10);
    return reply.send(runs);
  },
);

serveUI(app);

const port = parseInt(process.env.PORT ?? '5001', 10);
const host = '0.0.0.0';

try {
  await app.listen({ port, host });
  console.info(`OperatorOS API listening on http://${host}:${port} [runner=${getRunnerMode()}]`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
