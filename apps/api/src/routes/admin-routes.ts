import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import {
  users, subscriptions, subscriptionPlans, saasWorkspaces, saasProjects,
  saasTasks, notes, adminAuditLogs, billingEvents, activityFeed, adminNotes,
  workspaceMemberships,
  modules, planModules, addonSubscriptions, entitlementOverrides,
} from '../schema.js';
import { eq, desc, count, gte, and, or, ilike } from 'drizzle-orm';
import { requireAdmin, sanitizeUser, logAudit } from '../lib/auth.js';
import { retryBillingEvent, resyncUserBilling } from '../lib/billing-service.js';
import { getAccessBreakdown, getModuleAccessTrace } from '../lib/entitlement-service.js';

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

  // -------------------------------------------------------------------------
  // Billing-event DLQ retry
  // -------------------------------------------------------------------------
  // Spec-canonical path: /v1/admin/billing/events/:eventId/retry. We keep
  // the legacy /v1/admin/billing-events/:id/retry path registered too as
  // a transitional alias so existing UI builds keep working — but every
  // new caller MUST use the canonical path. Both routes share a single
  // handler factory below.
  const retryHandler = async (request: any, reply: any) => {
    const admin = request.user;
    const params = request.params as { id?: string; eventId?: string };
    const eventId = params.eventId || params.id;
    if (!eventId) return reply.code(400).send({ ok: false, message: 'eventId required' });
    const result = await retryBillingEvent(eventId);
    if (!result.ok) return reply.code(400).send(result);
    await logAudit(admin.id, 'billing_event_retried', null as any, { eventId }, request.ip);
    return result;
  };
  app.post('/v1/admin/billing/events/:eventId/retry', { preHandler: [requireAdmin] }, retryHandler);
  app.post('/v1/admin/billing-events/:id/retry', { preHandler: [requireAdmin] }, retryHandler);

  // -------------------------------------------------------------------------
  // Webhook-miss recovery: re-fetch a user's Stripe state and reconcile
  // local subscription rows. Use this when webhooks were missed (endpoint
  // down, signature secret rotated, etc.). Idempotent.
  // -------------------------------------------------------------------------
  app.post('/v1/admin/billing/resync/:userId', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const { userId } = request.params as { userId: string };

    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return reply.code(404).send({ error: 'User not found' });

    const result = await resyncUserBilling(userId);
    await logAudit(admin.id, 'billing_resync_triggered', userId, {
      mode: result.mode, scanned: result.scanned, reconciled: result.reconciled,
    }, request.ip);
    return result;
  });

  // -------------------------------------------------------------------------
  // Module catalog admin
  // -------------------------------------------------------------------------
  app.get('/v1/admin/modules', { preHandler: [requireAdmin] }, async () => {
    const rows = await db.select().from(modules).orderBy(modules.ord);
    const allPlans = await db.select().from(subscriptionPlans);
    const planMap = Object.fromEntries(allPlans.map(p => [p.id, p.slug]));
    const mappings = await db.select().from(planModules);
    const byModule: Record<string, string[]> = {};
    for (const m of mappings) {
      const slug = planMap[m.planId];
      if (!slug) continue;
      if (!byModule[m.moduleId]) byModule[m.moduleId] = [];
      byModule[m.moduleId].push(slug);
    }
    const enriched = rows.map(r => ({ ...r, includedInPlans: byModule[r.id] ?? [] }));
    return { modules: enriched };
  });

  app.post('/v1/admin/modules', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const body = request.body as any;
    const { slug, name } = body;
    if (!slug || !name) return reply.code(400).send({ error: 'slug and name are required' });

    const validStatuses = ['live', 'beta', 'coming_soon', 'disabled'];
    if (body.status && !validStatuses.includes(body.status)) {
      return reply.code(400).send({ error: `status must be one of ${validStatuses.join(', ')}` });
    }
    const validPlans = ['starter', 'pro', 'elite'];
    if (body.planMin && !validPlans.includes(body.planMin)) {
      return reply.code(400).send({ error: `planMin must be one of ${validPlans.join(', ')}` });
    }

    // Reject non-http(s) URLs to prevent javascript: / data: smuggling into
    // the launch button on the Apps page.
    for (const k of ['baseUrl', 'iconUrl'] as const) {
      const v = body[k];
      if (v && typeof v === 'string' && v.length > 0) {
        try {
          const u = new URL(v);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return reply.code(400).send({ error: `${k} must be an http(s) URL` });
          }
        } catch {
          return reply.code(400).send({ error: `${k} must be a valid URL` });
        }
      }
    }

    const existing = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
    if (existing.length > 0) {
      const updates: any = { updatedAt: new Date() };
      ['name', 'description', 'iconUrl', 'category', 'baseUrl', 'status', 'planMin', 'requiresOrg', 'ord']
        .forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });
      const [updated] = await db.update(modules).set(updates).where(eq(modules.slug, slug)).returning();
      await logAudit(admin.id, 'module_updated', null as any, { slug, updates }, request.ip);
      return { module: updated, action: 'updated' };
    }

    const [created] = await db.insert(modules).values({
      slug, name,
      description: body.description ?? '',
      iconUrl: body.iconUrl ?? null,
      category: body.category ?? 'app',
      baseUrl: body.baseUrl ?? '',
      status: body.status ?? 'coming_soon',
      planMin: body.planMin ?? 'elite',
      requiresOrg: body.requiresOrg ?? false,
      ord: body.ord ?? 99,
    }).returning();
    await logAudit(admin.id, 'module_created', null as any, { slug }, request.ip);
    return { module: created, action: 'created' };
  });

  // -------------------------------------------------------------------------
  // Per-module member access view: who has access to module X, by what
  // route. Powers the admin "Modules → Members" surface.
  // -------------------------------------------------------------------------
  app.get('/v1/admin/modules/:slug/members', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const [mod] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
    if (!mod) return reply.code(404).send({ error: 'Module not found' });

    // Plan-included plan_ids → user ids
    const allPlans = await db.select().from(subscriptionPlans);
    const planIdToSlug = Object.fromEntries(allPlans.map(p => [p.id, p.slug]));
    const includedMappings = await db.select().from(planModules).where(eq(planModules.moduleId, mod.id));
    const includedPlanIds = new Set(includedMappings.map(m => m.planId));

    // Pull every relevant user in one go to avoid N+1 lookups in big tenants
    const planSubs = includedPlanIds.size > 0
      ? await db.select().from(subscriptions)
      : [];
    const planUsers = planSubs
      .filter(s => includedPlanIds.has(s.planId) && ['active', 'trialing'].includes(s.status))
      .map(s => ({ userId: s.userId, source: 'plan' as const, planSlug: planIdToSlug[s.planId] }));

    const addons = await db.select().from(addonSubscriptions).where(eq(addonSubscriptions.moduleId, mod.id));
    const addonUsers = addons
      .filter(a => ['active', 'trialing'].includes(a.status))
      .map(a => ({ userId: a.userId, source: 'addon' as const, planSlug: null as string | null, addonId: a.id }));

    const overrides = await db.select().from(entitlementOverrides).where(eq(entitlementOverrides.moduleId, mod.id));
    const now = new Date();
    const overrideUsers = overrides
      .filter(o => !o.expiresAt || o.expiresAt > now)
      .map(o => ({
        userId: o.userId, source: 'override' as const, planSlug: null as string | null,
        grant: o.grant, reason: o.reason, expiresAt: o.expiresAt,
      }));

    // Spec: every user who has access — including admins via admin_role —
    // must appear in the members list with the correct accessSource.
    // Without this branch admins-only members are invisible in the UI,
    // breaking "who has access" answers for support and audit.
    const adminRows = await db.select().from(users).where(eq(users.role, 'admin'));
    const adminUsers = adminRows
      .filter(u => u.status === 'active')
      .map(u => ({ userId: u.id, source: 'admin_role' as const, planSlug: null as string | null }));

    // Coalesce: pick the highest-precedence access source per user, mirroring
    // the entitlement-service evaluation order (admin_role > override > addon > plan).
    // Lower-precedence sources are seeded first; higher-precedence sources
    // overwrite. admin_role overwrites everything.
    type Row = {
      userId: string;
      source: 'plan' | 'addon' | 'override' | 'admin_role';
      planSlug: string | null;
      grant?: boolean;
      reason?: string | null;
      expiresAt?: Date | null;
      addonId?: string;
    };
    const byUser: Record<string, Row> = {};
    for (const r of planUsers as Row[]) byUser[r.userId] = r;
    for (const r of addonUsers as Row[]) byUser[r.userId] = r;
    for (const r of overrideUsers as Row[]) byUser[r.userId] = r;
    for (const r of adminUsers as Row[]) {
      // admin_role is the highest precedence; only OVERWRITE if existing
      // entry isn't a revoke (revoke wins for visibility — admin still has
      // access, but the revoke is the noteworthy state to surface).
      const existing = byUser[r.userId];
      if (existing && existing.source === 'override' && existing.grant === false) continue;
      byUser[r.userId] = r;
    }

    // Hydrate user rows
    const userIds = Object.keys(byUser);
    const userRows = userIds.length > 0
      ? await db.select().from(users)
      : [];
    const userById = Object.fromEntries(
      userRows.filter(u => userIds.includes(u.id)).map(u => [u.id, u])
    );

    const members = userIds
      .map(uid => {
        const u = userById[uid];
        const r = byUser[uid];
        if (!u) return null;
        // Override-revoke users still appear in the list, marked grant=false,
        // so admins can see *and remove* the revoke.
        return {
          userId: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          status: u.status,
          accessSource: r.source,
          planSlug: r.planSlug,
          grant: r.grant ?? true,
          reason: r.reason ?? null,
          expiresAt: r.expiresAt ?? null,
          addonId: r.addonId ?? null,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => a.email.localeCompare(b.email));

    return {
      module: { id: mod.id, slug: mod.slug, name: mod.name, status: mod.status, planMin: mod.planMin },
      members,
      counts: {
        total: members.length,
        plan: members.filter(m => m.accessSource === 'plan').length,
        addon: members.filter(m => m.accessSource === 'addon').length,
        override_grant: members.filter(m => m.accessSource === 'override' && m.grant).length,
        override_revoke: members.filter(m => m.accessSource === 'override' && !m.grant).length,
        admin_role: members.filter(m => m.accessSource === 'admin_role').length,
      },
    };
  });

  app.post('/v1/admin/modules/:slug/plan-mapping', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const { slug } = request.params as any;
    const { planSlugs } = request.body as { planSlugs: string[] };
    if (!Array.isArray(planSlugs)) return reply.code(400).send({ error: 'planSlugs must be an array' });

    const [mod] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
    if (!mod) return reply.code(404).send({ error: 'Module not found' });

    const allPlans = await db.select().from(subscriptionPlans);
    const planBySlug = Object.fromEntries(allPlans.map(p => [p.slug, p]));

    // Replace mappings: delete then insert
    await db.delete(planModules).where(eq(planModules.moduleId, mod.id));
    for (const ps of planSlugs) {
      const plan = planBySlug[ps];
      if (!plan) continue;
      await db.insert(planModules).values({ planId: plan.id, moduleId: mod.id });
    }

    await logAudit(admin.id, 'module_plan_mapping_changed', null as any, { slug, planSlugs }, request.ip);
    return { ok: true, slug, planSlugs };
  });

  // -------------------------------------------------------------------------
  // Per-user module entitlement overrides
  // -------------------------------------------------------------------------
  app.get('/v1/admin/users/:id/module-overrides', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as any;
    const overrides = await db.select().from(entitlementOverrides).where(eq(entitlementOverrides.userId, id));
    const allModules = await db.select().from(modules);
    const modById = Object.fromEntries(allModules.map(m => [m.id, m]));
    const enriched = overrides.map(o => ({
      ...o,
      moduleSlug: modById[o.moduleId]?.slug,
      moduleName: modById[o.moduleId]?.name,
    }));

    // Also return the user's add-ons for the admin UI
    const addons = await db.select().from(addonSubscriptions).where(eq(addonSubscriptions.userId, id));
    const enrichedAddons = addons.map(a => ({
      ...a,
      moduleSlug: modById[a.moduleId]?.slug,
      moduleName: modById[a.moduleId]?.name,
    }));

    // And the per-module access breakdown for every module
    const breakdowns = [];
    for (const m of allModules) {
      const b = await getModuleAccessTrace(id, m.slug);
      if (b) breakdowns.push(b);
    }

    return { overrides: enriched, addons: enrichedAddons, breakdowns };
  });

  app.post('/v1/admin/users/:id/module-overrides', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const { id } = request.params as any;
    const { moduleSlug, grant, reason, expiresAt } = request.body as any;

    if (!moduleSlug) return reply.code(400).send({ error: 'moduleSlug is required' });
    if (typeof grant !== 'boolean') return reply.code(400).send({ error: 'grant must be a boolean' });

    const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
    if (!mod) return reply.code(404).send({ error: 'Module not found' });

    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) return reply.code(404).send({ error: 'User not found' });

    // Replace any existing override for this user/module pair
    await db.delete(entitlementOverrides)
      .where(and(eq(entitlementOverrides.userId, id), eq(entitlementOverrides.moduleId, mod.id)));

    const [created] = await db.insert(entitlementOverrides).values({
      userId: id,
      moduleId: mod.id,
      grant,
      reason: reason ?? null,
      createdByAdminId: admin.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();

    await logAudit(admin.id, grant ? 'module_override_granted' : 'module_override_revoked', id, {
      moduleSlug, reason, expiresAt: expiresAt ?? null,
    }, request.ip);

    await db.insert(activityFeed).values({
      userId: id, action: grant ? 'module_granted' : 'module_revoked',
      entityType: 'module', entityId: mod.id,
      metadata: { moduleSlug, by: admin.email, reason },
    });

    return { override: created };
  });

  app.delete('/v1/admin/users/:id/module-overrides/:overrideId', { preHandler: [requireAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const { id, overrideId } = request.params as any;

    const [ov] = await db.select().from(entitlementOverrides).where(eq(entitlementOverrides.id, overrideId)).limit(1);
    if (!ov || ov.userId !== id) return reply.code(404).send({ error: 'Override not found' });

    await db.delete(entitlementOverrides).where(eq(entitlementOverrides.id, overrideId));
    await logAudit(admin.id, 'module_override_removed', id, { overrideId, moduleId: ov.moduleId }, request.ip);
    return { ok: true };
  });
}
