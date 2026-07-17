import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

/**
 * OperatorOS remains the identity and tenant authority. This is a local
 * projection used for TorqueShed profile ownership and content attribution.
 */
export const torqueshedUsers = pgTable(
  "torqueshed_users",
  {
    id: text("id").primaryKey(),
    operatorOsUserId: text("operatoros_user_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    platformRole: text("platform_role").notNull().default("user"),
    tenantId: text("tenant_id").notNull(),
    tenantSlug: text("tenant_slug"),
    tenantName: text("tenant_name").notNull(),
    tenantRole: text("tenant_role"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("torqueshed_users_operatoros_user_unique").on(
      table.operatorOsUserId,
    ),
    index("torqueshed_users_tenant_idx").on(table.tenantId),
  ],
);

/** Opaque, revocable TorqueShed sessions. Only a SHA-256 digest is stored. */
export const torqueshedSessions = pgTable(
  "torqueshed_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("torqueshed_sessions_user_idx").on(table.userId),
    index("torqueshed_sessions_expires_idx").on(table.expiresAt),
  ],
);

export type TorqueShedUser = typeof torqueshedUsers.$inferSelect;
export type TorqueShedSession = typeof torqueshedSessions.$inferSelect;
