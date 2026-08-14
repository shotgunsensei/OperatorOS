import type { Express } from "express";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { requireSystemAdmin } from "../../core/middleware/requireSystemAdmin";
import { db } from "../../db";
import { tenantMembers, users } from "@shared/schema";
import { parseSnapshot, type EntitlementSnapshot } from "../../auth/entitlements";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function operatorosUrl(): string {
  if (process.env.OPERATOROS_ADMIN_URL) return process.env.OPERATOROS_ADMIN_URL;
  if (process.env.OPERATOROS_BILLING_URL) return process.env.OPERATOROS_BILLING_URL;
  const base = process.env.OPERATOROS_BASE_URL;
  return base ? `${stripTrailingSlash(base)}/billing` : "https://operatoros.net/billing";
}

function managedByOperatorOs(res: any) {
  const url = operatorosUrl();
  res.set("Location", url);
  return res.status(410).json({
    code: "managed_by_operatoros",
    message: "Tenant plans, subscription status, pause/unpause, upgrades, and downgrades are managed by OperatorOS.",
    operatorosUrl: url,
  });
}

async function getTenantOperatorOsStatus(tenantId: string): Promise<{
  operatorosTenantId: string | null;
  operatorosPlan: string | null;
  subscriptionStatus: string | null;
  accessLevel: string | null;
  enabledFeatures: string[];
  lastEntitlementSyncAt: Date | string | null;
  localRole: string | null;
  revoked: boolean;
  snapshot: EntitlementSnapshot | null;
}> {
  const rows = await db
    .select({
      operatorosTenantId: users.operatorosTenantId,
      localRole: users.localRole,
      revokedAt: users.revokedAt,
      lastEntitlementSyncAt: users.lastEntitlementSyncAt,
      entitlementSnapshotJson: users.entitlementSnapshotJson,
    })
    .from(tenantMembers)
    .innerJoin(users, eq(users.id, tenantMembers.userId))
    .where(and(eq(tenantMembers.tenantId, tenantId), isNotNull(users.entitlementSnapshotJson)))
    .orderBy(desc(users.lastEntitlementSyncAt))
    .limit(1);

  const row = rows[0];
  const snapshot = parseSnapshot(row?.entitlementSnapshotJson);
  return {
    operatorosTenantId: snapshot?.organizationId || row?.operatorosTenantId || null,
    operatorosPlan: snapshot?.planSlug || null,
    subscriptionStatus: snapshot?.subscriptionStatus || null,
    accessLevel: snapshot?.accessLevel || null,
    enabledFeatures: snapshot?.features || [],
    lastEntitlementSyncAt: row?.lastEntitlementSyncAt || snapshot?.syncedAt || null,
    localRole: row?.localRole || snapshot?.moduleRole || null,
    revoked: !!row?.revokedAt || snapshot?.enabled === false,
    snapshot,
  };
}

export function registerAdminRoutes(app: Express) {
  app.get("/api/admin/tenants", isAuthenticated, requireSystemAdmin(), async (_req: any, res) => {
    try {
      const tenants = await storage.getAllTenants();
      const enriched = await Promise.all(
        tenants.map(async (tenant) => ({
          ...tenant,
          operatoros: await getTenantOperatorOsStatus(tenant.id),
          legacySubscription: tenant.subscription || null,
          subscription: tenant.subscription || null,
          managedBy: "operatoros",
          operatorosUrl: operatorosUrl(),
        })),
      );
      res.json({ tenants: enriched, managedBy: "operatoros", operatorosUrl: operatorosUrl() });
    } catch (error: any) {
      console.error("[admin] GET /tenants error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/users", isAuthenticated, requireSystemAdmin(), async (_req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json({ users });
    } catch (error: any) {
      console.error("[admin] GET /users error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/users/:userId/system-admin", isAuthenticated, requireSystemAdmin(), async (req: any, res) => {
    try {
      const { userId } = req.params;
      if (typeof req.body?.isSystemAdmin !== "boolean") {
        return res.status(400).json({ message: "isSystemAdmin boolean required" });
      }

      await storage.setSystemAdmin(userId, req.body.isSystemAdmin);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[admin] POST /users/:id/system-admin error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/tenants/:tenantId/subscription", isAuthenticated, requireSystemAdmin(), async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const operatoros = await getTenantOperatorOsStatus(tenantId);
      const legacySubscription = await storage.getTenantSubscription(tenantId);
      res.json({
        managedBy: "operatoros",
        operatoros,
        operatorosUrl: operatorosUrl(),
        legacySubscription: legacySubscription || null,
      });
    } catch (error: any) {
      console.error("[admin] GET /tenants/:id/subscription error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/tenants/:tenantId/subscription", isAuthenticated, requireSystemAdmin(), async (_req: any, res) => {
    return managedByOperatorOs(res);
  });

  app.get("/api/admin/plans", isAuthenticated, requireSystemAdmin(), async (_req: any, res) => {
    res.json({ plans: [], managedBy: "operatoros", operatorosUrl: operatorosUrl() });
  });

  app.post("/api/admin/tenants/:tenantId/unpause", isAuthenticated, requireSystemAdmin(), async (_req: any, res) => {
    return managedByOperatorOs(res);
  });

  app.post("/api/admin/tenants/:tenantId/pause", isAuthenticated, requireSystemAdmin(), async (_req: any, res) => {
    return managedByOperatorOs(res);
  });

  app.delete("/api/admin/tenants/:tenantId", isAuthenticated, requireSystemAdmin(), async (req: any, res) => {
    try {
      const { tenantId } = req.params;
      const uploadsDir = path.join(process.cwd(), "uploads", tenantId);
      if (fs.existsSync(uploadsDir)) {
        fs.rmSync(uploadsDir, { recursive: true, force: true });
      }
      await storage.deleteTenant(tenantId);
      res.json({ success: true, message: "Tenant and all data deleted" });
    } catch (error: any) {
      console.error("[admin] DELETE /tenants/:id error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/me", isAuthenticated, requireSystemAdmin(), async (_req: any, res) => {
    res.json({ isSystemAdmin: true });
  });

  app.get("/api/auth/admin-check", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.json({ isSystemAdmin: false });
      const isAdmin = await storage.isUserSystemAdmin(userId);
      res.json({ isSystemAdmin: isAdmin });
    } catch {
      res.json({ isSystemAdmin: false });
    }
  });
}
