import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: integer("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("sessions_user_id_idx").on(t.userId),
  }),
);

export type Session = typeof sessionsTable.$inferSelect;
