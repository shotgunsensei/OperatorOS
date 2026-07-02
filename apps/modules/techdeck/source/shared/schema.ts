import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  jsonb,
  uniqueIndex,
  bigint,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";
export * from "./models/chat";

export const roleEnum = pgEnum("member_role", [
  "OWNER",
  "ADMIN",
  "TECH",
  "CLIENT",
]);

export const tenants = pgTable("tenants", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("free"),
  maxClients: integer("max_clients").notNull().default(5),
  maxEvidence: integer("max_evidence").notNull().default(50),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tenantsRelations = relations(tenants, ({ many }) => ({
  members: many(tenantMembers),
  clients: many(clients),
  assets: many(assets),
  evidenceItems: many(evidenceItems),
  auditLogs: many(auditLogs),
}));

export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("TECH"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_member_tenant").on(table.tenantId),
    index("idx_member_user").on(table.userId),
    uniqueIndex("idx_member_tenant_user").on(table.tenantId, table.userId),
  ]
);

export const tenantMembersRelations = relations(tenantMembers, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantMembers.tenantId],
    references: [tenants.id],
  }),
  user: one(usersTable, {
    fields: [tenantMembers.userId],
    references: [usersTable.id],
  }),
}));

import { users as usersTable } from "./models/auth";

export const pendingInvitations = pgTable(
  "pending_invitations",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull().default("TECH"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_pending_inv_email").on(table.email),
    uniqueIndex("idx_pending_inv_tenant_email").on(table.tenantId, table.email),
  ]
);

export const clients = pgTable(
  "clients",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_client_tenant").on(table.tenantId)]
);

export const clientsRelations = relations(clients, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [clients.tenantId],
    references: [tenants.id],
  }),
  sites: many(sites),
  evidenceItems: many(evidenceItems),
  clientAssignments: many(clientUserAssignments),
}));

export const clientUserAssignments = pgTable(
  "client_user_assignments",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: varchar("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    canUpload: boolean("can_upload").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_assignment_client").on(table.clientId),
    index("idx_assignment_user").on(table.userId),
    index("idx_assignment_tenant").on(table.tenantId),
  ]
);

export const clientUserAssignmentsRelations = relations(
  clientUserAssignments,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientUserAssignments.clientId],
      references: [clients.id],
    }),
    user: one(usersTable, {
      fields: [clientUserAssignments.userId],
      references: [usersTable.id],
    }),
  })
);

export const sites = pgTable(
  "sites",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: varchar("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    address: text("address"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_site_tenant").on(table.tenantId)]
);

export const sitesRelations = relations(sites, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [sites.tenantId],
    references: [tenants.id],
  }),
  client: one(clients, {
    fields: [sites.clientId],
    references: [clients.id],
  }),
  assets: many(assets),
}));

export const assets = pgTable(
  "assets",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: varchar("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    siteId: varchar("site_id").references(() => sites.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    type: text("type"),
    serialNumber: text("serial_number"),
    ipAddress: text("ip_address"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_asset_tenant").on(table.tenantId)]
);

export const assetsRelations = relations(assets, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [assets.tenantId],
    references: [tenants.id],
  }),
  client: one(clients, {
    fields: [assets.clientId],
    references: [clients.id],
  }),
  site: one(sites, {
    fields: [assets.siteId],
    references: [sites.id],
  }),
  evidenceItems: many(evidenceItems),
}));

export const tags = pgTable(
  "tags",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (table) => [index("idx_tag_tenant").on(table.tenantId)]
);

export const tagsRelations = relations(tags, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tags.tenantId],
    references: [tenants.id],
  }),
}));

export const evidenceItems = pgTable(
  "evidence_items",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: varchar("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    siteId: varchar("site_id").references(() => sites.id, {
      onDelete: "set null",
    }),
    assetId: varchar("asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    notes: text("notes"),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    fileSize: integer("file_size").notNull(),
    filePath: text("file_path").notNull(),
    sha256: text("sha256"),
    tagIds: text("tag_ids").array(),
    uploadedById: varchar("uploaded_by_id").references(() => usersTable.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_evidence_tenant").on(table.tenantId),
    index("idx_evidence_client").on(table.clientId),
    index("idx_evidence_sha256").on(table.sha256),
  ]
);

export const evidenceItemsRelations = relations(evidenceItems, ({ one }) => ({
  tenant: one(tenants, {
    fields: [evidenceItems.tenantId],
    references: [tenants.id],
  }),
  client: one(clients, {
    fields: [evidenceItems.clientId],
    references: [clients.id],
  }),
  site: one(sites, {
    fields: [evidenceItems.siteId],
    references: [sites.id],
  }),
  asset: one(assets, {
    fields: [evidenceItems.assetId],
    references: [assets.id],
  }),
  uploadedBy: one(usersTable, {
    fields: [evidenceItems.uploadedById],
    references: [usersTable.id],
  }),
}));

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id").references(() => usersTable.id),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: varchar("entity_id"),
    details: jsonb("details"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_audit_tenant").on(table.tenantId)]
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [auditLogs.tenantId],
    references: [tenants.id],
  }),
  user: one(usersTable, {
    fields: [auditLogs.userId],
    references: [usersTable.id],
  }),
}));

export const licenseProducts = pgTable(
  "license_products",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_license_product_tenant").on(table.tenantId),
    index("idx_license_product_slug").on(table.tenantId, table.slug),
  ]
);

export const licenseProductsRelations = relations(licenseProducts, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [licenseProducts.tenantId],
    references: [tenants.id],
  }),
  licenseKeys: many(licenseKeys),
}));

export const licenseKeys = pgTable(
  "license_keys",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: varchar("product_id")
      .notNull()
      .references(() => licenseProducts.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull(),
    label: text("label"),
    maxActivations: integer("max_activations").notNull().default(1),
    expiresAt: timestamp("expires_at"),
    isRevoked: boolean("is_revoked").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_license_key_tenant").on(table.tenantId),
    index("idx_license_key_product").on(table.productId),
    index("idx_license_key_hash").on(table.keyHash),
  ]
);

export const licenseKeysRelations = relations(licenseKeys, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [licenseKeys.tenantId],
    references: [tenants.id],
  }),
  product: one(licenseProducts, {
    fields: [licenseKeys.productId],
    references: [licenseProducts.id],
  }),
  activations: many(licenseActivations),
}));

export const licenseActivations = pgTable(
  "license_activations",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    licenseKeyId: varchar("license_key_id")
      .notNull()
      .references(() => licenseKeys.id, { onDelete: "cascade" }),
    deviceFingerprint: text("device_fingerprint").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_activation_key").on(table.licenseKeyId),
    index("idx_activation_tenant").on(table.tenantId),
  ]
);

export const licenseActivationsRelations = relations(licenseActivations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [licenseActivations.tenantId],
    references: [tenants.id],
  }),
  licenseKey: one(licenseKeys, {
    fields: [licenseActivations.licenseKeyId],
    references: [licenseKeys.id],
  }),
}));

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    eventTypes: text("event_types").array().notNull().default(sql`'{}'::text[]`),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_webhook_tenant").on(table.tenantId)]
);

export const webhookEndpointsRelations = relations(webhookEndpoints, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [webhookEndpoints.tenantId],
    references: [tenants.id],
  }),
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    webhookEndpointId: varchar("webhook_endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    responseCode: integer("response_code"),
    responseBody: text("response_body"),
    durationMs: integer("duration_ms"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextRetryAt: timestamp("next_retry_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_webhook_delivery_tenant").on(table.tenantId),
    index("idx_webhook_delivery_endpoint").on(table.webhookEndpointId),
    index("idx_webhook_delivery_status").on(table.status, table.nextRetryAt),
  ]
);

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  tenant: one(tenants, {
    fields: [webhookDeliveries.tenantId],
    references: [tenants.id],
  }),
  webhookEndpoint: one(webhookEndpoints, {
    fields: [webhookDeliveries.webhookEndpointId],
    references: [webhookEndpoints.id],
  }),
}));

export const componentStatusEnum = pgEnum("component_status", [
  "operational",
  "degraded",
  "partial_outage",
  "major_outage",
  "maintenance",
]);

export const incidentSeverityEnum = pgEnum("incident_severity", [
  "info",
  "minor",
  "major",
  "critical",
]);

export const incidentStatusEnum = pgEnum("incident_status", [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
]);

export const statusPages = pgTable(
  "status_pages",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    publicSlug: text("public_slug").notNull().unique(),
    isPublic: boolean("is_public").notNull().default(false),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_status_page_tenant").on(table.tenantId),
    index("idx_status_page_slug").on(table.publicSlug),
  ]
);

export const statusPagesRelations = relations(statusPages, ({ one }) => ({
  tenant: one(tenants, {
    fields: [statusPages.tenantId],
    references: [tenants.id],
  }),
}));

export const statusComponents = pgTable(
  "status_components",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: componentStatusEnum("status").notNull().default("operational"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_status_component_tenant").on(table.tenantId)]
);

export const statusComponentsRelations = relations(statusComponents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [statusComponents.tenantId],
    references: [tenants.id],
  }),
}));

export const statusIncidents = pgTable(
  "status_incidents",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: incidentSeverityEnum("severity").notNull().default("info"),
    status: incidentStatusEnum("status").notNull().default("investigating"),
    startedAt: timestamp("started_at").defaultNow(),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_status_incident_tenant").on(table.tenantId)]
);

export const statusIncidentsRelations = relations(statusIncidents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [statusIncidents.tenantId],
    references: [tenants.id],
  }),
}));

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
});
export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
});
export const insertSiteSchema = createInsertSchema(sites).omit({
  id: true,
  createdAt: true,
});
export const insertAssetSchema = createInsertSchema(assets).omit({
  id: true,
  createdAt: true,
});
export const insertEvidenceSchema = createInsertSchema(evidenceItems).omit({
  id: true,
  createdAt: true,
});
export const insertTagSchema = createInsertSchema(tags).omit({ id: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});
export const insertClientUserAccessSchema = createInsertSchema(clientUserAssignments).omit({
  id: true,
  createdAt: true,
});
export const insertLicenseProductSchema = createInsertSchema(licenseProducts).omit({
  id: true,
  createdAt: true,
});
export const insertLicenseKeySchema = createInsertSchema(licenseKeys).omit({
  id: true,
  createdAt: true,
});
export const insertLicenseActivationSchema = createInsertSchema(licenseActivations).omit({
  id: true,
  createdAt: true,
});
export const insertWebhookEndpointSchema = createInsertSchema(webhookEndpoints).omit({
  id: true,
  createdAt: true,
});
export const insertWebhookDeliverySchema = createInsertSchema(webhookDeliveries).omit({
  id: true,
  createdAt: true,
});
export const insertStatusPageSchema = createInsertSchema(statusPages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertStatusComponentSchema = createInsertSchema(statusComponents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertStatusIncidentSchema = createInsertSchema(statusIncidents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const reportJobStatusEnum = pgEnum("report_job_status", [
  "queued",
  "running",
  "complete",
  "failed",
]);

export const reportJobs = pgTable("report_jobs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").notNull(),
  type: text("type").notNull().default("evidence_packet"),
  status: reportJobStatusEnum("status").notNull().default("queued"),
  params: jsonb("params"),
  outputPath: text("output_path"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReportJobSchema = createInsertSchema(reportJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    scopes: text("scopes").array().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("api_tokens_tenant_idx").on(table.tenantId), index("api_tokens_hash_idx").on(table.tokenHash)]
);

export const insertApiTokenSchema = createInsertSchema(apiTokens).omit({
  id: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type ApiToken = typeof apiTokens.$inferSelect;
export type InsertApiToken = z.infer<typeof insertApiTokenSchema>;

export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull().default(0),
  limits: jsonb("limits").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
]);

export const tenantSubscriptions = pgTable("tenant_subscriptions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" })
    .unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId: text("stripe_price_id"),
  planCode: text("plan_code").notNull().default("solo"),
  status: text("status").notNull().default("trialing"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  pausedAt: timestamp("paused_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tenantSubscriptionsRelations = relations(tenantSubscriptions, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantSubscriptions.tenantId],
    references: [tenants.id],
  }),
}));

export const insertTenantSubscriptionSchema = createInsertSchema(tenantSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type TenantSubscription = typeof tenantSubscriptions.$inferSelect;
export type InsertTenantSubscription = z.infer<typeof insertTenantSubscriptionSchema>;

export const usageCountersMonthly = pgTable(
  "usage_counters_monthly",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    monthKey: text("month_key").notNull(),
    reportsGenerated: integer("reports_generated").notNull().default(0),
    webhookDeliveries: integer("webhook_deliveries").notNull().default(0),
    evidenceBytesStored: bigint("evidence_bytes_stored", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_usage_tenant_month").on(table.tenantId, table.monthKey),
  ]
);

export const usageCountersMonthlyRelations = relations(usageCountersMonthly, ({ one }) => ({
  tenant: one(tenants, {
    fields: [usageCountersMonthly.tenantId],
    references: [tenants.id],
  }),
}));

export const insertUsageCounterSchema = createInsertSchema(usageCountersMonthly).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UsageCounter = typeof usageCountersMonthly.$inferSelect;
export type InsertUsageCounter = z.infer<typeof insertUsageCounterSchema>;

export interface PlanLimits {
  usersMax: number;
  storageGb: number;
  reportsPerMonth: number;
  webhooksMax: number;
  apiEnabled: boolean;
  portalEnabled: boolean;
  statusEnabled: boolean;
  intakeEnabled?: boolean;
  intakeSpacesMax?: number;
  intakeRequestsPerMonth?: number;
  intakeStorageGb?: number;
}

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type TenantMember = typeof tenantMembers.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Site = typeof sites.$inferSelect;
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Asset = typeof assets.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type EvidenceItem = typeof evidenceItems.$inferSelect;
export type InsertEvidence = z.infer<typeof insertEvidenceSchema>;
export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type ClientUserAccess = typeof clientUserAssignments.$inferSelect;
export type InsertClientUserAccess = z.infer<typeof insertClientUserAccessSchema>;
export type MemberRole = "OWNER" | "ADMIN" | "TECH" | "CLIENT";

export type LicenseProduct = typeof licenseProducts.$inferSelect;
export type InsertLicenseProduct = z.infer<typeof insertLicenseProductSchema>;
export type LicenseKey = typeof licenseKeys.$inferSelect;
export type InsertLicenseKey = z.infer<typeof insertLicenseKeySchema>;
export type LicenseActivation = typeof licenseActivations.$inferSelect;
export type InsertLicenseActivation = z.infer<typeof insertLicenseActivationSchema>;
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type InsertWebhookEndpoint = z.infer<typeof insertWebhookEndpointSchema>;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = z.infer<typeof insertWebhookDeliverySchema>;
export type StatusPage = typeof statusPages.$inferSelect;
export type InsertStatusPage = z.infer<typeof insertStatusPageSchema>;
export type StatusComponent = typeof statusComponents.$inferSelect;
export type InsertStatusComponent = z.infer<typeof insertStatusComponentSchema>;
export type StatusIncident = typeof statusIncidents.$inferSelect;
export type InsertStatusIncident = z.infer<typeof insertStatusIncidentSchema>;
export type ReportJob = typeof reportJobs.$inferSelect;
export type InsertReportJob = z.infer<typeof insertReportJobSchema>;

export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "critical",
  "high",
  "medium",
  "low",
]);

export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "waiting_on_client",
  "resolved",
  "closed",
]);

export const tickets = pgTable(
  "tickets",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    priority: ticketPriorityEnum("priority").notNull().default("medium"),
    status: ticketStatusEnum("status").notNull().default("open"),
    clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
    siteId: varchar("site_id").references(() => sites.id, { onDelete: "set null" }),
    assetId: varchar("asset_id").references(() => assets.id, { onDelete: "set null" }),
    assignedToId: varchar("assigned_to_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
    slaProfileId: varchar("sla_profile_id"),
    responseDeadline: timestamp("response_deadline"),
    resolutionDeadline: timestamp("resolution_deadline"),
    respondedAt: timestamp("responded_at"),
    resolvedAt: timestamp("resolved_at"),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_ticket_tenant").on(table.tenantId),
    index("idx_ticket_status").on(table.tenantId, table.status),
    index("idx_ticket_assigned").on(table.assignedToId),
    index("idx_ticket_client").on(table.clientId),
    uniqueIndex("idx_ticket_number").on(table.tenantId, table.number),
  ]
);

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  tenant: one(tenants, { fields: [tickets.tenantId], references: [tenants.id] }),
  client: one(clients, { fields: [tickets.clientId], references: [clients.id] }),
  site: one(sites, { fields: [tickets.siteId], references: [sites.id] }),
  asset: one(assets, { fields: [tickets.assetId], references: [assets.id] }),
  assignedTo: one(usersTable, { fields: [tickets.assignedToId], references: [usersTable.id], relationName: "assignedTickets" }),
  createdBy: one(usersTable, { fields: [tickets.createdById], references: [usersTable.id], relationName: "createdTickets" }),
  comments: many(ticketComments),
}));

export const ticketComments = pgTable(
  "ticket_comments",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ticketId: varchar("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    userId: varchar("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_comment_ticket").on(table.ticketId),
    index("idx_comment_tenant").on(table.tenantId),
  ]
);

export const ticketCommentsRelations = relations(ticketComments, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketComments.ticketId], references: [tickets.id] }),
  user: one(usersTable, { fields: [ticketComments.userId], references: [usersTable.id] }),
}));

export const insertTicketSchema = createInsertSchema(tickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertTicketCommentSchema = createInsertSchema(ticketComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type TicketComment = typeof ticketComments.$inferSelect;
export type InsertTicketComment = z.infer<typeof insertTicketCommentSchema>;

export const slaProfiles = pgTable(
  "sla_profiles",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    criticalResponseMinutes: integer("critical_response_minutes").notNull().default(30),
    criticalResolutionMinutes: integer("critical_resolution_minutes").notNull().default(240),
    highResponseMinutes: integer("high_response_minutes").notNull().default(60),
    highResolutionMinutes: integer("high_resolution_minutes").notNull().default(480),
    mediumResponseMinutes: integer("medium_response_minutes").notNull().default(240),
    mediumResolutionMinutes: integer("medium_resolution_minutes").notNull().default(1440),
    lowResponseMinutes: integer("low_response_minutes").notNull().default(480),
    lowResolutionMinutes: integer("low_resolution_minutes").notNull().default(2880),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_sla_tenant").on(table.tenantId)]
);

export const insertSlaProfileSchema = createInsertSchema(slaProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SlaProfile = typeof slaProfiles.$inferSelect;
export type InsertSlaProfile = z.infer<typeof insertSlaProfileSchema>;

export const appointments = pgTable(
  "appointments",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time").notNull(),
    ticketId: varchar("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
    siteId: varchar("site_id").references(() => sites.id, { onDelete: "set null" }),
    assignedToId: varchar("assigned_to_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_appointment_tenant").on(table.tenantId),
    index("idx_appointment_time").on(table.tenantId, table.startTime),
    index("idx_appointment_assigned").on(table.assignedToId),
  ]
);

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  tenant: one(tenants, { fields: [appointments.tenantId], references: [tenants.id] }),
  ticket: one(tickets, { fields: [appointments.ticketId], references: [tickets.id] }),
  client: one(clients, { fields: [appointments.clientId], references: [clients.id] }),
  site: one(sites, { fields: [appointments.siteId], references: [sites.id] }),
  assignedTo: one(usersTable, { fields: [appointments.assignedToId], references: [usersTable.id], relationName: "assignedAppointments" }),
  createdBy: one(usersTable, { fields: [appointments.createdById], references: [usersTable.id], relationName: "createdAppointments" }),
}));

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

export const timeEntries = pgTable(
  "time_entries",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ticketId: varchar("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    description: text("description"),
    minutes: integer("minutes").notNull(),
    billable: boolean("billable").notNull().default(true),
    rateOverrideCents: integer("rate_override_cents"),
    date: timestamp("date").notNull(),
    invoiceId: varchar("invoice_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_time_tenant").on(table.tenantId),
    index("idx_time_ticket").on(table.ticketId),
    index("idx_time_user").on(table.userId),
    index("idx_time_client").on(table.clientId),
    index("idx_time_invoice").on(table.invoiceId),
  ]
);

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  tenant: one(tenants, { fields: [timeEntries.tenantId], references: [tenants.id] }),
  ticket: one(tickets, { fields: [timeEntries.ticketId], references: [tickets.id] }),
  client: one(clients, { fields: [timeEntries.clientId], references: [clients.id] }),
  user: one(usersTable, { fields: [timeEntries.userId], references: [usersTable.id] }),
}));

export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;

export const billingConfigs = pgTable(
  "billing_configs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" })
      .unique(),
    defaultHourlyRateCents: integer("default_hourly_rate_cents").notNull().default(15000),
    currency: text("currency").notNull().default("USD"),
    companyName: text("company_name"),
    companyAddress: text("company_address"),
    companyPhone: text("company_phone"),
    companyEmail: text("company_email"),
    invoicePrefix: text("invoice_prefix").notNull().default("INV"),
    invoiceNextNumber: integer("invoice_next_number").notNull().default(1001),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    invoiceNotes: text("invoice_notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_billing_config_tenant").on(table.tenantId)]
);

export const insertBillingConfigSchema = createInsertSchema(billingConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BillingConfig = typeof billingConfigs.$inferSelect;
export type InsertBillingConfig = z.infer<typeof insertBillingConfigSchema>;

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "viewed",
  "paid",
  "partial",
  "overdue",
  "cancelled",
]);

export const invoices = pgTable(
  "invoices",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
    invoiceNumber: text("invoice_number").notNull(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    issuedAt: timestamp("issued_at"),
    dueAt: timestamp("due_at"),
    paidAt: timestamp("paid_at"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    notes: text("notes"),
    publicToken: text("public_token"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_invoice_tenant").on(table.tenantId),
    index("idx_invoice_client").on(table.clientId),
    index("idx_invoice_status").on(table.tenantId, table.status),
    uniqueIndex("idx_invoice_number").on(table.tenantId, table.invoiceNumber),
    index("idx_invoice_public_token").on(table.publicToken),
  ]
);

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  tenant: one(tenants, { fields: [invoices.tenantId], references: [tenants.id] }),
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  lineItems: many(invoiceLineItems),
}));

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: varchar("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    timeEntryId: varchar("time_entry_id").references(() => timeEntries.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_line_item_invoice").on(table.invoiceId),
    index("idx_line_item_tenant").on(table.tenantId),
  ]
);

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLineItems.invoiceId], references: [invoices.id] }),
  timeEntry: one(timeEntries, { fields: [invoiceLineItems.timeEntryId], references: [timeEntries.id] }),
}));

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertInvoiceLineItemSchema = createInsertSchema(invoiceLineItems).omit({
  id: true,
  createdAt: true,
});

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type InsertInvoiceLineItem = z.infer<typeof insertInvoiceLineItemSchema>;

export const kbArticles = pgTable(
  "kb_articles",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    content: text("content").notNull().default(""),
    category: text("category"),
    isPublished: boolean("is_published").notNull().default(false),
    authorId: varchar("author_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_kb_tenant").on(table.tenantId),
    uniqueIndex("idx_kb_slug").on(table.tenantId, table.slug),
    index("idx_kb_category").on(table.tenantId, table.category),
  ]
);

export const kbArticlesRelations = relations(kbArticles, ({ one }) => ({
  tenant: one(tenants, { fields: [kbArticles.tenantId], references: [tenants.id] }),
  author: one(usersTable, { fields: [kbArticles.authorId], references: [usersTable.id] }),
}));

export const insertKbArticleSchema = createInsertSchema(kbArticles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type KbArticle = typeof kbArticles.$inferSelect;
export type InsertKbArticle = z.infer<typeof insertKbArticleSchema>;

export const recurringTicketTemplates = pgTable(
  "recurring_ticket_templates",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    priority: ticketPriorityEnum("priority").notNull().default("medium"),
    clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
    siteId: varchar("site_id").references(() => sites.id, { onDelete: "set null" }),
    assetId: varchar("asset_id").references(() => assets.id, { onDelete: "set null" }),
    assignedToId: varchar("assigned_to_id").references(() => usersTable.id, { onDelete: "set null" }),
    cronExpression: text("cron_expression").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastGeneratedAt: timestamp("last_generated_at"),
    nextRunAt: timestamp("next_run_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_recurring_tenant").on(table.tenantId),
    index("idx_recurring_next_run").on(table.enabled, table.nextRunAt),
  ]
);

export const insertRecurringTicketTemplateSchema = createInsertSchema(recurringTicketTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type RecurringTicketTemplate = typeof recurringTicketTemplates.$inferSelect;
export type InsertRecurringTicketTemplate = z.infer<typeof insertRecurringTicketTemplateSchema>;

export const intakeSpaceStatusEnum = pgEnum("intake_space_status", ["active", "archived"]);

export const intakeSpaces = pgTable(
  "intake_spaces",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    status: intakeSpaceStatusEnum("status").notNull().default("active"),
    allowedFileTypes: text("allowed_file_types").array(),
    maxFileSizeMb: integer("max_file_size_mb").notNull().default(25),
    requireMetadata: boolean("require_metadata").notNull().default(false),
    metadataFields: jsonb("metadata_fields"),
    retentionDays: integer("retention_days"),
    externalUploadsEnabled: boolean("external_uploads_enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_intake_spaces_tenant").on(table.tenantId),
    uniqueIndex("idx_intake_spaces_tenant_slug").on(table.tenantId, table.slug),
  ]
);

export const insertIntakeSpaceSchema = createInsertSchema(intakeSpaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type IntakeSpace = typeof intakeSpaces.$inferSelect;
export type InsertIntakeSpace = z.infer<typeof insertIntakeSpaceSchema>;

export const uploadRequestStatusEnum = pgEnum("upload_request_status", [
  "active",
  "completed",
  "expired",
  "revoked",
]);

export const uploadRequests = pgTable(
  "upload_requests",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    spaceId: varchar("space_id")
      .notNull()
      .references(() => intakeSpaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    uploaderName: text("uploader_name"),
    uploaderEmail: text("uploader_email"),
    instructions: text("instructions"),
    token: text("token").notNull().unique(),
    status: uploadRequestStatusEnum("status").notNull().default("active"),
    maxUploads: integer("max_uploads"),
    maxTotalSizeMb: integer("max_total_size_mb"),
    allowedFileTypes: text("allowed_file_types").array(),
    oneTimeUse: boolean("one_time_use").notNull().default(false),
    requiresPassword: boolean("requires_password").notNull().default(false),
    passwordHash: text("password_hash"),
    expiresAt: timestamp("expires_at"),
    completedAt: timestamp("completed_at"),
    revokedAt: timestamp("revoked_at"),
    createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
    uploadCount: integer("upload_count").notNull().default(0),
    totalUploadedBytes: bigint("total_uploaded_bytes", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_upload_requests_tenant").on(table.tenantId),
    index("idx_upload_requests_space").on(table.spaceId),
    index("idx_upload_requests_token").on(table.token),
    index("idx_upload_requests_status").on(table.tenantId, table.status),
  ]
);

export const insertUploadRequestSchema = createInsertSchema(uploadRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  uploadCount: true,
  totalUploadedBytes: true,
  completedAt: true,
  revokedAt: true,
});

export type UploadRequest = typeof uploadRequests.$inferSelect;
export type InsertUploadRequest = z.infer<typeof insertUploadRequestSchema>;

export const intakeFileStatusEnum = pgEnum("intake_file_status", [
  "uploaded",
  "reviewed",
  "approved",
  "rejected",
  "archived",
]);

export const intakeFiles = pgTable(
  "intake_files",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    spaceId: varchar("space_id")
      .notNull()
      .references(() => intakeSpaces.id, { onDelete: "cascade" }),
    uploadRequestId: varchar("upload_request_id")
      .references(() => uploadRequests.id, { onDelete: "set null" }),
    originalName: text("original_name").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256"),
    status: intakeFileStatusEnum("status").notNull().default("uploaded"),
    uploaderName: text("uploader_name"),
    uploaderEmail: text("uploader_email"),
    uploaderIp: text("uploader_ip"),
    metadata: jsonb("metadata"),
    reviewedById: varchar("reviewed_by_id").references(() => usersTable.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_intake_files_tenant").on(table.tenantId),
    index("idx_intake_files_space").on(table.spaceId),
    index("idx_intake_files_request").on(table.uploadRequestId),
    index("idx_intake_files_status").on(table.tenantId, table.status),
  ]
);

export const insertIntakeFileSchema = createInsertSchema(intakeFiles).omit({
  id: true,
  createdAt: true,
  reviewedAt: true,
});

export type IntakeFile = typeof intakeFiles.$inferSelect;
export type InsertIntakeFile = z.infer<typeof insertIntakeFileSchema>;

export const intakeAuditEvents = pgTable(
  "intake_audit_events",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    objectType: text("object_type"),
    objectId: text("object_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_intake_audit_tenant").on(table.tenantId),
    index("idx_intake_audit_action").on(table.tenantId, table.action),
    index("idx_intake_audit_created").on(table.tenantId, table.createdAt),
  ]
);

export const insertIntakeAuditEventSchema = createInsertSchema(intakeAuditEvents).omit({
  id: true,
  createdAt: true,
});

export type IntakeAuditEvent = typeof intakeAuditEvents.$inferSelect;
export type InsertIntakeAuditEvent = z.infer<typeof insertIntakeAuditEventSchema>;

export const intakePolicies = pgTable(
  "intake_policies",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" })
      .unique(),
    defaultMaxFileSizeMb: integer("default_max_file_size_mb").notNull().default(25),
    defaultAllowedFileTypes: text("default_allowed_file_types").array(),
    defaultRetentionDays: integer("default_retention_days"),
    defaultExpirationHours: integer("default_expiration_hours").notNull().default(72),
    requirePasswordForLinks: boolean("require_password_for_links").notNull().default(false),
    autoDeleteExpiredFiles: boolean("auto_delete_expired_files").notNull().default(false),
    complianceNotice: text("compliance_notice"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_intake_policies_tenant").on(table.tenantId),
  ]
);

export const insertIntakePolicySchema = createInsertSchema(intakePolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type IntakePolicy = typeof intakePolicies.$inferSelect;
export type InsertIntakePolicy = z.infer<typeof insertIntakePolicySchema>;
