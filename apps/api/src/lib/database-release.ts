import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { ensureBaseTables, ensureExtendedTables } from './db-init.js';
import {
  backfillFreeAccountAppsForAllTenants,
  backfillPersonalTenants,
  bootstrapSuperAdmin,
  ensureModuleShellTables,
  ensureSaasTables,
  ensureTenantTables,
  seedDemoCoTenant,
  seedModules,
  seedPlansAndAdmin,
  seedPlatformComponents,
} from './saas-db-init.js';
import { launchFixPostSeed, launchFixPreSeed } from './launch-fix-init.js';
import { ensureDirectoryTables } from './directory-db-init.js';
import { ensureSharedServiceTables } from './shared-services-db-init.js';
import { ensureTradeFlowKitTables } from './tradeflowkit-db-init.js';
import { ensureTechDeckTables } from './techdeck-db-init.js';
import { ensurePulseDeskTables } from './pulsedesk-db-init.js';
import { ensureTorqueShedTables } from './torqueshed-db-init.js';
import { ensureFaultlineLabTables } from './faultlinelab-db-init.js';
import { ensureNinjaPoolHallTables } from './ninja-pool-hall-db-init.js';
import {
  DATABASE_RELEASE_CONTRACT,
  DATABASE_RELEASE_STEPS,
} from './database-release-contract.js';

export { DATABASE_RELEASE_CONTRACT, DATABASE_RELEASE_STEPS };

type DatabaseReleaseStep = (typeof DATABASE_RELEASE_STEPS)[number];
type StepReporter = (event: { phase: 'start' | 'complete'; step: DatabaseReleaseStep }) => void;

const OPERATIONS: Readonly<Record<DatabaseReleaseStep['id'], () => Promise<unknown>>> = {
  base_tables: ensureBaseTables,
  extended_tables: ensureExtendedTables,
  saas_tables: ensureSaasTables,
  tenant_tables: ensureTenantTables,
  directory_tables: ensureDirectoryTables,
  module_tables: ensureModuleShellTables,
  tradeflowkit_tables: ensureTradeFlowKitTables,
  techdeck_tables: ensureTechDeckTables,
  pulsedesk_tables: ensurePulseDeskTables,
  torqueshed_tables: ensureTorqueShedTables,
  faultlinelab_tables: ensureFaultlineLabTables,
  ninja_pool_hall_tables: ensureNinjaPoolHallTables,
  shared_service_tables: ensureSharedServiceTables,
  plans_and_admin: seedPlansAndAdmin,
  launch_fix_pre_seed: launchFixPreSeed,
  platform_components: seedPlatformComponents,
  module_catalog: seedModules,
  personal_tenant_backfill: backfillPersonalTenants,
  super_admin_bootstrap: bootstrapSuperAdmin,
  demo_tenant_seed: seedDemoCoTenant,
  launch_fix_post_seed: launchFixPostSeed,
  free_account_app_backfill: backfillFreeAccountAppsForAllTenants,
};

export async function verifyOperatorOSDatabaseRelease(): Promise<void> {
  const result = await db.execute(sql`
    SELECT
      to_regclass('public.users') IS NOT NULL AS users,
      to_regclass('public.tenants') IS NOT NULL AS tenants,
      to_regclass('public.modules') IS NOT NULL AS modules,
      to_regclass('public.directory_organizations') IS NOT NULL AS directory_organizations,
      to_regclass('public.shared_outbox_messages') IS NOT NULL AS shared_outbox_messages,
      to_regclass('public.shared_usage_events') IS NOT NULL AS shared_usage_events,
      to_regclass('public.tradeflowkit_tasks') IS NOT NULL AS tradeflowkit_tasks,
      to_regclass('public.tradeflowkit_payments') IS NOT NULL AS tradeflowkit_payments,
      to_regclass('public.techdeck_documents') IS NOT NULL AS techdeck_documents,
      to_regclass('public.techdeck_configuration_relationships') IS NOT NULL AS techdeck_configuration_relationships,
      to_regclass('public.pulsedesk_ticket_messages') IS NOT NULL AS pulsedesk_ticket_messages,
      to_regclass('public.pulsedesk_sla_policies') IS NOT NULL AS pulsedesk_sla_policies,
      to_regclass('public.torqueshed_vehicles') IS NOT NULL AS torqueshed_vehicles,
      to_regclass('public.torqueshed_diagnostic_entries') IS NOT NULL AS torqueshed_diagnostic_entries,
      to_regclass('public.torqueshed_assist_requests') IS NOT NULL AS torqueshed_assist_requests,
      to_regclass('public.torqueshed_token_ledger_entries') IS NOT NULL AS torqueshed_token_ledger_entries,
      to_regclass('public.torqueshed_marketplace_listings') IS NOT NULL AS torqueshed_marketplace_listings,
      to_regclass('public.torqueshed_marketplace_messages') IS NOT NULL AS torqueshed_marketplace_messages,
      to_regclass('public.torqueshed_community_posts') IS NOT NULL AS torqueshed_community_posts,
      to_regclass('public.torqueshed_community_comments') IS NOT NULL AS torqueshed_community_comments,
      to_regclass('public.torqueshed_social_reports') IS NOT NULL AS torqueshed_social_reports,
      to_regclass('public.torqueshed_social_moderation_actions') IS NOT NULL AS torqueshed_social_moderation_actions,
      to_regclass('public.faultlinelab_challenges') IS NOT NULL AS faultlinelab_challenges,
      to_regclass('public.faultlinelab_challenge_versions') IS NOT NULL AS faultlinelab_challenge_versions,
      to_regclass('public.faultlinelab_sessions') IS NOT NULL AS faultlinelab_sessions,
      to_regclass('public.faultlinelab_session_actions') IS NOT NULL AS faultlinelab_session_actions,
      to_regclass('public.faultlinelab_submissions') IS NOT NULL AS faultlinelab_submissions,
      to_regclass('public.ninja_pool_player_profiles') IS NOT NULL AS ninja_pool_player_profiles,
      to_regclass('public.ninja_pool_match_sessions') IS NOT NULL AS ninja_pool_match_sessions,
      to_regclass('public.ninja_pool_match_events') IS NOT NULL AS ninja_pool_match_events,
      to_regclass('public.operatoros_token_purchase_intents') IS NOT NULL AS operatoros_token_purchase_intents,
      to_regclass('public.sso_handoff_tokens') IS NOT NULL AS sso_handoff_tokens
  `);
  const row = result.rows[0] as Record<string, boolean> | undefined;
  const missing = Object.entries(row ?? {})
    .filter(([, present]) => present !== true)
    .map(([name]) => name);
  if (!row || missing.length > 0) {
    throw new Error(`OperatorOS database release verification failed: missing ${missing.join(', ') || 'required tables'}`);
  }
}

export async function applyOperatorOSDatabaseRelease(report: StepReporter = () => {}): Promise<void> {
  for (const step of DATABASE_RELEASE_STEPS) {
    report({ phase: 'start', step });
    await OPERATIONS[step.id]();
    report({ phase: 'complete', step });
  }
  await verifyOperatorOSDatabaseRelease();
}
