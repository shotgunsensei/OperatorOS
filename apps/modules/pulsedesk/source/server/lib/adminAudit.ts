import type { Request } from "express";
import { storage } from "../storage";

function getClientIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0]?.trim() || null;
  }
  return req.ip || null;
}

export type AdminAuditEventType =
  | "admin_org_deleted"
  | "admin_org_profile_updated"
  | "admin_support_context_switched"
  | "admin_membership_role_changed"
  | "admin_membership_removed"
  | "admin_invite_created"
  | "admin_audit_log_purged"
  | "org_membership_role_changed"
  | "org_membership_removed"
  | "admin_superadmin_toggled"
  | "admin_user_deleted"
  | "admin_email_settings_toggled"
  | "admin_email_alias_regenerated"
  | "admin_inbound_email_replayed"
  | "admin_imap_poller_reset"
  | "admin_imap_force_poll"
  | "admin_imap_disabled"
  | "admin_connector_force_poll"
  | "admin_connector_disabled"
  | "admin_connector_enabled";

export async function logAdminAction(
  req: Request,
  params: {
    eventType: AdminAuditEventType;
    orgId?: string | null;
    targetUserId?: string | null;
    success: boolean;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const actor = req.session?.userId ? await storage.getUser(req.session.userId) : null;
    await storage.createAuthAuditLog({
      orgId: params.orgId ?? null,
      userId: req.session?.userId ?? null,
      eventType: params.eventType,
      authSource: "admin",
      ipAddress: getClientIp(req),
      userAgent: (req.headers["user-agent"] as string) || null,
      details: {
        actorUserId: req.session?.userId ?? null,
        actorEmail: actor?.email ?? null,
        actorUsername: actor?.username ?? null,
        targetUserId: params.targetUserId ?? null,
        ...(params.details || {}),
      },
      success: params.success,
    });
  } catch (err) {
    console.error("Failed to write admin audit log:", err);
  }
}
