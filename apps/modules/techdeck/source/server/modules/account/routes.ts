import type { Express } from "express";
import { isAuthenticated } from "../../auth";
import { db } from "../../db";
import { tenants, tenantMembers } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, ne } from "drizzle-orm";
import fs from "fs";
import path from "path";

export function registerAccountRoutes(app: Express): void {
  app.delete("/api/account", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.session?.userId;

      const memberships = await db
        .select({
          tenantId: tenantMembers.tenantId,
          role: tenantMembers.role,
        })
        .from(tenantMembers)
        .where(eq(tenantMembers.userId, userId));

      for (const membership of memberships) {
        const otherMembers = await db
          .select()
          .from(tenantMembers)
          .where(
            and(
              eq(tenantMembers.tenantId, membership.tenantId),
              ne(tenantMembers.userId, userId)
            )
          );

        if (otherMembers.length === 0) {
          const uploadDir = path.join(
            process.cwd(),
            "uploads",
            membership.tenantId
          );
          if (fs.existsSync(uploadDir)) {
            fs.rmSync(uploadDir, { recursive: true, force: true });
          }
          await db
            .delete(tenants)
            .where(eq(tenants.id, membership.tenantId));
        } else {
          await db
            .delete(tenantMembers)
            .where(
              and(
                eq(tenantMembers.tenantId, membership.tenantId),
                eq(tenantMembers.userId, userId)
              )
            );
        }
      }

      await db.delete(users).where(eq(users.id, userId));

      req.session?.destroy(() => {});
      res.json({ success: true });
    } catch (error) {
      console.error("[account] Delete error:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  app.get("/api/account/info", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.session?.userId;

      const memberships = await db
        .select({
          tenantId: tenantMembers.tenantId,
          role: tenantMembers.role,
          tenantName: tenants.name,
        })
        .from(tenantMembers)
        .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
        .where(eq(tenantMembers.userId, userId));

      const soloTenants = [];
      for (const m of memberships) {
        const memberCount = await db
          .select()
          .from(tenantMembers)
          .where(eq(tenantMembers.tenantId, m.tenantId));
        if (memberCount.length === 1) {
          soloTenants.push(m.tenantName);
        }
      }

      res.json({
        tenantCount: memberships.length,
        soloTenants,
      });
    } catch (error) {
      console.error("[account] Info error:", error);
      res.status(500).json({ message: "Failed to fetch account info" });
    }
  });
}
