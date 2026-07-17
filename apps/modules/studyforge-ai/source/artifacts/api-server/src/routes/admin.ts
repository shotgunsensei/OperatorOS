import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  studySetsTable,
  flashcardsTable,
  quizAttemptsTable,
} from "@workspace/db";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

function isDemoMode(): boolean {
  return !process.env.STRIPE_SECRET_KEY;
}

router.get("/admin/stats", requireAdmin, async (_req, res): Promise<void> => {
  // Replace four full-table SELECTs with cheap COUNT aggregates.
  const [{ totalUsers }] = await db.select({ totalUsers: sql<number>`count(*)::int` }).from(usersTable);
  const [{ totalStudySets }] = await db
    .select({ totalStudySets: sql<number>`count(*)::int` })
    .from(studySetsTable);
  const [{ totalFlashcards }] = await db
    .select({ totalFlashcards: sql<number>`count(*)::int` })
    .from(flashcardsTable);
  const [{ totalQuizAttempts }] = await db
    .select({ totalQuizAttempts: sql<number>`count(*)::int` })
    .from(quizAttemptsTable);

  const planRows = await db
    .select({ plan: usersTable.plan, count: sql<number>`count(*)::int` })
    .from(usersTable)
    .groupBy(usersTable.plan);
  const planMap = new Map(planRows.map((r) => [r.plan, Number(r.count)]));
  const usersByPlan = ["free", "pro", "tutor"].map((p) => ({ plan: p, count: planMap.get(p) ?? 0 }));

  const recentRows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      plan: usersTable.plan,
      createdAt: usersTable.createdAt,
      studySetCount: sql<number>`coalesce(count(${studySetsTable.id}), 0)::int`,
    })
    .from(usersTable)
    .leftJoin(studySetsTable, eq(studySetsTable.userId, usersTable.id))
    .groupBy(usersTable.id)
    .orderBy(desc(usersTable.createdAt))
    .limit(8);

  res.json({
    totalUsers: Number(totalUsers),
    totalStudySets: Number(totalStudySets),
    totalFlashcards: Number(totalFlashcards),
    totalQuizAttempts: Number(totalQuizAttempts),
    usersByPlan,
    demoMode: isDemoMode(),
    recentSignups: recentRows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      plan: u.plan,
      studySetCount: Number(u.studySetCount),
      createdAt: u.createdAt.toISOString(),
    })),
  });
});

router.get("/admin/users", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      plan: usersTable.plan,
      createdAt: usersTable.createdAt,
      studySetCount: sql<number>`coalesce(count(${studySetsTable.id}), 0)::int`,
    })
    .from(usersTable)
    .leftJoin(studySetsTable, eq(studySetsTable.userId, usersTable.id))
    .groupBy(usersTable.id)
    .orderBy(desc(usersTable.createdAt));
  res.json(
    rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      plan: u.plan,
      studySetCount: Number(u.studySetCount),
      createdAt: u.createdAt.toISOString(),
    })),
  );
});

export default router;
