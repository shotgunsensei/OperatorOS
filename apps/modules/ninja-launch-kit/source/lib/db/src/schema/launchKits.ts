import { pgTable, serial, text, integer, jsonb, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const launchKitsTable = pgTable(
  "launch_kits",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    title: text("title").notNull(),
    businessType: text("business_type").notNull(),
    input: jsonb("input").notNull(),
    content: jsonb("content").notNull(),
    watermarked: boolean("watermarked").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdIdx: index("launch_kits_user_id_idx").on(t.userId),
    userCreatedIdx: index("launch_kits_user_created_idx").on(t.userId, t.createdAt),
    deletedAtIdx: index("launch_kits_deleted_at_idx").on(t.deletedAt),
  }),
);

export type LaunchKitRow = typeof launchKitsTable.$inferSelect;
