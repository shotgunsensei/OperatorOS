import { pgTable, text, serial, timestamp, integer, date } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { campaignsTable } from "./campaigns";

export const campaignMetricsTable = pgTable("campaign_metrics", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("manual"),
  metricDate: date("metric_date").notNull(),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  spend: integer("spend").notNull().default(0),
  revenue: integer("revenue").notNull().default(0),
  ctr: text("ctr"),
  cpc: text("cpc"),
  roas: text("roas"),
  channel: text("channel"),
  isSampleData: text("is_sample_data").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CampaignMetric = typeof campaignMetricsTable.$inferSelect;
