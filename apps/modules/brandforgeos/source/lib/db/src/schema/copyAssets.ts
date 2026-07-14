import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { campaignsTable } from "./campaigns";
import { brandsTable } from "./brands";

export const copyAssetsTable = pgTable("copy_assets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
  brandId: integer("brand_id").references(() => brandsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  copyType: text("copy_type").notNull(),
  channel: text("channel"),
  tone: text("tone"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCopyAssetSchema = createInsertSchema(copyAssetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCopyAsset = z.infer<typeof insertCopyAssetSchema>;
export type CopyAsset = typeof copyAssetsTable.$inferSelect;
