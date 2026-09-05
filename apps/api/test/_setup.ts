import crypto from 'node:crypto';
import { db } from '../src/db.js';
import {
  users, modules, subscriptionPlans, addonSubscriptions, billingEvents, ssoHandoffTokens, revokedSessionTokens,
  tenants, tenantUsers, tenantModules, tenantUserModuleAccess,
  tenantEntitlements,
  saasWorkspaces, saasProjects, saasTasks, notes, activityFeed,
  usageTracking, aiActionsLog, aiPromptTemplates,
  ninjaPoolMatchEvents, ninjaPoolMatchSessions, ninjaPoolPlayerProfiles,
  ninjaPoolPracticeSessions, ninjaPoolOnlineEvents, ninjaPoolOnlineRooms,
  ninjaPoolOnlineRateLimits,
  moduleWorkflowItems,
  techdeckTickets, techdeckTicketSequences, techdeckAssets, techdeckRunbooks,
  tradeflowkitInvoices, tradeflowkitQuotes, tradeflowkitJobs, tradeflowkitCustomers,
  brandforgeCalendarItems, brandforgeCopyAssets, brandforgeCampaignMetrics,
  brandforgeGenerations, brandforgeCampaigns, brandforgePersonas,
  brandforgeBrands, brandforgeWorkspaceSettings,
} from '../src/schema.js';
import { eq, inArray, or, sql } from 'drizzle-orm';

// DB-backed tests bootstrap production DDL modules dynamically. Provide a
// non-production, test-process-only signing key before those modules load so
// the suite does not depend on a developer shell secret. The dedicated
// session-secret bootstrap tests still spawn isolated processes and override
// this value to prove missing/weak production configuration fails closed.
process.env.SESSION_SECRET ||= 'operatoros-integration-test-session-key-v1';

export const TEST_TAG = 'test-billing-regression';

async function ensureTestPlans() {
  const { PLAN_CONFIGS } = await import('../src/lib/plans.js');
  const canonicalPlans = PLAN_CONFIGS.filter(plan =>
    plan.slug === 'starter' || plan.slug === 'pro' || plan.slug === 'elite'
  );
  const existing = await db.select({ slug: subscriptionPlans.slug })
    .from(subscriptionPlans)
    .where(inArray(subscriptionPlans.slug, canonicalPlans.map(plan => plan.slug)));
  const existingSlugs = new Set(existing.map(plan => plan.slug));
  const missing = canonicalPlans.filter(plan => !existingSlugs.has(plan.slug));
  if (missing.length === 0) return;

  // Test bootstrap needs the canonical tier rows, but must not run the
  // production account seeder: doing so would create or depend on bootstrap
  // admin/demo credentials. Insert only missing plan fixtures and preserve
  // any rows a test database already owns.
  await db.insert(subscriptionPlans).values(missing.map(plan => ({
    name: plan.name,
    slug: plan.slug,
    price: plan.price,
    interval: plan.interval,
    maxWorkspaces: plan.limits.maxWorkspaces,
    maxProjects: plan.limits.maxProjects,
    maxTasks: plan.limits.maxTasks,
    maxTeamMembers: plan.limits.maxTeamMembers,
    maxAiActionsPerMonth: plan.limits.maxAiActionsPerMonth,
    hasExports: plan.features.exports,
    hasAutomation: plan.features.automation,
    hasTemplates: plan.features.templates,
    hasAdvancedAnalytics: plan.features.advancedAnalytics,
  }))).onConflictDoNothing({ target: subscriptionPlans.slug });
}

export async function ensureSchemaReady() {
  const { ensureBaseTables, ensureExtendedTables } = await import('../src/lib/db-init.js');
  const { ensureSaasTables, ensureTenantTables, ensureModuleShellTables } = await import('../src/lib/saas-db-init.js');
  await ensureBaseTables();
  await ensureExtendedTables();
  await ensureSaasTables();
  // Gate 1: tenant DDL must run before any code path that selects from
  // `users` (Drizzle's implicit SELECT * needs the new columns).
  await ensureTenantTables();
  const { ensureDirectoryTables } = await import('../src/lib/directory-db-init.js');
  await ensureDirectoryTables();
  await ensureModuleShellTables();
  const { ensureTradeFlowKitTables } = await import('../src/lib/tradeflowkit-db-init.js');
  await ensureTradeFlowKitTables();
  const { ensureTradeFlowKitSavedViewTables } = await import('../src/lib/tradeflowkit-saved-views-db-init.js');
  await ensureTradeFlowKitSavedViewTables();
  const { ensureTradeFlowKitLeadOperationsTables } = await import('../src/lib/tradeflowkit-lead-operations-db-init.js');
  await ensureTradeFlowKitLeadOperationsTables();
  const { ensureTradeFlowKitPublicOperationsTables } = await import('../src/lib/tradeflowkit-public-operations-db-init.js');
  await ensureTradeFlowKitPublicOperationsTables();
  const { ensureTechDeckTables } = await import('../src/lib/techdeck-db-init.js');
  await ensureTechDeckTables();
  const { ensurePulseDeskTables } = await import('../src/lib/pulsedesk-db-init.js');
  await ensurePulseDeskTables();
  const { ensureTorqueShedTables } = await import('../src/lib/torqueshed-db-init.js');
  await ensureTorqueShedTables();
  const { ensureFaultlineLabTables } = await import('../src/lib/faultlinelab-db-init.js');
  await ensureFaultlineLabTables();
  const { ensureNinjaPoolHallTables } = await import('../src/lib/ninja-pool-hall-db-init.js');
  await ensureNinjaPoolHallTables();
  const { ensureNinjaPoolOnlineTables } = await import('../src/lib/ninja-pool-online-db-init.js');
  await ensureNinjaPoolOnlineTables();
  const { ensureBrandForgeOsTables } = await import('../src/lib/brandforgeos-db-init.js');
  await ensureBrandForgeOsTables();
  const { ensureSharedServiceTables } = await import('../src/lib/shared-services-db-init.js');
  await ensureSharedServiceTables();
  const { ensureSharedPlatformTables } = await import('../src/lib/shared-platform-db-init.js');
  await ensureSharedPlatformTables();
  const { ensurePulseDeskLiteralTables } = await import('../src/lib/pulsedesk-literal-db-init.js');
  await ensurePulseDeskLiteralTables();
  const { ensureBrandForgeOsPhase31Tables } = await import('../src/lib/brandforgeos-phase31-db-init.js');
  await ensureBrandForgeOsPhase31Tables();
  const { ensureTorqueShedWebApiTables } = await import('../src/lib/torqueshed-web-api-db-init.js');
  await ensureTorqueShedWebApiTables();
  const { ensureTorqueShedNativeTables } = await import('../src/lib/torqueshed-native-db-init.js');
  await ensureTorqueShedNativeTables();
  const { ensureTorqueShedStripeCatalogTables } = await import('../src/lib/torqueshed-stripe-catalog-db-init.js');
  await ensureTorqueShedStripeCatalogTables();
  const { ensureTorqueShedCheckoutContract } = await import('../src/lib/torqueshed-checkout-contract-db-init.js');
  await ensureTorqueShedCheckoutContract();
  const { ensureTorqueShedSettlementContract } = await import('../src/lib/torqueshed-settlement-db-init.js');
  await ensureTorqueShedSettlementContract();
  const { ensureTorqueShedReservationContract } = await import('../src/lib/torqueshed-reservation-db-init.js');
  await ensureTorqueShedReservationContract();
  const { ensureTechDeckLiteralTables } = await import('../src/lib/techdeck-literal-db-init.js');
  await ensureTechDeckLiteralTables();
  const { ensureOutCallTables, ensureOutCallProductTables } = await import('../src/lib/outcall-db-init.js');
  await ensureOutCallTables();
  await ensureOutCallProductTables();
  const { ensureOperatorOsMessagingComplianceTables } = await import('../src/lib/operatoros-messaging-compliance-db-init.js');
  await ensureOperatorOsMessagingComplianceTables();
  const { ensureSnapProofOsTables } = await import('../src/lib/snapproofos-db-init.js');
  await ensureSnapProofOsTables();
  const { ensureSnapProofOsPhase32Tables } = await import('../src/lib/snapproofos-phase32-db-init.js');
  await ensureSnapProofOsPhase32Tables();
  const { ensureNinjaLaunchKitTables } = await import('../src/lib/ninja-launch-kit-db-init.js');
  await ensureNinjaLaunchKitTables();
  const { ensureNinjaLaunchKitPhase34Tables } = await import('../src/lib/ninja-launch-kit-phase34-db-init.js');
  await ensureNinjaLaunchKitPhase34Tables();
  const { ensureNinjamationTables } = await import('../src/lib/ninjamation-db-init.js');
  await ensureNinjamationTables();
  const { ensureNinjamationPhase36Tables } = await import('../src/lib/ninjamation-phase36-db-init.js');
  await ensureNinjamationPhase36Tables();
  const { ensureCallCommandTables } = await import('../src/lib/callcommand-db-init.js');
  await ensureCallCommandTables();
  const { ensureCallCommandPhase35Tables } = await import('../src/lib/callcommand-phase35-db-init.js');
  await ensureCallCommandPhase35Tables();
  const { ensureCallCommandMspTables } = await import('../src/lib/callcommand-msp-db-init.js');
  await ensureCallCommandMspTables();
  const { ensureCallCommandCommercialTables } = await import('../src/lib/callcommand-commercial-db-init.js');
  await ensureCallCommandCommercialTables();
  const { ensureCallCommandManagedNumberTables } = await import('../src/lib/callcommand-managed-number-db-init.js');
  await ensureCallCommandManagedNumberTables();
  const { ensureCrossModuleDataFabricTables } = await import('../src/lib/cross-module-data-fabric-db-init.js');
  await ensureCrossModuleDataFabricTables();
  const { ensureTenantMessengerTables } = await import('../src/lib/tenant-messenger-db-init.js');
  await ensureTenantMessengerTables();
  const { ensureIdentityOnboardingIntegrity } = await import('../src/lib/identity-onboarding-db-init.js');
  await ensureIdentityOnboardingIntegrity();
  const { ensureTenantInvitationConsent } = await import('../src/lib/tenant-invitation-consent-db-init.js');
  await ensureTenantInvitationConsent();
  const { ensureAuthMfaTables } = await import('../src/lib/auth-mfa-db-init.js');
  await ensureAuthMfaTables();
  const { ensureCoreSuiteTrialTables } = await import('../src/lib/core-suite-trial-db-init.js');
  await ensureCoreSuiteTrialTables();
  await ensureTestPlans();
  // Ordinary integration tests exercise the current release shape. The
  // dedicated forward-commerce migration contract temporarily removes only
  // these v60 objects on its isolated disposable database so it can prove the
  // one-shot grandfather boundary, then immediately reapplies v60.
  const { ensureForwardCommerceContract } = await import('../src/lib/application-stack-billing-db-init.js');
  await ensureForwardCommerceContract();
}

export function uniqueId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

type TestModuleRow = typeof modules.$inferSelect;

const createdTestModuleIds = new Set<string>();
const shadowedTestModules = new Map<string, { original: TestModuleRow; shadowSlug: string }>();

function testModuleFixtureValues() {
  return {
    name: 'Test Module',
    description: 'fixture',
    baseUrl: 'https://example.test',
    status: 'live' as const,
    planMin: 'starter' as const,
    ord: 0,
    archivedAt: null,
  };
}

// Gate 2: every user lives in a tenant. createTestUser provisions a
// personal tenant + owner membership and points current_tenant_id at it,
// so any test that exercises a tenant-scoped route resolves a real
// tenantId through `users.current_tenant_id` without extra wiring.
export async function createTestUser() {
  const email = `${uniqueId('billing-test')}@test.local`;
  const [u] = await db.insert(users).values({
    email,
    passwordHash: 'x',
    name: 'Test User',
    role: 'user',
    status: 'active',
  }).returning();
  const [tenant] = await db.insert(tenants).values({
    name: 'Personal',
    slug: `personal-${u.id}`,
    type: 'personal',
    ownerUserId: u.id,
  }).returning();
  await db.insert(tenantUsers).values({ tenantId: tenant.id, userId: u.id, role: 'owner' });
  await db.update(users).set({ currentTenantId: tenant.id, updatedAt: new Date() }).where(eq(users.id, u.id));
  return { ...u, currentTenantId: tenant.id };
}

export async function createTestModule(slug?: string) {
  const s = slug ?? uniqueId('test-mod');
  const [existing] = await db.select().from(modules).where(eq(modules.slug, s)).limit(1);
  if (existing) {
    if (createdTestModuleIds.has(existing.id)) return existing;
    const shadowSlug = uniqueId('fixture-shadow').replaceAll('_', '-');
    const fixture = await db.transaction(async (tx) => {
      await tx.update(modules).set({ slug: shadowSlug }).where(eq(modules.id, existing.id));
      const [created] = await tx.insert(modules).values({
        slug: s,
        ...testModuleFixtureValues(),
      }).returning();
      return created;
    });
    createdTestModuleIds.add(fixture.id);
    shadowedTestModules.set(fixture.id, { original: existing, shadowSlug });
    return fixture;
  }
  const [m] = await db.insert(modules).values({
    slug: s,
    ...testModuleFixtureValues(),
  }).returning();
  createdTestModuleIds.add(m.id);
  return m;
}

export async function cleanupUser(userId: string) {
  // Order matters: child rows first, then membership rows, then the
  // personal tenant the user owns, then the user. Each step is wrapped
  // in try/catch so a missing optional table (older schema) doesn't
  // abort the rest of the cleanup.
  try { await db.delete(aiActionsLog).where(eq(aiActionsLog.userId, userId)); } catch {}
  try { await db.delete(aiPromptTemplates).where(eq(aiPromptTemplates.userId, userId)); } catch {}
  try { await db.delete(usageTracking).where(eq(usageTracking.userId, userId)); } catch {}
  try { await db.delete(activityFeed).where(eq(activityFeed.userId, userId)); } catch {}
  try { await db.delete(notes).where(eq(notes.userId, userId)); } catch {}
  try { await db.delete(saasTasks).where(eq(saasTasks.userId, userId)); } catch {}
  try { await db.delete(saasProjects).where(eq(saasProjects.userId, userId)); } catch {}
  try { await db.delete(saasWorkspaces).where(eq(saasWorkspaces.ownerId, userId)); } catch {}
  try { await db.delete(addonSubscriptions).where(eq(addonSubscriptions.userId, userId)); } catch {}
  try { await db.delete(billingEvents).where(eq(billingEvents.userId, userId)); } catch {}
  try { await db.delete(ssoHandoffTokens).where(eq(ssoHandoffTokens.userId, userId)); } catch {}
  try { await db.delete(revokedSessionTokens).where(eq(revokedSessionTokens.userId, userId)); } catch {}
  try { await db.delete(ninjaPoolMatchEvents).where(eq(ninjaPoolMatchEvents.userId, userId)); } catch {}
  try { await db.delete(ninjaPoolMatchSessions).where(eq(ninjaPoolMatchSessions.userId, userId)); } catch {}
  try { await db.delete(ninjaPoolPlayerProfiles).where(eq(ninjaPoolPlayerProfiles.userId, userId)); } catch {}
  try { await db.delete(ninjaPoolPracticeSessions).where(eq(ninjaPoolPracticeSessions.userId, userId)); } catch {}
  try { await db.delete(ninjaPoolOnlineEvents).where(eq(ninjaPoolOnlineEvents.actorUserId, userId)); } catch {}
  try { await db.delete(ninjaPoolOnlineRooms).where(or(eq(ninjaPoolOnlineRooms.hostUserId, userId), eq(ninjaPoolOnlineRooms.guestUserId, userId))); } catch {}
  try { await db.delete(ninjaPoolOnlineRateLimits).where(eq(ninjaPoolOnlineRateLimits.userId, userId)); } catch {}
  try { await db.delete(moduleWorkflowItems).where(eq(moduleWorkflowItems.createdByUserId, userId)); } catch {}
  try { await db.delete(techdeckTickets).where(eq(techdeckTickets.createdByUserId, userId)); } catch {}
  try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.userId, userId)); } catch {}
  try { await db.delete(tenantUsers).where(eq(tenantUsers.userId, userId)); } catch {}
  try {
    // Drop any tenants this user owns (the personal tenant + any leftover
    // company tenants the test forgot to clean). Cascade child rows first.
    const owned = await db.select().from(tenants).where(eq(tenants.ownerUserId, userId));
    for (const t of owned) {
      // Release v53 messenger tables are tenant-owned and cascade on an
      // intentional tenant hard-delete. Explicit cleanup keeps disposable
      // fixture teardown compatible with databases created before v53.
      try { await db.execute(sql`DELETE FROM tenant_messenger_events WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tenant_messenger_messages WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tenant_messenger_participants WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tenant_messenger_presence_connections WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tenant_messenger_presence WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tenant_messenger_conversations WHERE tenant_id = ${t.id}`); } catch {}
      // StudyForge complete-product rows use restrictive tenant/owner keys.
      // Remove both Phase 33 and legacy leaves before shared usage/idempotency
      // records and the owning tenant.
      try { await db.execute(sql`DELETE FROM studyforge_session_card_reviews WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_learning_sessions WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_exam_countdowns WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_short_answers WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_daily_activity WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_generation_reservations WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_usage_counters WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_card_progress WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_quiz_attempts WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_study_sets WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_cards WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_questions WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_plan_sessions WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_decks WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_quizzes WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_plans WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_generations WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_sources WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_subjects WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_folders WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM studyforge_preferences WHERE tenant_id = ${t.id}`); } catch {}
      try {
        await db.transaction(async tx => {
          await tx.execute(sql`SET LOCAL operatoros.tenant_hard_delete = 'on'`);
          await tx.execute(sql`DELETE FROM snapproof_exports WHERE tenant_id = ${t.id}`);
          await tx.execute(sql`DELETE FROM snapproof_custody_events WHERE tenant_id = ${t.id}`);
          await tx.execute(sql`DELETE FROM snapproof_comments WHERE tenant_id = ${t.id}`);
          await tx.execute(sql`DELETE FROM snapproof_findings WHERE tenant_id = ${t.id}`);
          await tx.execute(sql`DELETE FROM snapproof_reports WHERE tenant_id = ${t.id}`);
          await tx.execute(sql`DELETE FROM snapproof_evidence_items WHERE tenant_id = ${t.id}`);
          await tx.execute(sql`DELETE FROM snapproof_cases WHERE tenant_id = ${t.id}`);
          await tx.execute(sql`DELETE FROM snapproof_settings WHERE tenant_id = ${t.id}`);
        });
      } catch {}
      // Shared-service tables deliberately use restrictive foreign keys so
      // tests exercise the same deletion ordering required by production
      // retention workflows. Remove tenant-scoped leaves before the tenant.
      try { await db.execute(sql`DELETE FROM shared_workflow_compensations WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_resource_links WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_event_inbox WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_domain_events WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_workflow_runs WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_workflow_rules WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_resource_references WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_download_grants WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_delivery_attempts WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_webhook_deliveries WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_webhook_endpoints WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_api_tokens WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_service_identities WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_feature_flags WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_search_documents WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_legacy_references WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_notification_suppressions WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_provider_configs WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_secret_references WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_schedules WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_exports WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_notifications WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_outbox_messages WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_jobs WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_webhook_receipts WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_notification_templates WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_attachment_blobs WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM shared_attachments WHERE tenant_id = ${t.id}`); } catch {}
      // TradeFlowKit state-5 leaves are restrictive by design. Tests remove
      // them in dependency order so tenant cleanup exercises production-like
      // retention boundaries without leaking disposable fixtures.
      try { await db.execute(sql`DELETE FROM tradeflowkit_tag_assignments WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tradeflowkit_tags WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tradeflowkit_comments WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tradeflowkit_payments WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tradeflowkit_invoice_items WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tradeflowkit_quote_items WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tradeflowkit_task_dependencies WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tradeflowkit_tasks WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tradeflowkit_migration_refs WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tradeflowkit_sequences WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tradeflowkit_settings WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tradeflowkit_leads WHERE tenant_id = ${t.id}`); } catch {}
      // TechDeck state-5 leaves are likewise tenant-restrictive and must be
      // removed before configuration items, Directory records, and tenants.
      try { await db.execute(sql`DELETE FROM techdeck_document_links WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM techdeck_document_revisions WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM techdeck_evidence WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM techdeck_reports WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM techdeck_time_entries WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM techdeck_ticket_comments WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM techdeck_configuration_relationships WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM techdeck_documents WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM techdeck_document_folders WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM techdeck_migration_refs WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.delete(brandforgeCalendarItems).where(eq(brandforgeCalendarItems.tenantId, t.id)); } catch {}
      try { await db.delete(brandforgeCopyAssets).where(eq(brandforgeCopyAssets.tenantId, t.id)); } catch {}
      try { await db.delete(brandforgeCampaignMetrics).where(eq(brandforgeCampaignMetrics.tenantId, t.id)); } catch {}
      try { await db.delete(brandforgeGenerations).where(eq(brandforgeGenerations.tenantId, t.id)); } catch {}
      try { await db.delete(brandforgeCampaigns).where(eq(brandforgeCampaigns.tenantId, t.id)); } catch {}
      try { await db.delete(brandforgePersonas).where(eq(brandforgePersonas.tenantId, t.id)); } catch {}
      try { await db.delete(brandforgeBrands).where(eq(brandforgeBrands.tenantId, t.id)); } catch {}
      try { await db.delete(brandforgeWorkspaceSettings).where(eq(brandforgeWorkspaceSettings.tenantId, t.id)); } catch {}
      try { await db.delete(ninjaPoolOnlineEvents).where(eq(ninjaPoolOnlineEvents.tenantId, t.id)); } catch {}
      try { await db.delete(ninjaPoolOnlineRooms).where(eq(ninjaPoolOnlineRooms.tenantId, t.id)); } catch {}
      try { await db.delete(ninjaPoolOnlineRateLimits).where(eq(ninjaPoolOnlineRateLimits.tenantId, t.id)); } catch {}
      try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.tenantId, t.id)); } catch {}
      try { await db.delete(moduleWorkflowItems).where(eq(moduleWorkflowItems.tenantId, t.id)); } catch {}
      try { await db.delete(techdeckTickets).where(eq(techdeckTickets.tenantId, t.id)); } catch {}
      try { await db.delete(techdeckTicketSequences).where(eq(techdeckTicketSequences.tenantId, t.id)); } catch {}
      try { await db.delete(techdeckAssets).where(eq(techdeckAssets.tenantId, t.id)); } catch {}
      try { await db.delete(techdeckRunbooks).where(eq(techdeckRunbooks.tenantId, t.id)); } catch {}
      try { await db.delete(tradeflowkitInvoices).where(eq(tradeflowkitInvoices.tenantId, t.id)); } catch {}
      try { await db.delete(tradeflowkitQuotes).where(eq(tradeflowkitQuotes.tenantId, t.id)); } catch {}
      try { await db.delete(tradeflowkitJobs).where(eq(tradeflowkitJobs.tenantId, t.id)); } catch {}
      try { await db.execute(sql`DELETE FROM tradeflowkit_workflow_stages WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM tradeflowkit_workflows WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.delete(tradeflowkitCustomers).where(eq(tradeflowkitCustomers.tenantId, t.id)); } catch {}
      try { await db.execute(sql`DELETE FROM tradeflowkit_customer_profiles WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM directory_tag_assignments WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM directory_tags WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM directory_site_contacts WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM directory_organization_contacts WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM directory_relationships WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM directory_sites WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM directory_addresses WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM directory_contacts WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.execute(sql`DELETE FROM directory_organizations WHERE tenant_id = ${t.id}`); } catch {}
      try { await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, t.id)); } catch {}
      try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, t.id)); } catch {}
      try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, t.id)); } catch {}
      try { await db.delete(tenants).where(eq(tenants.id, t.id)); } catch {}
    }
  } catch {}
  try { await db.delete(users).where(eq(users.id, userId)); } catch {}
}

export async function cleanupModule(moduleId: string) {
  try { await db.delete(addonSubscriptions).where(eq(addonSubscriptions.moduleId, moduleId)); } catch {}
  const shadowed = shadowedTestModules.get(moduleId);
  if (shadowed) {
    const original = shadowed.original;
    const orphanSlug = uniqueId('fixture-cleanup').replaceAll('_', '-');
    await db.transaction(async (tx) => {
      // Free the canonical slug first. If a test forgot a dependent fixture,
      // the production-shaped catalog row is still restored before deletion is
      // attempted and the leaked dependency remains visible as a test failure.
      await tx.update(modules).set({ slug: orphanSlug }).where(eq(modules.id, moduleId));
      await tx.update(modules).set({
        slug: original.slug,
        name: original.name,
        description: original.description,
        iconUrl: original.iconUrl,
        category: original.category,
        componentId: original.componentId,
        baseUrl: original.baseUrl,
        status: original.status,
        planMin: original.planMin,
        requiresOrg: original.requiresOrg,
        ord: original.ord,
        metadata: original.metadata,
        entitlementWebhookUrl: original.entitlementWebhookUrl,
        pushShape: original.pushShape,
        pushAuthMode: original.pushAuthMode,
        pushBearerEnvVar: original.pushBearerEnvVar,
        archivedAt: original.archivedAt,
        updatedAt: original.updatedAt,
      }).where(eq(modules.id, original.id));
    });
    shadowedTestModules.delete(moduleId);
    createdTestModuleIds.delete(moduleId);
    await db.delete(modules).where(eq(modules.id, moduleId));
    return;
  }
  createdTestModuleIds.delete(moduleId);
  try { await db.delete(modules).where(eq(modules.id, moduleId)); } catch {}
}

export interface CapturedLog { stream: 'log' | 'warn' | 'error'; line: string }

export function captureConsole(): { logs: CapturedLog[]; restore: () => void } {
  const logs: CapturedLog[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = (...a: unknown[]) => { logs.push({ stream: 'log', line: a.map(String).join(' ') }); };
  console.warn = (...a: unknown[]) => { logs.push({ stream: 'warn', line: a.map(String).join(' ') }); };
  console.error = (...a: unknown[]) => { logs.push({ stream: 'error', line: a.map(String).join(' ') }); };
  return {
    logs,
    restore() {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    },
  };
}

export function buildAddonCheckoutEvent(opts: {
  userId: string;
  moduleSlug: string;
  eventId?: string;
  stripeSubId?: string;
  customerId?: string;
}) {
  const eventId = opts.eventId ?? uniqueId('evt');
  return {
    id: eventId,
    type: 'checkout.session.completed' as const,
    data: {
      object: {
        id: uniqueId('cs'),
        subscription: opts.stripeSubId ?? uniqueId('sub'),
        customer: opts.customerId ?? uniqueId('cus'),
        amount_total: 1500,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        metadata: {
          type: 'addon',
          kind: 'addon',
          user_id: opts.userId,
          userId: opts.userId,
          module_slug: opts.moduleSlug,
          moduleSlug: opts.moduleSlug,
        },
      },
    },
  };
}
