import { pgTable, text, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const subscriptionRenewalNoticesTable = pgTable(
  "subscription_renewal_notices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    subscriptionId: text("subscription_id").notNull(),
    periodEnd: integer("period_end").notNull(),
    kind: text("kind").notNull(),
    email: text("email"),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("subscription_renewal_notices_uniq").on(
      t.subscriptionId,
      t.periodEnd,
      t.kind,
    ),
  }),
);

export type SubscriptionRenewalNotice =
  typeof subscriptionRenewalNoticesTable.$inferSelect;
