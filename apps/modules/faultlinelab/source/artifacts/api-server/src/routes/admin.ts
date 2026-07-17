import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import {
  db,
  usersTable,
  userEntitlementsTable,
  catalogOverridesTable,
  catalogOverrideHistoryTable,
  caseDraftsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { grantEntitlementFromCheckout } from "../lib/grantEntitlement";
import { notifyCatalogOverridesChanged } from "../lib/catalogEvents";

const router: IRouter = Router();

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  // requireAuth has already resolved the local user row (`req.appUser`) for
  // both Clerk and OperatorOS-cookie sessions. We only need to gate on the
  // admin flag here.
  const adminUser = (req as any).appUser as
    | {
        id: string;
        isAdmin?: boolean;
        isSuperAdmin?: boolean;
        localRole?: string | null;
        operatorIdentityId?: string | null;
      }
    | undefined;
  // For OperatorOS-launched users the derived `local_role` is authoritative
  // — OperatorOS owns role assignment via the entitlement snapshot.
  // For Clerk / legacy users we keep the existing is_admin flag check.
  // Bootstrap super admins always pass either path.
  const isAdmin =
    !!adminUser &&
    (adminUser.isSuperAdmin === true ||
      (adminUser.operatorIdentityId
        ? adminUser.localRole === "admin"
        : adminUser.isAdmin === true));
  if (!adminUser || !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  (req as any).adminUser = { ...adminUser, isAdmin: true };
  next();
}

async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const adminUser = (req as any).adminUser as
    | { isAdmin?: boolean; isSuperAdmin?: boolean }
    | undefined;
  // Defensive: require BOTH flags. Mutation logic guarantees super => admin,
  // but a manual DB edit or future schema change shouldn't be able to bypass
  // requireAdmin while still passing requireSuperAdmin.
  if (!adminUser || !adminUser.isAdmin || !adminUser.isSuperAdmin) {
    res.status(403).json({ error: "Super admin only" });
    return;
  }
  next();
}

function getParam(req: Request, key: string): string {
  const v = (req.params as any)[key];
  return Array.isArray(v) ? String(v[0]) : String(v);
}

router.get("/admin/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db.select().from(usersTable).limit(500);
    return res.json({
      users: users.map((u) => ({
        id: u.id,
        clerkId: u.clerkId,
        email: u.email,
        displayName: u.displayName,
        isAdmin: !!u.isAdmin,
        isSuperAdmin: !!u.isSuperAdmin,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list users:");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/users/:userId/entitlements", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = getParam(req, "userId");
    const entitlements = await db
      .select()
      .from(userEntitlementsTable)
      .where(eq(userEntitlementsTable.userId, userId));
    return res.json({
      entitlements: entitlements.map((e) => ({
        id: e.id,
        productId: e.productId,
        entitlementType: e.entitlementType,
        source: e.source,
        isActive: !!e.isActive && !e.revokedAt,
        grantedAt: e.grantedAt?.toISOString?.() ?? null,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load user entitlements:");
    return res.status(500).json({ error: "Internal server error" });
  }
});

const VALID_PRODUCT_IDS = new Set([
  "pro-subscription",
  "pack-network-ops",
  "pack-server-graveyard",
  "pack-garage-diagnostics",
  "pack-sensor-mesh",
  "pack-mixed-cascades",
  "pack-healthcare-imaging",
  "upgrade-advanced-tools",
  "upgrade-chaos-mode",
  "upgrade-deep-telemetry",
  "upgrade-sandbox-pro",
  "upgrade-pro-analytics",
  "bundle-clinical-systems",
  "bundle-master-investigator",
]);
const VALID_SOURCES = new Set(["admin-grant", "promo-grant", "comp", "beta", "stripe"]);

router.post("/admin/users/:userId/entitlements", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = getParam(req, "userId");
    const { productId, source = "admin-grant" } = req.body || {};
    if (!productId || typeof productId !== "string" || !VALID_PRODUCT_IDS.has(productId)) {
      return res.status(400).json({ error: "Invalid productId" });
    }
    if (typeof source !== "string" || !VALID_SOURCES.has(source)) {
      return res.status(400).json({ error: "Invalid source" });
    }

    const target = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (target.length === 0) return res.status(404).json({ error: "User not found" });

    const existing = await db
      .select()
      .from(userEntitlementsTable)
      .where(
        and(
          eq(userEntitlementsTable.userId, userId),
          eq(userEntitlementsTable.productId, productId),
          eq(userEntitlementsTable.isActive, true),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return res.json({ success: true, id: existing[0].id, alreadyActive: true });
    }

    const id = await grantEntitlementFromCheckout({
      userId,
      productId,
      source,
    });

    return res.json({ success: true, id });
  } catch (err) {
    req.log.error({ err }, "Failed to grant entitlement:");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete(
  "/admin/users/:userId/entitlements/:entitlementId",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const userId = getParam(req, "userId");
      const entitlementId = getParam(req, "entitlementId");
      await db
        .update(userEntitlementsTable)
        .set({ isActive: false, revokedAt: new Date() })
        .where(
          and(
            eq(userEntitlementsTable.id, entitlementId),
            eq(userEntitlementsTable.userId, userId)
          )
        );
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, "Failed to revoke entitlement:");
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get("/admin/catalog/overrides", requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await db
      .select({
        productId: catalogOverridesTable.productId,
        overrides: catalogOverridesTable.overrides,
        updatedAt: catalogOverridesTable.updatedAt,
        updatedByUserId: catalogOverridesTable.updatedByUserId,
        editorEmail: usersTable.email,
        editorDisplayName: usersTable.displayName,
      })
      .from(catalogOverridesTable)
      .leftJoin(usersTable, eq(usersTable.id, catalogOverridesTable.updatedByUserId));
    return res.json({
      overrides: rows.map((r) => ({
        productId: r.productId,
        ...((r.overrides as Record<string, unknown>) || {}),
        updatedAt: r.updatedAt?.toISOString?.() ?? null,
        updatedByUserId: r.updatedByUserId,
        editor: r.updatedByUserId
          ? {
              id: r.updatedByUserId,
              displayName: r.editorDisplayName,
              email: r.editorEmail,
            }
          : null,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load catalog overrides:");
    return res.status(500).json({ error: "Internal server error" });
  }
});

async function applyOverride(
  productId: string,
  overrides: Record<string, unknown>,
  adminUserId: string,
  action: "update" | "create" | "rollback",
): Promise<{ updatedAt: Date; previous: Record<string, unknown> | null }> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(catalogOverridesTable)
      .where(eq(catalogOverridesTable.productId, productId))
      .limit(1);
    const now = new Date();
    const previous = existing.length === 0
      ? null
      : (existing[0].overrides as Record<string, unknown>);

    if (existing.length === 0) {
      await tx.insert(catalogOverridesTable).values({
        productId,
        overrides,
        updatedAt: now,
        updatedByUserId: adminUserId,
      });
    } else {
      await tx
        .update(catalogOverridesTable)
        .set({ overrides, updatedAt: now, updatedByUserId: adminUserId })
        .where(eq(catalogOverridesTable.productId, productId));
    }

    await tx.insert(catalogOverrideHistoryTable).values({
      id: randomUUID(),
      productId,
      action: existing.length === 0 ? "create" : action,
      overrides,
      previousOverrides: previous,
      changedAt: now,
      changedByUserId: adminUserId,
    });

    return { updatedAt: now, previous };
  });
}

router.put("/admin/catalog/overrides/:productId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const productId = getParam(req, "productId");
    const overrides = req.body || {};
    const adminUser = (req as any).adminUser as { id: string };
    const { updatedAt } = await applyOverride(productId, overrides, adminUser.id, "update");
    notifyCatalogOverridesChanged();
    return res.json({
      success: true,
      updatedAt: updatedAt.toISOString(),
      updatedByUserId: adminUser.id,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to save catalog override:");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete(
  "/admin/catalog/overrides/:productId",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const productId = getParam(req, "productId");
      const adminUser = (req as any).adminUser as { id: string };
      await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(catalogOverridesTable)
          .where(eq(catalogOverridesTable.productId, productId))
          .limit(1);
        const previous = existing.length === 0
          ? null
          : (existing[0].overrides as Record<string, unknown>);
        await tx
          .delete(catalogOverridesTable)
          .where(eq(catalogOverridesTable.productId, productId));
        if (existing.length > 0) {
          await tx.insert(catalogOverrideHistoryTable).values({
            id: randomUUID(),
            productId,
            action: "revert",
            overrides: null,
            previousOverrides: previous,
            changedAt: new Date(),
            changedByUserId: adminUser.id,
          });
        }
      });
      notifyCatalogOverridesChanged();
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, "Failed to revert catalog override:");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.patch(
  "/admin/users/:userId/role",
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const userId = getParam(req, "userId");
      const adminUser = (req as any).adminUser as { id: string };
      const body = (req.body || {}) as { isAdmin?: unknown; isSuperAdmin?: unknown };

      const target = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (target.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const updates: { isAdmin?: boolean; isSuperAdmin?: boolean; updatedAt?: Date } = {};
      if (typeof body.isAdmin === "boolean") updates.isAdmin = body.isAdmin;
      if (typeof body.isSuperAdmin === "boolean") updates.isSuperAdmin = body.isSuperAdmin;
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "Nothing to update" });
      }

      // Self-protection: a super admin can't demote themselves (would lock
      // themselves out of this very endpoint). They can demote other admins.
      if (target[0].id === adminUser.id) {
        if (updates.isAdmin === false || updates.isSuperAdmin === false) {
          return res
            .status(400)
            .json({ error: "You cannot demote yourself; ask another super admin to do it." });
        }
      }

      // Granting super-admin implies admin.
      if (updates.isSuperAdmin === true) updates.isAdmin = true;
      // Revoking admin implies revoking super-admin (can't be super without admin).
      if (updates.isAdmin === false) updates.isSuperAdmin = false;

      updates.updatedAt = new Date();
      await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));

      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, "Failed to update user role:");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.delete(
  "/admin/users/:userId",
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const userId = getParam(req, "userId");
      const adminUser = (req as any).adminUser as { id: string };

      if (userId === adminUser.id) {
        return res.status(400).json({ error: "You cannot delete yourself." });
      }

      const target = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (target.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      // Cascade deletes (user_profiles, user_entitlements, purchases) are
      // handled by the FK constraints in lib/db/src/schema/users.ts.
      await db.delete(usersTable).where(eq(usersTable.id, userId));

      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, "Failed to delete user:");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.get(
  "/admin/catalog/overrides/:productId/history",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const productId = getParam(req, "productId");
      const rows = await db
        .select({
          id: catalogOverrideHistoryTable.id,
          productId: catalogOverrideHistoryTable.productId,
          action: catalogOverrideHistoryTable.action,
          overrides: catalogOverrideHistoryTable.overrides,
          previousOverrides: catalogOverrideHistoryTable.previousOverrides,
          changedAt: catalogOverrideHistoryTable.changedAt,
          changedByUserId: catalogOverrideHistoryTable.changedByUserId,
          editorEmail: usersTable.email,
          editorDisplayName: usersTable.displayName,
        })
        .from(catalogOverrideHistoryTable)
        .leftJoin(
          usersTable,
          eq(usersTable.id, catalogOverrideHistoryTable.changedByUserId),
        )
        .where(eq(catalogOverrideHistoryTable.productId, productId))
        .orderBy(desc(catalogOverrideHistoryTable.changedAt))
        .limit(100);
      return res.json({
        history: rows.map((r) => ({
          id: r.id,
          productId: r.productId,
          action: r.action,
          overrides: r.overrides,
          previousOverrides: r.previousOverrides,
          changedAt: r.changedAt?.toISOString?.() ?? null,
          changedByUserId: r.changedByUserId,
          editor: r.changedByUserId
            ? {
                id: r.changedByUserId,
                displayName: r.editorDisplayName,
                email: r.editorEmail,
              }
            : null,
        })),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to load catalog override history:");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.post(
  "/admin/catalog/overrides/:productId/rollback/:historyId",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const productId = getParam(req, "productId");
      const historyId = getParam(req, "historyId");
      const adminUser = (req as any).adminUser as { id: string };
      const rows = await db
        .select()
        .from(catalogOverrideHistoryTable)
        .where(
          and(
            eq(catalogOverrideHistoryTable.id, historyId),
            eq(catalogOverrideHistoryTable.productId, productId),
          ),
        )
        .limit(1);
      if (rows.length === 0) {
        return res.status(404).json({ error: "History entry not found" });
      }
      const target = rows[0];
      const targetSnapshot = target.overrides as Record<string, unknown> | null;
      if (targetSnapshot === null) {
        await db.transaction(async (tx) => {
          const existingBefore = await tx
            .select()
            .from(catalogOverridesTable)
            .where(eq(catalogOverridesTable.productId, productId))
            .limit(1);
          await tx
            .delete(catalogOverridesTable)
            .where(eq(catalogOverridesTable.productId, productId));
          await tx.insert(catalogOverrideHistoryTable).values({
            id: randomUUID(),
            productId,
            action: "rollback",
            overrides: null,
            previousOverrides:
              existingBefore.length === 0
                ? null
                : (existingBefore[0].overrides as Record<string, unknown>),
            changedAt: new Date(),
            changedByUserId: adminUser.id,
          });
        });
        notifyCatalogOverridesChanged();
        return res.json({ success: true, restored: null });
      }
      const { updatedAt } = await applyOverride(
        productId,
        targetSnapshot,
        adminUser.id,
        "rollback",
      );
      notifyCatalogOverridesChanged();
      return res.json({
        success: true,
        restored: targetSnapshot,
        updatedAt: updatedAt.toISOString(),
        updatedByUserId: adminUser.id,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to rollback catalog override:");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.get("/admin/case-drafts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: caseDraftsTable.id,
        draft: caseDraftsTable.draft,
        updatedAt: caseDraftsTable.updatedAt,
        updatedByUserId: caseDraftsTable.updatedByUserId,
        editorEmail: usersTable.email,
        editorDisplayName: usersTable.displayName,
      })
      .from(caseDraftsTable)
      .leftJoin(usersTable, eq(usersTable.id, caseDraftsTable.updatedByUserId))
      .orderBy(desc(caseDraftsTable.updatedAt));
    return res.json({
      drafts: rows.map((r) => ({
        id: r.id,
        draft: r.draft,
        updatedAt: r.updatedAt?.toISOString?.() ?? null,
        updatedByUserId: r.updatedByUserId,
        editor: r.updatedByUserId
          ? {
              id: r.updatedByUserId,
              displayName: r.editorDisplayName,
              email: r.editorEmail,
            }
          : null,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load case drafts:");
    return res.status(500).json({ error: "Internal server error" });
  }
});

function isCaseDraftShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.slug === "string" &&
    typeof v.title === "string" &&
    typeof v.category === "string" &&
    typeof v.difficulty === "string" &&
    typeof v.description === "string" &&
    typeof v.briefing === "string" &&
    Array.isArray(v.symptoms) &&
    Array.isArray(v.evidence) &&
    Array.isArray(v.hints) &&
    Array.isArray(v.terminalCommands) &&
    Array.isArray(v.eventLogs) &&
    Array.isArray(v.ticketHistory) &&
    Array.isArray(v.availableTools) &&
    Array.isArray(v.redHerrings) &&
    Array.isArray(v.preventativeMeasures) &&
    typeof v.remediation === "string" &&
    !!v.rootCause &&
    typeof v.rootCause === "object"
  );
}

const MAX_DRAFT_BYTES = 256 * 1024;

router.put("/admin/case-drafts/:draftId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const draftId = getParam(req, "draftId");
    const adminUser = (req as any).adminUser as { id: string };
    const draft = req.body?.draft;
    if (!isCaseDraftShape(draft)) {
      return res.status(400).json({ error: "Invalid draft payload" });
    }
    if (!draftId.trim()) {
      return res.status(400).json({ error: "Invalid draft id" });
    }
    let serialized: string;
    try {
      serialized = JSON.stringify(draft);
    } catch {
      return res.status(400).json({ error: "Draft is not JSON-serializable" });
    }
    if (serialized.length > MAX_DRAFT_BYTES) {
      return res.status(413).json({ error: "Draft exceeds maximum size" });
    }
    const now = new Date();
    const existing = await db
      .select()
      .from(caseDraftsTable)
      .where(eq(caseDraftsTable.id, draftId))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(caseDraftsTable).values({
        id: draftId,
        draft,
        updatedAt: now,
        updatedByUserId: adminUser.id,
      });
    } else {
      await db
        .update(caseDraftsTable)
        .set({ draft, updatedAt: now, updatedByUserId: adminUser.id })
        .where(eq(caseDraftsTable.id, draftId));
    }
    return res.json({
      success: true,
      updatedAt: now.toISOString(),
      updatedByUserId: adminUser.id,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to save case draft:");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete(
  "/admin/case-drafts/:draftId",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const draftId = getParam(req, "draftId");
      await db.delete(caseDraftsTable).where(eq(caseDraftsTable.id, draftId));
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, "Failed to delete case draft:");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
