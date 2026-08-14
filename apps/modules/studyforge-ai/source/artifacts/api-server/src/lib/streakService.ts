import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, studyActivityTable, usersTable, quizAttemptsTable } from "@workspace/db";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ad = new Date(a + "T00:00:00Z").getTime();
  const bd = new Date(b + "T00:00:00Z").getTime();
  return Math.round((bd - ad) / (1000 * 60 * 60 * 24));
}

/**
 * Records a study activity for today, updates the user's streak, and
 * returns nothing. Safe to call from any hot path — uses an upsert so
 * concurrent calls in the same day collapse to a single row.
 */
export async function recordActivity(userId: number): Promise<void> {
  const today = todayStr();
  await db
    .insert(studyActivityTable)
    .values({ userId, activityDate: today, count: 1 })
    .onConflictDoUpdate({
      target: [studyActivityTable.userId, studyActivityTable.activityDate],
      set: { count: sql`${studyActivityTable.count} + 1` },
    });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return;

  const last = user.lastActiveDate ? dateOnly(user.lastActiveDate) : null;
  let streak = user.streakDays;
  if (!last) {
    streak = 1;
  } else if (last === today) {
    return; // already counted today, no streak change needed
  } else {
    const diff = daysBetween(last, today);
    streak = diff === 1 ? streak + 1 : 1;
  }
  const longest = Math.max(user.longestStreakDays, streak);
  await db
    .update(usersTable)
    .set({ streakDays: streak, longestStreakDays: longest, lastActiveDate: today })
    .where(eq(usersTable.id, userId));
}

export type StreakInfo = { current: number; longest: number; activeToday: boolean };
export type DailyActivity = { date: string; count: number };
export type ScorePoint = { date: string; score: number };

/**
 * Returns dashboard widgets — current streak, last-30-days activity, and
 * recent quiz score history. A single batch of selects, no N+1.
 */
export async function getStreakAndActivity(
  userId: number,
): Promise<{ streak: StreakInfo; activity: DailyActivity[]; scoreHistory: ScorePoint[] }> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    return {
      streak: { current: 0, longest: 0, activeToday: false },
      activity: [],
      scoreHistory: [],
    };
  }
  const today = todayStr();
  const last = user.lastActiveDate ? dateOnly(user.lastActiveDate) : null;
  // Streak silently expires after a one-day gap.
  let current = user.streakDays;
  if (last) {
    const diff = daysBetween(last, today);
    if (diff > 1) current = 0;
  } else {
    current = 0;
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const activityRows = await db
    .select()
    .from(studyActivityTable)
    .where(and(eq(studyActivityTable.userId, userId), gte(studyActivityTable.activityDate, since)));
  const activity: DailyActivity[] = [];
  const byDate = new Map<string, number>();
  for (const r of activityRows) byDate.set(dateOnly(r.activityDate), r.count);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    activity.push({ date: d, count: byDate.get(d) ?? 0 });
  }

  const recentAttempts = await db
    .select()
    .from(quizAttemptsTable)
    .where(eq(quizAttemptsTable.userId, userId))
    .orderBy(desc(quizAttemptsTable.completedAt))
    .limit(20);
  const scoreHistory: ScorePoint[] = recentAttempts
    .reverse()
    .map((a) => ({
      date: a.completedAt.toISOString().slice(0, 10),
      score: a.score,
    }));

  return {
    streak: { current, longest: user.longestStreakDays, activeToday: last === today },
    activity,
    scoreHistory,
  };
}
