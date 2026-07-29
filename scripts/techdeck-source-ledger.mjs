import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ledgerPath = join(repositoryRoot, 'docs', 'modules', 'techdeck', 'SOURCE_LEDGER.json');
const expectedSourceCommit = '8125f8d89d8d39d60a50c8061a26133a0c917792';
const args = process.argv.slice(2);
const captureIndex = args.indexOf('--capture');
const sourceRoot = captureIndex >= 0 ? resolve(args[captureIndex + 1] ?? '') : null;

const ACTIVE = 'active';
const SHARED = 'shared_replacement';
const GAP = 'restoration_gap';
const RETIRED_SECURITY = 'retired_security';
const RETIRED_BOUNDARY = 'retired_product_boundary';
const allowedDispositions = new Set([ACTIVE, SHARED, GAP, RETIRED_SECURITY, RETIRED_BOUNDARY]);

const platformTargets = [
  'apps/api/src/routes/auth-routes.ts',
  'apps/api/src/routes/module-routes.ts',
  'apps/api/src/routes/platform-routes.ts',
  'apps/web/src/app/platform/[[...slug]]/page.tsx',
];
const platformEvidence = [
  'docs/auth/OPERATOROS_SSO_CONTRACT_V1.md',
  'apps/api/test/auth-security.test.ts',
  'apps/api/test/shared-sso-routes.test.ts',
  'apps/web/e2e/sso-v1.spec.ts',
];
const operationsTargets = [
  'apps/api/src/routes/techdeck-routes.ts',
  'apps/api/src/lib/techdeck-ops.ts',
  'apps/web/src/components/module-shells/TechDeckOperations.tsx',
];
const operationsEvidence = [
  'apps/api/test/techdeck-state5-workflow.test.ts',
  'apps/api/test/techdeck-state5-static.test.ts',
  'apps/api/test/techdeck-ops-workflows.test.ts',
];
const ticketTargets = [
  'apps/api/src/routes/module-shell-routes.ts',
  'apps/api/src/lib/techdeck-tickets.ts',
  'apps/web/src/components/module-shells/TechDeckTicketQueue.tsx',
];
const ticketEvidence = [
  'apps/api/test/techdeck-shared-runtime-tickets.test.ts',
  'apps/api/test/techdeck-state5-workflow.test.ts',
];
const directoryTargets = [
  'apps/api/src/routes/directory-routes.ts',
  'apps/api/src/lib/business-directory.ts',
  'apps/web/src/components/module-shells/BusinessDirectory.tsx',
];
const directoryEvidence = [
  'apps/api/test/business-directory.test.ts',
  'apps/web/e2e/business-directory.spec.ts',
];
const sharedServiceTargets = [
  'apps/api/src/routes/shared-service-routes.ts',
  'apps/api/src/lib/shared-attachments.ts',
  'apps/api/src/lib/shared-notification-outbox.ts',
];
const sharedServiceEvidence = [
  'apps/api/test/shared-service-routes.test.ts',
  'apps/api/test/techdeck-state5-workflow.test.ts',
];
const routeTargets = [
  'apps/web/src/components/module-shells/TechDeckShell.tsx',
  'apps/web/src/components/module-shells/TechDeckOperations.tsx',
  'apps/web/src/app/modules/[slug]/[...path]/route-map.ts',
];
const routeEvidence = [
  'apps/api/test/core-module-deep-link-routing.test.ts',
  'apps/api/test/techdeck-state5-static.test.ts',
];
const boundaryTargets = [
  'docs/adr/ADR-0012-techdeck-network-ipam-ownership.md',
  'docs/adr/ADR-0013-techdeck-credential-references.md',
  'docs/adr/ADR-0014-techdeck-remote-action-boundary.md',
  'docs/modules/techdeck/PARITY_MATRIX.md',
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizePath(value) {
  return value.replaceAll('\\', '/');
}

function git(source, ...gitArgs) {
  return execFileSync(
    'git',
    ['-c', `safe.directory=${normalizePath(source)}`, '-C', source, ...gitArgs],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
  ).trim();
}

function gitFile(source, commit, path) {
  return execFileSync(
    'git',
    ['-c', `safe.directory=${normalizePath(source)}`, '-C', source, 'show', `${commit}:${path}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
  );
}

function uniqueSorted(items, key) {
  const byKey = new Map();
  for (const item of items) byKey.set(key(item), item);
  return [...byKey.values()].sort((left, right) => key(left).localeCompare(key(right)));
}

function outcome(disposition, domain, targetPointers, evidence, note) {
  return { disposition, domain, targetPointers, evidence, note };
}

function active(domain, targets = operationsTargets, evidence = operationsEvidence, note = 'The consolidated TechDeck runtime provides the persistent tenant-scoped equivalent.') {
  return outcome(ACTIVE, domain, targets, evidence, note);
}

function shared(domain, targets, evidence, note) {
  return outcome(SHARED, domain, targets, evidence, note);
}

function retiredSecurity(domain, note, targets = boundaryTargets) {
  return outcome(RETIRED_SECURITY, domain, targets, [], note);
}

function retiredBoundary(domain, note, targets = boundaryTargets) {
  return outcome(RETIRED_BOUNDARY, domain, targets, [], note);
}

function gap(domain, note) {
  return outcome(GAP, domain, [], [], note);
}

function classifyPage(path) {
  if (['/login', '/register', '/reviewer-login', '/account-security', '/mfa-setup', '/delete-account'].includes(path)) {
    return retiredSecurity(
      'identity_account_authority',
      'Module-local credentials, reviewer access, MFA, and account mutation are prohibited; OperatorOS owns the complete account lifecycle.',
      ['docs/auth/OPERATOROS_SSO_CONTRACT_V1.md', 'apps/web/src/app/login/page.tsx'],
    );
  }
  if (['/billing', '/pricing', '/refund', '/system-admin'].includes(path)) {
    return shared(
      path === '/system-admin' ? 'platform_administration' : 'platform_billing',
      platformTargets,
      platformEvidence,
      'OperatorOS owns platform administration, subscriptions, pricing, checkout, refunds, and entitlements.',
    );
  }
  if (['/privacy', '/terms', '/access-denied'].includes(path)) {
    return shared(
      'platform_policy_and_access',
      ['apps/web/src/app/login/page.tsx', 'docs/OPERATOROS_ECOSYSTEM_INTEGRATION_CONTRACT.md'],
      platformEvidence,
      'Shared OperatorOS policy and bounded access-denied surfaces replace standalone copies.',
    );
  }
  if (path === '/' || ['/assets', '/inventory', '/network', '/lifecycle', '/documentation', '/kb', '/kb/:id', '/evidence', '/evidence/:id', '/evidence/upload', '/reports', '/time', '/settings'].includes(path)) {
    return active('managed_infrastructure_documentation', routeTargets, routeEvidence, 'A canonical host-routed TechDeck workflow or explicit legacy-compatible deep link is active.');
  }
  if (['/tickets', '/tickets/:id'].includes(path)) {
    return active('technician_ticketing', ticketTargets, ticketEvidence);
  }
  if (['/clients', '/clients/:id', '/sites'].includes(path)) {
    return shared(
      'business_directory',
      directoryTargets,
      directoryEvidence,
      'Shared Directory owns managed clients, sites, contacts, and module associations.',
    );
  }
  if (['/team', '/audit', '/client-access'].includes(path)) {
    return shared(
      'platform_membership_and_audit',
      platformTargets,
      platformEvidence,
      'OperatorOS owns tenant membership, module grants, client access policy, and platform audit.',
    );
  }
  if (path === '/m' || path.startsWith('/m/')) {
    return shared(
      'responsive_web',
      ['apps/web/src/components/module-shells/TechDeckShell.tsx'],
      routeEvidence,
      'The responsive canonical TechDeck shell replaces the standalone mobile router.',
    );
  }
  if (path.startsWith('/portal')) {
    return retiredBoundary(
      'anonymous_client_portal',
      'A public/client portal needs an accepted token, relationship, consent, retention, and abuse-control boundary before activation.',
    );
  }
  if (path === '/calendar' || path === '/recurring-tickets') {
    return retiredBoundary(
      'scheduling_and_recurrence',
      'Dispatch scheduling and recurrence require shared leased-job, timezone, retry, cancellation, and ownership semantics not approved for TechDeck.',
    );
  }
  if (path === '/invoices' || path === '/invoices/:id' || path === '/billing-settings') {
    return retiredBoundary(
      'business_invoicing',
      'TradeFlowKit owns lead-to-cash business invoicing; OperatorOS owns platform billing.',
    );
  }
  if (path === '/itops') {
    return retiredSecurity(
      'remote_action_and_secret_storage',
      'The AI/script console and browser-local vault are prohibited without the signed endpoint-agent and approved vault boundaries.',
    );
  }
  if (path.startsWith('/secure-intake') || path.startsWith('/t/upload/')) {
    return retiredBoundary(
      'anonymous_secure_intake',
      'Anonymous intake needs accepted uploader identity, token abuse, consent, retention, scanning, and relationship policy.',
    );
  }
  if (path === '/licenses' || path === '/licenses/developer' || path === '/webhooks' || path === '/status-admin' || path.startsWith('/status/') || path === '/api-tokens') {
    return retiredBoundary(
      'standalone_platform_infrastructure',
      'License-server, API-token, outbound-webhook, and public-status infrastructure require separate OperatorOS-wide product and security policy.',
    );
  }
  return gap('page', `No approved disposition exists for source page ${path}.`);
}

function starts(path, prefixes) {
  return prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

function classifyApi(method, path) {
  const upperMethod = method.toUpperCase();
  if (path === '/health' || path === '/api/health') {
    return shared(
      'production_health',
      ['apps/api/src/index.ts', 'scripts/start-unified-runtime.mjs'],
      ['apps/api/test/module-runtime-authority.test.ts'],
      'The unified runtime owns health and readiness.',
    );
  }
  if (path === '/sso' || path === '/logout' || starts(path, ['/api/auth', '/api/reviewer-login', '/api/account'])) {
    return retiredSecurity(
      'identity_session_authority',
      'Exact-host SSO and OperatorOS account/session routes replace all child credentials and reviewer/system-admin access.',
      ['docs/auth/OPERATOROS_SSO_CONTRACT_V1.md', 'apps/api/src/routes/sso-routes.ts'],
    );
  }
  if (starts(path, ['/api/operatoros', '/api/admin', '/api/tenants', '/api/team', '/api/client-access'])) {
    return shared(
      'platform_authority',
      platformTargets,
      platformEvidence,
      'OperatorOS owns tenants, members, roles, module grants, entitlement synchronization, and root administration.',
    );
  }
  if (starts(path, ['/api/tenant', '/api/members', '/api/modules', '/api/me/entitlements'])) {
    return shared(
      'platform_authority',
      platformTargets,
      platformEvidence,
      'OperatorOS owns tenant context, memberships, module registry, roles, and entitlement state.',
    );
  }
  if (starts(path, ['/api/billing', '/api/subscriptions', '/api/plans', '/api/stripe'])) {
    return shared(
      'platform_billing',
      ['apps/api/src/routes/billing-routes.ts', 'apps/api/src/routes/module-routes.ts'],
      ['apps/api/test/billing-resync.test.ts', 'apps/api/test/marketplace-rbac.test.ts'],
      'OperatorOS is the only platform subscription, checkout, webhook, usage, and entitlement authority.',
    );
  }
  if (starts(path, ['/api/clients', '/api/sites', '/api/contacts', '/api/contact-records'])) {
    return shared(
      'business_directory',
      directoryTargets,
      directoryEvidence,
      upperMethod === 'DELETE'
        ? 'Shared Directory uses versioned archive rather than destructive child deletion.'
        : 'Shared Directory owns managed-client, site, and contact identity.',
    );
  }
  if (starts(path, ['/api/tickets', '/api/sla', '/api/time'])) {
    return active('technician_ticketing', ticketTargets, ticketEvidence);
  }
  if (starts(path, ['/api/sla-profiles', '/api/time-entries'])) {
    return active('technician_ticketing', ticketTargets, ticketEvidence);
  }
  if (starts(path, ['/api/assets', '/api/configuration-items', '/api/configuration-relationships', '/api/relationships', '/api/documentation', '/api/folders', '/api/kb', '/api/evidence', '/api/reports', '/api/tags'])) {
    return active('managed_infrastructure_documentation');
  }
  if (starts(path, ['/api/attachments'])) {
    return shared(
      'private_attachments',
      sharedServiceTargets,
      sharedServiceEvidence,
      'Shared private attachments and scanning replace module-local file storage.',
    );
  }
  if (starts(path, ['/api/ops/attachments'])) {
    return shared(
      'private_attachments',
      sharedServiceTargets,
      sharedServiceEvidence,
      'Shared private attachments and scanning replace module-local file storage.',
    );
  }
  if (starts(path, ['/api/ops/contacts'])) {
    return shared(
      'business_directory',
      directoryTargets,
      directoryEvidence,
      upperMethod === 'DELETE'
        ? 'Shared Directory uses versioned archive rather than destructive child deletion.'
        : 'Shared Directory owns managed-client, site, and contact identity.',
    );
  }
  if (starts(path, ['/api/ops/import'])) {
    return shared(
      'migration_tooling',
      ['apps/api/src/scripts/techdeck-import.ts', 'apps/api/src/lib/techdeck-import.ts'],
      ['apps/api/test/techdeck-import-plan.test.ts', 'apps/api/test/techdeck-import-static.test.ts'],
      'The commit-pinned, idempotent migration path replaces the legacy interactive import endpoint.',
    );
  }
  if (starts(path, ['/api/ops'])) {
    return active(
      'managed_infrastructure_documentation',
      operationsTargets,
      operationsEvidence,
      'Namespaced TechDeck configuration, relationship, document, folder, search, and summary routes replace the legacy generic operations API.',
    );
  }
  if (starts(path, ['/api/audit', '/api/audit-actions', '/api/audit-logs', '/api/activity'])) {
    return shared(
      'platform_activity_audit',
      ['apps/api/src/lib/audit.ts', 'apps/api/src/routes/shared-service-routes.ts'],
      sharedServiceEvidence,
      'Shared append-only activity and OperatorOS platform audit replace the child audit store.',
    );
  }
  if (path === '/api/dashboard') {
    return active(
      'operations_dashboard',
      routeTargets,
      routeEvidence,
      'The dashboard is derived from persistent tenant-scoped TechDeck records rather than a separate aggregate authority.',
    );
  }
  if (starts(path, ['/api/calendar', '/api/appointments', '/api/recurring', '/api/recurring-templates'])) {
    return retiredBoundary(
      'scheduling_and_recurrence',
      'Standalone scheduling/recurrence is outside the approved TechDeck boundary pending shared job semantics.',
    );
  }
  if (starts(path, ['/api/invoices', '/api/invoicing', '/api/billing-settings', '/api/billing-config'])) {
    return retiredBoundary(
      'business_invoicing',
      'TradeFlowKit owns business invoicing; TechDeck does not duplicate lead-to-cash authority.',
    );
  }
  if (starts(path, ['/api/itops', '/api/chat', '/api/images', '/api/audio', '/api/conversations', '/api/generate-image'])) {
    return retiredSecurity(
      'remote_action_and_unapproved_ai',
      'Remote-action generation, browser vault data, and standalone AI/media integrations are prohibited without approved shared-provider and endpoint-agent boundaries.',
    );
  }
  if (starts(path, ['/api/secure-intake', '/api/intake', '/api/public/intake', '/t/upload'])) {
    return retiredBoundary(
      'anonymous_secure_intake',
      'Anonymous intake is not activated without accepted uploader identity, token abuse, consent, retention, scanning, and relationship policy.',
    );
  }
  if (starts(path, ['/api/licenses', '/api/license', '/api/webhooks', '/api/webhook-events', '/api/status', '/api/public/status', '/api/api-tokens', '/api/v1'])) {
    return retiredBoundary(
      'standalone_platform_infrastructure',
      'License-server, API-token, outbound-webhook, and public-status APIs require separate OperatorOS-wide ownership decisions.',
    );
  }
  if (starts(path, ['/api/portal'])) {
    return retiredBoundary(
      'client_portal',
      'The standalone client portal is not approved until relationship, exposure, consent, and retention policy is accepted.',
    );
  }
  if (starts(path, ['/api/public/invoices'])) {
    return retiredBoundary(
      'business_invoicing',
      'TradeFlowKit owns public business-invoice payment workflows; TechDeck does not duplicate that authority.',
    );
  }
  if (starts(path, ['/api/demo'])) {
    return retiredSecurity(
      'demo_seed_and_bypass',
      'Demo-only identities and bypass surfaces are never production capability.',
    );
  }
  return gap('api_route', `No approved disposition exists for ${upperMethod} ${path}.`);
}

function classifyTable(name) {
  if (['tenants', 'tenant_members', 'pending_invitations'].includes(name)) {
    return retiredSecurity(
      'identity_tenant_authority',
      'Standalone tenant, membership, and invitation authority is prohibited.',
      ['apps/api/src/schema.ts', 'docs/auth/OPERATOROS_SSO_CONTRACT_V1.md'],
    );
  }
  if (['clients', 'client_user_assignments', 'sites', 'contact_records'].includes(name)) {
    return shared(
      'business_directory',
      ['apps/api/src/schema.ts', 'apps/api/src/lib/business-directory.ts'],
      directoryEvidence,
      'Shared Directory owns managed organizations, contacts, sites, and associations.',
    );
  }
  if (['assets', 'configuration_items', 'configuration_relationships', 'documentation_folders', 'documentation_pages', 'documentation_revisions', 'tags', 'evidence_items', 'report_jobs'].includes(name)) {
    return active('managed_infrastructure_documentation');
  }
  if (name === 'operational_attachments') {
    return shared(
      'private_attachments',
      ['apps/api/src/schema.ts', 'apps/api/src/lib/shared-attachments.ts'],
      sharedServiceEvidence,
      'Shared private attachment/blob storage replaces module-local files.',
    );
  }
  if (name === 'audit_logs') {
    return shared(
      'platform_activity_audit',
      ['apps/api/src/schema.ts', 'apps/api/src/lib/audit.ts'],
      sharedServiceEvidence,
      'Shared activity and platform audit retain bounded TechDeck events.',
    );
  }
  if (['tickets', 'ticket_comments', 'sla_profiles', 'time_entries', 'kb_articles'].includes(name)) {
    return active(
      'technician_ticketing_and_knowledge',
      name === 'kb_articles' ? operationsTargets : ticketTargets,
      name === 'kb_articles' ? operationsEvidence : ticketEvidence,
    );
  }
  if (['subscription_plans', 'tenant_subscriptions', 'usage_counters_monthly', 'api_tokens'].includes(name)) {
    return retiredSecurity(
      'platform_authority',
      'Child subscriptions, usage authority, and API bearer credentials are prohibited; OperatorOS owns these concerns.',
      ['apps/api/src/schema.ts', 'docs/OPERATOROS_ECOSYSTEM_INTEGRATION_CONTRACT.md'],
    );
  }
  if (['license_products', 'license_keys', 'license_activations', 'webhook_endpoints', 'webhook_deliveries', 'status_pages', 'status_components', 'status_incidents'].includes(name)) {
    return retiredBoundary(
      'standalone_platform_infrastructure',
      'License-server, outbound-webhook, and public-status persistence require separate OperatorOS-wide product/security ownership.',
    );
  }
  if (name === 'appointments' || name === 'recurring_ticket_templates') {
    return retiredBoundary(
      'scheduling_and_recurrence',
      'Scheduling and recurrence are excluded pending a shared leased-job/timezone/cancellation design.',
    );
  }
  if (['billing_configs', 'invoices', 'invoice_line_items'].includes(name)) {
    return retiredBoundary(
      'business_invoicing',
      'TradeFlowKit owns business invoicing and OperatorOS owns platform billing.',
    );
  }
  if (['intake_spaces', 'upload_requests', 'intake_files', 'intake_audit_events', 'intake_policies'].includes(name)) {
    return retiredBoundary(
      'anonymous_secure_intake',
      'Secure intake persistence is excluded until uploader identity, consent, token abuse, scanning, retention, and relationship policy is accepted.',
    );
  }
  return gap('database_table', `No approved disposition exists for source table ${name}.`);
}

function classifyProvider(name) {
  if (['DATABASE_URL', 'NODE_ENV', 'PORT'].includes(name)) {
    return shared(
      'unified_runtime',
      ['apps/api/src/index.ts', 'scripts/start-unified-runtime.mjs'],
      ['apps/api/test/module-runtime-authority.test.ts', 'apps/api/test/database-release-contract.test.ts'],
      'The unified OperatorOS runtime owns database, environment, and ports.',
    );
  }
  if (name.startsWith('OPERATOROS_') || ['CHILD_APP_MODULE_KEY', 'VITE_OPERATOROS_URL', 'VITE_OPERATOROS_BASE_URL'].includes(name)) {
    return shared(
      'platform_integration',
      ['packages/modules/registry.ts', 'apps/api/src/routes/sso-routes.ts'],
      platformEvidence,
      'The unified runtime resolves exact-host SSO, entitlements, and navigation directly.',
    );
  }
  if (['MODULE_SSO_DISABLED', 'MODULE_SSO_SECRET', 'ENABLE_LEGACY_ENTITLEMENT_FALLBACK'].includes(name)) {
    return retiredSecurity(
      'child_identity_configuration',
      'Local shared-secret SSO, disable switches, and entitlement fallback are prohibited by the exact-host OperatorOS SSO contract.',
      ['docs/auth/OPERATOROS_SSO_CONTRACT_V1.md', 'apps/api/src/routes/sso-routes.ts'],
    );
  }
  if (name.includes('AUTH') || name.includes('SESSION') || name.includes('PASSWORD') || name.includes('MFA') || name.includes('REVIEWER') || name.includes('BYPASS') || name.startsWith('DEV_USER') || name.startsWith('DEV_TENANT')) {
    return retiredSecurity(
      'child_identity_configuration',
      'Local credentials, sessions, bypasses, MFA, and reviewer/system-admin configuration are prohibited.',
      ['docs/auth/OPERATOROS_SSO_CONTRACT_V1.md', 'apps/api/src/index.ts'],
    );
  }
  if (name.startsWith('STRIPE_')) {
    return shared(
      'platform_billing',
      ['apps/api/src/routes/billing-routes.ts'],
      ['apps/api/test/billing-resync.test.ts'],
      'OperatorOS owns platform Stripe configuration and signed webhooks.',
    );
  }
  if (['ENABLE_LEGACY_BILLING_GRACE_CLEANUP', 'ENABLE_LEGACY_BILLING_SEED'].includes(name)) {
    return shared(
      'platform_billing',
      ['apps/api/src/routes/billing-routes.ts', 'apps/api/src/routes/module-routes.ts'],
      ['apps/api/test/billing-resync.test.ts', 'apps/api/test/marketplace-rbac.test.ts'],
      'OperatorOS subscription and entitlement authority replaces legacy child billing seed and grace cleanup switches.',
    );
  }
  if (name.includes('UPLOAD') || name.includes('STORAGE')) {
    return shared(
      'private_attachments',
      ['apps/api/src/lib/shared-attachments.ts'],
      sharedServiceEvidence,
      'Shared private attachment storage/scanning replaces module-local paths and upload configuration.',
    );
  }
  if (name.includes('MAIL') || name.includes('EMAIL') || name.includes('SMTP')) {
    return shared(
      'shared_notifications',
      ['apps/api/src/lib/shared-notification-outbox.ts'],
      sharedServiceEvidence,
      'Shared notification/outbox providers own outbound delivery.',
    );
  }
  if (name.includes('OPENAI') || name.includes('WEBHOOK') || name.includes('LICENSE') || name.includes('API_ONLY') || name.includes('INTERNAL_WEBHOOK')) {
    return retiredBoundary(
      'unapproved_provider_or_platform_surface',
      'Standalone AI, webhook, license, and headless API configuration is not active without a separate accepted boundary.',
    );
  }
  if (name.startsWith('REPL_') || name.startsWith('REPLIT_')) {
    return shared(
      'deployment_runtime',
      ['.replit', 'scripts/start-unified-runtime.mjs'],
      ['apps/api/test/replit-unified-runtime.test.ts'],
      'The canonical OperatorOS Replit deployment owns runtime metadata.',
    );
  }
  if (name === 'WEB_REPL_RENEWAL') {
    return shared(
      'deployment_runtime',
      ['.replit', 'scripts/start-unified-runtime.mjs'],
      ['apps/api/test/replit-unified-runtime.test.ts'],
      'The canonical OperatorOS Replit deployment owns runtime renewal behavior.',
    );
  }
  if (name === 'LOG_LEVEL') {
    return shared(
      'production_observability',
      ['apps/api/src/index.ts', 'scripts/start-unified-runtime.mjs'],
      ['apps/api/test/module-runtime-authority.test.ts'],
      'The unified runtime owns log verbosity and production observability.',
    );
  }
  if (name === 'TEST_DATABASE_URL') {
    return shared(
      'isolated_test_database',
      ['apps/api/test/_setup.ts'],
      ['apps/api/test/database-release-contract.test.ts'],
      'OperatorOS tests use an explicitly isolated disposable database.',
    );
  }
  return gap('provider_configuration', `No approved disposition exists for source environment variable ${name}.`);
}

const backgroundDefinitions = [
  {
    key: 'billing-grace-cleanup',
    sourcePointer: 'server/core/billing/graceCleanup.ts',
    ...shared(
      'platform_billing',
      ['apps/api/src/routes/billing-routes.ts'],
      ['apps/api/test/billing-resync.test.ts'],
      'OperatorOS subscription/billing authority replaces child grace cleanup.',
    ),
  },
  {
    key: 'license-rate-limit-maintenance',
    sourcePointer: 'server/modules/license/routes.ts',
    ...retiredBoundary('license_server', 'Standalone license issuance/activation and its maintenance loop are not approved TechDeck scope.'),
  },
  {
    key: 'outbound-webhook-worker',
    sourcePointer: 'server/modules/webhooks/worker.ts',
    ...retiredBoundary('outbound_webhooks', 'Standalone arbitrary outbound webhook delivery is not activated without an OperatorOS-wide provider policy.'),
  },
  {
    key: 'process-health-sampler',
    sourcePointer: 'server/index.ts',
    ...shared(
      'production_observability',
      ['apps/api/src/index.ts', 'scripts/start-unified-runtime.mjs'],
      ['apps/api/test/module-runtime-authority.test.ts'],
      'The unified runtime owns process health, readiness, logs, and shutdown.',
    ),
  },
  {
    key: 'typed-event-audit-subscribers',
    sourcePointer: 'server/core/events/subscribers.ts',
    ...shared(
      'platform_activity_audit',
      ['apps/api/src/lib/audit.ts', 'apps/api/src/routes/shared-service-routes.ts'],
      sharedServiceEvidence,
      'Shared activity and platform audit replace the child in-process event/audit bus.',
    ),
  },
];

function extractInventory(source, commit) {
  const trackedFiles = git(source, 'ls-tree', '-r', '--name-only', commit).split(/\r?\n/u).filter(Boolean);
  const sourceFiles = trackedFiles.filter(path => /\.(?:ts|tsx)$/u.test(path));
  const fileContents = new Map(sourceFiles.map(path => [path, gitFile(source, commit, path)]));
  const appSource = fileContents.get('client/src/App.tsx') ?? '';
  const pages = [...appSource.matchAll(/<Route\b[^>]*\bpath=["']([^"']+)["'][^>]*>/gu)].map(match => ({
    key: match[1],
    path: match[1],
    sourcePointer: 'client/src/App.tsx',
    ...classifyPage(match[1]),
  }));

  const apiRoutes = [];
  const routePattern = /\b(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gsu;
  for (const [path, content] of fileContents) {
    if (!path.startsWith('server/')) continue;
    for (const match of content.matchAll(routePattern)) {
      const method = match[1].toUpperCase();
      const route = match[2];
      apiRoutes.push({
        key: `${method} ${route}`,
        method,
        path: route,
        sourcePointer: path,
        ...classifyApi(method, route),
      });
    }
  }

  const schemaSource = fileContents.get('shared/schema.ts') ?? '';
  const tables = [...schemaSource.matchAll(/\bpgTable\(\s*["'`]([^"'`]+)["'`]/gsu)].map(match => ({
    key: match[1],
    table: match[1],
    sourcePointer: 'shared/schema.ts',
    ...classifyTable(match[1]),
  }));

  const providerPointers = new Map();
  const envPattern = /\bprocess\.env(?:\.([A-Z][A-Z0-9_]+)|\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\])/gu;
  for (const [path, content] of fileContents) {
    for (const match of content.matchAll(envPattern)) {
      const name = match[1] ?? match[2];
      const pointers = providerPointers.get(name) ?? new Set();
      pointers.add(path);
      providerPointers.set(name, pointers);
    }
  }
  const providers = [...providerPointers.entries()].map(([name, pointers]) => ({
    key: name,
    name,
    sourcePointers: [...pointers].sort(),
    ...classifyProvider(name),
  }));

  const relevantFiles = new Set(['client/src/App.tsx', 'shared/schema.ts']);
  for (const item of [...apiRoutes, ...tables, ...backgroundDefinitions]) relevantFiles.add(item.sourcePointer);
  for (const item of providers) for (const pointer of item.sourcePointers) relevantFiles.add(pointer);

  return {
    trackedFileCount: trackedFiles.length,
    relevantFileHashes: [...relevantFiles]
      .filter(path => trackedFiles.includes(path))
      .sort()
      .map(path => ({ path, sha256: sha256(gitFile(source, commit, path)) })),
    pages: uniqueSorted(pages, item => item.key),
    apiRoutes: uniqueSorted(apiRoutes, item => item.key),
    tables: uniqueSorted(tables, item => item.key),
    providers: uniqueSorted(providers, item => item.key),
    backgroundProcesses: uniqueSorted(
      backgroundDefinitions.filter(item => trackedFiles.includes(item.sourcePointer)),
      item => item.key,
    ),
  };
}

function validateCollection(name, items) {
  const failures = [];
  if (!Array.isArray(items) || items.length === 0) failures.push(`${name}: inventory is empty`);
  const keys = new Set();
  for (const item of items ?? []) {
    if (!item.key) failures.push(`${name}: item is missing key`);
    if (keys.has(item.key)) failures.push(`${name}: duplicate key ${item.key}`);
    keys.add(item.key);
    if (!allowedDispositions.has(item.disposition)) failures.push(`${name}:${item.key}: unclassified`);
    if (item.disposition === GAP) failures.push(`${name}:${item.key}: restoration gap remains`);
    if (!item.domain) failures.push(`${name}:${item.key}: missing domain`);
    if (!item.sourcePointer && (!Array.isArray(item.sourcePointers) || item.sourcePointers.length === 0)) {
      failures.push(`${name}:${item.key}: missing source pointer`);
    }
    if (!Array.isArray(item.targetPointers) || item.targetPointers.length === 0) {
      failures.push(`${name}:${item.key}: missing target/boundary pointer`);
    }
    if ([ACTIVE, SHARED].includes(item.disposition) && (!Array.isArray(item.evidence) || item.evidence.length === 0)) {
      failures.push(`${name}:${item.key}: active/shared item missing evidence`);
    }
    for (const pointer of [...(item.targetPointers ?? []), ...(item.evidence ?? [])]) {
      if (!existsSync(resolve(repositoryRoot, pointer))) failures.push(`${name}:${item.key}: missing repository pointer ${pointer}`);
    }
  }
  return failures;
}

function validateLedger(ledger) {
  const failures = [];
  if (ledger.schemaVersion !== 1) failures.push('Unsupported ledger schemaVersion');
  if (ledger.moduleSlug !== 'techdeck') failures.push('Unexpected moduleSlug');
  if (ledger.source?.commit !== expectedSourceCommit) failures.push('TechDeck source commit does not match the accepted provenance pin');
  if (ledger.source?.worktreeDirty !== false) failures.push('Source worktree was not clean at capture');
  for (const name of ['pages', 'apiRoutes', 'tables', 'providers', 'backgroundProcesses']) {
    failures.push(...validateCollection(name, ledger.inventory?.[name]));
  }
  if (!Array.isArray(ledger.relevantFileHashes) || ledger.relevantFileHashes.length === 0) {
    failures.push('Relevant source file hashes are missing');
  }
  for (const entry of ledger.relevantFileHashes ?? []) {
    if (!entry.path || !/^[0-9a-f]{64}$/u.test(entry.sha256 ?? '')) failures.push(`Invalid source hash entry ${entry.path ?? '<missing>'}`);
  }
  return failures;
}

function summarize(ledger) {
  const names = ['pages', 'apiRoutes', 'tables', 'providers', 'backgroundProcesses'];
  const all = names.flatMap(name => ledger.inventory[name]);
  return {
    sourceCommit: ledger.source.commit,
    trackedFiles: ledger.source.trackedFileCount,
    ...Object.fromEntries(names.map(name => [name, ledger.inventory[name].length])),
    total: all.length,
    unclassified: all.filter(item => !allowedDispositions.has(item.disposition)).length,
    restorationGaps: all.filter(item => item.disposition === GAP).length,
    dispositions: Object.fromEntries(
      [...allowedDispositions].map(disposition => [
        disposition,
        all.filter(item => item.disposition === disposition).length,
      ]),
    ),
  };
}

if (sourceRoot) {
  if (!existsSync(sourceRoot)) throw new Error(`Source path does not exist: ${sourceRoot}`);
  const status = git(sourceRoot, 'status', '--porcelain=v1', '--untracked-files=all');
  const commit = git(sourceRoot, 'rev-parse', 'HEAD');
  if (commit !== expectedSourceCommit) {
    throw new Error(`Expected TechDeck source ${expectedSourceCommit}, received ${commit}`);
  }
  const inventory = extractInventory(sourceRoot, commit);
  const remote = git(sourceRoot, 'config', '--get', 'remote.origin.url');
  const ledger = {
    schemaVersion: 1,
    moduleSlug: 'techdeck',
    capturedAtUtc: new Date().toISOString(),
    source: {
      repository: remote.replace(/^(https?:\/\/)[^/@]+@/u, '$1'),
      commit,
      branch: git(sourceRoot, 'branch', '--show-current'),
      worktreeDirty: status !== '',
      trackedFileCount: inventory.trackedFileCount,
      authority: 'read_only_migration_evidence',
    },
    inventory: {
      pages: inventory.pages,
      apiRoutes: inventory.apiRoutes,
      tables: inventory.tables,
      providers: inventory.providers,
      backgroundProcesses: inventory.backgroundProcesses,
    },
    relevantFileHashes: inventory.relevantFileHashes,
  };
  const failures = validateLedger(ledger);
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summarize(ledger), null, 2));
  process.exit(0);
}

if (!existsSync(ledgerPath)) throw new Error(`Ledger does not exist: ${ledgerPath}`);
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
const failures = validateLedger(ledger);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify(summarize(ledger), null, 2));
