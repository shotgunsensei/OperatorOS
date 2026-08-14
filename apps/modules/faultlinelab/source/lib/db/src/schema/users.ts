import { pgTable, text, timestamp, boolean, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  clerkId: text("clerk_id").unique(),
  email: text("email"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  isSuperAdmin: boolean("is_super_admin").default(false).notNull(),
  // OperatorOS SSO identity. operator_identity_id is the stable subject from
  // the OperatorOS-issued JWT (claim `sub`). It is unique across users so
  // every OperatorOS account maps to exactly one row. The remaining fields
  // mirror the most recent SSO launch payload — they are descriptive only;
  // local entitlement state remains the source of truth.
  operatorIdentityId: text("operator_identity_id").unique(),
  operatorPlanSlug: text("operator_plan_slug"),
  operatorOrganizationId: text("operator_organization_id"),
  operatorRole: text("operator_role"),
  operatorLastLaunchAt: timestamp("operator_last_launch_at"),
  operatorosTenantId: text("operatoros_tenant_id"),
  // Derived role mapping: 'admin' | 'standard' | 'read-only' | 'deny'.
  // Recomputed on every OperatorOS launch + entitlement sync from the
  // module_role / tenant_role / access_level claims. requireAuth returns
  // 403 access_denied when this is 'deny'.
  localRole: text("local_role"),
  lastEntitlementSyncAt: timestamp("last_entitlement_sync_at"),
  // Raw OperatorOS-issued entitlement snapshot. Source of truth for
  // OperatorOS-managed users (replaces user_entitlements lookup for them).
  entitlementSnapshotJson: jsonb("entitlement_snapshot_json").$type<{
    accessLevel: 'pro' | 'standard' | 'read-only' | 'denied';
    moduleEnabled: boolean;
    moduleRole: string | null;
    tenantRole: string | null;
    planSlug: string | null;
    subscriptionStatus: string | null;
    features: string[];
    grantedProductIds: string[];
    syncedAt: number;
  } | null>(),
  // Per-user opt-in toggle for renewal / expiration emails. Defaults to true
  // so existing users keep getting heads-up notices, but a single-click
  // unsubscribe link in every email (or the Account screen toggle) flips
  // this off and the scheduled scan skips the user.
  renewalEmailsEnabled: boolean("renewal_emails_enabled").default(true).notNull(),
  // Opaque per-user secret embedded in the unsubscribe link. Generated
  // lazily the first time we mail the user. Unique so a link can be
  // reversed back to exactly one account.
  unsubscribeToken: text("unsubscribe_token").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userProfilesTable = pgTable("user_profiles", {
  userId: text("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  profileData: jsonb("profile_data").notNull().$type<{
    name: string;
    casesSolved: number;
    bestScores: Record<string, number>;
    totalScore: number;
    bestChaosScores: Record<string, number>;
    totalChaosScore: number;
    streakCurrent: number;
    streakBest: number;
    achievementsUnlocked: string[];
    solvedCaseIds: string[];
    createdAt: number;
    lastActiveAt: number;
  }>(),
  caseStates: jsonb("case_states").notNull().$type<Record<string, unknown>>().default({}),
  settings: jsonb("settings").notNull().$type<{
    soundEnabled: boolean;
    animationsEnabled: boolean;
    terminalFontSize: number;
  }>().default({ soundEnabled: false, animationsEnabled: true, terminalFontSize: 14 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userEntitlementsTable = pgTable("user_entitlements", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  entitlementType: text("entitlement_type").notNull(),
  productId: text("product_id").notNull(),
  source: text("source").notNull(),
  stripePaymentId: text("stripe_payment_id"),
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  isActive: boolean("is_active").default(true).notNull(),
});

export const purchasesTable = pgTable("purchases", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  amount: integer("amount"),
  currency: text("currency").default("usd"),
  status: text("status").notNull().default("pending"),
  receiptUrl: text("receipt_url"),
  fulfilledAt: timestamp("fulfilled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export type UserProfile = typeof userProfilesTable.$inferSelect;
export type UserEntitlement = typeof userEntitlementsTable.$inferSelect;
export type Purchase = typeof purchasesTable.$inferSelect;
