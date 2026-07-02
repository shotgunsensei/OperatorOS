import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  ssoSubject: varchar("sso_subject").unique(),
  ssoRole: varchar("sso_role"),
  ssoPlanSlug: varchar("sso_plan_slug"),
  ssoOrganizationId: varchar("sso_organization_id"),
  operatorosUserId: varchar("operatoros_user_id").unique(),
  operatorosTenantId: varchar("operatoros_tenant_id"),
  localRole: varchar("local_role"),
  lastEntitlementSyncAt: timestamp("last_entitlement_sync_at"),
  entitlementSnapshotJson: jsonb("entitlement_snapshot_json"),
  revokedAt: timestamp("revoked_at"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isSystemAdmin: boolean("is_system_admin").notNull().default(false),
  passwordHash: text("password_hash"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaSecret: text("mfa_secret"),
  mfaRecoveryCodes: text("mfa_recovery_codes").array(),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
