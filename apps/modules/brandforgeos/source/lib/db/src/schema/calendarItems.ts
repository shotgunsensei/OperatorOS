import { pgTable, text, serial, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { campaignsTable } from "./campaigns";
import { brandsTable } from "./brands";

export const calendarItemsTable = pgTable("calendar_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
  brandId: integer("brand_id").references(() => brandsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  itemType: text("item_type").notNull(),
  channel: text("channel"),
  scheduledDate: date("scheduled_date").notNull(),
  status: text("status").notNull().default("idea"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCalendarItemSchema = createInsertSchema(calendarItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCalendarItem = z.infer<typeof insertCalendarItemSchema>;
export type CalendarItem = typeof calendarItemsTable.$inferSelect;
