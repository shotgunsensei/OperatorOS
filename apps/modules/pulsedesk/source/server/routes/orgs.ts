import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, requireRole } from "../middleware";
import { DEFAULT_DEPARTMENTS } from "@shared/schema";
import { logAdminAction } from "../lib/adminAudit";
import { getOperatorOsNumericLimitForOrg } from "../services/operatorosEntitlements";
import { isMasterAdminEmail } from "../config/masterAdmin";
import { normalizeRole, type CanonicalRole } from "@shared/roles";

const router = Router();
const TENANT_MANAGED_ROLES: CanonicalRole[] = ["admin", "supervisor", "technician", "staff", "readonly"];

router.post("/api/orgs", requireAuth, async (req, res) => {
  try {
    const { name, slug, phone, email, address } = req.body;
    if (!name) return res.status(400).json({ error: "Organization name required" });

    const org = await storage.createOrg({
      name,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      phone: phone || "",
      email: email || "",
      address: address || "",
    });

    await storage.createMembership(org.id, req.session.userId!, "admin");
    req.session.orgId = org.id;

    for (const deptName of DEFAULT_DEPARTMENTS) {
      await storage.createDepartment(org.id, { name: deptName });
    }

    res.json(org);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/orgs/:id", requireAuth, requireOrg, requireRole("admin"), async (req, res) => {
  try {
    if ((req.params.id as string) !== req.session.orgId) {
      return res.status(403).json({ error: "Cannot edit another organization" });
    }
    const org = await storage.updateOrg((req.params.id as string), req.body);
    res.json(org);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/orgs/join", requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    const invite = await storage.getInviteCodeByCode(code);
    if (!invite) return res.status(400).json({ error: "Invalid invite code" });

    const existing = await storage.getMembership(invite.orgId, req.session.userId!);
    if (existing) return res.status(400).json({ error: "Already a member" });

    const maxMembers = await getOperatorOsNumericLimitForOrg(invite.orgId, "maxMembers");
    if (maxMembers !== null) {
      const counts = await storage.getOrgCounts(invite.orgId);
      if (counts.members >= maxMembers) {
        return res.status(403).json({ error: `Member limit reached (${maxMembers}). Update the OperatorOS entitlement for more seats.` });
      }
    }

    await storage.createMembership(invite.orgId, req.session.userId!, invite.role);
    req.session.orgId = invite.orgId;
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/invite-codes", requireAuth, requireOrg, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    const codes = await storage.getOrgInviteCodes(req.session.orgId!);
    res.json(codes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/invite-codes", requireAuth, requireOrg, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    const { role } = req.body;
    const normalizedRole = normalizeRole(role) ?? "staff";
    if (!TENANT_MANAGED_ROLES.includes(normalizedRole)) {
      return res.status(400).json({ error: "Invalid role", code: "INVALID_ROLE", validRoles: TENANT_MANAGED_ROLES });
    }
    const code = await storage.createInviteCode(req.session.orgId!, normalizedRole, req.session.userId!);
    res.json(code);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/memberships", requireAuth, requireOrg, async (req, res) => {
  try {
    const mems = await storage.getOrgMemberships(req.session.orgId!);
    const membersWithUsers = await Promise.all(
      mems.map(async (m) => {
        const user = await storage.getUser(m.userId);
        return { ...m, user: user ? { ...user, password: undefined } : null };
      })
    );
    res.json(membersWithUsers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/memberships/:userId/role", requireAuth, requireOrg, requireRole("admin"), async (req, res) => {
  try {
    const userId = (req.params.userId as string);
    const orgId = req.session.orgId!;
    const { role } = req.body;
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole || !TENANT_MANAGED_ROLES.includes(normalizedRole)) {
      await logAdminAction(req, {
        eventType: "org_membership_role_changed",
        orgId,
        targetUserId: userId,
        success: false,
        details: { reason: "invalid_role", requestedRole: role },
      });
      return res.status(400).json({ error: "Invalid role", code: "INVALID_ROLE", validRoles: TENANT_MANAGED_ROLES });
    }
    if (userId === req.session.userId) {
      await logAdminAction(req, {
        eventType: "org_membership_role_changed",
        orgId,
        targetUserId: userId,
        success: false,
        details: { reason: "self_role_change_blocked", requestedRole: normalizedRole },
      });
      return res.status(400).json({ error: "Cannot change your own role" });
    }
    const existing = await storage.getMembership(orgId, userId);
    if (!existing) {
      await logAdminAction(req, {
        eventType: "org_membership_role_changed",
        orgId,
        targetUserId: userId,
        success: false,
        details: { reason: "not_found", requestedRole: role },
      });
      return res.status(404).json({ error: "Membership not found" });
    }
    const targetUser = await storage.getUser(userId);
    if (targetUser && isMasterAdminEmail(targetUser.email)) {
      await logAdminAction(req, {
        eventType: "org_membership_role_changed",
        orgId,
        targetUserId: userId,
        success: false,
        details: {
          reason: "configured_master_admin_role_protected",
          before: { role: existing.role },
          requestedRole: normalizedRole,
        },
      });
      return res.status(400).json({ error: "Configured master admin role cannot be changed from tenant settings" });
    }
    await storage.updateMembershipRole(orgId, userId, normalizedRole);
    await logAdminAction(req, {
      eventType: "org_membership_role_changed",
      orgId,
      targetUserId: userId,
      success: true,
      details: {
        before: { role: existing.role },
        after: { role: normalizedRole },
      },
    });
    res.json({ ok: true });
  } catch (err: any) {
    await logAdminAction(req, {
      eventType: "org_membership_role_changed",
      orgId: req.session.orgId ?? null,
      targetUserId: (req.params.userId as string),
      success: false,
      details: { error: err?.message ?? "unknown" },
    });
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/memberships/:userId", requireAuth, requireOrg, requireRole("admin"), async (req, res) => {
  try {
    const userId = (req.params.userId as string);
    const orgId = req.session.orgId!;
    if (userId === req.session.userId) {
      await logAdminAction(req, {
        eventType: "org_membership_removed",
        orgId,
        targetUserId: userId,
        success: false,
        details: { reason: "self_remove_blocked" },
      });
      return res.status(400).json({ error: "Cannot remove yourself" });
    }
    const existing = await storage.getMembership(orgId, userId);
    if (!existing) {
      await logAdminAction(req, {
        eventType: "org_membership_removed",
        orgId,
        targetUserId: userId,
        success: false,
        details: { reason: "not_found" },
      });
      return res.status(404).json({ error: "Membership not found" });
    }
    const targetUser = await storage.getUser(userId);
    if (targetUser && isMasterAdminEmail(targetUser.email)) {
      await logAdminAction(req, {
        eventType: "org_membership_removed",
        orgId,
        targetUserId: userId,
        success: false,
        details: {
          reason: "configured_master_admin_membership_protected",
          before: { role: existing.role },
        },
      });
      return res.status(400).json({ error: "Configured master admin membership cannot be removed" });
    }
    await storage.deleteMembership(orgId, userId);
    await logAdminAction(req, {
      eventType: "org_membership_removed",
      orgId,
      targetUserId: userId,
      success: true,
      details: {
        before: { role: existing.role },
        after: { removed: true },
      },
    });
    res.json({ ok: true });
  } catch (err: any) {
    await logAdminAction(req, {
      eventType: "org_membership_removed",
      orgId: req.session.orgId ?? null,
      targetUserId: (req.params.userId as string),
      success: false,
      details: { error: err?.message ?? "unknown" },
    });
    res.status(500).json({ error: err.message });
  }
});

export default router;
