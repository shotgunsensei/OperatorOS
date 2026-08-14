import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Idempotency log for Stripe webhook events. Insert event.id before processing;
 * unique-violation means it has already been handled and can be skipped.
 */
export const stripeEventsTable = pgTable("stripe_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StripeEventRow = typeof stripeEventsTable.$inferSelect;
