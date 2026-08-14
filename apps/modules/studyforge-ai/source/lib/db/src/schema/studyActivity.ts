import { pgTable, integer, date, primaryKey, index } from "drizzle-orm/pg-core";

/**
 * Per-user, per-day activity counter — feeds the streak service and the
 * "last 30 days" chart on the dashboard. Bumped any time a user does
 * something meaningful (creates a set, finishes a quiz, marks a card,
 * completes a study session).
 */
export const studyActivityTable = pgTable(
  "study_activity",
  {
    userId: integer("user_id").notNull(),
    activityDate: date("activity_date").notNull(),
    count: integer("count").notNull().default(1),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.activityDate] }),
    userDateIdx: index("study_activity_user_date_idx").on(t.userId, t.activityDate),
  }),
);

export type StudyActivityRow = typeof studyActivityTable.$inferSelect;
