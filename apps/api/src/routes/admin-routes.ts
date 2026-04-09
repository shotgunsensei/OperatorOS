import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import {
  users, subscriptions, subscriptionPlans, saasWorkspaces, saasProjects,
  saasTasks, notes, adminAuditLogs, billingEvents, activityFeed, adminNotes,
  workspaceMemberships,
} from '../schema.js';
import { eq, desc, count, gte, and, or, ilike } from 'drizzle-orm';
import { requireAdmin, sanitizeUser, logAudit } from '../lib/auth.js';

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get('/v1/admin/users', { preHandler: [requireAdmin] }, async (request) => {
    const { search, status, plan, role, sort, order, page: pg, limit: lim } = request.query as any;
    const page = parseInt(pg) || 1;
    const limit = Math.min(parseInt(lim) || 25, 100);
    const offset = (page - 1) * limit;

    let allUsers = await db.select({
      id: users.id, email: users.email, name: users.name, role: users.role,
      status: users.status, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt,
      avatarUrl: users.avatarUrl, planId: users.planId, deletedAt: users.deletedAt,
      failedLoginCount: users.failedLoginCount, lockedUntil: users.lockedUntil,
    }).from(users).orderBy(desc(users.createdAt));

    if (search) {
      const s = search.toLowerCase();
      allUsers = allUsers.filter(u => u.email.toLowerCase().includes(s) || u.name.toLowerCase().includes(s));
    }
    if (status) {
      allUsers = allUsers.filter(u => u.status === status);
    }
    if (role) {
      allUsers = allUsers.filter(u => u.role === role);
    }

    const usersWithSubs = [];
    for (const u of allUsers) {
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, u.id)).limit(1);
      let planName = 'None';
      let planSlug = 'none';
      if (sub) {
        const [p] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
        planName = p?.name || 'Unknown';
        planSlug = p?.slug || 'unknown';
      }
      usersWithSubs.push({ ...u, subscription: sub || null, planName, planSlug });
    }

    let filtered = usersWithSubs;
    if (plan) {
      filtered = filtered.filter(u => u.planSlug === plan);
    }

    if (sort) {
      const dir = order === 'asc' ? 1 : -1;
      filtered.sort((a: any, b: any) => {
        const va = a[sort] ?? '';
        const vb = b[sort] ?? '';
        if (va < vb) return -dir;
        if (va > vb) return dir;
        return 0;
      });
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return { users: paginated, total, page, limit, pages: Math.ceil(total / limit) };
  });

  app.get('/v1/admin/users/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as any;
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) return reply.code(404).send({ error: 'User not found' });

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, id)).limit(1);
    let plan = null;
    if (sub) {
      [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
    }

    const [{ value: wsCount }] = await db.select({ value: count() }).from(saasWorkspaces).where(eq(saasWorkspaces.ownerId, id));
    const [{ value: projCount }] = await db.select({ value: count() }).from(saasProjects).where(eq(saasProjects.userId, id));
    const [{ value: taskCount }] = await db.select({ value: count() }).from(saasTasks).where(eq(saasTasks.userId, id));
    const [{ value: noteCount }] = await db.select({ value: count() }).from(notes).where(eq(notes.userId, id));

    const recentActivity = await db.select().from(activityFeed).where(eq(activityFeed.userId, id)).orderBy(desc(activityFeed.createdAt)).limit(10);
    const auditHistory = await db.select().from(adminAuditLogs).where(eq(adminAuditLogs.targetUserId, id)).orderBy(desc(adminAuditLogs.createdAt)).limit(20);

    const userBillingEvents = await db.select().from(billingEvents).where(eq(billingEvents.userId, id)).orderBy(desc(billingEvents.createdAt)).limit(20);

    const userNotes = await db.select({
      id: adminNotes.id,
      adminId: adminNotes.adminId,
      content: adminNotes.content,
      createdAt: adminNotes.createdAt,
      updatedAt: adminNotes.updatedAt,
    }).from(adminNotes).where(eq(adminNotes.targetUserId, id)).orderBy(desc(adminNotes.createdAt));

    const adminIds = [...new Set(userNotes.map(n => n.adminId))];
    const adminMap: Record<string, string> = {};
    for (const aid of adminIds) {
      const [a] = await db.select({ name: users.name }).from(users).where(eq(users.id, aid)).limit(1);
      adminMap[aid] = a?.name || 'Unknown';
    }
    const notesWithAdmin = userNotes.map(n => ({ ...n, adminName: adminMap[n.adminId] || 'Unknown' }));

    return {
      user: sanitizeUser(user),
      subscription: sub || null,
      plan,
      stats: { workspaces: wsCount, projects: projCount, tasks: taskCount, notes: noteCount },
      recentActivity,
      auditHistory,
      billingEvents: userBillingEvents,
      adminNotes: notesWithAdmin,
    };
  });

  app.put('/v1/admin/users/:id/status', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const { id } = request.params as any;
    const { status, reason } = request.body as any;

    if (!['active', 'suspended', 'deleted'].includes(status)) {
      return reply.code(400).send({ error: 'Invalid status. Allowed: active, suspended, deleted' });
    }

    if (id === admin.id) {
      return reply.code(400).send({ error: 'Cannot change your own status' });
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) return reply.code(404).send({ error: 'User not found' });

    const previousStatus = targetUser.status;
    const updates: any = { status, updatedAt: new Date() };

    if (status === 'deleted') {
      updates.deletedAt = new Date();
    }
    if (status === 'active' && previousStatus === 'suspended') {
      updates.failedLoginCount = 0;
      updates.lockedUntil = null;
    }

    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();

    const actionName = status === 'suspended' ? 'user_suspended' : status === 'active' ? 'user_reactivated' : 'user_deleted';
    await logAudit(admin.id, actionName, id, { previousStatus, newStatus: status, reason: reason || null }, request.ip);

    return { user: sanitizeUser(updated), previousStatus };
  });

  app.put('/v1/admin/users/:id/role', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const { id } = request.params as any;
    const { role } = request.body as any;

    if (!['user', 'admin'].includes(role)) {
      return reply.code(400).send({ error: 'Invalid role. Allowed: user, admin' });
    }

    if (id === admin.id) {
      return reply.code(400).send({ error: 'Cannot change your own role' });
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) return reply.code(404).send({ error: 'User not found' });

    const previousRole = targetUser.role;
    const [updated] = await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id)).returning();

    await logAudit(admin.id, 'user_role_changed', id, { previousRole, newRole: role }, request.ip);
    return { user: sanitizeUser(updated), previousRole };
  });

  app.put('/v1/admin/users/:id/plan', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const { id } = request.params as any;
    const { planSlug } = request.body as any;

    if (!planSlug || typeof planSlug !== 'string') {
      return reply.code(400).send({ error: 'Plan slug is required' });
    }

    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, planSlug)).limit(1);
    if (!plan) return reply.code(404).send({ error: 'Plan not found' });

    const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, id)).limit(1);
    const previousPlan = existingSub?.planId;

    if (existingSub) {
      await db.update(subscriptions).set({
        planId: plan.id, status: 'active', updatedAt: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }).where(eq(subscriptions.id, existingSub.id));
    } else {
      await db.insert(subscriptions).values({
        userId: id, planId: plan.id, status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    }

    await logAudit(admin.id, 'user_plan_changed', id, { previousPlanId: previousPlan, newPlan: planSlug }, request.ip);

    await db.insert(billingEvents).values({
      userId: id, eventType: 'plan_changed_by_admin',
      metadata: { adminId: admin.id, planSlug, previousPlanId: previousPlan },
    });

    return { ok: true, plan: plan.name };
  });

  app.put('/v1/admin/users/:id/subscription-status', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const { id } = request.params as any;
    const { status, reason } = request.body as any;

    if (!['active', 'past_due', 'canceled', 'trialing', 'expired'].includes(status)) {
      return reply.code(400).send({ error: 'Invalid subscription status' });
    }

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, id)).limit(1);
    if (!sub) return reply.code(404).send({ error: 'No subscription found for this user' });

    const previousStatus = sub.status;
    await db.update(subscriptions).set({ status, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));

    await logAudit(admin.id, 'subscription_status_changed', id, { previousStatus, newStatus: status, reason: reason || null }, request.ip);
    await db.insert(billingEvents).values({
      userId: id, eventType: 'subscription_status_override',
      metadata: { adminId: admin.id, previousStatus, newStatus: status, reason: reason || null },
    });

    return { ok: true, previousStatus, newStatus: status };
  });

  app.put('/v1/admin/users/:id/trial', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const { id } = request.params as any;
    const { trialEndDate } = request.body as any;

    if (!trialEndDate) return reply.code(400).send({ error: 'Trial end date is required' });

    const endDate = new Date(trialEndDate);
    if (isNaN(endDate.getTime())) return reply.code(400).send({ error: 'Invalid date format' });

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, id)).limit(1);
    if (!sub) return reply.code(404).send({ error: 'No subscription found for this user' });

    await db.update(subscriptions).set({
      status: 'trialing',
      currentPeriodEnd: endDate,
      updatedAt: new Date(),
    }).where(eq(subscriptions.id, sub.id));

    await logAudit(admin.id, 'trial_set', id, { trialEndDate: endDate.toISOString() }, request.ip);
    await db.insert(billingEvents).values({
      userId: id, eventType: 'trial_set_by_admin',
      metadata: { adminId: admin.id, trialEndDate: endDate.toISOString() },
    });

    return { ok: true, trialEndDate: endDate.toISOString() };
  });

  app.put('/v1/admin/users/:id/unlock', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const { id } = request.params as any;

    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) return reply.code(404).send({ error: 'User not found' });

    await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, id));
    await logAudit(admin.id, 'user_unlocked', id, { wasLocked: !!targetUser.lockedUntil }, request.ip);

    return { ok: true, message: 'User account unlocked' };
  });

  app.delete('/v1/admin/users/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const { id } = request.params as any;

    if (id === admin.id) return reply.code(400).send({ error: 'Cannot delete yourself' });

    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) return reply.code(404).send({ error: 'User not found' });

    await db.update(users).set({ status: 'deleted', deletedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, id));
    await logAudit(admin.id, 'user_deleted', id, { email: targetUser.email }, request.ip);
    return { ok: true };
  });

  app.delete('/v1/admin/users/:id/hard', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const { id } = request.params as any;

    if (id === admin.id) return reply.code(400).send({ error: 'Cannot delete yourself' });

    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) return reply.code(404).send({ error: 'User not found' });

    if (targetUser.status !== 'deleted') {
      return reply.code(400).send({ error: 'User must be soft-deleted first before hard delete' });
    }

    const [{ value: wsCount }] = await db.select({ value: count() }).from(saasWorkspaces).where(eq(saasWorkspaces.ownerId, id));
    const [{ value: projCount }] = await db.select({ value: count() }).from(saasProjects).where(eq(saasProjects.userId, id));

    if (wsCount > 0 || projCount > 0) {
      return reply.code(400).send({
        error: 'Cannot hard delete user with existing workspaces or projects. Clean up their data first.',
        remaining: { workspaces: wsCount, projects: projCount },
      });
    }

    await db.delete(adminNotes).where(eq(adminNotes.targetUserId, id));
    await db.delete(activityFeed).where(eq(activityFeed.userId, id));
    await db.delete(saasTasks).where(eq(saasTasks.userId, id));
    await db.delete(notes).where(eq(notes.userId, id));
    await db.delete(workspaceMemberships).where(eq(workspaceMemberships.userId, id));
    await db.delete(billingEvents).where(eq(billingEvents.userId, id));
    await db.delete(subscriptions).where(eq(subscriptions.userId, id));
    await db.delete(users).where(eq(users.id, id));

    await logAudit(admin.id, 'user_hard_deleted', null as any, { email: targetUser.email, userId: id }, request.ip);
    return { ok: true, message: 'User permanently deleted' };
  });

  app.post('/v1/admin/users/:id/notes', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const { id } = request.params as any;
    const { content } = request.body as any;

    if (!content?.trim()) return reply.code(400).send({ error: 'Note content is required' });

    const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) return reply.code(404).send({ error: 'User not found' });

    const [note] = await db.insert(adminNotes).values({
      adminId: admin.id,
      targetUserId: id,
      content: content.trim(),
    }).returning();

    await logAudit(admin.id, 'admin_note_added', id, { noteId: note.id }, request.ip);

    return { note: { ...note, adminName: admin.name } };
  });

  app.delete('/v1/admin/notes/:noteId', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const { noteId } = request.params as any;

    const [note] = await db.select().from(adminNotes).where(eq(adminNotes.id, noteId)).limit(1);
    if (!note) return reply.code(404).send({ error: 'Note not found' });

    await db.delete(adminNotes).where(eq(adminNotes.id, noteId));
    await logAudit(admin.id, 'admin_note_deleted', note.targetUserId, { noteId }, request.ip);

    return { ok: true };
  });

  app.get('/v1/admin/metrics', { preHandler: [requireAdmin] }, async () => {
    const [{ value: totalUsers }] = await db.select({ value: count() }).from(users);
    const [{ value: activeUsers }] = await db.select({ value: count() }).from(users).where(eq(users.status, 'active'));
    const [{ value: suspendedUsers }] = await db.select({ value: count() }).from(users).where(eq(users.status, 'suspended'));
    const [{ value: deletedUsers }] = await db.select({ value: count() }).from(users).where(eq(users.status, 'deleted'));

    const plans = await db.select().from(subscriptionPlans);
    const planCounts: Record<string, number> = {};
    for (const plan of plans) {
      const [{ value: c }] = await db.select({ value: count() }).from(subscriptions)
        .where(eq(subscriptions.planId, plan.id));
      planCounts[plan.slug] = c;
    }

    const trialingSubs = await db.select({ value: count() }).from(subscriptions).where(eq(subscriptions.status, 'trialing'));
    const trialingCount = trialingSubs[0]?.value || 0;

    const [{ value: totalProjects }] = await db.select({ value: count() }).from(saasProjects);
    const [{ value: totalTasks }] = await db.select({ value: count() }).from(saasTasks);
    const [{ value: totalNotes }] = await db.select({ value: count() }).from(notes);
    const [{ value: totalWorkspaces }] = await db.select({ value: count() }).from(saasWorkspaces);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentSignups = await db.select({
      id: users.id, name: users.name, email: users.email, createdAt: users.createdAt,
    }).from(users).where(gte(users.createdAt, sevenDaysAgo)).orderBy(desc(users.createdAt)).limit(10);

    const recentActions = await db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(10);

    const adminIds = [...new Set(recentActions.map(a => a.adminId))];
    const adminNameMap: Record<string, string> = {};
    for (const aid of adminIds) {
      const [a] = await db.select({ name: users.name }).from(users).where(eq(users.id, aid)).limit(1);
      adminNameMap[aid] = a?.name || 'Unknown';
    }
    const actionsWithNames = recentActions.map(a => ({ ...a, adminName: adminNameMap[a.adminId] || 'Unknown' }));

    return {
      users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers, deleted: deletedUsers, trialing: trialingCount },
      subscriptions: planCounts,
      content: { projects: totalProjects, tasks: totalTasks, notes: totalNotes, workspaces: totalWorkspaces },
      recentSignups,
      recentActions: actionsWithNames,
    };
  });

  app.get('/v1/admin/audit-log', { preHandler: [requireAdmin] }, async (request) => {
    const { limit: lim, page: pg, action, userId, search } = request.query as any;
    const limit = Math.min(parseInt(lim) || 50, 100);
    const offset = ((parseInt(pg) || 1) - 1) * limit;

    let logs = await db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(200);

    if (action) logs = logs.filter(l => l.action === action);
    if (userId) logs = logs.filter(l => l.targetUserId === userId || l.adminId === userId);
    if (search) {
      const s = search.toLowerCase();
      logs = logs.filter(l => l.action.toLowerCase().includes(s) || JSON.stringify(l.details || {}).toLowerCase().includes(s));
    }

    const adminIds = [...new Set(logs.map(l => l.adminId))];
    const targetIds = [...new Set(logs.filter(l => l.targetUserId).map(l => l.targetUserId!))];
    const allIds = [...new Set([...adminIds, ...targetIds])];
    const nameMap: Record<string, string> = {};
    for (const uid of allIds) {
      const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, uid)).limit(1);
      nameMap[uid] = u?.name || u?.email || 'Deleted user';
    }

    const enrichedLogs = logs.map(l => ({
      ...l,
      adminName: nameMap[l.adminId] || 'Unknown',
      targetUserName: l.targetUserId ? (nameMap[l.targetUserId] || 'Unknown') : null,
    }));

    const total = enrichedLogs.length;
    const paginated = enrichedLogs.slice(offset, offset + limit);

    return { logs: paginated, total, page: parseInt(pg) || 1 };
  });

  app.get('/v1/admin/billing-events', { preHandler: [requireAdmin] }, async (request) => {
    const { limit: lim, page: pg, userId, eventType } = request.query as any;
    const limit = Math.min(parseInt(lim) || 50, 100);
    const offset = ((parseInt(pg) || 1) - 1) * limit;

    let events = await db.select().from(billingEvents).orderBy(desc(billingEvents.createdAt)).limit(200);

    if (userId) events = events.filter(e => e.userId === userId);
    if (eventType) events = events.filter(e => e.eventType === eventType);

    const userIds = [...new Set(events.map(e => e.userId))];
    const nameMap: Record<string, string> = {};
    for (const uid of userIds) {
      const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, uid)).limit(1);
      nameMap[uid] = u?.name || u?.email || 'Deleted';
    }

    const enriched = events.map(e => ({ ...e, userName: nameMap[e.userId] || 'Unknown' }));
    const total = enriched.length;
    const paginated = enriched.slice(offset, offset + limit);

    return { events: paginated, total, page: parseInt(pg) || 1 };
  });
}
