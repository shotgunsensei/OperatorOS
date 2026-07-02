import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, requireMinRole } from "../middleware";
import { db } from "../db";
import { tickets, supplyRequests, assets } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/api/analytics", requireAuth, requireOrg, requireMinRole("supervisor"), async (req, res) => {
  try {
    const orgId = req.session.orgId!;
    const allTickets = await db.select().from(tickets).where(eq(tickets.orgId, orgId));
    const allSupplies = await db.select().from(supplyRequests).where(eq(supplyRequests.orgId, orgId));
    const allAssets = await db.select().from(assets).where(eq(assets.orgId, orgId));
    const depts = await storage.getDepartments(orgId);
    const deptMap = Object.fromEntries(depts.map(d => [d.id, d.name]));

    const now = new Date();

    const volumeByDay: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      volumeByDay[d.toISOString().split("T")[0]] = 0;
    }
    for (const t of allTickets) {
      const day = new Date(t.createdAt).toISOString().split("T")[0];
      if (volumeByDay[day] !== undefined) volumeByDay[day]++;
    }

    const categoryCounts: Record<string, number> = {};
    for (const t of allTickets) {
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
    }

    const deptCounts: Record<string, number> = {};
    for (const t of allTickets) {
      const dname = t.departmentId ? (deptMap[t.departmentId] || "Unassigned") : "Unassigned";
      deptCounts[dname] = (deptCounts[dname] || 0) + 1;
    }

    const recurringCount = allTickets.filter(t => t.isRecurring).length;
    const openStatuses = ["new", "triage", "assigned", "waiting_department", "waiting_vendor", "in_progress", "escalated"];
    const overdueCount = allTickets.filter(t => openStatuses.includes(t.status) && t.dueDate && new Date(t.dueDate) < now).length;

    const resolvedTickets = allTickets.filter(t => t.status === "resolved" || t.status === "closed");
    let avgResolutionTime = 0;
    if (resolvedTickets.length > 0) {
      const totalHours = resolvedTickets.reduce((sum, t) => {
        const created = new Date(t.createdAt).getTime();
        const resolved = new Date(t.updatedAt).getTime();
        return sum + (resolved - created) / (1000 * 60 * 60);
      }, 0);
      avgResolutionTime = Math.round(totalHours / resolvedTickets.length);
    }

    const vendorTickets = allTickets.filter(t => t.category === "vendor_external").length;
    const equipmentDown = allAssets.filter(a => a.status === "under_service" || a.status === "offline").length;

    const supplyTrend: Record<string, number> = {};
    for (const s of allSupplies) {
      const day = new Date(s.createdAt).toISOString().split("T")[0];
      supplyTrend[day] = (supplyTrend[day] || 0) + 1;
    }

    res.json({
      volumeOverTime: Object.entries(volumeByDay).map(([date, count]) => ({ date, count })),
      categoryCounts,
      departmentCounts: deptCounts,
      recurringCount,
      overdueCount,
      avgResolutionHours: avgResolutionTime,
      vendorRelatedIncidents: vendorTickets,
      equipmentDowntime: equipmentDown,
      supplyRequestTrend: Object.entries(supplyTrend).map(([date, count]) => ({ date, count })),
      totalTickets: allTickets.length,
      totalResolved: resolvedTickets.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
