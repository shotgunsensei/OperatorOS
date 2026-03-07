import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  automationRules,
  systemEvents,
  systemNotifications,
  workspacePorts,
  workspaceProcesses,
  workspaceServices,
  workspaces,
} from '../schema.js';
import { safeWorkspaceExec } from '../lib/exec.js';
import { addSystemEvent, addSystemNotification } from '../lib/system-events.js';
import { getProfile } from '../../../../packages/profiles/src/index.js';

function shellEscape(input: string) {
  return `'${input.replace(/'/g, `'\\''`)}'`;
}

export async function registerOsRoutes(app: FastifyInstance) {
  app.get('/v1/system/status', async () => {
    const [workspaceCount, processCount, serviceCount, notificationCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(workspaces),
      db.select({ count: sql<number>`count(*)::int` }).from(workspaceProcesses).where(eq(workspaceProcesses.status, 'running')),
      db.select({ count: sql<number>`count(*)::int` }).from(workspaceServices).where(eq(workspaceServices.status, 'running')),
      db.select({ count: sql<number>`count(*)::int` }).from(systemNotifications).where(eq(systemNotifications.read, false)),
    ]);

    return {
      ok: true,
      counts: {
        workspaces: workspaceCount[0]?.count ?? 0,
        activeProcesses: processCount[0]?.count ?? 0,
        activeServices: serviceCount[0]?.count ?? 0,
        unreadNotifications: notificationCount[0]?.count ?? 0,
      },
      ts: new Date().toISOString(),
    };
  });

  app.get('/v1/system/events', async (req) => {
    const q = req.query as { workspaceId?: string; limit?: string };
    const limit = Math.min(Number.parseInt(q.limit ?? '50', 10), 200);
    const rows = q.workspaceId
      ? await db.select().from(systemEvents).where(eq(systemEvents.workspaceId, q.workspaceId)).orderBy(desc(systemEvents.ts)).limit(limit)
      : await db.select().from(systemEvents).orderBy(desc(systemEvents.ts)).limit(limit);

    return { events: rows, total: rows.length };
  });

  app.get('/v1/system/notifications', async (req) => {
    const q = req.query as { workspaceId?: string; limit?: string };
    const limit = Math.min(Number.parseInt(q.limit ?? '25', 10), 100);
    const rows = q.workspaceId
      ? await db.select().from(systemNotifications).where(eq(systemNotifications.workspaceId, q.workspaceId)).orderBy(desc(systemNotifications.createdAt)).limit(limit)
      : await db.select().from(systemNotifications).orderBy(desc(systemNotifications.createdAt)).limit(limit);

    return { notifications: rows, total: rows.length };
  });

  app.post('/v1/system/notifications/:id/read', async (req) => {
    const { id } = req.params as { id: string };
    await db.update(systemNotifications).set({ read: true }).where(eq(systemNotifications.id, id));
    return { ok: true };
  });

  app.get('/v1/workspaces/:id/processes', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!workspace) return reply.status(404).send({ error: 'Workspace not found' });

    const rows = await db.select().from(workspaceProcesses).where(eq(workspaceProcesses.workspaceId, id)).orderBy(desc(workspaceProcesses.startedAt)).limit(100);
    return { processes: rows, total: rows.length };
  });

  app.post('/v1/workspaces/:id/processes', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; command: string; background?: boolean; timeoutSec?: number };
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!workspace) return reply.status(404).send({ error: 'Workspace not found' });
    if (!body.command?.trim()) return reply.status(400).send({ error: 'command is required' });

    const background = body.background ?? true;
    const processName = body.name?.trim() || body.command.trim().split(/\s+/)[0] || 'process';

    if (background) {
      const logPath = `/tmp/operatoros-${id}-${Date.now()}.log`;
      const wrapped = `cd /workspace && nohup bash -lc ${shellEscape(body.command)} > ${shellEscape(logPath)} 2>&1 & echo $!`;
      const execResult = await safeWorkspaceExec(id, wrapped, body.timeoutSec ?? 10);
      const pid = execResult.stdout.trim().split('\n').pop()?.trim() || null;
      if (execResult.exitCode !== 0 || !pid) {
        return reply.status(500).send({ error: execResult.stderr || 'Failed to start background process' });
      }

      const [row] = await db.insert(workspaceProcesses).values({
        workspaceId: id,
        name: processName,
        command: body.command,
        status: 'running',
        providerProcessId: pid,
        logPath,
        updatedAt: new Date(),
      }).returning();

      await addSystemEvent({ workspaceId: id, source: 'process-manager', type: 'process.started', severity: 'success', payload: { processId: row.id, pid, name: processName } });
      await addSystemNotification({ workspaceId: id, title: 'Process started', message: `${processName} is running in the background.`, level: 'success' });
      return reply.status(201).send(row);
    }

    const execResult = await safeWorkspaceExec(id, `cd /workspace && ${body.command}`, body.timeoutSec ?? 60);
    const [row] = await db.insert(workspaceProcesses).values({
      workspaceId: id,
      name: processName,
      command: body.command,
      status: execResult.exitCode === 0 ? 'completed' : 'failed',
      startedAt: new Date(Date.now() - execResult.durationMs),
      finishedAt: new Date(),
      exitCode: execResult.exitCode,
      durationMs: execResult.durationMs,
      updatedAt: new Date(),
    }).returning();

    await addSystemEvent({ workspaceId: id, source: 'process-manager', type: 'process.finished', severity: execResult.exitCode === 0 ? 'success' : 'error', payload: { processId: row.id, name: processName, exitCode: execResult.exitCode } });
    return { process: row, result: execResult };
  });

  app.post('/v1/workspaces/:id/processes/:processId/stop', async (req, reply) => {
    const { id, processId } = req.params as { id: string; processId: string };
    const [row] = await db.select().from(workspaceProcesses).where(and(eq(workspaceProcesses.id, processId), eq(workspaceProcesses.workspaceId, id)));
    if (!row) return reply.status(404).send({ error: 'Process not found' });
    if (!row.providerProcessId) return reply.status(400).send({ error: 'Process does not have a managed PID' });

    const killResult = await safeWorkspaceExec(id, `kill ${row.providerProcessId}`, 10);
    const nextStatus = killResult.exitCode === 0 ? 'stopped' : 'failed';
    await db.update(workspaceProcesses).set({ status: nextStatus, finishedAt: new Date(), exitCode: killResult.exitCode, updatedAt: new Date() }).where(eq(workspaceProcesses.id, processId));

    await addSystemEvent({ workspaceId: id, source: 'process-manager', type: 'process.stopped', severity: killResult.exitCode === 0 ? 'info' : 'error', payload: { processId } });
    await addSystemNotification({ workspaceId: id, title: 'Process stopped', message: `${row.name} has been stopped.`, level: killResult.exitCode === 0 ? 'info' : 'warning' });
    return { ok: killResult.exitCode === 0, result: killResult };
  });

  app.get('/v1/workspaces/:id/processes/:processId/logs', async (req, reply) => {
    const { id, processId } = req.params as { id: string; processId: string };
    const [row] = await db.select().from(workspaceProcesses).where(and(eq(workspaceProcesses.id, processId), eq(workspaceProcesses.workspaceId, id)));
    if (!row) return reply.status(404).send({ error: 'Process not found' });
    if (!row.logPath) return { logs: '', process: row };

    const result = await safeWorkspaceExec(id, `test -f ${shellEscape(row.logPath)} && tail -n 250 ${shellEscape(row.logPath)} || true`, 10);
    return { logs: result.stdout, process: row };
  });

  app.get('/v1/workspaces/:id/services', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!workspace) return reply.status(404).send({ error: 'Workspace not found' });
    const rows = await db.select().from(workspaceServices).where(eq(workspaceServices.workspaceId, id)).orderBy(desc(workspaceServices.updatedAt)).limit(100);
    return { services: rows, total: rows.length };
  });

  app.post('/v1/workspaces/:id/services/start', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; type?: string; command?: string; port?: number; protocol?: string; healthPath?: string };
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!workspace) return reply.status(404).send({ error: 'Workspace not found' });

    const profile = getProfile(workspace.profileId);
    const command = body.command?.trim() || profile?.preview?.startCommands?.[0];
    if (!command) return reply.status(400).send({ error: 'command is required and no default preview command exists for this profile' });

    const name = body.name?.trim() || 'preview-web';
    const port = body.port ?? profile?.preview?.port ?? null;
    const protocol = body.protocol ?? 'http';
    const healthPath = body.healthPath ?? profile?.preview?.healthPath ?? '/';

    const logPath = `/tmp/operatoros-service-${id}-${Date.now()}.log`;
    const wrapped = `cd /workspace && nohup bash -lc ${shellEscape(command)} > ${shellEscape(logPath)} 2>&1 & echo $!`;
    const execResult = await safeWorkspaceExec(id, wrapped, 15);
    const pid = execResult.stdout.trim().split('\n').pop()?.trim() || null;
    if (execResult.exitCode !== 0 || !pid) {
      return reply.status(500).send({ error: execResult.stderr || 'Failed to start service' });
    }

    const [processRow] = await db.insert(workspaceProcesses).values({
      workspaceId: id,
      name,
      command,
      status: 'running',
      providerProcessId: pid,
      logPath,
      updatedAt: new Date(),
    }).returning();

    const [serviceRow] = await db.insert(workspaceServices).values({
      workspaceId: id,
      name,
      type: body.type ?? 'preview',
      command,
      status: 'running',
      port,
      protocol,
      healthPath,
      processId: processRow.id,
      startedAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    await db.update(workspaceProcesses).set({ serviceId: serviceRow.id, updatedAt: new Date() }).where(eq(workspaceProcesses.id, processRow.id));

    if (port) {
      await db.insert(workspacePorts).values({ workspaceId: id, port, protocol, isPrimary: true, healthPath, updatedAt: new Date() });
    }

    await addSystemEvent({ workspaceId: id, source: 'service-manager', type: 'service.started', severity: 'success', payload: { serviceId: serviceRow.id, processId: processRow.id, port } });
    await addSystemNotification({ workspaceId: id, title: 'Service started', message: `${name} is now running${port ? ` on port ${port}` : ''}.`, level: 'success' });
    return reply.status(201).send({ service: serviceRow, process: processRow });
  });

  app.post('/v1/workspaces/:id/services/:serviceId/stop', async (req, reply) => {
    const { id, serviceId } = req.params as { id: string; serviceId: string };
    const [service] = await db.select().from(workspaceServices).where(and(eq(workspaceServices.id, serviceId), eq(workspaceServices.workspaceId, id)));
    if (!service) return reply.status(404).send({ error: 'Service not found' });

    if (service.processId) {
      const [processRow] = await db.select().from(workspaceProcesses).where(and(eq(workspaceProcesses.id, service.processId), eq(workspaceProcesses.workspaceId, id)));
      if (processRow?.providerProcessId) {
        await safeWorkspaceExec(id, `kill ${processRow.providerProcessId}`, 10);
        await db.update(workspaceProcesses).set({ status: 'stopped', finishedAt: new Date(), updatedAt: new Date() }).where(eq(workspaceProcesses.id, processRow.id));
      }
    }

    await db.update(workspaceServices).set({ status: 'stopped', stoppedAt: new Date(), updatedAt: new Date() }).where(eq(workspaceServices.id, serviceId));
    await addSystemEvent({ workspaceId: id, source: 'service-manager', type: 'service.stopped', severity: 'info', payload: { serviceId } });
    await addSystemNotification({ workspaceId: id, title: 'Service stopped', message: `${service.name} has been stopped.`, level: 'info' });
    return { ok: true };
  });

  app.get('/v1/workspaces/:id/services/:serviceId/status', async (req, reply) => {
    const { id, serviceId } = req.params as { id: string; serviceId: string };
    const [service] = await db.select().from(workspaceServices).where(and(eq(workspaceServices.id, serviceId), eq(workspaceServices.workspaceId, id)));
    if (!service) return reply.status(404).send({ error: 'Service not found' });
    return { service };
  });

  app.get('/v1/workspaces/:id/automations', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!workspace) return reply.status(404).send({ error: 'Workspace not found' });
    const rows = await db.select().from(automationRules).where(eq(automationRules.workspaceId, id)).orderBy(desc(automationRules.updatedAt)).limit(100);
    return { automations: rows, total: rows.length };
  });

  app.post('/v1/workspaces/:id/automations', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name: string; triggerType: string; triggerJson?: Record<string, unknown>; actionType: string; actionJson?: Record<string, unknown>; enabled?: boolean };
    if (!body.name?.trim() || !body.triggerType?.trim() || !body.actionType?.trim()) {
      return reply.status(400).send({ error: 'name, triggerType, and actionType are required' });
    }

    const [row] = await db.insert(automationRules).values({
      workspaceId: id,
      name: body.name.trim(),
      triggerType: body.triggerType.trim(),
      triggerJson: body.triggerJson ?? {},
      actionType: body.actionType.trim(),
      actionJson: body.actionJson ?? {},
      enabled: body.enabled ?? true,
      updatedAt: new Date(),
    }).returning();

    await addSystemEvent({ workspaceId: id, source: 'automation', type: 'automation.created', severity: 'success', payload: { automationId: row.id, name: row.name } });
    return reply.status(201).send(row);
  });

  app.post('/v1/workspaces/:id/automations/:ruleId/toggle', async (req, reply) => {
    const { id, ruleId } = req.params as { id: string; ruleId: string };
    const body = req.body as { enabled?: boolean };
    const [rule] = await db.select().from(automationRules).where(and(eq(automationRules.id, ruleId), eq(automationRules.workspaceId, id)));
    if (!rule) return reply.status(404).send({ error: 'Automation rule not found' });

    const enabled = typeof body.enabled === 'boolean' ? body.enabled : !rule.enabled;
    await db.update(automationRules).set({ enabled, updatedAt: new Date() }).where(eq(automationRules.id, ruleId));
    await addSystemEvent({ workspaceId: id, source: 'automation', type: 'automation.toggled', severity: 'info', payload: { automationId: ruleId, enabled } });
    return { ok: true, enabled };
  });
}
