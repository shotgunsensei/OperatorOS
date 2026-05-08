import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import {
  saasWorkspaces, workspaceMemberships, saasProjects, saasTasks,
  notes, activityFeed,
} from '../schema.js';
import { eq, and, desc, count } from 'drizzle-orm';
import { authenticate, getUserPlanLimits } from '../lib/auth.js';
import { requireTenantMember } from '../lib/tenant-auth.js';
import { checkResourceLimit, getUserUsageSummary, getUserPlanConfig } from '../lib/plans.js';

// Gate 2: every per-user resource (workspaces, projects, tasks, notes,
// activity, etc.) is scoped by the active tenant. Reads filter on
// tenantId; writes stamp tenantId from the resolved tenant context. The
// tenant pre-handler runs first so `(request as any).tenantContext` is
// always populated for these handlers.
async function logActivity(
  userId: string,
  tenantId: string,
  action: string,
  entityType: string,
  entityId?: string,
  workspaceId?: string,
  metadata?: Record<string, unknown>,
) {
  await db.insert(activityFeed).values({ userId, tenantId, action, entityType, entityId, workspaceId, metadata });
}

async function verifyWorkspaceMember(userId: string, tenantId: string, workspaceId: string, role: string): Promise<boolean> {
  if (role === 'admin') return true;
  // Workspace must belong to the active tenant; cross-tenant access is
  // invisible (treated as "not a member").
  const [ws] = await db.select().from(saasWorkspaces)
    .where(and(eq(saasWorkspaces.id, workspaceId), eq(saasWorkspaces.tenantId, tenantId)))
    .limit(1);
  if (!ws) return false;
  const [membership] = await db.select().from(workspaceMemberships)
    .where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.userId, userId))).limit(1);
  return !!membership;
}

async function verifyProjectOwner(userId: string, tenantId: string, projectId: string, role: string): Promise<{ allowed: boolean; project?: any }> {
  const [project] = await db.select().from(saasProjects)
    .where(and(eq(saasProjects.id, projectId), eq(saasProjects.tenantId, tenantId)))
    .limit(1);
  if (!project) return { allowed: false };
  if (role === 'admin') return { allowed: true, project };
  const isMember = await verifyWorkspaceMember(userId, tenantId, project.workspaceId, role);
  return { allowed: isMember, project };
}

async function verifyTaskOwner(userId: string, tenantId: string, taskId: string, role: string): Promise<{ allowed: boolean; task?: any }> {
  const [task] = await db.select().from(saasTasks)
    .where(and(eq(saasTasks.id, taskId), eq(saasTasks.tenantId, tenantId)))
    .limit(1);
  if (!task) return { allowed: false };
  if (role === 'admin') return { allowed: true, task };
  if (task.userId === userId) return { allowed: true, task };
  const { allowed } = await verifyProjectOwner(userId, tenantId, task.projectId, role);
  return { allowed, task };
}

async function verifyNoteOwner(userId: string, tenantId: string, noteId: string, role: string): Promise<boolean> {
  const [note] = await db.select().from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.tenantId, tenantId)))
    .limit(1);
  if (!note) return false;
  if (role === 'admin') return true;
  return note.userId === userId;
}

const VALID_PROJECT_STATUS = ['active', 'archived', 'completed'];
const VALID_TASK_STATUS = ['todo', 'in_progress', 'done', 'canceled'];
const VALID_PRIORITY = ['low', 'medium', 'high', 'urgent'];

export async function registerSaasRoutes(app: FastifyInstance) {
  app.get('/v1/saas/workspaces', { preHandler: [requireTenantMember] }, async (request) => {
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const owned = await db.select().from(saasWorkspaces)
      .where(and(eq(saasWorkspaces.ownerId, user.id), eq(saasWorkspaces.tenantId, ctx.tenantId)))
      .orderBy(desc(saasWorkspaces.createdAt));
    const memberships = await db.select().from(workspaceMemberships).where(eq(workspaceMemberships.userId, user.id));
    const memberWorkspaceIds = memberships.map(m => m.workspaceId);
    let memberWorkspaces: any[] = [];
    for (const wid of memberWorkspaceIds) {
      if (!owned.find(o => o.id === wid)) {
        const [ws] = await db.select().from(saasWorkspaces)
          .where(and(eq(saasWorkspaces.id, wid), eq(saasWorkspaces.tenantId, ctx.tenantId)))
          .limit(1);
        if (ws) memberWorkspaces.push(ws);
      }
    }
    return { workspaces: [...owned, ...memberWorkspaces] };
  });

  app.post('/v1/saas/workspaces', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const { name, description } = request.body as any;
    if (!name || typeof name !== 'string' || name.trim().length === 0) return reply.code(400).send({ error: 'Name is required' });
    if (name.length > 100) return reply.code(400).send({ error: 'Name too long' });

    if (user.role !== 'admin') {
      const check = await checkResourceLimit(user.id, ctx.tenantId, 'maxWorkspaces');
      if (!check.allowed) {
        return reply.code(403).send({ error: check.message, code: 'RESOURCE_LIMIT_REACHED', resource: 'workspaces', limit: check.limit, used: check.used, upgradeSlug: check.upgradeSlug, upgrade: true });
      }
    }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const [ws] = await db.insert(saasWorkspaces).values({
      tenantId: ctx.tenantId, ownerId: user.id, name: name.trim(), slug, description: description?.trim(),
    }).returning();
    await db.insert(workspaceMemberships).values({ workspaceId: ws.id, userId: user.id, role: 'owner' });
    await logActivity(user.id, ctx.tenantId, 'created', 'workspace', ws.id, ws.id);
    return ws;
  });

  app.get('/v1/saas/workspaces/:id', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const { id } = request.params as any;
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const [ws] = await db.select().from(saasWorkspaces)
      .where(and(eq(saasWorkspaces.id, id), eq(saasWorkspaces.tenantId, ctx.tenantId)))
      .limit(1);
    if (!ws) return reply.code(404).send({ error: 'Workspace not found' });
    if (!await verifyWorkspaceMember(user.id, ctx.tenantId, id, user.role)) return reply.code(403).send({ error: 'Access denied' });
    const members = await db.select().from(workspaceMemberships).where(eq(workspaceMemberships.workspaceId, id));
    return { ...ws, members };
  });

  app.delete('/v1/saas/workspaces/:id', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const { id } = request.params as any;
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const [ws] = await db.select().from(saasWorkspaces)
      .where(and(eq(saasWorkspaces.id, id), eq(saasWorkspaces.tenantId, ctx.tenantId)))
      .limit(1);
    if (!ws) return reply.code(404).send({ error: 'Workspace not found' });
    if (ws.ownerId !== user.id && user.role !== 'admin') return reply.code(403).send({ error: 'Only owner can delete' });

    await db.delete(workspaceMemberships).where(eq(workspaceMemberships.workspaceId, id));
    const projects = await db.select().from(saasProjects).where(eq(saasProjects.workspaceId, id));
    for (const p of projects) {
      await db.delete(saasTasks).where(eq(saasTasks.projectId, p.id));
    }
    await db.delete(saasProjects).where(eq(saasProjects.workspaceId, id));
    await db.delete(notes).where(eq(notes.workspaceId, id));
    await db.delete(saasWorkspaces).where(eq(saasWorkspaces.id, id));
    return { ok: true };
  });

  app.get('/v1/saas/workspaces/:wsId/projects', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const { wsId } = request.params as any;
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    if (!await verifyWorkspaceMember(user.id, ctx.tenantId, wsId, user.role)) return reply.code(403).send({ error: 'Access denied' });
    const projects = await db.select().from(saasProjects)
      .where(and(eq(saasProjects.workspaceId, wsId), eq(saasProjects.tenantId, ctx.tenantId)))
      .orderBy(desc(saasProjects.createdAt));
    return { projects };
  });

  app.post('/v1/saas/workspaces/:wsId/projects', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const { wsId } = request.params as any;
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    if (!await verifyWorkspaceMember(user.id, ctx.tenantId, wsId, user.role)) return reply.code(403).send({ error: 'Access denied' });

    const { name, description, color } = request.body as any;
    if (!name || typeof name !== 'string' || name.trim().length === 0) return reply.code(400).send({ error: 'Name is required' });
    if (name.length > 200) return reply.code(400).send({ error: 'Name too long' });

    if (user.role !== 'admin') {
      const check = await checkResourceLimit(user.id, ctx.tenantId, 'maxProjects');
      if (!check.allowed) {
        return reply.code(403).send({ error: check.message, code: 'RESOURCE_LIMIT_REACHED', resource: 'projects', limit: check.limit, used: check.used, upgradeSlug: check.upgradeSlug, upgrade: true });
      }
    }

    const [project] = await db.insert(saasProjects).values({
      tenantId: ctx.tenantId, workspaceId: wsId, userId: user.id,
      name: name.trim(), description: description?.trim(), color: color || '#3b82f6',
    }).returning();
    await logActivity(user.id, ctx.tenantId, 'created', 'project', project.id, wsId, { name: name.trim() });
    return project;
  });

  app.put('/v1/saas/projects/:id', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const { id } = request.params as any;
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const { allowed, project } = await verifyProjectOwner(user.id, ctx.tenantId, id, user.role);
    if (!allowed || !project) return reply.code(project ? 403 : 404).send({ error: project ? 'Access denied' : 'Project not found' });

    const { name, description, status, color } = request.body as any;
    if (status && !VALID_PROJECT_STATUS.includes(status)) return reply.code(400).send({ error: 'Invalid status' });

    const updates: any = { updatedAt: new Date() };
    if (name && typeof name === 'string') updates.name = name.trim();
    if (description !== undefined) updates.description = description;
    if (status) updates.status = status;
    if (color) updates.color = color;
    const [updated] = await db.update(saasProjects).set(updates).where(eq(saasProjects.id, id)).returning();
    return updated;
  });

  app.delete('/v1/saas/projects/:id', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const { id } = request.params as any;
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const { allowed, project } = await verifyProjectOwner(user.id, ctx.tenantId, id, user.role);
    if (!allowed || !project) return reply.code(project ? 403 : 404).send({ error: project ? 'Access denied' : 'Project not found' });

    await db.delete(saasTasks).where(eq(saasTasks.projectId, id));
    await db.delete(saasProjects).where(eq(saasProjects.id, id));
    return { ok: true };
  });

  app.get('/v1/saas/projects/:projectId/tasks', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const { projectId } = request.params as any;
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const { allowed } = await verifyProjectOwner(user.id, ctx.tenantId, projectId, user.role);
    if (!allowed) return reply.code(403).send({ error: 'Access denied' });

    const tasks = await db.select().from(saasTasks)
      .where(and(eq(saasTasks.projectId, projectId), eq(saasTasks.tenantId, ctx.tenantId)))
      .orderBy(desc(saasTasks.createdAt));
    return { tasks };
  });

  app.post('/v1/saas/projects/:projectId/tasks', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const { projectId } = request.params as any;
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const { allowed, project } = await verifyProjectOwner(user.id, ctx.tenantId, projectId, user.role);
    if (!allowed || !project) return reply.code(project ? 403 : 404).send({ error: project ? 'Access denied' : 'Project not found' });

    const { title, description, priority, dueDate, assigneeId } = request.body as any;
    if (!title || typeof title !== 'string' || title.trim().length === 0) return reply.code(400).send({ error: 'Title is required' });
    if (title.length > 500) return reply.code(400).send({ error: 'Title too long' });
    if (priority && !VALID_PRIORITY.includes(priority)) return reply.code(400).send({ error: 'Invalid priority' });

    if (user.role !== 'admin') {
      const check = await checkResourceLimit(user.id, ctx.tenantId, 'maxTasks');
      if (!check.allowed) {
        return reply.code(403).send({ error: check.message, code: 'RESOURCE_LIMIT_REACHED', resource: 'tasks', limit: check.limit, used: check.used, upgradeSlug: check.upgradeSlug, upgrade: true });
      }
    }

    const [task] = await db.insert(saasTasks).values({
      tenantId: ctx.tenantId, projectId, userId: user.id,
      title: title.trim(), description: description?.trim(),
      priority: priority || 'medium',
      dueDate: dueDate ? new Date(dueDate) : undefined,
      assigneeId,
    }).returning();
    await logActivity(user.id, ctx.tenantId, 'created', 'task', task.id, project.workspaceId, { title: title.trim() });
    return task;
  });

  app.put('/v1/saas/tasks/:id', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const { id } = request.params as any;
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const { allowed, task } = await verifyTaskOwner(user.id, ctx.tenantId, id, user.role);
    if (!allowed || !task) return reply.code(task ? 403 : 404).send({ error: task ? 'Access denied' : 'Task not found' });

    const { title, description, status, priority, dueDate, assigneeId } = request.body as any;
    if (status && !VALID_TASK_STATUS.includes(status)) return reply.code(400).send({ error: 'Invalid status' });
    if (priority && !VALID_PRIORITY.includes(priority)) return reply.code(400).send({ error: 'Invalid priority' });

    const updates: any = { updatedAt: new Date() };
    if (title && typeof title === 'string') updates.title = title.trim();
    if (description !== undefined) updates.description = description;
    if (status) updates.status = status;
    if (priority) updates.priority = priority;
    if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
    if (assigneeId !== undefined) updates.assigneeId = assigneeId;
    const [updated] = await db.update(saasTasks).set(updates).where(eq(saasTasks.id, id)).returning();
    return updated;
  });

  app.delete('/v1/saas/tasks/:id', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const { id } = request.params as any;
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const { allowed, task } = await verifyTaskOwner(user.id, ctx.tenantId, id, user.role);
    if (!allowed || !task) return reply.code(task ? 403 : 404).send({ error: task ? 'Access denied' : 'Task not found' });

    await db.delete(saasTasks).where(eq(saasTasks.id, id));
    return { ok: true };
  });

  app.get('/v1/saas/notes', { preHandler: [requireTenantMember] }, async (request) => {
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const { workspaceId, projectId } = request.query as any;
    const allNotes = await db.select().from(notes)
      .where(and(eq(notes.userId, user.id), eq(notes.tenantId, ctx.tenantId)))
      .orderBy(desc(notes.createdAt));
    let filtered = allNotes;
    if (workspaceId) filtered = filtered.filter(n => n.workspaceId === workspaceId);
    if (projectId) filtered = filtered.filter(n => n.projectId === projectId);
    return { notes: filtered };
  });

  app.post('/v1/saas/notes', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const { title, content, workspaceId, projectId, isPinned } = request.body as any;
    if (!title || typeof title !== 'string' || title.trim().length === 0) return reply.code(400).send({ error: 'Title is required' });
    if (title.length > 500) return reply.code(400).send({ error: 'Title too long' });

    if (workspaceId && !await verifyWorkspaceMember(user.id, ctx.tenantId, workspaceId, user.role)) {
      return reply.code(403).send({ error: 'Access denied to workspace' });
    }

    const [note] = await db.insert(notes).values({
      tenantId: ctx.tenantId, userId: user.id, title: title.trim(), content: content || '',
      workspaceId, projectId, isPinned: isPinned || false,
    }).returning();
    await logActivity(user.id, ctx.tenantId, 'created', 'note', note.id, workspaceId);
    return note;
  });

  app.put('/v1/saas/notes/:id', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const { id } = request.params as any;
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    if (!await verifyNoteOwner(user.id, ctx.tenantId, id, user.role)) return reply.code(403).send({ error: 'Access denied' });

    const { title, content, isPinned } = request.body as any;
    const updates: any = { updatedAt: new Date() };
    if (title && typeof title === 'string') updates.title = title.trim();
    if (content !== undefined) updates.content = content;
    if (isPinned !== undefined) updates.isPinned = isPinned;
    const [updated] = await db.update(notes).set(updates).where(eq(notes.id, id)).returning();
    if (!updated) return reply.code(404).send({ error: 'Note not found' });
    return updated;
  });

  app.delete('/v1/saas/notes/:id', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const { id } = request.params as any;
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    if (!await verifyNoteOwner(user.id, ctx.tenantId, id, user.role)) return reply.code(403).send({ error: 'Access denied' });

    await db.delete(notes).where(eq(notes.id, id));
    return { ok: true };
  });

  app.get('/v1/saas/activity', { preHandler: [requireTenantMember] }, async (request) => {
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const { workspaceId, limit: lim } = request.query as any;
    const maxItems = Math.min(parseInt(lim) || 50, 100);
    let all = await db.select().from(activityFeed)
      .where(and(eq(activityFeed.userId, user.id), eq(activityFeed.tenantId, ctx.tenantId)))
      .orderBy(desc(activityFeed.createdAt)).limit(maxItems);
    if (workspaceId) all = all.filter(a => a.workspaceId === workspaceId);
    return { activities: all };
  });

  app.get('/v1/saas/dashboard', { preHandler: [requireTenantMember] }, async (request) => {
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const limits = await getUserPlanLimits(user.id);
    const usage = await getUserUsageSummary(user.id, ctx.tenantId);
    const { config } = await getUserPlanConfig(user.id);

    const [{ value: noteCount }] = await db.select({ value: count() }).from(notes)
      .where(and(eq(notes.userId, user.id), eq(notes.tenantId, ctx.tenantId)));

    const todoTasks = await db.select({ value: count() }).from(saasTasks)
      .where(and(eq(saasTasks.userId, user.id), eq(saasTasks.tenantId, ctx.tenantId), eq(saasTasks.status, 'todo')));
    const inProgressTasks = await db.select({ value: count() }).from(saasTasks)
      .where(and(eq(saasTasks.userId, user.id), eq(saasTasks.tenantId, ctx.tenantId), eq(saasTasks.status, 'in_progress')));
    const doneTasks = await db.select({ value: count() }).from(saasTasks)
      .where(and(eq(saasTasks.userId, user.id), eq(saasTasks.tenantId, ctx.tenantId), eq(saasTasks.status, 'done')));

    const recentActivity = await db.select().from(activityFeed)
      .where(and(eq(activityFeed.userId, user.id), eq(activityFeed.tenantId, ctx.tenantId)))
      .orderBy(desc(activityFeed.createdAt)).limit(10);

    return {
      stats: {
        workspaces: usage.workspaces.used,
        projects: usage.projects.used,
        tasks: usage.tasks.used,
        notes: noteCount,
        tasksByStatus: { todo: todoTasks[0].value, inProgress: inProgressTasks[0].value, done: doneTasks[0].value },
      },
      limits,
      usage,
      features: config.features,
      recentActivity,
    };
  });

  app.get('/v1/saas/plans', async () => {
    const { subscriptionPlans } = await import('../schema.js');
    const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
    return { plans };
  });
}
