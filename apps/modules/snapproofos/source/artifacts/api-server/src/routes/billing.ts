import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, organizationsTable, teamMembersTable, reportsTable, jobsTable, filesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const PLANS: Record<string, any> = {
  free: {
    planName: "Free", monthlyPrice: 0, reportLimit: 3, teamSeatLimit: 1,
    features: ["3 reports/month", "Basic exports", "SnapProof branding", "Limited templates"],
  },
  solo: {
    planName: "Solo", monthlyPrice: 19, reportLimit: 25, teamSeatLimit: 1,
    features: ["25 reports/month", "Custom logo", "Basic customer management", "Better exports"],
  },
  pro: {
    planName: "Pro", monthlyPrice: 49, reportLimit: 999, teamSeatLimit: 3,
    features: ["Unlimited reports", "Advanced templates", "Share links", "Branded exports", "Signatures"],
  },
  team: {
    planName: "Team", monthlyPrice: 99, reportLimit: 999, teamSeatLimit: 5,
    features: ["Up to 5 users", "Team workspace", "Shared customers", "Team activity log", "Advanced branding"],
  },
  whitelabel: {
    planName: "White Label / MSP", monthlyPrice: 199, reportLimit: 999, teamSeatLimit: 25,
    features: ["White-label exports", "Full branding control", "Priority support", "Team controls", "Higher storage"],
  },
};

router.get("/billing/plan", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  if (!orgId) {
    res.json({ planId: "free", ...PLANS.free, currentUsage: { reportsUsed: 0, teamSeats: 0, storageUsedMb: 0 } });
    return;
  }

  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId));
  const planId = org?.planId || "free";
  const plan = PLANS[planId] || PLANS.free;

  const [tm] = await db.select({ count: sql<number>`count(*)::int` }).from(teamMembersTable).where(eq(teamMembersTable.organizationId, orgId));

  const jobIds = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.organizationId, orgId));
  const jobIdList = jobIds.map(j => j.id);
  let reportsUsed = 0;
  if (jobIdList.length > 0) {
    const [rc] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(sql`${reportsTable.jobId} = ANY(${jobIdList})`);
    reportsUsed = rc.count;
  }

  let storageUsed = 0;
  if (jobIdList.length > 0) {
    const [storageResult] = await db.select({ total: sql<number>`coalesce(sum(${filesTable.fileSize}), 0)::int` }).from(filesTable).where(sql`${filesTable.jobId} = ANY(${jobIdList})`);
    storageUsed = storageResult.total;
  }

  res.json({
    planId,
    ...plan,
    currentUsage: {
      reportsUsed,
      teamSeats: tm.count,
      storageUsedMb: Math.round((storageUsed / 1024 / 1024) * 100) / 100,
    },
  });
});

router.post("/billing/subscribe", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  if (!orgId) { res.status(400).json({ error: "No organization" }); return; }

  const { planId } = req.body;
  if (!PLANS[planId]) { res.status(400).json({ error: "Invalid plan" }); return; }

  await db.update(organizationsTable).set({ planId }).where(eq(organizationsTable.id, orgId));

  const plan = PLANS[planId];
  res.json({
    planId,
    ...plan,
    currentUsage: { reportsUsed: 0, teamSeats: 0, storageUsedMb: 0 },
  });
});

export default router;
