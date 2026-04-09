import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import {
  users, subscriptions, subscriptionPlans, saasWorkspaces, saasProjects,
  saasTasks, notes, adminAuditLogs, billingEvents, activityFeed,
} from '../schema.js';
import { eq, desc, count } from 'drizzle-orm';
import { requireAdmin, sanitizeUser, logAudit } from '../lib/auth.js';

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get('/v1/admin/users', { preHandler: [requireAdmin] }, async (request) => {
    const { search, status, page: pg, limit: lim } = request.query as any;
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

    const total = allUsers.length;
    const paginated = allUsers.slice(offset, offset + limit);

    const usersWithSubs = [];
    for (const u of paginated) {
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, u.id)).limit(1);
      let planName = 'None';
      if (sub) {
        const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
        planName = plan?.name || 'Unknown';
      }
      usersWithSubs.push({ ...u, subscription: sub || null, planName });
    }

    return { users: usersWithSubs, total, page, limit, pages: Math.ceil(total / limit) };
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

    const recentActivity = await db.select().from(activityFeed).where(eq(activityFeed.userId, id)).orderBy(desc(activityFeed.createdAt)).limit(10);
    const auditHistory = await db.select().from(adminAuditLogs).where(eq(adminAuditLogs.targetUserId, id)).orderBy(desc(adminAuditLogs.createdAt)).limit(20);

    return {
      user: sanitizeUser(user),
      subscription: sub || null,
      plan,
      stats: { workspaces: wsCount, projects: projCount, tasks: taskCount },
      recentActivity,
      auditHistory,
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
      metadata: { adminId: admin.id, planSlug },
    });

    return { ok: true, plan: plan.name };
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

    const [{ value: totalProjects }] = await db.select({ value: count() }).from(saasProjects);
    const [{ value: totalTasks }] = await db.select({ value: count() }).from(saasTasks);
    const [{ value: totalNotes }] = await db.select({ value: count() }).from(notes);
    const [{ value: totalWorkspaces }] = await db.select({ value: count() }).from(saasWorkspaces);

    return {
      users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers, deleted: deletedUsers },
      subscriptions: planCounts,
      content: { projects: totalProjects, tasks: totalTasks, notes: totalNotes, workspaces: totalWorkspaces },
    };
  });

  app.get('/v1/admin/audit-log', { preHandler: [requireAdmin] }, async (request) => {
    const { limit: lim, page: pg, action, userId } = request.query as any;
    const limit = Math.min(parseInt(lim) || 50, 100);
    const offset = ((parseInt(pg) || 1) - 1) * limit;

    let logs = await db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(limit).offset(offset);

    if (action) logs = logs.filter(l => l.action === action);
    if (userId) logs = logs.filter(l => l.targetUserId === userId || l.adminId === userId);

    const [{ value: total }] = await db.select({ value: count() }).from(adminAuditLogs);
    return { logs, total };
  });
}
