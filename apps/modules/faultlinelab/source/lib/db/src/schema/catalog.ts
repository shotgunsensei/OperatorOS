import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export type CatalogOverrideShape = {
  status?: "available" | "coming-soon" | "disabled";
  featured?: boolean;
  shortDescription?: string;
  longDescription?: string;
  tags?: string[];
};

export const catalogOverridesTable = pgTable("catalog_overrides", {
  productId: text("product_id").primaryKey(),
  overrides: jsonb("overrides").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedByUserId: text("updated_by_user_id"),
});

export type CatalogOverride = typeof catalogOverridesTable.$inferSelect;

export const catalogOverrideHistoryTable = pgTable(
  "catalog_override_history",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    action: text("action").notNull(),
    overrides: jsonb("overrides"),
    previousOverrides: jsonb("previous_overrides"),
    changedAt: timestamp("changed_at").defaultNow().notNull(),
    changedByUserId: text("changed_by_user_id"),
  },
  (t) => ({
    productIdx: index("catalog_override_history_product_idx").on(t.productId, t.changedAt),
  }),
);

export type CatalogOverrideHistory = typeof catalogOverrideHistoryTable.$inferSelect;

export const caseDraftsTable = pgTable("case_drafts", {
  id: text("id").primaryKey(),
  draft: jsonb("draft").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedByUserId: text("updated_by_user_id"),
});

export type CaseDraftRow = typeof caseDraftsTable.$inferSelect;
