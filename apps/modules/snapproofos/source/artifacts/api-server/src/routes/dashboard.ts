import { Router, type IRouter } from "express";
import { eq, sql, desc, and, gte } from "drizzle-orm";
import { db, jobsTable, customersTable, reportsTable, exportsTable, teamMembersTable, filesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  if (!orgId) {
    res.json({
      totalJobs: 0, activeJobs: 0, completedJobs: 0, totalCustomers: 0,
      totalReports: 0, totalExports: 0, reportsThisMonth: 0, reportLimit: 3,
      storageUsedMb: 0, storageLimitMb: 100, teamMembers: 0, pendingDrafts: 0,
    });
    return;
  }

  const [totalJobs] = await db.select({ count: sql<number>`count(*)::int` }).from(jobsTable).where(eq(jobsTable.organizationId, orgId));
  const [activeJobs] = await db.select({ count: sql<number>`count(*)::int` }).from(jobsTable).where(and(eq(jobsTable.organizationId, orgId), eq(jobsTable.status, "in_progress")));
  const [completedJobs] = await db.select({ count: sql<number>`count(*)::int` }).from(jobsTable).where(and(eq(jobsTable.organizationId, orgId), eq(jobsTable.status, "completed")));
  const [totalCustomers] = await db.select({ count: sql<number>`count(*)::int` }).from(customersTable).where(eq(customersTable.organizationId, orgId));

  const jobIds = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.organizationId, orgId));
  const jobIdList = jobIds.map(j => j.id);

  let totalReportsCount = 0;
  let reportsThisMonthCount = 0;
  let totalExportsCount = 0;
  let pendingDraftsCount = 0;

  if (jobIdList.length > 0) {
    const [tr] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(sql`${reportsTable.jobId} = ANY(${jobIdList})`);
    totalReportsCount = tr.count;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const [rm] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(sql`${reportsTable.jobId} = ANY(${jobIdList})`, gte(reportsTable.createdAt, startOfMonth)));
    reportsThisMonthCount = rm.count;

    const [pd] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(sql`${reportsTable.jobId} = ANY(${jobIdList})`, eq(reportsTable.status, "draft")));
    pendingDraftsCount = pd.count;
  }

  const [te] = await db.select({ count: sql<number>`count(*)::int` }).from(exportsTable).where(eq(exportsTable.organizationId, orgId));
  totalExportsCount = te.count;

  const [tm] = await db.select({ count: sql<number>`count(*)::int` }).from(teamMembersTable).where(eq(teamMembersTable.organizationId, orgId));

  let storageUsed = 0;
  if (jobIdList.length > 0) {
    const [storageResult] = await db.select({ total: sql<number>`coalesce(sum(${filesTable.fileSize}), 0)::int` }).from(filesTable).where(sql`${filesTable.jobId} = ANY(${jobIdList})`);
    storageUsed = storageResult.total;
  }

  res.json({
    totalJobs: totalJobs.count,
    activeJobs: activeJobs.count,
    completedJobs: completedJobs.count,
    totalCustomers: totalCustomers.count,
    totalReports: totalReportsCount,
    totalExports: totalExportsCount,
    reportsThisMonth: reportsThisMonthCount,
    reportLimit: 999,
    storageUsedMb: Math.round((storageUsed / 1024 / 1024) * 100) / 100,
    storageLimitMb: 5000,
    teamMembers: tm.count,
    pendingDrafts: pendingDraftsCount,
  });
});

router.get("/dashboard/recent-jobs", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  if (!orgId) { res.json([]); return; }

  const jobs = await db.select().from(jobsTable).where(eq(jobsTable.organizationId, orgId)).orderBy(desc(jobsTable.createdAt)).limit(5);

  const enriched = jobs.map(job => ({
    ...job,
    customerName: null,
    assignedToName: null,
    notesCount: 0,
    findingsCount: 0,
    filesCount: 0,
    reportsCount: 0,
  }));

  res.json(enriched);
});

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  if (!orgId) {
    res.json({ jobsByStatus: [], jobsByType: [], reportsOverTime: [], topCustomers: [] });
    return;
  }

  const jobsByStatus = await db.select({
    status: jobsTable.status,
    count: sql<number>`count(*)::int`,
  }).from(jobsTable).where(eq(jobsTable.organizationId, orgId)).groupBy(jobsTable.status);

  const jobsByType = await db.select({
    type: jobsTable.jobType,
    count: sql<number>`count(*)::int`,
  }).from(jobsTable).where(eq(jobsTable.organizationId, orgId)).groupBy(jobsTable.jobType);

  const topCustomers = await db.select({
    name: customersTable.name,
    jobCount: sql<number>`count(${jobsTable.id})::int`,
  }).from(customersTable)
    .leftJoin(jobsTable, eq(jobsTable.customerId, customersTable.id))
    .where(eq(customersTable.organizationId, orgId))
    .groupBy(customersTable.name)
    .orderBy(sql`count(${jobsTable.id}) desc`)
    .limit(5);

  res.json({
    jobsByStatus,
    jobsByType,
    reportsOverTime: [],
    topCustomers,
  });
});

export default router;
