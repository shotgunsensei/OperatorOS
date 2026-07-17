import { pgTable, text, serial, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { brandsTable } from "./brands";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  brandId: integer("brand_id").references(() => brandsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  objective: text("objective"),
  targetAudience: text("target_audience"),
  coreMessage: text("core_message"),
  offer: text("offer"),
  status: text("status").notNull().default("draft"),
  channels: text("channels").array().notNull().default([]),
  startDate: date("start_date"),
  endDate: date("end_date"),
  budget: text("budget"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
