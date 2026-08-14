import type { Express } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { parseSnapshot } from "../../auth/entitlements";

/**
 * Task #12: OperatorOS is the authority for plans, subscriptions, and
 * entitlements. Tech Deck no longer owns checkout, the customer portal,
 * or plan switching — those endpoints now return 410 Gone with a clear
 * pointer to OperatorOS billing. We keep read-only endpoints so the UI
 * can display the current snapshot. The legacy Stripe webhook is registered
 * only when ENABLE_LEGACY_STRIPE_WEBHOOK_AUDIT=true, and then it records
 * audit events without changing access.
 */
function operatorosBillingUrl(): string {
  if (process.env.OPERATOROS_BILLING_URL) return process.env.OPERATOROS_BILLING_URL;
  if (process.env.OPERATOROS_BASE_URL) return `${process.env.OPERATOROS_BASE_URL.replace(/\/$/, "")}/billing`;
  return "https://operatoros.net/billing";
}

const GONE_BODY = {
  error: "managed_by_operatoros",
  message: "Plans and billing are now managed by OperatorOS. Visit OperatorOS billing to subscribe or change plans.",
};

export function registerBillingRoutes(app: Express) {
  /**
   * Returns the calling user's authoritative entitlement snapshot, plus the
   * OperatorOS billing URL the UI should deep-link to for any plan changes.
   * Available to every authenticated user (no role gate) because the snapshot
   * itself encodes their permissions.
   */
  app.get("/api/me/entitlements", isAuthenticated, async (req: any, res) => {
    const profile = req.user?.profile as Record<string, unknown> | undefined;
    const snapshot = parseSnapshot(profile?.entitlementSnapshotJson);
    res.json({
      snapshot,
      operatorosBillingUrl: operatorosBillingUrl(),
      lastSyncAt: profile?.lastEntitlementSyncAt ?? null,
      managedBy: "operatoros",
    });
  });

  /**
   * Legacy read endpoints still answer for backwards compatibility, but they
   * now project from the snapshot instead of `tenant_subscriptions`. The
   * payload shape is preserved so existing UI components continue to render.
   */
  app.get("/api/billing/subscription", isAuthenticated, async (req: any, res) => {
    const profile = req.user?.profile as Record<string, unknown> | undefined;
    const snapshot = parseSnapshot(profile?.entitlementSnapshotJson);
    if (!snapshot) {
      return res.json({ subscription: null, plan: null, usage: null, managedBy: "operatoros" });
    }
    const monthKey = new Date().toISOString().slice(0, 7);
    const tenantId = req.tenantCtx?.tenantId;
    const usage = tenantId ? await storage.getOrCreateUsageCounter(tenantId, monthKey) : null;
    res.json({
      subscription: {
        planCode: snapshot.accessLevel,
        status: snapshot.subscriptionStatus,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
      },
      plan: {
        code: snapshot.accessLevel,
        name: snapshot.accessLevel.charAt(0).toUpperCase() + snapshot.accessLevel.slice(1),
        limits: snapshot.limits,
        features: snapshot.features,
      },
      usage,
      managedBy: "operatoros",
      operatorosBillingUrl: operatorosBillingUrl(),
    });
  });

  app.get("/api/billing/plans", isAuthenticated, async (_req: any, res) => {
    // Plans catalog is no longer locally authoritative; clients should call
    // OperatorOS for the up-to-date offer set. We return an empty list and
    // a clear pointer.
    res.json({ plans: [], subscription: null, managedBy: "operatoros", operatorosBillingUrl: operatorosBillingUrl() });
  });

  // Write endpoints → 410 Gone. Including a Location header gives well-behaved
  // clients a hint, and the JSON body explains the migration for everyone else.
  const goneHandler = (_req: any, res: any) => {
    res.set("Location", operatorosBillingUrl());
    res.status(410).json({ ...GONE_BODY, operatorosBillingUrl: operatorosBillingUrl() });
  };
  app.post("/api/billing/checkout-session", isAuthenticated, goneHandler);
  app.post("/api/billing/customer-portal", isAuthenticated, goneHandler);
}
