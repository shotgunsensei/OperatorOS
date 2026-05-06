/**
 * Gate 3 — Tenant administration routes (member-scoped, RBAC by tenant role).
 *
 * Routes:
 *   GET    /v1/tenants/:tenantId/users
 *   PATCH  /v1/tenants/:tenantId/users/:userId        body { role }
 *   DELETE /v1/tenants/:tenantId/users/:userId
 *   GET    /v1/tenants/:tenantId/invites
 *   POST   /v1/tenants/:tenantId/invites              body { email, role }
 *   DELETE /v1/tenants/:tenantId/invites/:inviteId
 *   POST   /v1/invites/:token/accept                  (auth)
 *   GET    /v1/tenants/:tenantId/users/:userId/module-access
 *   POST   /v1/tenants/:tenantId/users/:userId/module-access  body { moduleSlug, accessLevel }
 *   GET    /v1/tenants/:tenantId/modules               (read-only catalog for the tenant)
 *
 * Auth model:
 *   - Member-list / module-grid READ → requireTenantAdmin (admin or owner).
 *   - Mutations (invite, role-change, remove, grant) → requireTenantAdmin.
 *   - Owner role assignment / removal of last owner is blocked.
 *   - Cross-tenant access collapses to 404 TENANT_NOT_FOUND (anti-enumeration).
 */

import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import {
  tenants, tenantUsers, tenantInvites, tenantModules,
  tenantUserModuleAccess, modules, users,
} from '../schema.js';
import { authenticate } from '../lib/auth.js';
import { requireTenantAdmin } from '../lib/tenant-auth.js';
import { writeAudit, pickSafe, TENANT_USER_ACCESS_SAFE_FIELDS } from '../lib/audit.js';

const INVITE_TTL_DAYS = 14;
const TENANT_USER_SAFE_FIELDS = ['id', 'tenantId', 'userId', 'role'] as const;
const TENANT_INVITE_SAFE_FIELDS = ['id', 'tenantId', 'email', 'role', 'expiresAt', 'acceptedAt'] as const;

function badRequest(reply: any, msg: string) {
  return reply.code(400).send({ error: msg, code: 'BAD_REQUEST' });
}
function notFound(reply: any, code: string, msg: string) {
  return reply.code(404).send({ error: msg, code });
}
function isValidRole(r: any): r is 'owner' | 'admin' | 'member' {
  return r === 'owner' || r === 'admin' || r === 'member';
}
function isValidEmail(e: any): e is string {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function registerTenantAdminRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────────────────────────
  // Members
  // ──────────────────────────────────────────────────────────────────
  app.get<{ Params: { tenantId: string } }>(
    '/v1/tenants/:tenantId/users',
    { preHandler: [requireTenantAdmin] },
    async (request) => {
      const { tenantId } = request.params;
      const memberships = await db.select().from(tenantUsers).where(eq(tenantUsers.tenantId, tenantId));
      if (memberships.length === 0) return { users: [] };
      const userIds = memberships.map(m => m.userId);
      const userRows = await db.select().from(users);
      const byId = new Map(userRows.map(u => [u.id, u]));
      return {
        users: memberships
          .map(m => {
            const u = byId.get(m.userId);
            return u ? {
              membershipId: m.id, userId: u.id, email: u.email, name: u.name,
              role: m.role, status: u.status, joinedAt: m.joinedAt,
            } : null;
          })
          .filter(Boolean),
      };
    },
  );

  app.patch<{ Params: { tenantId: string; userId: string }; Body: any }>(
    '/v1/tenants/:tenantId/users/:userId',
    { preHandler: [requireTenantAdmin] },
    async (request, reply) => {
      const ctx = (request as any).tenantContext;
      const actor = (request as any).user;
      const { tenantId, userId } = request.params;
      const body = (request.body ?? {}) as any;
      if (!isValidRole(body.role)) return badRequest(reply, 'role must be owner|admin|member');

      const [target] = await db.select().from(tenantUsers)
        .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, userId))).limit(1);
      if (!target) return notFound(reply, 'TENANT_USER_NOT_FOUND', 'User is not a member of this tenant');

      // Only owners may promote/demote owner role; admins cannot manage owners.
      if ((target.role === 'owner' || body.role === 'owner') && ctx.role !== 'owner') {
        return reply.code(403).send({
          error: 'Only tenant owners can change owner roles',
          code: 'TENANT_ROLE_INSUFFICIENT',
        });
      }
      // Blocking demotion of the last owner — keep at least one owner alive.
      if (target.role === 'owner' && body.role !== 'owner') {
        const owners = await db.select().from(tenantUsers)
          .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.role, 'owner')));
        if (owners.length <= 1) {
          return reply.code(409).send({
            error: 'Cannot demote the last owner of this tenant',
            code: 'LAST_OWNER',
          });
        }
      }

      const before = target;
      const [after] = await db.update(tenantUsers).set({ role: body.role })
        .where(eq(tenantUsers.id, target.id)).returning();
      await writeAudit({
        actorUserId: actor.id, tenantId, targetType: 'tenant_user',
        targetId: after.id, action: 'tenant_user_role_changed',
        before: pickSafe(before, [...TENANT_USER_SAFE_FIELDS]),
        after: pickSafe(after, [...TENANT_USER_SAFE_FIELDS]),
        extra: { targetUserId: userId },
        ipAddress: request.ip,
      }, request);
      return { membership: after };
    },
  );

  app.delete<{ Params: { tenantId: string; userId: string } }>(
    '/v1/tenants/:tenantId/users/:userId',
    { preHandler: [requireTenantAdmin] },
    async (request, reply) => {
      const ctx = (request as any).tenantContext;
      const actor = (request as any).user;
      const { tenantId, userId } = request.params;
      const [target] = await db.select().from(tenantUsers)
        .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, userId))).limit(1);
      if (!target) return notFound(reply, 'TENANT_USER_NOT_FOUND', 'User is not a member of this tenant');

      if (target.role === 'owner' && ctx.role !== 'owner') {
        return reply.code(403).send({
          error: 'Only tenant owners can remove other owners',
          code: 'TENANT_ROLE_INSUFFICIENT',
        });
      }
      if (target.role === 'owner') {
        const owners = await db.select().from(tenantUsers)
          .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.role, 'owner')));
        if (owners.length <= 1) {
          return reply.code(409).send({
            error: 'Cannot remove the last owner of this tenant',
            code: 'LAST_OWNER',
          });
        }
      }
      // Drop per-user, per-module grants alongside the membership so
      // re-invites get a clean slate.
      await db.delete(tenantUserModuleAccess)
        .where(and(eq(tenantUserModuleAccess.tenantId, tenantId), eq(tenantUserModuleAccess.userId, userId)));
      await db.delete(tenantUsers).where(eq(tenantUsers.id, target.id));

      await writeAudit({
        actorUserId: actor.id, tenantId, targetType: 'tenant_user',
        targetId: target.id, action: 'tenant_user_removed',
        before: pickSafe(target, [...TENANT_USER_SAFE_FIELDS]),
        after: null,
        extra: { targetUserId: userId },
        ipAddress: request.ip,
      }, request);
      return { ok: true };
    },
  );

  // ──────────────────────────────────────────────────────────────────
  // Invites
  // ──────────────────────────────────────────────────────────────────
  app.get<{ Params: { tenantId: string } }>(
    '/v1/tenants/:tenantId/invites',
    { preHandler: [requireTenantAdmin] },
    async (request) => {
      const { tenantId } = request.params;
      // Show only pending (unaccepted) invites.
      const rows = await db.select().from(tenantInvites)
        .where(and(eq(tenantInvites.tenantId, tenantId), isNull(tenantInvites.acceptedAt)));
      return { invites: rows };
    },
  );

  app.post<{ Params: { tenantId: string }; Body: any }>(
    '/v1/tenants/:tenantId/invites',
    { preHandler: [requireTenantAdmin] },
    async (request, reply) => {
      const ctx = (request as any).tenantContext;
      const actor = (request as any).user;
      const { tenantId } = request.params;
      const body = (request.body ?? {}) as any;
      const email = (body.email ?? '').trim().toLowerCase();
      const role = body.role ?? 'member';
      if (!isValidEmail(email)) return badRequest(reply, 'email is required');
      if (!isValidRole(role)) return badRequest(reply, 'role must be owner|admin|member');
      if (role === 'owner' && ctx.role !== 'owner') {
        return reply.code(403).send({
          error: 'Only tenant owners can invite new owners',
          code: 'TENANT_ROLE_INSUFFICIENT',
        });
      }

      // If the email is already a member, surface 409 instead of silently
      // re-issuing an invite.
      const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existingUser) {
        const [member] = await db.select().from(tenantUsers)
          .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, existingUser.id))).limit(1);
        if (member) {
          return reply.code(409).send({
            error: 'User is already a member of this tenant',
            code: 'ALREADY_MEMBER',
          });
        }
      }

      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
      const [invite] = await db.insert(tenantInvites).values({
        tenantId, email, role, token, invitedByUserId: actor.id, expiresAt,
      }).returning();
      await writeAudit({
        actorUserId: actor.id, tenantId, targetType: 'tenant_invite',
        targetId: invite.id, action: 'tenant_invite_created',
        before: null, after: pickSafe(invite, [...TENANT_INVITE_SAFE_FIELDS]),
        ipAddress: request.ip,
      }, request);
      return { invite };
    },
  );

  app.delete<{ Params: { tenantId: string; inviteId: string } }>(
    '/v1/tenants/:tenantId/invites/:inviteId',
    { preHandler: [requireTenantAdmin] },
    async (request, reply) => {
      const actor = (request as any).user;
      const { tenantId, inviteId } = request.params;
      const [row] = await db.select().from(tenantInvites)
        .where(and(eq(tenantInvites.id, inviteId), eq(tenantInvites.tenantId, tenantId))).limit(1);
      if (!row) return notFound(reply, 'INVITE_NOT_FOUND', 'Invite not found');
      await db.delete(tenantInvites).where(eq(tenantInvites.id, inviteId));
      await writeAudit({
        actorUserId: actor.id, tenantId, targetType: 'tenant_invite',
        targetId: row.id, action: 'tenant_invite_revoked',
        before: pickSafe(row, [...TENANT_INVITE_SAFE_FIELDS]),
        after: null, ipAddress: request.ip,
      }, request);
      return { ok: true };
    },
  );

  app.post<{ Params: { token: string } }>(
    '/v1/invites/:token/accept',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = (request as any).user;
      const { token } = request.params;
      const [invite] = await db.select().from(tenantInvites)
        .where(eq(tenantInvites.token, token)).limit(1);
      if (!invite) return notFound(reply, 'INVITE_NOT_FOUND', 'Invite not found');
      if (invite.acceptedAt) {
        return reply.code(409).send({ error: 'Invite already accepted', code: 'INVITE_ALREADY_ACCEPTED' });
      }
      if (invite.expiresAt.getTime() < Date.now()) {
        return reply.code(410).send({ error: 'Invite has expired', code: 'INVITE_EXPIRED' });
      }
      // Email mismatch → return 403; do not reveal which other email it
      // was issued to.
      if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
        return reply.code(403).send({
          error: 'This invite was issued to a different email address',
          code: 'INVITE_EMAIL_MISMATCH',
        });
      }
      const [existing] = await db.select().from(tenantUsers)
        .where(and(eq(tenantUsers.tenantId, invite.tenantId), eq(tenantUsers.userId, user.id))).limit(1);
      let membership: any;
      if (existing) {
        membership = existing;
      } else {
        [membership] = await db.insert(tenantUsers).values({
          tenantId: invite.tenantId, userId: user.id, role: invite.role,
        }).returning();
      }
      await db.update(tenantInvites).set({ acceptedAt: new Date() })
        .where(eq(tenantInvites.id, invite.id));
      await writeAudit({
        actorUserId: user.id, tenantId: invite.tenantId,
        targetType: 'tenant_user', targetId: membership.id,
        action: 'tenant_invite_accepted',
        before: null, after: pickSafe(membership, [...TENANT_USER_SAFE_FIELDS]),
        extra: { inviteId: invite.id },
        ipAddress: request.ip,
      }, request);
      return { membership, tenantId: invite.tenantId };
    },
  );

  // ──────────────────────────────────────────────────────────────────
  // Per-user module access (tenant-scoped, owner/admin only)
  // ──────────────────────────────────────────────────────────────────
  app.get<{ Params: { tenantId: string; userId: string } }>(
    '/v1/tenants/:tenantId/users/:userId/module-access',
    { preHandler: [requireTenantAdmin] },
    async (request, reply) => {
      const { tenantId, userId } = request.params;
      const [member] = await db.select().from(tenantUsers)
        .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, userId))).limit(1);
      if (!member) return notFound(reply, 'TENANT_USER_NOT_FOUND', 'User is not a member of this tenant');

      // Active tenant_modules → join into a grid the UI can render.
      const tms = await db.select().from(tenantModules).where(eq(tenantModules.tenantId, tenantId));
      const grants = await db.select().from(tenantUserModuleAccess)
        .where(and(eq(tenantUserModuleAccess.tenantId, tenantId), eq(tenantUserModuleAccess.userId, userId)));
      const grantByModule = new Map(grants.map(g => [g.moduleId, g]));
      const allModules = await db.select().from(modules);
      const modById = new Map(allModules.map(m => [m.id, m]));
      const grid = tms.map(tm => {
        const mod = modById.get(tm.moduleId);
        const grant = grantByModule.get(tm.moduleId);
        return {
          moduleId: tm.moduleId,
          moduleSlug: mod?.slug ?? null,
          moduleName: mod?.name ?? null,
          tenantModuleStatus: tm.status,
          allowAllMembers: tm.allowAllMembers,
          accessLevel: grant?.accessLevel ?? 'none',
        };
      });
      return { grid };
    },
  );

  app.post<{ Params: { tenantId: string; userId: string }; Body: any }>(
    '/v1/tenants/:tenantId/users/:userId/module-access',
    { preHandler: [requireTenantAdmin] },
    async (request, reply) => {
      const actor = (request as any).user;
      const { tenantId, userId } = request.params;
      const body = (request.body ?? {}) as any;
      const { moduleSlug, accessLevel } = body;
      if (!moduleSlug || !['none', 'user', 'manager'].includes(accessLevel)) {
        return badRequest(reply, 'moduleSlug and accessLevel (none|user|manager) are required');
      }
      const [member] = await db.select().from(tenantUsers)
        .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, userId))).limit(1);
      if (!member) return notFound(reply, 'TENANT_USER_NOT_FOUND', 'User is not a member of this tenant');
      const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
      if (!mod) return notFound(reply, 'MODULE_NOT_FOUND', 'Module not found');
      const [tm] = await db.select().from(tenantModules)
        .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleId, mod.id))).limit(1);
      if (!tm || tm.status === 'archived' || tm.status === 'disabled') {
        return reply.code(403).send({
          error: 'Module is not enabled for this tenant',
          code: 'TENANT_MODULE_DISABLED',
        });
      }

      const [before] = await db.select().from(tenantUserModuleAccess)
        .where(and(
          eq(tenantUserModuleAccess.tenantId, tenantId),
          eq(tenantUserModuleAccess.userId, userId),
          eq(tenantUserModuleAccess.moduleId, mod.id),
        )).limit(1);

      let after: any;
      if (before) {
        [after] = await db.update(tenantUserModuleAccess).set({
          accessLevel, grantedByUserId: actor.id, updatedAt: new Date(),
        }).where(eq(tenantUserModuleAccess.id, before.id)).returning();
      } else {
        [after] = await db.insert(tenantUserModuleAccess).values({
          tenantId, userId, moduleId: mod.id, accessLevel,
          grantedByUserId: actor.id,
        }).returning();
      }
      await writeAudit({
        actorUserId: actor.id, tenantId,
        targetType: 'tenant_user_module_access', targetId: after.id,
        action: 'tenant_user_module_access_set',
        before: pickSafe(before, [...TENANT_USER_ACCESS_SAFE_FIELDS]),
        after: pickSafe(after, [...TENANT_USER_ACCESS_SAFE_FIELDS]),
        extra: { moduleSlug, targetUserId: userId },
        ipAddress: request.ip,
      }, request);
      return { access: after };
    },
  );

  // ──────────────────────────────────────────────────────────────────
  // Tenant module catalog (read-only listing for the active tenant)
  // ──────────────────────────────────────────────────────────────────
  app.get<{ Params: { tenantId: string } }>(
    '/v1/tenants/:tenantId/modules',
    { preHandler: [requireTenantAdmin] },
    async (request) => {
      const { tenantId } = request.params;
      const tms = await db.select().from(tenantModules).where(eq(tenantModules.tenantId, tenantId));
      if (tms.length === 0) return { modules: [] };
      const allModules = await db.select().from(modules);
      const byId = new Map(allModules.map(m => [m.id, m]));
      return {
        modules: tms.map(tm => {
          const m = byId.get(tm.moduleId);
          return {
            tenantModuleId: tm.id,
            moduleId: tm.moduleId,
            moduleSlug: m?.slug ?? null,
            moduleName: m?.name ?? null,
            category: m?.category ?? null,
            status: tm.status,
            source: tm.source,
            allowAllMembers: tm.allowAllMembers,
          };
        }),
      };
    },
  );
}
