import { Router, type Response } from "express";
import { requireAuth, requireOrg, requireMinRole } from "../middleware";
import { storage } from "../storage";
import {
  getCurrentEntitlementSnapshotForRequest,
  snapshotAllowsFeature,
  snapshotNumericLimit,
} from "../services/operatorosEntitlements";

const router = Router();

function getOperatorOsBillingUrl(): string {
  const configured =
    process.env.OPERATOROS_BILLING_URL
    || process.env.OPERATOROS_BASE_URL
    || process.env.OPERATOROS_APP_URL
    || "https://app.operatoros.net";
  const normalized = configured.replace(/\/+$/, "");
  return normalized.includes("/app/platform/billing")
    ? normalized
    : `${normalized}/app/platform/billing`;
}

function sendManagedBilling(res: Response, action: string) {
  return res.status(410).json({
    code: "managed_by_operatoros",
    managedBy: "operatoros",
    action,
    billingUrl: getOperatorOsBillingUrl(),
    error: "PulseDesk billing, checkout, pricing, and subscription changes are managed by OperatorOS.",
  });
}

router.get("/api/billing/plans", requireAuth, requireOrg, async (_req, res) => {
  return sendManagedBilling(res, "plans");
});

export async function syncOrgPlanFromStripe(_orgId: string): Promise<void> {
  // OperatorOS owns subscription state and pushes entitlement snapshots into PulseDesk.
}

router.get("/api/billing/status", requireAuth, requireOrg, async (req, res) => {
  try {
    const org = await storage.getOrg(req.session.orgId!);
    if (!org) return res.status(404).json({ error: "Org not found" });

    const counts = await storage.getOrgCounts(req.session.orgId!);
    const snapshot = await getCurrentEntitlementSnapshotForRequest(req, {
      refreshIfMissing: true,
      refreshIfStale: true,
    });
    const maxMembers = snapshotNumericLimit(snapshot, "maxMembers");
    const maxTickets = snapshotNumericLimit(snapshot, "maxTickets");

    res.json({
      plan: "operatoros",
      managedBy: "operatoros",
      billingUrl: getOperatorOsBillingUrl(),
      entitlement: snapshot ? {
        id: snapshot.id,
        moduleSlug: snapshot.moduleSlug,
        enabled: snapshot.enabled && !snapshot.revokedAt,
        accessLevel: snapshot.accessLevel,
        moduleRole: snapshot.moduleRole,
        tenantRole: snapshot.tenantRole,
        tenantRoleAlias: snapshot.tenantRoleAlias,
        computedAt: snapshot.computedAt,
        receivedAt: snapshot.receivedAt,
        revokedAt: snapshot.revokedAt,
      } : null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      planExpiresAt: null,
      subscriptionStatus: snapshot?.subscriptionStatus ?? null,
      cancelAtPeriodEnd: false,
      stripeSyncStatus: "operatoros",
      limits: {
        maxMembers,
        maxTickets,
        entraEnabled: snapshotAllowsFeature(snapshot, "entraEnabled"),
      },
      usage: {
        members: counts.members,
        tickets: counts.tickets,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/billing/checkout", requireAuth, requireOrg, requireMinRole("admin"), async (_req, res) => {
  return sendManagedBilling(res, "checkout");
});

router.post("/api/billing/portal", requireAuth, requireOrg, requireMinRole("admin"), async (_req, res) => {
  return sendManagedBilling(res, "portal");
});

router.get("/api/billing/publishable-key", requireAuth, async (_req, res) => {
  return sendManagedBilling(res, "publishable_key");
});

export default router;
