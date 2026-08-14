import { pgTable, serial, integer, text, date, boolean, index } from "drizzle-orm/pg-core";

export const studySessionsTable = pgTable(
  "study_sessions",
  {
    id: serial("id").primaryKey(),
    studySetId: integer("study_set_id").notNull(),
    day: integer("day").notNull(),
    date: date("date").notNull(),
    topic: text("topic").notNull(),
    focus: text("focus").notNull().default(""),
    estimatedMinutes: integer("estimated_minutes").notNull().default(30),
    completed: boolean("completed").notNull().default(false),
  },
  (t) => ({
    setIdx: index("study_sessions_study_set_id_idx").on(t.studySetId),
  }),
);

export type StudySessionRow = typeof studySessionsTable.$inferSelect;
