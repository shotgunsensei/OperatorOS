import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  reportType: text("report_type").notNull().default("campaign_summary"),
  dateRange: text("date_range"),
  brandId: integer("brand_id"),
  campaignId: integer("campaign_id"),
  sections: text("sections").notNull().default("[]"),
  brandingLogo: text("branding_logo"),
  brandingColor: text("branding_color"),
  brandingCompanyName: text("branding_company_name"),
  isWhiteLabel: boolean("is_white_label").notNull().default(false),
  status: text("status").notNull().default("draft"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Report = typeof reportsTable.$inferSelect;
