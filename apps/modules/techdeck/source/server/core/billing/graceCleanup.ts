import { storage } from "../../storage";
import * as fs from "fs";
import * as path from "path";

const GRACE_PERIOD_DAYS = 90;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function cleanupExpiredTenants(): Promise<void> {
  try {
    const expired = await storage.getPausedTenantsExpiredGrace(GRACE_PERIOD_DAYS);

    if (expired.length === 0) return;

    console.log(`[grace-cleanup] Found ${expired.length} tenant(s) with expired grace period`);

    for (const sub of expired) {
      try {
        const freshSub = await storage.getTenantSubscription(sub.tenantId);
        if (!freshSub?.pausedAt) {
          console.log(`[grace-cleanup] Tenant ${sub.tenantId} was unpaused since check, skipping`);
          continue;
        }

        const uploadsDir = path.join(process.cwd(), "uploads", sub.tenantId);
        if (fs.existsSync(uploadsDir)) {
          fs.rmSync(uploadsDir, { recursive: true, force: true });
          console.log(`[grace-cleanup] Removed file storage for tenant ${sub.tenantId}`);
        }

        await storage.deleteTenant(sub.tenantId);
        console.log(`[grace-cleanup] Deleted tenant ${sub.tenantId} after ${GRACE_PERIOD_DAYS}-day grace period`);
      } catch (err: any) {
        console.error(`[grace-cleanup] Error deleting tenant ${sub.tenantId}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error("[grace-cleanup] Error during cleanup check:", err.message);
  }
}

export function startGraceCleanupJob(): void {
  if (process.env.NODE_ENV === "production") {
    console.log("[grace-cleanup] Disabled in production. OperatorOS owns subscription state and tenant access.");
    return;
  }

  if (process.env.ENABLE_LEGACY_BILLING_GRACE_CLEANUP !== "true") {
    console.log("[grace-cleanup] Disabled. OperatorOS owns subscription state and tenant access.");
    return;
  }

  console.log(`[grace-cleanup] Started (checks every ${CHECK_INTERVAL_MS / 3600000}h, grace period: ${GRACE_PERIOD_DAYS} days)`);

  cleanupExpiredTenants();

  setInterval(cleanupExpiredTenants, CHECK_INTERVAL_MS);
}
