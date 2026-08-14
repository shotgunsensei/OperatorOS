import type { Response, NextFunction } from "express";
import { parseSnapshot, isBlockingStatus, type EntitlementSnapshot } from "../../auth/entitlements";
import { logger } from "../../logger";

function getSnapshotFromReq(req: any): EntitlementSnapshot | null {
  const profile = req.user?.profile as Record<string, unknown> | undefined;
  if (!profile) return null;
  return parseSnapshot(profile.entitlementSnapshotJson);
}

function isOperatorOsManagedProfile(profile: Record<string, unknown> | undefined): boolean {
  if (!profile) return false;
  return !!(profile.operatorosUserId || profile.ssoSubject || profile.operatorosTenantId);
}

/**
 * OperatorOS access-state middleware.
 *
 * The historical name remains for route compatibility, but the decision no
 * longer consults tenant_subscriptions.pausedAt. OperatorOS snapshots block
 * writes when the module is disabled or the subscription status is past_due,
 * unpaid, or canceled. Missing snapshots fail closed for OperatorOS-managed
 * users.
 */
export function requireNotPaused() {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const snapshot = getSnapshotFromReq(req);
      if (!snapshot) {
        const profile = req.user?.profile as Record<string, unknown> | undefined;
        if (isOperatorOsManagedProfile(profile)) {
          return res.status(402).json({
            error: "entitlement_snapshot_missing",
            message: "OperatorOS entitlements are not synced. Sign in again from OperatorOS to refresh access.",
          });
        }
        return next();
      }
      if (snapshot.enabled === false) {
        return res.status(402).json({
          error: "module_access_denied",
          message: "Access to Tech Deck is disabled for your OperatorOS account.",
        });
      }
      if (isBlockingStatus(snapshot.subscriptionStatus)) {
        return res.status(402).json({
          error: "subscription_inactive",
          status: snapshot.subscriptionStatus,
          accessLevel: snapshot.accessLevel,
          message: "Your OperatorOS subscription is not active. Manage billing in OperatorOS to restore access.",
        });
      }
      return next();
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[requireNotPaused] error");
      return res.status(500).json({ error: "entitlement_check_failed", message: "Unable to verify OperatorOS entitlements." });
    }
  };
}
