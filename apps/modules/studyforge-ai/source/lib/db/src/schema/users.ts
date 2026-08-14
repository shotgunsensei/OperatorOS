import { pgTable, serial, text, timestamp, integer, date, index } from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default("student"),
    plan: text("plan").notNull().default("free"),
    quizAttemptsThisMonth: integer("quiz_attempts_this_month").notNull().default(0),
    quizAttemptsMonthKey: text("quiz_attempts_month_key").notNull().default(""),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    streakDays: integer("streak_days").notNull().default(0),
    longestStreakDays: integer("longest_streak_days").notNull().default(0),
    lastActiveDate: date("last_active_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("users_email_idx").on(t.email),
  }),
);

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
