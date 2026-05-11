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
import { eq, and, isNull, desc, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  tenants, tenantUsers, tenantInvites, tenantModules,
  tenantUserModuleAccess, modules, users,
  adminAuditLogs, subscriptions, addonSubscriptions, usageTracking,
} from '../schema.js';
import { authenticate } from '../lib/auth.js';
import { requireTenantAdmin, requireTenantOwner } from '../lib/tenant-auth.js';
import { writeAudit, pickSafe, TENANT_USER_ACCESS_SAFE_FIELDS } from '../lib/audit.js';
import { sendInviteEmail, buildInviteAcceptUrl } from '../lib/email-service.js';
import { isTenantOwner } from '../lib/rbac.js';

const INVITE_TTL_DAYS = 14;
const TENANT_USER_SAFE_FIELDS = ['id', 'tenantId', 'userId', 'role'] as const;
const TENANT_INVITE_SAFE_FIELDS = ['id', 'tenantId', 'email', 'role', 'expiresAt', 'acceptedAt'] as const;
const TENANT_SAFE_FIELDS = ['id', 'name', 'slug', 'type', 'status'] as const;

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
  // Tenant settings — rename (owner only).
  // ──────────────────────────────────────────────────────────────────
  app.patch<{ Params: { tenantId: string }; Body: any }>(
    '/v1/tenants/:tenantId',
    { preHandler: [requireTenantOwner] },
    async (request, reply) => {
      const actor = (request as any).user;
      const { tenantId } = request.params;
      const body = (request.body ?? {}) as any;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 120) {
        return badRequest(reply, 'name is required (1-120 chars)');
      }
      const [before] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!before) return notFound(reply, 'TENANT_NOT_FOUND', 'Tenant not found');
      const [after] = await db.update(tenants).set({ name, updatedAt: new Date() })
        .where(eq(tenants.id, tenantId)).returning();
      await writeAudit({
        actorUserId: actor.id, tenantId, targetType: 'tenant',
        targetId: tenantId, action: 'tenant_renamed',
        before: pickSafe(before, [...TENANT_SAFE_FIELDS]),
        after: pickSafe(after, [...TENANT_SAFE_FIELDS]),
        ipAddress: request.ip,
      }, request);
      return { tenant: after };
    },
  );

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
      if ((isTenantOwner(target.role) || isTenantOwner(body.role)) && !isTenantOwner(ctx.role)) {
        return reply.code(403).send({
          error: 'Only tenant owners can change owner roles',
          code: 'TENANT_ROLE_INSUFFICIENT',
        });
      }
      // Blocking demotion of the last owner — keep at least one owner alive.
      if (isTenantOwner(target.role) && !isTenantOwner(body.role)) {
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

      if (isTenantOwner(target.role) && !isTenantOwner(ctx.role)) {
        return reply.code(403).send({
          error: 'Only tenant owners can remove other owners',
          code: 'TENANT_ROLE_INSUFFICIENT',
        });
      }
      if (isTenantOwner(target.role)) {
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
      if (isTenantOwner(role) && !isTenantOwner(ctx.role)) {
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

      // Awaited email delivery (so the response can report whether the
      // email actually went out), but a failure is intentionally non-fatal:
      // the invite row is the durable record of truth and admins can
      // resend, copy the link, or surface the token directly. The audit
      // row captures whether delivery succeeded so support can investigate
      // later. Note this adds the email provider roundtrip to request
      // latency.
      const [tenantRow] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const sendResult = await sendInviteEmail({
        to: invite.email,
        tenantName: tenantRow?.name ?? 'your workspace',
        inviterName: actor.name ?? actor.email,
        inviterEmail: actor.email,
        role: invite.role as 'owner' | 'admin' | 'member',
        acceptUrl: buildInviteAcceptUrl(invite.token),
        expiresAt: invite.expiresAt,
      });
      await writeAudit({
        actorUserId: actor.id, tenantId, targetType: 'tenant_invite',
        targetId: invite.id,
        action: sendResult.ok ? 'tenant_invite_email_sent' : 'tenant_invite_email_failed',
        before: null, after: null,
        extra: {
          provider: sendResult.provider,
          messageId: sendResult.id ?? null,
          error: sendResult.error ?? null,
        },
        ipAddress: request.ip,
      }, request);

      return { invite, emailDelivery: { ok: sendResult.ok, provider: sendResult.provider } };
    },
  );

  // Resend the invite email for an existing pending invite. Useful when the
  // recipient never received the first email or when an admin opens the
  // tenant users page days after the invite was created.
  app.post<{ Params: { tenantId: string; inviteId: string } }>(
    '/v1/tenants/:tenantId/invites/:inviteId/resend',
    { preHandler: [requireTenantAdmin] },
    async (request, reply) => {
      const actor = (request as any).user;
      const { tenantId, inviteId } = request.params;
      const [invite] = await db.select().from(tenantInvites)
        .where(and(eq(tenantInvites.id, inviteId), eq(tenantInvites.tenantId, tenantId))).limit(1);
      if (!invite) return notFound(reply, 'INVITE_NOT_FOUND', 'Invite not found');
      if (invite.acceptedAt) {
        return reply.code(409).send({
          error: 'Invite already accepted',
          code: 'INVITE_ALREADY_ACCEPTED',
        });
      }
      if (invite.expiresAt.getTime() < Date.now()) {
        return reply.code(410).send({ error: 'Invite has expired', code: 'INVITE_EXPIRED' });
      }
      const [tenantRow] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const sendResult = await sendInviteEmail({
        to: invite.email,
        tenantName: tenantRow?.name ?? 'your workspace',
        inviterName: actor.name ?? actor.email,
        inviterEmail: actor.email,
        role: invite.role as 'owner' | 'admin' | 'member',
        acceptUrl: buildInviteAcceptUrl(invite.token),
        expiresAt: invite.expiresAt,
      });
      await writeAudit({
        actorUserId: actor.id, tenantId, targetType: 'tenant_invite',
        targetId: invite.id,
        action: sendResult.ok ? 'tenant_invite_email_resent' : 'tenant_invite_email_failed',
        before: null, after: null,
        extra: {
          provider: sendResult.provider,
          messageId: sendResult.id ?? null,
          error: sendResult.error ?? null,
          resend: true,
        },
        ipAddress: request.ip,
      }, request);
      if (!sendResult.ok) {
        return reply.code(502).send({
          error: sendResult.error ?? 'Failed to send invite email',
          code: 'INVITE_EMAIL_FAILED',
          provider: sendResult.provider,
        });
      }
      return { ok: true, provider: sendResult.provider };
    },
  );

  // Task #66: copy-link fallback. When an admin needs to hand the
  // invite URL to the recipient out-of-band (Slack DM, SMS, etc.) the
  // UI calls this endpoint and copies the returned acceptUrl to the
  // clipboard. Owner/admin only — the URL embeds the secret token.
  app.get<{ Params: { tenantId: string; inviteId: string } }>(
    '/v1/tenants/:tenantId/invites/:inviteId/link',
    { preHandler: [requireTenantAdmin] },
    async (request, reply) => {
      const { tenantId, inviteId } = request.params;
      const [invite] = await db.select().from(tenantInvites)
        .where(and(eq(tenantInvites.id, inviteId), eq(tenantInvites.tenantId, tenantId))).limit(1);
      if (!invite) return notFound(reply, 'INVITE_NOT_FOUND', 'Invite not found');
      if (invite.acceptedAt) {
        return reply.code(409).send({
          error: 'Invite already accepted',
          code: 'INVITE_ALREADY_ACCEPTED',
        });
      }
      if (invite.expiresAt.getTime() < Date.now()) {
        return reply.code(410).send({ error: 'Invite has expired', code: 'INVITE_EXPIRED' });
      }
      return {
        acceptUrl: buildInviteAcceptUrl(invite.token),
        expiresAt: invite.expiresAt,
      };
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

  // Public peek for the invite landing page. Returns just enough to render
  // a friendly UX (invitee email so we can pre-fill login/register, tenant
  // name so the recipient knows where they're being invited) and an explicit
  // status so the page can short-circuit to an error state without making
  // the recipient sign in first.
  //
  // Anti-enumeration: tokens are 32+ random bytes so listing them isn't
  // feasible. We only expose the email back to whoever already holds the
  // token (they got it in their inbox), never the underlying tenantId.
  app.get<{ Params: { token: string } }>(
    '/v1/invites/:token/peek',
    async (request, reply) => {
      const { token } = request.params;
      const [invite] = await db.select().from(tenantInvites)
        .where(eq(tenantInvites.token, token)).limit(1);
      if (!invite) return notFound(reply, 'INVITE_NOT_FOUND', 'Invite not found');
      const [tenant] = await db.select({ name: tenants.name })
        .from(tenants).where(eq(tenants.id, invite.tenantId)).limit(1);
      let status: 'pending' | 'expired' | 'accepted' = 'pending';
      if (invite.acceptedAt) status = 'accepted';
      else if (invite.expiresAt.getTime() < Date.now()) status = 'expired';
      return {
        email: invite.email,
        role: invite.role,
        tenantName: tenant?.name ?? null,
        status,
        expiresAt: invite.expiresAt,
      };
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

  // ──────────────────────────────────────────────────────────────────
  // Tenant activity feed — recent audit events, usage trend, billing
  // summary. Drives the Tenant Command Center dashboard.
  // ──────────────────────────────────────────────────────────────────
  app.get<{ Params: { tenantId: string } }>(
    '/v1/tenants/:tenantId/activity',
    { preHandler: [requireTenantAdmin] },
    async (request) => {
      const { tenantId } = request.params;

      // 1. Recent audit events (last 20) scoped to the tenant. Bound by
      //    createdAt as well so the planner can use the tenant index +
      //    created_at filter together, keeping latency flat as the table
      //    grows past the 30-day window.
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const auditRows = await db.select().from(adminAuditLogs)
        .where(and(
          eq(adminAuditLogs.tenantId, tenantId),
          gte(adminAuditLogs.createdAt, since),
        ))
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(20);

      const actorIds = [...new Set(auditRows.map(r => r.adminId))];
      const targetUserIds = [...new Set(auditRows.filter(r => r.targetUserId).map(r => r.targetUserId!))];
      const allUserIds = [...new Set([...actorIds, ...targetUserIds])];
      const nameMap = new Map<string, { name: string | null; email: string | null }>();
      if (allUserIds.length > 0) {
        const userRows = await db.select({ id: users.id, name: users.name, email: users.email })
          .from(users).where(inArray(users.id, allUserIds));
        for (const u of userRows) nameMap.set(u.id, { name: u.name, email: u.email });
      }
      // Some audit rows have `targetUserId` set to a membership row id (when
      // targetType is 'tenant_user'); the actual user id is duplicated into
      // `details.targetUserId` / `details.extra.targetUserId` by writeAudit
      // call sites. Prefer the details-side user id for name resolution.
      const targetUserIdFromDetails = (r: typeof auditRows[number]): string | null => {
        const d = (r.details ?? {}) as Record<string, unknown>;
        if (typeof d.targetUserId === 'string') return d.targetUserId;
        return null;
      };

      const detailsTargetUserIds = auditRows
        .map(targetUserIdFromDetails)
        .filter((v): v is string => typeof v === 'string');
      const allUserIds2 = [...new Set([...allUserIds, ...detailsTargetUserIds])];
      if (allUserIds2.length > allUserIds.length) {
        const extra = allUserIds2.filter(id => !nameMap.has(id));
        if (extra.length > 0) {
          const more = await db.select({ id: users.id, name: users.name, email: users.email })
            .from(users).where(inArray(users.id, extra));
          for (const u of more) nameMap.set(u.id, { name: u.name, email: u.email });
        }
      }

      const recentEvents = auditRows.map(r => {
        const actor = nameMap.get(r.adminId);
        const detailsUserId = targetUserIdFromDetails(r);
        const targetUserId = detailsUserId ?? r.targetUserId;
        const target = targetUserId ? nameMap.get(targetUserId) : null;
        const details = (r.details ?? {}) as Record<string, unknown>;
        return {
          id: r.id,
          action: r.action,
          createdAt: r.createdAt,
          actorName: actor?.name || actor?.email || 'Unknown',
          targetUserName: target ? (target.name || target.email || 'Deleted user') : null,
          targetType: typeof details.targetType === 'string' ? details.targetType : null,
          targetId: typeof details.targetId === 'string' ? details.targetId : null,
          moduleSlug: typeof details.moduleSlug === 'string' ? details.moduleSlug : null,
        };
      });

      // 2. Per-day audit-event counts for the last 30 days, broken down by
      //    targetType. We use audit events as the available "tenant usage"
      //    telemetry — the underlying usage_tracking table is per-user and
      //    not module-scoped, so admin actions are the most meaningful
      //    per-module signal we can surface.
      //
      //    The day-bucketing is pushed into Postgres so we never materialize
      //    every audit row in JS — the result set is bounded by
      //    (days × distinct targetTypes), independent of audit volume.
      const dayBucketResult = await db.execute<{
        day: string; target_type: string; count: number;
      }>(sql`
        SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
               COALESCE(details->>'targetType', 'other')                                AS target_type,
               COUNT(*)::int                                                            AS count
        FROM admin_audit_logs
        WHERE tenant_id = ${tenantId}
          AND created_at >= ${since}
        GROUP BY 1, 2
      `);
      const dayBuckets = new Map<string, { date: string; count: number; byTargetType: Record<string, number> }>();
      for (const r of dayBucketResult.rows) {
        const bucket = dayBuckets.get(r.day) ?? { date: r.day, count: 0, byTargetType: {} };
        bucket.count += r.count;
        bucket.byTargetType[r.target_type] = (bucket.byTargetType[r.target_type] ?? 0) + r.count;
        dayBuckets.set(r.day, bucket);
      }
      // Fill in missing days so the chart has a stable 30-point x-axis.
      const dayKeys: string[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        dayKeys.push(d.toISOString().slice(0, 10));
      }
      const usageByDay = dayKeys.map(key =>
        dayBuckets.get(key) ?? { date: key, count: 0, byTargetType: {} },
      );

      // 2b. Per-module 30-day breakdown.
      //     Task #31: now driven by real per-module usage telemetry from
      //     `usage_tracking` rows with actionType='module_usage' (written
      //     by the SSO handoff path on every successful launch). We still
      //     seed the series map with every active tenant module so modules
      //     with zero usage in the window appear in the chart at count=0.
      const tenantModuleRows = await db.select().from(tenantModules)
        .where(eq(tenantModules.tenantId, tenantId));
      const allModuleRows = tenantModuleRows.length > 0
        ? await db.select().from(modules).where(inArray(modules.id, tenantModuleRows.map(tm => tm.moduleId)))
        : [];
      const moduleById = new Map(allModuleRows.map(m => [m.id, m]));

      type ModuleSeries = {
        moduleId: string;
        moduleSlug: string;
        moduleName: string | null;
        total: number;
        byDay: Record<string, number>;
      };
      const moduleSeries = new Map<string, ModuleSeries>();
      const ensureSeries = (moduleId: string): ModuleSeries | null => {
        const mod = moduleById.get(moduleId);
        if (!mod) return null;
        let s = moduleSeries.get(moduleId);
        if (!s) {
          s = {
            moduleId,
            moduleSlug: mod.slug,
            moduleName: mod.name,
            total: 0,
            byDay: {},
          };
          moduleSeries.set(moduleId, s);
        }
        return s;
      };
      // Seed the map with every tenant module so the chart shows them
      // even when nothing happened in the window.
      for (const tm of tenantModuleRows) ensureSeries(tm.moduleId);

      // Per-module/day aggregation — pushed into Postgres so the result
      // set is bounded by (modules × days) and not by raw row count.
      // Combined with the partial unique index `uniq_usage_tracking_module_day`
      // this keeps latency flat as usage_tracking grows.
      const moduleAggResult = await db.execute<{
        day: string; module_id: string; total: number;
      }>(sql`
        SELECT to_char(date_trunc('day', period_start AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
               module_id                                                                  AS module_id,
               SUM(count)::int                                                            AS total
        FROM usage_tracking
        WHERE tenant_id = ${tenantId}
          AND action_type = 'module_usage'
          AND module_id IS NOT NULL
          AND period_start >= ${since}
        GROUP BY 1, 2
      `);
      let moduleUsageTotal = 0;
      for (const r of moduleAggResult.rows) {
        const s = ensureSeries(r.module_id);
        if (!s) continue;
        s.total += r.total;
        s.byDay[r.day] = (s.byDay[r.day] ?? 0) + r.total;
        moduleUsageTotal += r.total;
      }
      // Materialize byDay into the same 30-point x-axis so the UI can
      // render a stable per-module series.
      const usageByModule = [...moduleSeries.values()]
        .map(s => ({
          moduleSlug: s.moduleSlug,
          moduleName: s.moduleName,
          total: s.total,
          byDay: dayKeys.map(date => ({ date, count: s.byDay[date] ?? 0 })),
        }))
        .sort((a, b) => b.total - a.total);

      // 3. AI-action usage rollup across all members of the tenant for the
      //    same 30-day window.
      const memberRows = await db.select({ userId: tenantUsers.userId })
        .from(tenantUsers).where(eq(tenantUsers.tenantId, tenantId));
      const memberIds = memberRows.map(m => m.userId);
      let aiActions30d = 0;
      if (memberIds.length > 0) {
        const usageRows = await db.select().from(usageTracking).where(
          and(
            inArray(usageTracking.userId, memberIds),
            eq(usageTracking.actionType, 'ai_action'),
            gte(usageTracking.periodStart, since),
          ),
        );
        aiActions30d = usageRows.reduce((sum, r) => sum + r.count, 0);
      }

      // 4. Billing summary — active plan + add-on subscriptions on the
      //    tenant, plus the soonest upcoming renewal.
      const planSubs = await db.select().from(subscriptions)
        .where(eq(subscriptions.tenantId, tenantId));
      const addonSubs = await db.select().from(addonSubscriptions)
        .where(eq(addonSubscriptions.tenantId, tenantId));
      const activePlanSubs = planSubs.filter(s => s.status === 'active' || s.status === 'trialing');
      const activeAddonSubs = addonSubs.filter(s => s.status === 'active' || s.status === 'trialing');
      const renewalCandidates: Date[] = [];
      for (const s of [...activePlanSubs, ...activeAddonSubs]) {
        if (s.currentPeriodEnd && s.currentPeriodEnd.getTime() > Date.now()) {
          renewalCandidates.push(s.currentPeriodEnd);
        }
      }
      renewalCandidates.sort((a, b) => a.getTime() - b.getTime());
      const nextRenewal = renewalCandidates[0] ?? null;

      // Per-active-add-on detail (module name + renewal date) for the UI.
      const addonModuleIds = [...new Set(activeAddonSubs.map(s => s.moduleId))];
      const addonModuleMap = new Map<string, { slug: string; name: string }>();
      if (addonModuleIds.length > 0) {
        const modRows = await db.select({ id: modules.id, slug: modules.slug, name: modules.name })
          .from(modules).where(inArray(modules.id, addonModuleIds));
        for (const m of modRows) addonModuleMap.set(m.id, { slug: m.slug, name: m.name });
      }
      const addons = activeAddonSubs.map(s => {
        const mod = addonModuleMap.get(s.moduleId);
        return {
          id: s.id,
          moduleSlug: mod?.slug ?? null,
          moduleName: mod?.name ?? null,
          status: s.status,
          amount: s.amount,
          currentPeriodEnd: s.currentPeriodEnd,
          cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        };
      });

      return {
        recentEvents,
        usageByDay,
        usageByModule,
        moduleUsageTotal30d: moduleUsageTotal,
        aiActions30d,
        billing: {
          activePlanSubscriptions: activePlanSubs.length,
          activeAddonSubscriptions: activeAddonSubs.length,
          nextRenewal,
          addons,
        },
      };
    },
  );
}
