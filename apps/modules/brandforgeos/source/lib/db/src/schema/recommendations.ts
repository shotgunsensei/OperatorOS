import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const recommendationsTable = pgTable("recommendations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  actionLabel: text("action_label"),
  actionUrl: text("action_url"),
  priority: text("priority").notNull().default("medium"),
  isDismissed: boolean("is_dismissed").notNull().default(false),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Recommendation = typeof recommendationsTable.$inferSelect;
