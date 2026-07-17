import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const featuredTemplatesTable = pgTable("featured_templates", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  businessType: text("business_type").notNull(),
  description: text("description").notNull(),
  tone: text("tone").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FeaturedTemplateRow = typeof featuredTemplatesTable.$inferSelect;
