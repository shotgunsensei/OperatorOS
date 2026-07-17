import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("free"),
  industry: text("industry"),
  businessType: text("business_type"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  aiCreditsUsed: integer("ai_credits_used").notNull().default(0),
  aiCreditsLimit: integer("ai_credits_limit").notNull().default(50),
  storageUsedMb: integer("storage_used_mb").notNull().default(0),
  storageLimitMb: integer("storage_limit_mb").notNull().default(100),
  exportsUsed: integer("exports_used").notNull().default(0),
  exportsLimit: integer("exports_limit").notNull().default(5),
  publishedPagesUsed: integer("published_pages_used").notNull().default(0),
  publishedPagesLimit: integer("published_pages_limit").notNull().default(1),
  billingStatus: text("billing_status").notNull().default("active"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  activationScore: integer("activation_score").notNull().default(0),
  onboardingData: text("onboarding_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
