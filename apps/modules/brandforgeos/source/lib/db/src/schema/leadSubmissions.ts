import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { landingPagesTable } from "./landingPages";

export const leadSubmissionsTable = pgTable("lead_submissions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  landingPageId: integer("landing_page_id").references(() => landingPagesTable.id, { onDelete: "set null" }),
  email: text("email"),
  name: text("name"),
  phone: text("phone"),
  company: text("company"),
  formData: text("form_data"),
  source: text("source"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LeadSubmission = typeof leadSubmissionsTable.$inferSelect;
