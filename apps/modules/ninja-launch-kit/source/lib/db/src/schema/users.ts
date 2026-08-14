import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    plan: text("plan").notNull().default("free"),
    role: text("role").notNull().default("user"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    subscriptionStatus: text("subscription_status").notNull().default("demo"),
    subscriptionPeriodEnd: timestamp("subscription_period_end", { withTimezone: true }),
    operatorOsUserId: text("operator_os_user_id"),
    organizationId: text("organization_id"),
    operatorOsPlanSlug: text("operator_os_plan_slug"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    operatorOsUserIdx: uniqueIndex("users_operator_os_user_id_idx").on(table.operatorOsUserId),
  }),
);

export type User = typeof usersTable.$inferSelect;
