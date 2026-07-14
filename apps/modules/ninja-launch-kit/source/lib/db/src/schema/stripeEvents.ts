import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const stripeEventsTable = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StripeEvent = typeof stripeEventsTable.$inferSelect;
