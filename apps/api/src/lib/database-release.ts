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
import { ensureSharedPlatformTables } from './shared-platform-db-init.js';
import { ensureTradeFlowKitTables } from './tradeflowkit-db-init.js';
import { ensureTechDeckTables } from './techdeck-db-init.js';
import { ensureTechDeckLiteralTables } from './techdeck-literal-db-init.js';
import { ensurePulseDeskTables } from './pulsedesk-db-init.js';
import { ensurePulseDeskLiteralTables } from './pulsedesk-literal-db-init.js';
import { ensureTorqueShedTables } from './torqueshed-db-init.js';
import { ensureTorqueShedWebApiTables } from './torqueshed-web-api-db-init.js';
import { ensureTorqueShedNativeTables } from './torqueshed-native-db-init.js';
import { ensureFaultlineLabTables } from './faultlinelab-db-init.js';
import { ensureNinjaPoolHallTables } from './ninja-pool-hall-db-init.js';
import { ensureNinjaPoolOnlineTables } from './ninja-pool-online-db-init.js';
import { ensureBrandForgeOsTables } from './brandforgeos-db-init.js';
import { ensureBrandForgeOsPhase31Tables } from './brandforgeos-phase31-db-init.js';
import { ensureSnapProofOsTables } from './snapproofos-db-init.js';
import { ensureSnapProofOsPhase32Tables } from './snapproofos-phase32-db-init.js';
import { ensureStudyForgeTables } from './studyforge-db-init.js';
import { ensureStudyForgePhase33Tables } from './studyforge-phase33-db-init.js';
import { ensureNinjaLaunchKitTables } from './ninja-launch-kit-db-init.js';
import { ensureNinjaLaunchKitPhase34Tables } from './ninja-launch-kit-phase34-db-init.js';
import { ensureCallCommandTables } from './callcommand-db-init.js';
import { ensureCallCommandPhase35Tables } from './callcommand-phase35-db-init.js';
import { ensureCallCommandMspTables } from './callcommand-msp-db-init.js';
import { ensureCallCommandCommercialTables } from './callcommand-commercial-db-init.js';
import { ensureCallCommandManagedNumberTables } from './callcommand-managed-number-db-init.js';
import { ensureNinjamationTables } from './ninjamation-db-init.js';
import { ensureNinjamationPhase36Tables } from './ninjamation-phase36-db-init.js';
import { ensureOutCallProductTables, ensureOutCallTables } from './outcall-db-init.js';
import { ensureOperatorOsMessagingComplianceTables } from './operatoros-messaging-compliance-db-init.js';
import { ensureCrossModuleDataFabricTables } from './cross-module-data-fabric-db-init.js';
import { ensureTorqueShedStripeCatalogTables } from './torqueshed-stripe-catalog-db-init.js';
import { ensureTorqueShedCheckoutContract } from './torqueshed-checkout-contract-db-init.js';
import { ensureTorqueShedSettlementContract } from './torqueshed-settlement-db-init.js';
import { ensureTorqueShedReservationContract } from './torqueshed-reservation-db-init.js';
import { ensureTenantMessengerTables } from './tenant-messenger-db-init.js';
import { ensureIdentityOnboardingIntegrity } from './identity-onboarding-db-init.js';
import { ensureTenantInvitationConsent } from './tenant-invitation-consent-db-init.js';
import { ensureAuthMfaTables } from './auth-mfa-db-init.js';
import { ensureTradeFlowKitSavedViewTables } from './tradeflowkit-saved-views-db-init.js';
import { ensureTradeFlowKitLeadOperationsTables } from './tradeflowkit-lead-operations-db-init.js';
import { ensureTradeFlowKitPublicOperationsTables } from './tradeflowkit-public-operations-db-init.js';
import { reconcileTradeFlowKitTenantConstraints } from './tradeflowkit-constraint-reconciliation.js';
import { withDatabaseReleaseLock } from './database-release-lock.js';
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
  pulsedesk_literal_tables: ensurePulseDeskLiteralTables,
  torqueshed_tables: ensureTorqueShedTables,
  faultlinelab_tables: ensureFaultlineLabTables,
  ninja_pool_hall_tables: ensureNinjaPoolHallTables,
  brandforgeos_tables: ensureBrandForgeOsTables,
  shared_service_tables: ensureSharedServiceTables,
  shared_platform_tables: ensureSharedPlatformTables,
  techdeck_literal_tables: ensureTechDeckLiteralTables,
  snapproofos_tables: ensureSnapProofOsTables,
  studyforge_tables: ensureStudyForgeTables,
  ninja_launch_kit_tables: ensureNinjaLaunchKitTables,
  callcommand_tables: ensureCallCommandTables,
  ninjamation_tables: ensureNinjamationTables,
  outcall_tables: ensureOutCallTables,
  plans_and_admin: seedPlansAndAdmin,
  launch_fix_pre_seed: launchFixPreSeed,
  platform_components: seedPlatformComponents,
  module_catalog: seedModules,
  personal_tenant_backfill: backfillPersonalTenants,
  super_admin_bootstrap: bootstrapSuperAdmin,
  demo_tenant_seed: seedDemoCoTenant,
  launch_fix_post_seed: launchFixPostSeed,
  free_account_app_backfill: backfillFreeAccountAppsForAllTenants,
  tradeflowkit_saved_views: ensureTradeFlowKitSavedViewTables,
  tradeflowkit_lead_operations: ensureTradeFlowKitLeadOperationsTables,
  tradeflowkit_public_operations: ensureTradeFlowKitPublicOperationsTables,
  outcall_product_operations: ensureOutCallProductTables,
  operatoros_messaging_compliance_tables: ensureOperatorOsMessagingComplianceTables,
  torqueshed_web_api_tables: ensureTorqueShedWebApiTables,
  ninja_pool_online_tables: ensureNinjaPoolOnlineTables,
  brandforgeos_complete_product_tables: ensureBrandForgeOsPhase31Tables,
  snapproofos_complete_product_tables: ensureSnapProofOsPhase32Tables,
  studyforge_complete_product_tables: ensureStudyForgePhase33Tables,
  ninja_launch_kit_complete_product_tables: ensureNinjaLaunchKitPhase34Tables,
  callcommand_complete_product_tables: ensureCallCommandPhase35Tables,
  ninjamation_complete_product_tables: ensureNinjamationPhase36Tables,
  callcommand_msp_automation_fabric_tables: ensureCallCommandMspTables,
  torqueshed_native_tables: ensureTorqueShedNativeTables,
  cross_module_data_fabric_tables: ensureCrossModuleDataFabricTables,
  torqueshed_stripe_credit_catalog: ensureTorqueShedStripeCatalogTables,
  torqueshed_checkout_contract: ensureTorqueShedCheckoutContract,
  torqueshed_settlement_contract: ensureTorqueShedSettlementContract,
  torqueshed_reservation_contract: ensureTorqueShedReservationContract,
  tenant_messenger_tables: ensureTenantMessengerTables,
  identity_onboarding_integrity: ensureIdentityOnboardingIntegrity,
  tenant_invitation_consent: ensureTenantInvitationConsent,
  auth_mfa_tables: ensureAuthMfaTables,
  callcommand_commercial_runtime: ensureCallCommandCommercialTables,
  callcommand_managed_number_provisioning: ensureCallCommandManagedNumberTables,
  tradeflowkit_constraint_reconciliation: reconcileTradeFlowKitTenantConstraints,
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
      to_regclass('public.shared_provider_configs') IS NOT NULL AS shared_provider_configs,
      to_regclass('public.shared_webhook_deliveries') IS NOT NULL AS shared_webhook_deliveries,
      to_regclass('public.shared_exports') IS NOT NULL AS shared_exports,
      to_regclass('public.shared_api_tokens') IS NOT NULL AS shared_api_tokens,
      to_regclass('public.shared_search_documents') IS NOT NULL AS shared_search_documents,
      to_regclass('public.tradeflowkit_tasks') IS NOT NULL AS tradeflowkit_tasks,
      to_regclass('public.tradeflowkit_workflows') IS NOT NULL AS tradeflowkit_workflows,
      to_regclass('public.tradeflowkit_workflow_stages') IS NOT NULL AS tradeflowkit_workflow_stages,
      to_regclass('public.tradeflowkit_payments') IS NOT NULL AS tradeflowkit_payments,
      to_regclass('public.tradeflowkit_saved_views') IS NOT NULL AS tradeflowkit_saved_views,
      to_regclass('public.tradeflowkit_lead_settings') IS NOT NULL AS tradeflowkit_lead_settings,
      to_regclass('public.tradeflowkit_lead_capture_forms') IS NOT NULL AS tradeflowkit_lead_capture_forms,
      to_regclass('public.tradeflowkit_lead_followups') IS NOT NULL AS tradeflowkit_lead_followups,
      to_regclass('public.tradeflowkit_lead_source_events') IS NOT NULL AS tradeflowkit_lead_source_events,
      to_regclass('public.tradeflowkit_public_intake_rate_limits') IS NOT NULL AS tradeflowkit_public_intake_rate_limits,
      to_regclass('public.tradeflowkit_payment_provider_accounts') IS NOT NULL AS tradeflowkit_payment_provider_accounts,
      to_regclass('public.tradeflowkit_payment_oauth_states') IS NOT NULL AS tradeflowkit_payment_oauth_states,
      to_regclass('public.techdeck_documents') IS NOT NULL AS techdeck_documents,
      to_regclass('public.techdeck_configuration_relationships') IS NOT NULL AS techdeck_configuration_relationships,
      to_regclass('public.techdeck_portal_assignments') IS NOT NULL AS techdeck_portal_assignments,
      to_regclass('public.techdeck_appointments') IS NOT NULL AS techdeck_appointments,
      to_regclass('public.techdeck_license_products') IS NOT NULL AS techdeck_license_products,
      to_regclass('public.techdeck_status_pages') IS NOT NULL AS techdeck_status_pages,
      to_regclass('public.techdeck_intake_requests') IS NOT NULL AS techdeck_intake_requests,
      to_regclass('public.techdeck_evidence_file_links') IS NOT NULL AS techdeck_evidence_file_links,
      to_regclass('public.pulsedesk_ticket_messages') IS NOT NULL AS pulsedesk_ticket_messages,
      to_regclass('public.pulsedesk_sla_policies') IS NOT NULL AS pulsedesk_sla_policies,
      to_regclass('public.pulsedesk_mail_connectors') IS NOT NULL AS pulsedesk_mail_connectors,
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
      to_regclass('public.torqueshed_build_journal_entries') IS NOT NULL AS torqueshed_build_journal_entries,
      to_regclass('public.torqueshed_build_parts') IS NOT NULL AS torqueshed_build_parts,
      to_regclass('public.torqueshed_live_bays') IS NOT NULL AS torqueshed_live_bays,
      to_regclass('public.torqueshed_live_bay_messages') IS NOT NULL AS torqueshed_live_bay_messages,
      to_regclass('public.torqueshed_share_links') IS NOT NULL AS torqueshed_share_links,
      to_regclass('public.torqueshed_user_settings') IS NOT NULL AS torqueshed_user_settings,
      to_regclass('public.torqueshed_native_authorization_codes') IS NOT NULL AS torqueshed_native_authorization_codes,
      to_regclass('public.torqueshed_native_sessions') IS NOT NULL AS torqueshed_native_sessions,
      to_regclass('public.faultlinelab_challenges') IS NOT NULL AS faultlinelab_challenges,
      to_regclass('public.faultlinelab_challenge_versions') IS NOT NULL AS faultlinelab_challenge_versions,
      to_regclass('public.faultlinelab_sessions') IS NOT NULL AS faultlinelab_sessions,
      to_regclass('public.faultlinelab_session_actions') IS NOT NULL AS faultlinelab_session_actions,
      to_regclass('public.faultlinelab_submissions') IS NOT NULL AS faultlinelab_submissions,
      to_regclass('public.ninja_pool_player_profiles') IS NOT NULL AS ninja_pool_player_profiles,
      to_regclass('public.ninja_pool_match_sessions') IS NOT NULL AS ninja_pool_match_sessions,
      to_regclass('public.ninja_pool_match_events') IS NOT NULL AS ninja_pool_match_events,
      to_regclass('public.ninja_pool_online_rooms') IS NOT NULL AS ninja_pool_online_rooms,
      to_regclass('public.ninja_pool_online_events') IS NOT NULL AS ninja_pool_online_events,
      to_regclass('public.ninja_pool_online_rate_limits') IS NOT NULL AS ninja_pool_online_rate_limits,
      to_regclass('public.brandforge_brands') IS NOT NULL AS brandforge_brands,
      to_regclass('public.brandforge_campaigns') IS NOT NULL AS brandforge_campaigns,
      to_regclass('public.brandforge_copy_assets') IS NOT NULL AS brandforge_copy_assets,
      to_regclass('public.brandforge_generations') IS NOT NULL AS brandforge_generations,
      to_regclass('public.brandforge_offers') IS NOT NULL AS brandforge_offers,
      to_regclass('public.brandforge_campaign_tasks') IS NOT NULL AS brandforge_campaign_tasks,
      to_regclass('public.brandforge_campaign_comments') IS NOT NULL AS brandforge_campaign_comments,
      to_regclass('public.brandforge_landing_pages') IS NOT NULL AS brandforge_landing_pages,
      to_regclass('public.brandforge_ai_workflows') IS NOT NULL AS brandforge_ai_workflows,
      to_regclass('public.brandforge_templates') IS NOT NULL AS brandforge_templates,
      to_regclass('public.brandforge_integrations') IS NOT NULL AS brandforge_integrations,
      to_regclass('public.brandforge_sync_runs') IS NOT NULL AS brandforge_sync_runs,
      to_regclass('public.brandforge_recommendations') IS NOT NULL AS brandforge_recommendations,
      to_regclass('public.brandforge_lead_submissions') IS NOT NULL AS brandforge_lead_submissions,
      to_regclass('public.brandforge_reports') IS NOT NULL AS brandforge_reports,
      to_regclass('public.brandforge_export_jobs') IS NOT NULL AS brandforge_export_jobs,
      to_regclass('public.brandforge_credit_counters') IS NOT NULL AS brandforge_credit_counters,
      to_regclass('public.snapproof_cases') IS NOT NULL AS snapproof_cases,
      to_regclass('public.snapproof_evidence_items') IS NOT NULL AS snapproof_evidence_items,
      to_regclass('public.snapproof_custody_events') IS NOT NULL AS snapproof_custody_events,
      to_regclass('public.snapproof_reports') IS NOT NULL AS snapproof_reports,
      to_regclass('public.studyforge_subjects') IS NOT NULL AS studyforge_subjects,
      to_regclass('public.studyforge_sources') IS NOT NULL AS studyforge_sources,
      to_regclass('public.studyforge_decks') IS NOT NULL AS studyforge_decks,
      to_regclass('public.studyforge_cards') IS NOT NULL AS studyforge_cards,
      to_regclass('public.studyforge_quizzes') IS NOT NULL AS studyforge_quizzes,
      to_regclass('public.studyforge_plans') IS NOT NULL AS studyforge_plans,
      to_regclass('public.studyforge_card_progress') IS NOT NULL AS studyforge_card_progress,
      to_regclass('public.studyforge_study_sets') IS NOT NULL AS studyforge_study_sets,
      to_regclass('public.studyforge_short_answers') IS NOT NULL AS studyforge_short_answers,
      to_regclass('public.studyforge_daily_activity') IS NOT NULL AS studyforge_daily_activity,
      to_regclass('public.studyforge_generation_reservations') IS NOT NULL AS studyforge_generation_reservations,
      to_regclass('public.launchkit_launches') IS NOT NULL AS launchkit_launches,
      to_regclass('public.launchkit_tasks') IS NOT NULL AS launchkit_tasks,
      to_regclass('public.launchkit_artifacts') IS NOT NULL AS launchkit_artifacts,
      to_regclass('public.launchkit_exports') IS NOT NULL AS launchkit_exports,
      to_regclass('public.launchkit_brand_profiles') IS NOT NULL AS launchkit_brand_profiles,
      to_regclass('public.launchkit_product_kits') IS NOT NULL AS launchkit_product_kits,
      to_regclass('public.launchkit_product_revisions') IS NOT NULL AS launchkit_product_revisions,
      to_regclass('public.launchkit_product_exports') IS NOT NULL AS launchkit_product_exports,
      to_regclass('public.launchkit_usage_counters') IS NOT NULL AS launchkit_usage_counters,
      to_regclass('public.callcommand_channels') IS NOT NULL AS callcommand_channels,
      to_regclass('public.callcommand_consents') IS NOT NULL AS callcommand_consents,
      to_regclass('public.callcommand_calls') IS NOT NULL AS callcommand_calls,
      to_regclass('public.callcommand_events') IS NOT NULL AS callcommand_events,
      to_regclass('public.callcommand_flows') IS NOT NULL AS callcommand_flows,
      to_regclass('public.callcommand_flow_versions') IS NOT NULL AS callcommand_flow_versions,
      to_regclass('public.callcommand_flow_traces') IS NOT NULL AS callcommand_flow_traces,
      to_regclass('public.callcommand_live_sessions') IS NOT NULL AS callcommand_live_sessions,
      to_regclass('public.callcommand_ingestion_tokens') IS NOT NULL AS callcommand_ingestion_tokens,
      to_regclass('public.callcommand_ingestion_events') IS NOT NULL AS callcommand_ingestion_events,
      to_regclass('public.callcommand_upload_intents') IS NOT NULL AS callcommand_upload_intents,
      to_regclass('public.callcommand_automation_rules') IS NOT NULL AS callcommand_automation_rules,
      to_regclass('public.callcommand_tickets') IS NOT NULL AS callcommand_tickets,
      to_regclass('public.callcommand_leads') IS NOT NULL AS callcommand_leads,
      to_regclass('public.callcommand_tasks') IS NOT NULL AS callcommand_tasks,
      to_regclass('public.callcommand_action_runs') IS NOT NULL AS callcommand_action_runs,
      to_regclass('public.callcommand_transfer_logs') IS NOT NULL AS callcommand_transfer_logs,
      to_regclass('public.callcommand_reports') IS NOT NULL AS callcommand_reports,
      to_regclass('public.callcommand_msp_settings') IS NOT NULL AS callcommand_msp_settings,
      to_regclass('public.callcommand_organization_profiles') IS NOT NULL AS callcommand_organization_profiles,
      to_regclass('public.automation_fabric_integrations') IS NOT NULL AS automation_fabric_integrations,
      to_regclass('public.callcommand_trusted_originating_lines') IS NOT NULL AS callcommand_trusted_originating_lines,
      to_regclass('public.callcommand_contact_profiles') IS NOT NULL AS callcommand_contact_profiles,
      to_regclass('public.callcommand_support_links') IS NOT NULL AS callcommand_support_links,
      to_regclass('public.callcommand_msp_call_contexts') IS NOT NULL AS callcommand_msp_call_contexts,
      to_regclass('public.callcommand_msp_call_events') IS NOT NULL AS callcommand_msp_call_events,
      to_regclass('public.callcommand_local_cases') IS NOT NULL AS callcommand_local_cases,
      to_regclass('public.automation_fabric_action_catalog') IS NOT NULL AS automation_fabric_action_catalog,
      to_regclass('public.callcommand_action_requests') IS NOT NULL AS callcommand_action_requests,
      to_regclass('public.callcommand_policy_decisions') IS NOT NULL AS callcommand_policy_decisions,
      to_regclass('public.callcommand_verification_challenges') IS NOT NULL AS callcommand_verification_challenges,
      to_regclass('public.callcommand_reset_sessions') IS NOT NULL AS callcommand_reset_sessions,
      to_regclass('public.callcommand_integration_outbox') IS NOT NULL AS callcommand_integration_outbox,
      to_regclass('public.ninjamation_scripts') IS NOT NULL AS ninjamation_scripts,
      to_regclass('public.ninjamation_script_versions') IS NOT NULL AS ninjamation_script_versions,
      to_regclass('public.ninjamation_reviews') IS NOT NULL AS ninjamation_reviews,
      to_regclass('public.ninjamation_downloads') IS NOT NULL AS ninjamation_downloads,
      to_regclass('public.ninjamation_generations') IS NOT NULL AS ninjamation_generations,
      to_regclass('public.ninjamation_favorites') IS NOT NULL AS ninjamation_favorites,
      to_regclass('public.ninjamation_sync_runs') IS NOT NULL AS ninjamation_sync_runs,
      to_regclass('public.ninjamation_sync_items') IS NOT NULL AS ninjamation_sync_items,
      to_regclass('public.ninjamation_usage_counters') IS NOT NULL AS ninjamation_usage_counters,
      to_regclass('public.outcall_settings') IS NOT NULL AS outcall_settings,
      to_regclass('public.outcall_phone_owners') IS NOT NULL AS outcall_phone_owners,
      to_regclass('public.outcall_profiles') IS NOT NULL AS outcall_profiles,
      to_regclass('public.outcall_triggers') IS NOT NULL AS outcall_triggers,
      to_regclass('public.outcall_call_requests') IS NOT NULL AS outcall_call_requests,
      to_regclass('public.outcall_events') IS NOT NULL AS outcall_events,
      to_regclass('public.outcall_rate_limits') IS NOT NULL AS outcall_rate_limits,
      to_regclass('public.operatoros_token_purchase_intents') IS NOT NULL AS operatoros_token_purchase_intents,
      to_regclass('public.sso_handoff_tokens') IS NOT NULL AS sso_handoff_tokens,
      to_regclass('public.operatoros_sms_consent_records') IS NOT NULL AS operatoros_sms_consent_records,
      to_regclass('public.operatoros_sms_consent_events') IS NOT NULL AS operatoros_sms_consent_events,
      to_regclass('public.operatoros_sms_consent_rate_limits') IS NOT NULL AS operatoros_sms_consent_rate_limits
      ,to_regclass('public.shared_resource_references') IS NOT NULL AS shared_resource_references
      ,to_regclass('public.shared_workflow_rules') IS NOT NULL AS shared_workflow_rules
      ,to_regclass('public.shared_workflow_runs') IS NOT NULL AS shared_workflow_runs
      ,to_regclass('public.shared_domain_events') IS NOT NULL AS shared_domain_events
      ,to_regclass('public.shared_event_inbox') IS NOT NULL AS shared_event_inbox
      ,to_regclass('public.shared_resource_links') IS NOT NULL AS shared_resource_links
      ,to_regclass('public.shared_workflow_compensations') IS NOT NULL AS shared_workflow_compensations
      ,to_regclass('public.torqueshed_stripe_credit_catalog') IS NOT NULL AS torqueshed_stripe_credit_catalog
      ,(
        SELECT COUNT(*) = 9
        FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='operatoros_token_purchase_intents'
          AND column_name IN (
            'diagnostic_session_id','catalog_version','stripe_account_id',
            'provider_product_id','provider_price_id','success_return_url',
            'cancel_return_url','checkout_created_at','failed_at'
          )
      ) AS torqueshed_checkout_contract
      ,to_regclass('public.torqueshed_credit_policy_holds') IS NOT NULL AS torqueshed_settlement_contract
      ,to_regclass('public.torqueshed_token_reservations') IS NOT NULL AS torqueshed_reservation_contract
      ,to_regclass('public.tenant_messenger_conversations') IS NOT NULL AS tenant_messenger_conversations
      ,to_regclass('public.tenant_messenger_participants') IS NOT NULL AS tenant_messenger_participants
      ,to_regclass('public.tenant_messenger_messages') IS NOT NULL AS tenant_messenger_messages
      ,to_regclass('public.tenant_messenger_presence') IS NOT NULL AS tenant_messenger_presence
      ,to_regclass('public.tenant_messenger_presence_connections') IS NOT NULL AS tenant_messenger_presence_connections
      ,to_regclass('public.tenant_messenger_events') IS NOT NULL AS tenant_messenger_events
      ,EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tenant_invites'
          AND column_name = 'declined_at'
      )
      AND EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tenant_invites_single_decision_check'
          AND conrelid = 'public.tenant_invites'::regclass
      )
      AND to_regclass('public.idx_tenant_invites_pending') IS NOT NULL
      AS tenant_invitation_consent
      ,to_regclass('public.auth_mfa_totp') IS NOT NULL
      AND to_regclass('public.auth_mfa_recovery_codes') IS NOT NULL
      AND to_regclass('public.auth_mfa_login_challenges') IS NOT NULL
      AND to_regclass('public.idx_auth_mfa_recovery_active') IS NOT NULL
      AND to_regclass('public.idx_auth_mfa_challenge_user_active') IS NOT NULL
      AS auth_mfa_tables
      ,to_regclass('public.callcommand_tenant_runtime_settings') IS NOT NULL
      AND to_regclass('public.callcommand_telephony_accounts') IS NOT NULL
      AND to_regclass('public.callcommand_number_orders') IS NOT NULL
      AND to_regclass('public.callcommand_capacity_entitlements') IS NOT NULL
      AND to_regclass('public.callcommand_lane_leases') IS NOT NULL
      AND to_regclass('public.callcommand_usage_events') IS NOT NULL
      AND to_regclass('public.callcommand_agent_knowledge') IS NOT NULL
      AND to_regclass('public.callcommand_transfer_verifications') IS NOT NULL
      AND to_regclass('public.uq_callcommand_live_session_active_call') IS NOT NULL
      AND to_regclass('public.uq_callcommand_live_session_active_provider') IS NOT NULL
      AS callcommand_commercial_runtime
      ,to_regclass('public.callcommand_number_billing_entitlements') IS NOT NULL
      AND to_regclass('public.callcommand_number_reconciliation_issues') IS NOT NULL
      AND to_regclass('public.uq_callcommand_number_order_provider_number_provision') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='callcommand_channels' AND column_name='lifecycle_state'
      )
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='callcommand_number_orders' AND column_name='provisioning_state'
      )
      AS callcommand_managed_number_provisioning
      ,to_regclass('public.uq_tfk_customers_tenant_id') IS NOT NULL
      AND to_regclass('public.uq_tfk_jobs_tenant_id') IS NOT NULL
      AND to_regclass('public.uq_tfk_quotes_tenant_id') IS NOT NULL
      AND to_regclass('public.uq_tfk_invoices_tenant_id') IS NOT NULL
      AND (
        SELECT COUNT(DISTINCT conname) = 13
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname IN (
            'uq_tfk_workflows_tenant_id',
            'uq_tfk_workflow_stages_tenant_id',
            'tfk_workflow_stages_workflow_fk',
            'uq_tfk_tasks_tenant_id',
            'tfk_tasks_job_tenant_fk',
            'tfk_tasks_workflow_stage_tenant_fk',
            'tfk_task_dependencies_task_fk',
            'tfk_task_dependencies_parent_fk',
            'tfk_quote_items_quote_fk',
            'tfk_invoice_items_invoice_fk',
            'tfk_payments_invoice_fk',
            'uq_tfk_tags_tenant_id',
            'tfk_tag_assignments_tag_fk'
          )
      )
      AS tradeflowkit_tenant_constraints
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
  await withDatabaseReleaseLock(async () => {
    for (const step of DATABASE_RELEASE_STEPS) {
      report({ phase: 'start', step });
      await OPERATIONS[step.id]();
      report({ phase: 'complete', step });
    }
    await verifyOperatorOSDatabaseRelease();
  });
}
