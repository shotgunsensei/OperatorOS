import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireSuperAdmin } from "../middleware";
import { db } from "../db";
import {
  users,
  memberships,
  orgs,
  mailConnectors,
  operatorOsEntitlementSnapshots,
  authAuditLog,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { logAdminAction } from "../lib/adminAudit";
import { getOperatorOsModuleSlug } from "../services/operatorosEntitlements";
import { getMasterAdminEmails, isMasterAdminEmail } from "../config/masterAdmin";
import { CANONICAL_ROLES } from "@shared/roles";

const router = Router();

const VALID_ROLES = CANONICAL_ROLES;

const updateOrgProfileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
  phone: z.string().max(100).nullable().optional(),
  email: z.string().email().or(z.literal("")).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  authMode: z.enum(["local", "m365", "hybrid"]).optional(),
});
const createInviteSchema = z.object({
  role: z.enum(VALID_ROLES).default("staff"),
});

const purgeAuditSchema = z.object({
  days: z.number().int().min(7).max(3650),
});

const ADMIN_AUDIT_EVENT_TYPES = [
  "admin_org_deleted",
  "admin_org_profile_updated",
  "admin_support_context_switched",
  "admin_membership_role_changed",
  "admin_membership_removed",
  "admin_invite_created",
  "org_membership_role_changed",
  "org_membership_removed",
  "admin_audit_log_purged",
  "admin_superadmin_toggled",
  "admin_user_deleted",
  "admin_email_settings_toggled",
  "admin_email_alias_regenerated",
  "admin_inbound_email_replayed",
  "admin_imap_poller_reset",
  "admin_imap_force_poll",
  "admin_imap_disabled",
  "admin_connector_force_poll",
  "admin_connector_disabled",
  "admin_connector_enabled",
] as const;

async function getUserOr404(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user;
}

async function configuredMasterAdminCountExcluding(userId?: string): Promise<number> {
  const allUsers = await storage.getAllUsers();
  return allUsers.filter((user) => {
    if (userId && user.id === userId) return false;
    return user.isSuperAdmin && isMasterAdminEmail(user.email);
  }).length;
}

async function getMembershipRowsForOrg(orgId: string) {
  return db
    .select({
      id: memberships.id,
      orgId: memberships.orgId,
      userId: memberships.userId,
      role: memberships.role,
      createdAt: memberships.createdAt,
      username: users.username,
      fullName: users.fullName,
      email: users.email,
      isSuperAdmin: users.isSuperAdmin,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.orgId, orgId))
    .orderBy(desc(memberships.createdAt));
}

async function getOrgConnectorSummary(orgId: string) {
  const rows = await db.select().from(mailConnectors).where(eq(mailConnectors.orgId, orgId));
  return {
    total: rows.length,
    active: rows.filter((row) => row.enabled && row.status === "active").length,
    error: rows.filter((row) => row.status === "error" || row.consecutiveFailures > 0).length,
    disabled: rows.filter((row) => !row.enabled || row.status === "disabled").length,
    pendingAuth: rows.filter((row) => row.status === "pending_auth").length,
    lastError: rows.find((row) => row.lastError)?.lastError ?? null,
  };
}

async function getOrgRecentActivityAt(orgId: string): Promise<Date | null> {
  const [latest] = await db
    .select({ createdAt: authAuditLog.createdAt })
    .from(authAuditLog)
    .where(eq(authAuditLog.orgId, orgId))
    .orderBy(desc(authAuditLog.createdAt))
    .limit(1);
  return latest?.createdAt ?? null;
}

router.get("/api/admin/audit", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const querySchema = z.object({
      eventTypes: z.string().optional(),
      since: z.string().datetime().optional(),
      until: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    });
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    }
    const requested = parsed.data.eventTypes
      ? parsed.data.eventTypes.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (requested.length > 0) {
      const invalid = requested.filter(
        (t) => !(ADMIN_AUDIT_EVENT_TYPES as readonly string[]).includes(t)
      );
      if (invalid.length > 0) {
        return res.status(400).json({
          error: "Unknown event types",
          invalid,
          allowed: ADMIN_AUDIT_EVENT_TYPES,
        });
      }
    }
    const eventTypes = requested.length > 0 ? requested : [...ADMIN_AUDIT_EVENT_TYPES];

    const result = await storage.getAllAuthAuditLogs({
      eventTypes,
      since: parsed.data.since ? new Date(parsed.data.since) : undefined,
      until: parsed.data.until ? new Date(parsed.data.until) : undefined,
      limit: parsed.data.limit ?? 100,
      offset: parsed.data.offset ?? 0,
    });
    res.json({
      rows: result.rows,
      total: result.total,
      limit: parsed.data.limit ?? 100,
      offset: parsed.data.offset ?? 0,
      availableEventTypes: ADMIN_AUDIT_EVENT_TYPES,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/audit/purge", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const parsed = purgeAuditSchema.safeParse(req.body);
    if (!parsed.success) {
      await logAdminAction(req, {
        eventType: "admin_audit_log_purged",
        orgId: req.session.orgId ?? null,
        success: false,
        details: { reason: "invalid_input", body: req.body },
      });
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const deleted = await storage.purgeAuthAuditLogsOlderThan(parsed.data.days);
    await logAdminAction(req, {
      eventType: "admin_audit_log_purged",
      orgId: req.session.orgId ?? null,
      success: true,
      details: { days: parsed.data.days, deletedCount: deleted, scope: "global" },
    });
    res.json({ deleted, days: parsed.data.days });
  } catch (err: any) {
    await logAdminAction(req, {
      eventType: "admin_audit_log_purged",
      orgId: req.session.orgId ?? null,
      success: false,
      details: { error: err?.message ?? "unknown" },
    });
    res.status(500).json({ error: err.message });
  }
});

const updateRoleSchema = z.object({
  role: z.enum(VALID_ROLES),
});

router.get("/api/admin/master-admins", requireAuth, requireSuperAdmin, async (_req, res) => {
  res.json({ emails: getMasterAdminEmails() });
});

router.get("/api/admin/orgs", requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    const allOrgs = await storage.getAllOrgs();
    const orgsWithCounts = await Promise.all(
      allOrgs.map(async (org) => {
        const counts = await storage.getOrgCounts(org.id);
        const mems = await storage.getOrgMemberships(org.id);
        const authConfig = await storage.getOrgAuthConfig(org.id);
        const entitlement = await storage.getLatestOperatorOsEntitlementSnapshotForOrg(org.id, getOperatorOsModuleSlug());
        const connectorHealth = await getOrgConnectorSummary(org.id);
        const recentActivityAt = await getOrgRecentActivityAt(org.id);
        return {
          ...org,
          counts,
          memberCount: mems.length,
          ssoStatus: org.operatorOsOrgId ? "operatoros" : (authConfig?.authMode ?? "local"),
          authMode: authConfig?.authMode ?? "local",
          entitlement: entitlement ? {
            id: entitlement.id,
            enabled: entitlement.enabled,
            accessLevel: entitlement.accessLevel,
            moduleRole: entitlement.moduleRole,
            tenantRole: entitlement.tenantRole,
            subscriptionStatus: entitlement.subscriptionStatus,
            computedAt: entitlement.computedAt,
            receivedAt: entitlement.receivedAt,
            revokedAt: entitlement.revokedAt,
          } : null,
          connectorHealth,
          recentActivityAt,
        };
      })
    );
    res.json(orgsWithCounts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/admin/orgs/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  const orgId = req.params.id as string;
  try {
    const parsed = updateOrgProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      await logAdminAction(req, {
        eventType: "admin_org_profile_updated",
        orgId,
        success: false,
        details: { reason: "invalid_input", body: req.body },
      });
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const org = await storage.getOrg(orgId);
    if (!org) {
      await logAdminAction(req, {
        eventType: "admin_org_profile_updated",
        orgId,
        success: false,
        details: { reason: "not_found" },
      });
      return res.status(404).json({ error: "Organization not found" });
    }

    const { authMode, ...orgProfile } = parsed.data;
    const beforeAuth = await storage.getOrgAuthConfig(orgId);
    const orgUpdate: any = {};
    for (const [key, value] of Object.entries(orgProfile)) {
      if (value !== undefined) orgUpdate[key] = value ?? "";
    }

    const updated = Object.keys(orgUpdate).length > 0
      ? await storage.updateOrg(orgId, orgUpdate)
      : org;
    const updatedAuth = authMode
      ? await storage.upsertOrgAuthConfig(orgId, { authMode })
      : beforeAuth ?? null;

    await logAdminAction(req, {
      eventType: "admin_org_profile_updated",
      orgId,
      success: true,
      details: {
        before: {
          name: org.name,
          slug: org.slug,
          phone: org.phone,
          email: org.email,
          address: org.address,
          authMode: beforeAuth?.authMode ?? "local",
        },
        after: {
          name: updated?.name,
          slug: updated?.slug,
          phone: updated?.phone,
          email: updated?.email,
          address: updated?.address,
          authMode: updatedAuth?.authMode ?? "local",
        },
      },
    });
    res.json({ org: updated, authConfig: updatedAuth });
  } catch (err: any) {
    await logAdminAction(req, {
      eventType: "admin_org_profile_updated",
      orgId,
      success: false,
      details: { error: err?.message ?? "unknown" },
    });
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/orgs/:id/switch", requireAuth, requireSuperAdmin, async (req, res) => {
  const orgId = req.params.id as string;
  try {
    const org = await storage.getOrg(orgId);
    if (!org) {
      await logAdminAction(req, {
        eventType: "admin_support_context_switched",
        orgId,
        success: false,
        details: { reason: "not_found" },
      });
      return res.status(404).json({ error: "Organization not found" });
    }

    const previousOrgId = req.session.orgId ?? null;
    req.session.orgId = orgId;
    req.session.adminSupportOrgId = orgId;
    req.session.adminSupportStartedAt = new Date().toISOString();

    await logAdminAction(req, {
      eventType: "admin_support_context_switched",
      orgId,
      success: true,
      details: {
        before: { orgId: previousOrgId },
        after: { orgId, supportContext: true },
      },
    });
    res.json({ ok: true, orgId, org });
  } catch (err: any) {
    await logAdminAction(req, {
      eventType: "admin_support_context_switched",
      orgId,
      success: false,
      details: { error: err?.message ?? "unknown" },
    });
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/admin/orgs/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const existing = await storage.getOrg((req.params.id as string));
    if (!existing) {
      await logAdminAction(req, {
        eventType: "admin_org_deleted",
        orgId: (req.params.id as string),
        success: false,
        details: { reason: "not_found" },
      });
      return res.status(404).json({ error: "Organization not found" });
    }
    await storage.deleteOrg((req.params.id as string));
    await logAdminAction(req, {
      eventType: "admin_org_deleted",
      orgId: null,
      success: true,
      details: {
        deletedOrgId: existing.id,
        before: { name: existing.name, slug: existing.slug, plan: existing.plan },
      },
    });
    res.json({ ok: true });
  } catch (err: any) {
    await logAdminAction(req, {
      eventType: "admin_org_deleted",
      orgId: (req.params.id as string),
      success: false,
      details: { error: err?.message ?? "unknown" },
    });
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/admin/users", requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    const allUsers = await storage.getAllUsers();
    const usersWithMemberships = await Promise.all(
      allUsers.map(async (u) => {
        const userMemberships = await db
          .select({
            orgId: memberships.orgId,
            role: memberships.role,
            orgName: orgs.name,
            orgSlug: orgs.slug,
            orgPlan: orgs.plan,
          })
          .from(memberships)
          .innerJoin(orgs, eq(memberships.orgId, orgs.id))
          .where(eq(memberships.userId, u.id));

        return {
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          email: u.email,
          isSuperAdmin: u.isSuperAdmin,
          isConfiguredMasterAdmin: isMasterAdminEmail(u.email),
          createdAt: (u as any).createdAt ?? null,
          memberships: userMemberships,
        };
      })
    );
    res.json(usersWithMemberships);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/admin/orgs/:orgId/members/:userId/role", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const orgId = req.params.orgId as string;
    const userId = req.params.userId as string;
    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      await logAdminAction(req, {
        eventType: "admin_membership_role_changed",
        orgId,
        targetUserId: userId,
        success: false,
        details: { reason: "invalid_role", body: req.body },
      });
      return res.status(400).json({ error: "Invalid role", validRoles: VALID_ROLES });
    }

    const mem = await storage.getMembership(orgId, userId);
    if (!mem) {
      await logAdminAction(req, {
        eventType: "admin_membership_role_changed",
        orgId,
        targetUserId: userId,
        success: false,
        details: { reason: "not_found", requestedRole: parsed.data.role },
      });
      return res.status(404).json({ error: "Membership not found" });
    }

    const targetUser = await getUserOr404(userId);
    if (targetUser && isMasterAdminEmail(targetUser.email) && parsed.data.role !== "owner") {
      await logAdminAction(req, {
        eventType: "admin_membership_role_changed",
        orgId,
        targetUserId: userId,
        success: false,
        details: {
          reason: "configured_master_admin_role_protected",
          before: { role: mem.role },
          requestedRole: parsed.data.role,
        },
      });
      return res.status(400).json({ error: "Configured master admin must remain owner in tenant mappings" });
    }

    await storage.updateMembershipRole(orgId, userId, parsed.data.role);
    await logAdminAction(req, {
      eventType: "admin_membership_role_changed",
      orgId,
      targetUserId: userId,
      success: true,
      details: {
        before: { role: mem.role },
        after: { role: parsed.data.role },
      },
    });
    res.json({ ok: true, orgId, userId, role: parsed.data.role });
  } catch (err: any) {
    await logAdminAction(req, {
      eventType: "admin_membership_role_changed",
      orgId: (req.params.orgId as string),
      targetUserId: (req.params.userId as string),
      success: false,
      details: { error: err?.message ?? "unknown" },
    });
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/admin/orgs/:orgId/members", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const orgId = req.params.orgId as string;
    const org = await storage.getOrg(orgId);
    if (!org) return res.status(404).json({ error: "Organization not found" });
    res.json(await getMembershipRowsForOrg(orgId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/orgs/:orgId/invites", requireAuth, requireSuperAdmin, async (req, res) => {
  const orgId = req.params.orgId as string;
  try {
    const parsed = createInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      await logAdminAction(req, {
        eventType: "admin_invite_created",
        orgId,
        success: false,
        details: { reason: "invalid_role", body: req.body },
      });
      return res.status(400).json({ error: "Invalid role", validRoles: VALID_ROLES });
    }
    const org = await storage.getOrg(orgId);
    if (!org) {
      await logAdminAction(req, {
        eventType: "admin_invite_created",
        orgId,
        success: false,
        details: { reason: "not_found" },
      });
      return res.status(404).json({ error: "Organization not found" });
    }

    const invite = await storage.createInviteCode(orgId, parsed.data.role, req.session.userId!);
    await logAdminAction(req, {
      eventType: "admin_invite_created",
      orgId,
      success: true,
      details: {
        after: {
          inviteId: invite.id,
          role: invite.role,
          expiresAt: invite.expiresAt ?? null,
        },
      },
    });
    res.json(invite);
  } catch (err: any) {
    await logAdminAction(req, {
      eventType: "admin_invite_created",
      orgId,
      success: false,
      details: { error: err?.message ?? "unknown" },
    });
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/admin/orgs/:orgId/members/:userId", requireAuth, requireSuperAdmin, async (req, res) => {
  const orgId = req.params.orgId as string;
  const userId = req.params.userId as string;
  try {
    const mem = await storage.getMembership(orgId, userId);
    if (!mem) {
      await logAdminAction(req, {
        eventType: "admin_membership_removed",
        orgId,
        targetUserId: userId,
        success: false,
        details: { reason: "not_found" },
      });
      return res.status(404).json({ error: "Membership not found" });
    }
    const targetUser = await getUserOr404(userId);
    if (targetUser && isMasterAdminEmail(targetUser.email)) {
      await logAdminAction(req, {
        eventType: "admin_membership_removed",
        orgId,
        targetUserId: userId,
        success: false,
        details: {
          reason: "configured_master_admin_membership_protected",
          before: { role: mem.role },
        },
      });
      return res.status(400).json({ error: "Configured master admin membership cannot be removed" });
    }

    await storage.deleteMembership(orgId, userId);
    await logAdminAction(req, {
      eventType: "admin_membership_removed",
      orgId,
      targetUserId: userId,
      success: true,
      details: {
        before: { role: mem.role },
        after: { removed: true },
      },
    });
    res.json({ ok: true });
  } catch (err: any) {
    await logAdminAction(req, {
      eventType: "admin_membership_removed",
      orgId,
      targetUserId: userId,
      success: false,
      details: { error: err?.message ?? "unknown" },
    });
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/admin/entitlements", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const orgId = typeof req.query.orgId === "string" ? req.query.orgId : "";
    const userId = typeof req.query.userId === "string" ? req.query.userId : "";
    const state = typeof req.query.state === "string" ? req.query.state : "all";
    const limit = Math.min(Number(req.query.limit) || 200, 500);

    const rows = await db
      .select({
        id: operatorOsEntitlementSnapshots.id,
        operatorOsUserId: operatorOsEntitlementSnapshots.operatorOsUserId,
        operatorOsTenantId: operatorOsEntitlementSnapshots.operatorOsTenantId,
        localUserId: operatorOsEntitlementSnapshots.localUserId,
        localOrgId: operatorOsEntitlementSnapshots.localOrgId,
        moduleSlug: operatorOsEntitlementSnapshots.moduleSlug,
        enabled: operatorOsEntitlementSnapshots.enabled,
        accessLevel: operatorOsEntitlementSnapshots.accessLevel,
        moduleRole: operatorOsEntitlementSnapshots.moduleRole,
        tenantRole: operatorOsEntitlementSnapshots.tenantRole,
        tenantRoleAlias: operatorOsEntitlementSnapshots.tenantRoleAlias,
        subscriptionStatus: operatorOsEntitlementSnapshots.subscriptionStatus,
        features: operatorOsEntitlementSnapshots.features,
        computedAt: operatorOsEntitlementSnapshots.computedAt,
        receivedAt: operatorOsEntitlementSnapshots.receivedAt,
        revokedAt: operatorOsEntitlementSnapshots.revokedAt,
        userEmail: users.email,
        userFullName: users.fullName,
        orgName: orgs.name,
        orgSlug: orgs.slug,
      })
      .from(operatorOsEntitlementSnapshots)
      .leftJoin(users, eq(operatorOsEntitlementSnapshots.localUserId, users.id))
      .leftJoin(orgs, eq(operatorOsEntitlementSnapshots.localOrgId, orgs.id))
      .orderBy(desc(operatorOsEntitlementSnapshots.computedAt))
      .limit(limit);

    const filtered = rows.filter((row) => {
      if (orgId && row.localOrgId !== orgId) return false;
      if (userId && row.localUserId !== userId) return false;
      if (state === "enabled" && (!row.enabled || row.revokedAt)) return false;
      if (state === "disabled" && row.enabled && !row.revokedAt) return false;
      return true;
    });

    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/admin/users/:id/superadmin", requireAuth, requireSuperAdmin, async (req, res) => {
  const id = req.params.id as string;
  try {
    const { isSuperAdmin } = req.body;

    if (typeof isSuperAdmin !== "boolean") {
      await logAdminAction(req, {
        eventType: "admin_superadmin_toggled",
        targetUserId: id,
        success: false,
        details: {
          reason: "invalid_body",
          receivedType: typeof req.body?.isSuperAdmin,
        },
      });
      return res.status(400).json({ error: "isSuperAdmin must be a boolean" });
    }

    if (id === req.session.userId && !isSuperAdmin) {
      await logAdminAction(req, {
        eventType: "admin_superadmin_toggled",
        targetUserId: id,
        success: false,
        details: { reason: "self_demotion_blocked", requested: { isSuperAdmin } },
      });
      return res.status(400).json({ error: "Cannot remove your own super admin status" });
    }

    const [existing] = await db.select().from(users).where(eq(users.id, id));
    if (!existing) {
      await logAdminAction(req, {
        eventType: "admin_superadmin_toggled",
        targetUserId: id,
        success: false,
        details: { reason: "not_found", requested: { isSuperAdmin } },
      });
      return res.status(404).json({ error: "User not found" });
    }

    if (!isSuperAdmin && isMasterAdminEmail(existing.email)) {
      await logAdminAction(req, {
        eventType: "admin_superadmin_toggled",
        targetUserId: id,
        success: false,
        details: {
          reason: "configured_master_admin_protected",
          before: { isSuperAdmin: existing.isSuperAdmin ?? false, email: existing.email ?? null },
          requested: { isSuperAdmin },
        },
      });
      return res.status(400).json({ error: "Configured master admin cannot be demoted" });
    }

    if (!isSuperAdmin && existing.isSuperAdmin && (await configuredMasterAdminCountExcluding(id)) < 1) {
      await logAdminAction(req, {
        eventType: "admin_superadmin_toggled",
        targetUserId: id,
        success: false,
        details: {
          reason: "last_configured_master_admin_blocked",
          before: { isSuperAdmin: existing.isSuperAdmin ?? false, email: existing.email ?? null },
          requested: { isSuperAdmin },
        },
      });
      return res.status(400).json({ error: "Cannot remove the last configured master admin" });
    }

    await db.update(users).set({ isSuperAdmin }).where(eq(users.id, id));
    await logAdminAction(req, {
      eventType: "admin_superadmin_toggled",
      targetUserId: id,
      success: true,
      details: {
        before: { isSuperAdmin: existing.isSuperAdmin ?? false },
        after: { isSuperAdmin },
      },
    });
    res.json({ ok: true, userId: id, isSuperAdmin });
  } catch (err: any) {
    await logAdminAction(req, {
      eventType: "admin_superadmin_toggled",
      targetUserId: id,
      success: false,
      details: { error: err?.message ?? "unknown" },
    });
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/admin/users/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  const id = req.params.id as string;
  try {
    if (id === req.session.userId) {
      await logAdminAction(req, {
        eventType: "admin_user_deleted",
        targetUserId: id,
        success: false,
        details: { reason: "self_delete_blocked" },
      });
      return res.status(400).json({ error: "Cannot delete your own user" });
    }

    const existing = await getUserOr404(id);
    if (!existing) {
      await logAdminAction(req, {
        eventType: "admin_user_deleted",
        targetUserId: id,
        success: false,
        details: { reason: "not_found" },
      });
      return res.status(404).json({ error: "User not found" });
    }

    if (isMasterAdminEmail(existing.email)) {
      await logAdminAction(req, {
        eventType: "admin_user_deleted",
        targetUserId: id,
        success: false,
        details: {
          reason: "configured_master_admin_protected",
          before: { email: existing.email, username: existing.username, isSuperAdmin: existing.isSuperAdmin },
        },
      });
      return res.status(400).json({ error: "Configured master admin cannot be deleted" });
    }

    await storage.deleteUser(id);
    await logAdminAction(req, {
      eventType: "admin_user_deleted",
      targetUserId: id,
      success: true,
      details: {
        before: {
          email: existing.email,
          username: existing.username,
          isSuperAdmin: existing.isSuperAdmin,
        },
        after: { deleted: true },
      },
    });
    res.json({ ok: true });
  } catch (err: any) {
    await logAdminAction(req, {
      eventType: "admin_user_deleted",
      targetUserId: id,
      success: false,
      details: { error: err?.message ?? "unknown" },
    });
    res.status(500).json({ error: err.message });
  }
});

export default router;
