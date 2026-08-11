import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { torqueshedUsers } from "./identity";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    vin: text("vin"),
    year: integer("year").notNull(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    trim: text("trim"),
    engine: text("engine"),
    transmission: text("transmission"),
    drivetrain: text("drivetrain"),
    mileage: integer("mileage"),
    nickname: text("nickname"),
    ownershipStatus: text("ownership_status").notNull().default("owned"),
    visibility: text("visibility").notNull().default("private"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("vehicles_tenant_owner_idx").on(table.tenantId, table.ownerUserId),
    uniqueIndex("vehicles_tenant_vin_uidx").on(table.tenantId, table.vin),
  ],
);

export const vehicleProfiles = pgTable(
  "vehicle_profiles",
  {
    vehicleId: uuid("vehicle_id")
      .primaryKey()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    summary: text("summary").notNull().default(""),
    specifications: jsonb("specifications").$type<Record<string, unknown>>().notNull().default({}),
    currentModifications: jsonb("current_modifications")
      .$type<string[]>()
      .notNull()
      .default([]),
    coverAttachmentId: uuid("cover_attachment_id"),
    updatedAt: updatedAt(),
  },
);

export const vendors = pgTable(
  "vendors",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    website: text("website"),
    phone: text("phone"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("vendors_tenant_owner_idx").on(table.tenantId, table.ownerUserId)],
);

export const vehicleRecords = pgTable(
  "vehicle_records",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    mileage: integer("mileage"),
    costCents: integer("cost_cents"),
    laborMinutes: integer("labor_minutes"),
    parts: jsonb("parts").$type<Array<Record<string, unknown>>>().notNull().default([]),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("vehicle_records_vehicle_idx").on(table.vehicleId, table.performedAt),
    index("vehicle_records_tenant_idx").on(table.tenantId, table.ownerUserId),
  ],
);

export const serviceReminders = pgTable(
  "service_reminders",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    dueMileage: integer("due_mileage"),
    status: text("status").notNull().default("open"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("service_reminders_vehicle_idx").on(table.vehicleId, table.status)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    kind: text("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    caption: text("caption"),
    createdAt: createdAt(),
  },
  (table) => [index("attachments_entity_idx").on(table.tenantId, table.entityType, table.entityId)],
);

export const projectBuilds = pgTable(
  "project_builds",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("planning"),
    budgetCents: integer("budget_cents"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    targetAt: timestamp("target_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("project_builds_tenant_idx").on(table.tenantId, table.ownerUserId)],
);

export const buildStages = pgTable(
  "build_stages",
  {
    id: id(),
    buildId: uuid("build_id")
      .notNull()
      .references(() => projectBuilds.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    position: integer("position").notNull().default(0),
    status: text("status").notNull().default("planned"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("build_stages_build_idx").on(table.buildId, table.position)],
);

export const buildTasks = pgTable(
  "build_tasks",
  {
    id: id(),
    buildId: uuid("build_id")
      .notNull()
      .references(() => projectBuilds.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id").references(() => buildStages.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("open"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("build_tasks_build_idx").on(table.buildId, table.stageId)],
);

export const notes = pgTable(
  "notes",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("notes_entity_idx").on(table.tenantId, table.entityType, table.entityId)],
);

export const tags = pgTable(
  "tags",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("tags_tenant_slug_uidx").on(table.tenantId, table.slug)],
);

export const entityTags = pgTable(
  "entity_tags",
  {
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.tagId, table.entityType, table.entityId] })],
);

export const diagnosticSessions = pgTable(
  "diagnostic_sessions",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    customerConcern: text("customer_concern").notNull(),
    symptoms: text("symptoms").notNull().default(""),
    conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull().default({}),
    freezeFrame: jsonb("freeze_frame").$type<Record<string, unknown>>().notNull().default({}),
    probableCauses: jsonb("probable_causes").$type<Array<Record<string, unknown>>>().notNull().default([]),
    confirmedRootCause: text("confirmed_root_cause"),
    repairPerformed: text("repair_performed"),
    verification: text("verification"),
    finalResolution: text("final_resolution"),
    status: text("status").notNull().default("open"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("diagnostics_vehicle_idx").on(table.vehicleId, table.createdAt),
    index("diagnostics_tenant_idx").on(table.tenantId, table.ownerUserId),
  ],
);

export const diagnosticTroubleCodes = pgTable(
  "diagnostic_trouble_codes",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => diagnosticSessions.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    freezeFrame: jsonb("freeze_frame").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [index("diagnostic_codes_session_idx").on(table.sessionId)],
);

export const diagnosticEntries = pgTable(
  "diagnostic_entries",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => diagnosticSessions.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    value: text("value").notNull(),
    unit: text("unit"),
    outcome: text("outcome"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("diagnostic_entries_session_idx").on(table.sessionId, table.observedAt)],
);

export const diagnosticTemplates = pgTable(
  "diagnostic_templates",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    concernPattern: text("concern_pattern").notNull().default(""),
    testPlan: jsonb("test_plan").$type<Array<Record<string, unknown>>>().notNull().default([]),
    isShared: boolean("is_shared").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("diagnostic_templates_tenant_idx").on(table.tenantId, table.ownerUserId)],
);

export const torqueAssistRequests = pgTable(
  "torque_assist_requests",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    diagnosticSessionId: uuid("diagnostic_session_id")
      .notNull()
      .references(() => diagnosticSessions.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    contextHash: text("context_hash").notNull(),
    status: text("status").notNull().default("pending"),
    reservedTokens: integer("reserved_tokens").notNull().default(2),
    chargedTokens: integer("charged_tokens").notNull().default(0),
    provider: text("provider").notNull().default("openai"),
    model: text("model"),
    providerResponseId: text("provider_response_id"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("torque_assist_idempotency_uidx").on(table.ownerUserId, table.idempotencyKey),
    index("torque_assist_session_idx").on(table.diagnosticSessionId, table.createdAt),
  ],
);

export const tokenPackages = pgTable(
  "token_packages",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    tokenAmount: integer("token_amount").notNull(),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    stripePriceId: text("stripe_price_id"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

export const tokenPurchases = pgTable(
  "token_purchases",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    packageId: text("package_id").references(() => tokenPackages.id, { onDelete: "set null" }),
    tokenAmount: integer("token_amount").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    livemode: boolean("livemode").notNull().default(false),
    status: text("status").notNull().default("pending"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("token_purchase_checkout_uidx").on(table.stripeCheckoutSessionId),
    index("token_purchases_owner_idx").on(table.ownerUserId, table.createdAt),
  ],
);

export const tokenLedgerEntries = pgTable(
  "token_ledger_entries",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    entryType: text("entry_type").notNull(),
    description: text("description").notNull(),
    purchaseId: uuid("purchase_id").references(() => tokenPurchases.id, { onDelete: "set null" }),
    torqueAssistRequestId: uuid("torque_assist_request_id").references(
      () => torqueAssistRequests.id,
      { onDelete: "set null" },
    ),
    externalEventId: text("external_event_id"),
    createdAt: createdAt(),
  },
  (table) => [
    index("token_ledger_owner_idx").on(table.ownerUserId, table.createdAt),
    uniqueIndex("token_ledger_assist_uidx").on(table.torqueAssistRequestId),
    uniqueIndex("token_ledger_external_uidx").on(table.externalEventId),
  ],
);

export const marketplaceListings = pgTable(
  "marketplace_listings",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    sellerUserId: text("seller_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    listingType: text("listing_type").notNull().default("sell"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    condition: text("condition").notNull(),
    price: numeric("price", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    locationLabel: text("location_label"),
    status: text("status").notNull().default("draft"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("marketplace_tenant_status_idx").on(table.tenantId, table.status, table.createdAt),
    index("marketplace_seller_idx").on(table.sellerUserId, table.createdAt),
  ],
);

export const marketplaceFavorites = pgTable(
  "marketplace_favorites",
  {
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListings.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.listingId, table.userId] })],
);

export const marketplaceMessages = pgTable(
  "marketplace_messages",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListings.id, { onDelete: "cascade" }),
    senderUserId: text("sender_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("marketplace_messages_listing_idx").on(table.listingId, table.createdAt)],
);

export const marketplaceReports = pgTable(
  "marketplace_reports",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListings.id, { onDelete: "cascade" }),
    reporterUserId: text("reporter_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    details: text("details"),
    status: text("status").notNull().default("open"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [index("marketplace_reports_status_idx").on(table.tenantId, table.status)],
);

export const communityPosts = pgTable(
  "community_posts",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    buildId: uuid("build_id").references(() => projectBuilds.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("build_update"),
    category: text("category").notNull().default("general"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("published"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("community_posts_tenant_idx").on(table.tenantId, table.status, table.createdAt)],
);

export const communityComments = pgTable(
  "community_comments",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id"),
    body: text("body").notNull(),
    status: text("status").notNull().default("published"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("community_comments_post_idx").on(table.postId, table.createdAt)],
);

export const communityReactions = pgTable(
  "community_reactions",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    reaction: text("reaction").notNull().default("like"),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userId, table.reaction] })],
);

export const communityFollows = pgTable(
  "community_follows",
  {
    tenantId: text("tenant_id").notNull(),
    followerUserId: text("follower_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    followedUserId: text("followed_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.followerUserId, table.followedUserId] })],
);

export const communityReports = pgTable(
  "community_reports",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    postId: uuid("post_id").references(() => communityPosts.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => communityComments.id, { onDelete: "cascade" }),
    reporterUserId: text("reporter_user_id")
      .notNull()
      .references(() => torqueshedUsers.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    details: text("details"),
    status: text("status").notNull().default("open"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [index("community_reports_status_idx").on(table.tenantId, table.status)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    actorUserId: text("actor_user_id").references(() => torqueshedUsers.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [index("audit_events_tenant_idx").on(table.tenantId, table.createdAt)],
);

export type Vehicle = typeof vehicles.$inferSelect;
export type DiagnosticSession = typeof diagnosticSessions.$inferSelect;
export type TorqueAssistRequest = typeof torqueAssistRequests.$inferSelect;
export type TokenLedgerEntry = typeof tokenLedgerEntries.$inferSelect;
export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type CommunityPost = typeof communityPosts.$inferSelect;
