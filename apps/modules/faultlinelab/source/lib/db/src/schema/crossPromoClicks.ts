import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

export const crossPromoClicksTable = pgTable(
  "cross_promo_clicks",
  {
    id: text("id").primaryKey(),
    placementId: text("placement_id").notNull(),
    targetProduct: text("target_product").notNull(),
    targetUrl: text("target_url").notNull(),
    route: text("route"),
    userTier: text("user_tier").notNull(),
    userId: text("user_id"),
    clerkId: text("clerk_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    placementIdx: index("cross_promo_clicks_placement_idx").on(
      t.placementId,
      t.createdAt,
    ),
    targetIdx: index("cross_promo_clicks_target_idx").on(
      t.targetProduct,
      t.createdAt,
    ),
  }),
);

export type CrossPromoClick = typeof crossPromoClicksTable.$inferSelect;
