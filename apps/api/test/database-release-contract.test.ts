import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
process.env.SESSION_SECRET ||= 'database-release-contract-test-secret-32-plus';

test('database release plan is explicit, ordered, additive, and reusable by startup', async () => {
  const release = await import('../src/lib/database-release.js');
  assert.equal(release.DATABASE_RELEASE_CONTRACT.contractVersion, 1);
  assert.equal(release.DATABASE_RELEASE_CONTRACT.releaseVersion, 49);
  assert.equal(release.DATABASE_RELEASE_CONTRACT.releaseVersion, release.DATABASE_RELEASE_STEPS.length);
  assert.equal(release.DATABASE_RELEASE_CONTRACT.destructive, false);
  assert.equal(release.DATABASE_RELEASE_STEPS.length, 49);
  assert.equal(new Set(release.DATABASE_RELEASE_STEPS.map((step: { id: string }) => step.id)).size, 49);
  assert.equal(release.DATABASE_RELEASE_STEPS[0].id, 'base_tables');
  assert.equal(release.DATABASE_RELEASE_STEPS.at(-1).id, 'torqueshed_stripe_credit_catalog');
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'torqueshed_stripe_credit_catalog')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'cross_module_data_fabric_tables'),
    'TorqueShed durable Stripe mappings must be an additive release step after v48',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'cross_module_data_fabric_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'torqueshed_native_tables'),
    'cross-module data fabric persistence must be an additive release step after v47',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'callcommand_msp_automation_fabric_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'ninjamation_complete_product_tables'),
    'CallCommand MSP and Automation Fabric persistence must be an additive release step after v45',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'ninjamation_complete_product_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'callcommand_complete_product_tables'),
    'Ninjamation complete product persistence must be an additive release step after v44',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'callcommand_complete_product_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'ninja_launch_kit_complete_product_tables'),
    'CallCommand complete telephony persistence must be an additive release step after v43',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'studyforge_complete_product_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'snapproofos_complete_product_tables'),
    'StudyForge complete learning persistence must be an additive release step after v41',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'tradeflowkit_saved_views')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'free_account_app_backfill'),
    'saved views must be a new additive release step instead of changing the v29 TradeFlowKit initializer',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'tradeflowkit_lead_operations')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'tradeflowkit_saved_views'),
    'lead operations must be a new additive release step instead of changing the v30 saved-views initializer',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'tradeflowkit_public_operations')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'tradeflowkit_lead_operations'),
    'public intake and business payments must be a new additive release step instead of changing the v31 lead initializer',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'outcall_product_operations')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'tradeflowkit_public_operations'),
    'OutCall provider and privacy controls must be an additive release step after v32',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'techdeck_literal_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'outcall_product_operations'),
    'TechDeck literal restoration must remain a new additive release step after v34',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'pulsedesk_literal_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'techdeck_literal_tables'),
    'PulseDesk literal restoration must remain a new additive release step after v35',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'operatoros_messaging_compliance_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'pulsedesk_literal_tables'),
    'platform messaging consent evidence must be an additive release step after v36',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'torqueshed_web_api_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'operatoros_messaging_compliance_tables'),
    'TorqueShed Phase 28 web/API tables must be an additive release step after v37',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'ninja_pool_online_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'torqueshed_web_api_tables'),
    'Ninja Pool Hall online authority must be an additive release step after v38',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'torqueshed_native_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'callcommand_msp_automation_fabric_tables'),
    'TorqueShed Phase 29 native sessions must be an additive release step after v46',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'directory_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'tenant_tables'),
    'directory tables must follow tenant authority',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'directory_tables')
      < release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'module_tables'),
    'module tables and profiles must follow the shared directory',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'tradeflowkit_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'module_tables'),
    'TradeFlowKit tables must follow shared directory-backed module profiles',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'techdeck_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'tradeflowkit_tables'),
    'TechDeck tables must follow shared Directory and normalized TradeFlowKit tables',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'pulsedesk_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'techdeck_tables'),
    'PulseDesk tables must follow shared Directory and TechDeck boundary tables',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'torqueshed_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'pulsedesk_tables'),
    'TorqueShed tables must follow the completed core module foundations',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'faultlinelab_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'torqueshed_tables'),
    'FaultlineLab tables must follow TorqueShed and the completed core module foundations',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'shared_service_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'ninja_pool_hall_tables'),
    'shared services must follow tenant, directory, and active module tables',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'shared_platform_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'shared_service_tables'),
    'Phase 22 control-plane tables must extend the existing shared service foundation additively',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'ninja_pool_hall_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'faultlinelab_tables'),
    'Ninja Pool Hall tables must follow the previously accepted module foundations',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'brandforgeos_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'ninja_pool_hall_tables'),
    'BrandForgeOS tables must follow the previously accepted module foundations',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'snapproofos_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'shared_service_tables'),
    'SnapProofOS evidence tables must follow the shared private attachment service',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'studyforge_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'snapproofos_tables'),
    'StudyForge learning tables must follow shared attachments and the prior accepted modules',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'ninja_launch_kit_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'studyforge_tables'),
    'Ninja Launch Kit tables must follow shared services and prior accepted modules',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'callcommand_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'ninja_launch_kit_tables'),
    'CallCommand tables must follow the prior accepted module foundations',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'ninjamation_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'callcommand_tables'),
    'Ninjamation tables must follow the prior accepted module foundations',
  );
  assert.ok(
    release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'outcall_tables')
      > release.DATABASE_RELEASE_STEPS.findIndex((step: { id: string }) => step.id === 'ninjamation_tables'),
    'OutCall tables must follow shared services and the CallCommand boundary',
  );

  const api = read('apps/api/src/index.ts');
  const releaseSource = read('apps/api/src/lib/database-release.ts');
  assert.match(api, /applyOperatorOSDatabaseRelease/);
  assert.match(api, /OPERATOROS_DATABASE_RELEASE_APPLIED/);
  assert.doesNotMatch(api, /await ensureBaseTables\(\)/);
  assert.match(releaseSource, /to_regclass\('public\.sso_handoff_tokens'\)/);
  assert.match(releaseSource, /to_regclass\('public\.directory_organizations'\)/);
  assert.match(releaseSource, /to_regclass\('public\.shared_outbox_messages'\)/);
  assert.match(releaseSource, /to_regclass\('public\.shared_usage_events'\)/);
  assert.match(releaseSource, /to_regclass\('public\.shared_provider_configs'\)/);
  assert.match(releaseSource, /to_regclass\('public\.shared_webhook_deliveries'\)/);
  assert.match(releaseSource, /to_regclass\('public\.shared_exports'\)/);
  assert.match(releaseSource, /to_regclass\('public\.shared_api_tokens'\)/);
  assert.match(releaseSource, /to_regclass\('public\.shared_search_documents'\)/);
  assert.match(releaseSource, /to_regclass\('public\.outcall_call_requests'\)/);
  assert.match(releaseSource, /to_regclass\('public\.tradeflowkit_tasks'\)/);
  assert.match(releaseSource, /to_regclass\('public\.tradeflowkit_workflows'\)/);
  assert.match(releaseSource, /to_regclass\('public\.tradeflowkit_workflow_stages'\)/);
  assert.match(releaseSource, /to_regclass\('public\.tradeflowkit_payments'\)/);
  assert.match(releaseSource, /to_regclass\('public\.tradeflowkit_saved_views'\)/);
  assert.match(releaseSource, /to_regclass\('public\.tradeflowkit_lead_settings'\)/);
  assert.match(releaseSource, /to_regclass\('public\.tradeflowkit_lead_capture_forms'\)/);
  assert.match(releaseSource, /to_regclass\('public\.tradeflowkit_lead_followups'\)/);
  assert.match(releaseSource, /to_regclass\('public\.tradeflowkit_lead_source_events'\)/);
  assert.match(releaseSource, /to_regclass\('public\.tradeflowkit_public_intake_rate_limits'\)/);
  assert.match(releaseSource, /to_regclass\('public\.tradeflowkit_payment_provider_accounts'\)/);
  assert.match(releaseSource, /to_regclass\('public\.tradeflowkit_payment_oauth_states'\)/);
  assert.match(releaseSource, /to_regclass\('public\.techdeck_documents'\)/);
  assert.match(releaseSource, /to_regclass\('public\.techdeck_configuration_relationships'\)/);
  assert.match(releaseSource, /to_regclass\('public\.techdeck_portal_assignments'\)/);
  assert.match(releaseSource, /to_regclass\('public\.techdeck_license_products'\)/);
  assert.match(releaseSource, /to_regclass\('public\.techdeck_status_pages'\)/);
  assert.match(releaseSource, /to_regclass\('public\.techdeck_intake_requests'\)/);
  assert.match(releaseSource, /to_regclass\('public\.pulsedesk_ticket_messages'\)/);
  assert.match(releaseSource, /to_regclass\('public\.pulsedesk_sla_policies'\)/);
  assert.match(releaseSource, /to_regclass\('public\.pulsedesk_mail_connectors'\)/);
  assert.match(releaseSource, /to_regclass\('public\.torqueshed_vehicles'\)/);
  assert.match(releaseSource, /to_regclass\('public\.torqueshed_diagnostic_entries'\)/);
  assert.match(releaseSource, /to_regclass\('public\.torqueshed_assist_requests'\)/);
  assert.match(releaseSource, /to_regclass\('public\.torqueshed_token_ledger_entries'\)/);
  assert.match(releaseSource, /to_regclass\('public\.torqueshed_marketplace_listings'\)/);
  assert.match(releaseSource, /to_regclass\('public\.torqueshed_marketplace_messages'\)/);
  assert.match(releaseSource, /to_regclass\('public\.torqueshed_community_posts'\)/);
  assert.match(releaseSource, /to_regclass\('public\.torqueshed_community_comments'\)/);
  assert.match(releaseSource, /to_regclass\('public\.torqueshed_social_reports'\)/);
  assert.match(releaseSource, /to_regclass\('public\.torqueshed_social_moderation_actions'\)/);
  assert.match(releaseSource, /to_regclass\('public\.torqueshed_build_journal_entries'\)/);
  assert.match(releaseSource, /to_regclass\('public\.torqueshed_live_bay_messages'\)/);
  assert.match(releaseSource, /to_regclass\('public\.torqueshed_share_links'\)/);
  assert.match(releaseSource, /to_regclass\('public\.faultlinelab_challenges'\)/);
  assert.match(releaseSource, /to_regclass\('public\.faultlinelab_challenge_versions'\)/);
  assert.match(releaseSource, /to_regclass\('public\.faultlinelab_sessions'\)/);
  assert.match(releaseSource, /to_regclass\('public\.faultlinelab_session_actions'\)/);
  assert.match(releaseSource, /to_regclass\('public\.faultlinelab_submissions'\)/);
  assert.match(releaseSource, /to_regclass\('public\.ninja_pool_player_profiles'\)/);
  assert.match(releaseSource, /to_regclass\('public\.ninja_pool_match_sessions'\)/);
  assert.match(releaseSource, /to_regclass\('public\.ninja_pool_match_events'\)/);
  assert.match(releaseSource, /to_regclass\('public\.brandforge_brands'\)/);
  assert.match(releaseSource, /to_regclass\('public\.brandforge_campaigns'\)/);
  assert.match(releaseSource, /to_regclass\('public\.brandforge_generations'\)/);
  assert.match(releaseSource, /to_regclass\('public\.snapproof_cases'\)/);
  assert.match(releaseSource, /to_regclass\('public\.snapproof_evidence_items'\)/);
  assert.match(releaseSource, /to_regclass\('public\.snapproof_custody_events'\)/);
  assert.match(releaseSource, /to_regclass\('public\.snapproof_reports'\)/);
  assert.match(releaseSource, /to_regclass\('public\.studyforge_subjects'\)/);
  assert.match(releaseSource, /to_regclass\('public\.studyforge_sources'\)/);
  assert.match(releaseSource, /to_regclass\('public\.studyforge_decks'\)/);
  assert.match(releaseSource, /to_regclass\('public\.studyforge_card_progress'\)/);
  assert.match(releaseSource, /to_regclass\('public\.launchkit_launches'\)/);
  assert.match(releaseSource, /to_regclass\('public\.launchkit_tasks'\)/);
  assert.match(releaseSource, /to_regclass\('public\.launchkit_artifacts'\)/);
  assert.match(releaseSource, /to_regclass\('public\.launchkit_exports'\)/);
  assert.match(releaseSource, /to_regclass\('public\.ninjamation_scripts'\)/);
  assert.match(releaseSource, /to_regclass\('public\.ninjamation_script_versions'\)/);
  assert.match(releaseSource, /to_regclass\('public\.ninjamation_downloads'\)/);
  assert.match(releaseSource, /to_regclass\('public\.operatoros_token_purchase_intents'\)/);
  assert.match(releaseSource, /to_regclass\('public\.operatoros_sms_consent_records'\)/);
  assert.match(releaseSource, /to_regclass\('public\.operatoros_sms_consent_events'\)/);
  assert.doesNotMatch(releaseSource, /sso_authorization_codes/);
});

test('database release CLI exposes plan and apply modes without accepting arbitrary commands', () => {
  const cli = read('apps/api/src/scripts/database-release.ts');
  assert.match(cli, /--plan/);
  assert.match(cli, /--apply/);
  assert.match(cli, /OPERATOROS_DATABASE_RELEASE_MODE/);
  assert.match(cli, /Unknown database release option/);
  assert.doesNotMatch(cli, /process\.env\[[^\]]+\]\s*=\s*process\.argv/);
});
