import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ledgerPath = join(repositoryRoot, 'docs', 'modules', 'tradeflowkit', 'PHASE16_SOURCE_LEDGER.json');
const args = process.argv.slice(2);
const captureIndex = args.indexOf('--capture');
const sourceRoot = captureIndex >= 0 ? resolve(args[captureIndex + 1] ?? '') : null;

const ACTIVE = 'active';
const SHARED = 'shared_replacement';
const GAP = 'phase16_gap';
const RETIRED_SECURITY = 'retired_security';
const RETIRED_BOUNDARY = 'retired_product_boundary';
const allowedDispositions = new Set([ACTIVE, SHARED, GAP, RETIRED_SECURITY, RETIRED_BOUNDARY]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizePath(value) {
  return value.replaceAll('\\', '/');
}

function git(source, ...gitArgs) {
  const safeDirectory = normalizePath(source);
  return execFileSync(
    'git',
    ['-c', `safe.directory=${safeDirectory}`, '-C', source, ...gitArgs],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

function gitFile(source, commit, path) {
  return execFileSync(
    'git',
    ['-c', `safe.directory=${normalizePath(source)}`, '-C', source, 'show', `${commit}:${path}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 },
  );
}

function walk(root, predicate) {
  const results = [];
  for (const entry of readdirSync(root)) {
    const absolute = join(root, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      results.push(...walk(absolute, predicate));
    } else if (predicate(absolute)) {
      results.push(absolute);
    }
  }
  return results;
}

function uniqueSorted(items, key) {
  const byKey = new Map();
  for (const item of items) byKey.set(key(item), item);
  return [...byKey.values()].sort((left, right) => key(left).localeCompare(key(right)));
}

function outcome(disposition, domain, targetPointers, evidence, note) {
  return { disposition, domain, targetPointers, evidence, note };
}

const contractEvidence = [
  'docs/auth/OPERATOROS_SSO_CONTRACT_V1.md',
  'apps/api/test/auth.test.ts',
];
const workflowEvidence = [
  'apps/api/test/tradeflowkit-state5-workflow.test.ts',
  'apps/api/test/tradeflowkit-revenue-flow.test.ts',
];
const documentMutationEvidence = [
  'apps/api/test/tradeflowkit-document-mutations.test.ts',
  'apps/api/test/tradeflowkit-revenue-ui-static.test.ts',
];
const customerImportEvidence = [
  'apps/api/test/tradeflowkit-customer-import.test.ts',
  'apps/api/test/tradeflowkit-revenue-ui-static.test.ts',
];
const directoryEvidence = [
  'apps/api/test/business-directory.test.ts',
  'apps/web/e2e/business-directory.spec.ts',
];
const sharedServiceEvidence = [
  'apps/api/test/shared-service-routes.test.ts',
  'apps/api/test/tradeflowkit-state5-workflow.test.ts',
];
const workManagementEvidence = [
  'apps/api/test/tradeflowkit-work-management.test.ts',
  'apps/web/src/components/module-shells/TradeFlowKitWorkManagement.tsx',
];
const leadMessagingEvidence = [
  'apps/api/test/tradeflowkit-lead-messaging.test.ts',
  'apps/api/test/tradeflowkit-lead-messaging-static.test.ts',
];
const savedViewEvidence = [
  'apps/api/test/tradeflowkit-saved-views.test.ts',
  'apps/api/test/tradeflowkit-saved-views-static.test.ts',
  'apps/web/src/components/module-shells/TradeFlowKitOperations.tsx',
];
const accountingExportEvidence = [
  'apps/api/test/tradeflowkit-accounting-export-format.test.ts',
  'apps/api/test/tradeflowkit-accounting-exports.test.ts',
  'apps/web/src/components/module-shells/TradeFlowKitOperations.tsx',
];
const safeBulkEvidence = [
  'apps/api/test/tradeflowkit-safe-bulk-operations.test.ts',
  'apps/api/test/tradeflowkit-safe-bulk-operations-static.test.ts',
  'docs/adr/ADR-0029-tradeflowkit-bounded-bulk-operations.md',
];
const recordImportEvidence = [
  'apps/api/test/tradeflowkit-record-imports.test.ts',
  'apps/api/test/tradeflowkit-revenue-ui-static.test.ts',
];
const deterministicSchedulingBoundaryEvidence = [
  'docs/adr/ADR-0011-tradeflowkit-approved-product-scope.md',
  'docs/adr/ADR-0028-tradeflowkit-workflow-studio-boundary.md',
  'docs/adr/ADR-0031-tradeflowkit-record-import-and-deterministic-scope-closure.md',
];

function classifyPage(path) {
  if (['/subscription', '/admin', '/access-denied'].includes(path)) {
    return outcome(
      SHARED,
      'platform_authority',
      ['apps/web/src/app/app/apps/page.tsx', 'apps/web/src/app/app/platform/page.tsx'],
      contractEvidence,
      'OperatorOS owns subscriptions, platform administration, and access denial.',
    );
  }
  if (['/privacy', '/terms', '/sms-consent', '/delete-account', '/guide'].includes(path)) {
    return outcome(
      SHARED,
      'platform_navigation',
      ['apps/web/src/app/privacy/page.tsx', 'apps/web/src/app/terms/page.tsx'],
      ['apps/web/e2e/operatoros-final-acceptance.spec.ts'],
      'The platform owns legal, account, and ecosystem guidance surfaces.',
    );
  }
  if (path === '/call-recovery') {
    return outcome(
      RETIRED_BOUNDARY,
      'callcommand',
      ['docs/adr/ADR-0025-callcommand-outcall-consent-and-provider-boundary.md'],
      ['apps/api/test/callcommand-state5-workflow.test.ts'],
      'Call Recovery belongs to the CallCommand/OutCall consent and provider boundary.',
    );
  }
  if (path === '/auth') {
    return outcome(
      RETIRED_SECURITY,
      'identity',
      ['apps/web/src/app/login/page.tsx'],
      contractEvidence,
      'Module-local authentication is prohibited.',
    );
  }
  if (path === '/contacts') {
    return outcome(
      SHARED,
      'business_directory',
      ['apps/web/src/components/module-shells/BusinessDirectory.tsx'],
      directoryEvidence,
      'Shared Directory provides the tenant contact workspace.',
    );
  }
  if (path === '/workflows' || path === '/tasks' || path === '/activity') {
    return outcome(
      ACTIVE,
      'restored_operations',
      ['apps/web/src/components/module-shells/TradeFlowKitWorkManagement.tsx'],
      workManagementEvidence,
      'The consolidated work-management surface provides persisted workflows, job tasks, and tenant activity.',
    );
  }
  if (path === '/trash') {
    return outcome(
      ACTIVE,
      'retention',
      ['apps/api/src/routes/tradeflowkit-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitTrash.tsx'],
      ['apps/api/test/tradeflowkit-retention.test.ts', 'apps/api/test/tradeflowkit-retention-static.test.ts'],
      'Bounded archived-record listing and dependency-safe restore are active; permanent purge stays prohibited.',
    );
  }
  if (
    path === '/' ||
    path === '/dashboard' ||
    path.startsWith('/leads') ||
    path.startsWith('/customers') ||
    path.startsWith('/jobs') ||
    path.startsWith('/quotes') ||
    path.startsWith('/invoices') ||
    path.startsWith('/portal/') ||
    path === '/settings' ||
    path === '/analytics'
  ) {
    return outcome(
      ACTIVE,
      'lead_to_cash',
      ['apps/web/src/components/module-shells/TradeFlowKitShell.tsx'],
      workflowEvidence,
      'The shared runtime has a persistent equivalent, subject to endpoint-level gaps below.',
    );
  }
  return null;
}

function classifyApi(method, path) {
  const upperMethod = method.toUpperCase();
  if (path === '/.well-known/assetlinks.json') {
    return outcome(
      RETIRED_BOUNDARY,
      'standalone_mobile_shell',
      [],
      [],
      'The standalone Android/PWA association is not part of the host-routed OperatorOS module.',
    );
  }
  if (path.startsWith('/api/operatoros/')) {
    return outcome(
      SHARED,
      'platform_integration',
      ['apps/api/src/routes/modules.ts', 'apps/api/src/routes/tenant-entitlement-routes.ts'],
      contractEvidence,
      'The consolidated runtime calls OperatorOS authority directly and does not synchronize a second module authority.',
    );
  }
  if (
    path.startsWith('/api/auth') ||
    path.startsWith('/api/orgs') ||
    path.startsWith('/api/memberships') ||
    path.startsWith('/api/invite-codes') ||
    path.startsWith('/api/plan-info') ||
    path.startsWith('/api/admin') ||
    path === '/sso'
  ) {
    return outcome(
      path === '/sso' ? SHARED : RETIRED_SECURITY,
      'identity_tenant_authority',
      ['apps/api/src/routes/auth.ts', 'apps/api/src/routes/sso-v1-routes.ts'],
      contractEvidence,
      'OperatorOS is the only identity, session, tenant, membership, and platform-role authority.',
    );
  }
  if (
    path.startsWith('/api/stripe/plans') ||
    path.startsWith('/api/stripe/create-checkout') ||
    path.startsWith('/api/stripe/create-portal') ||
    path.startsWith('/api/stripe/publishable-key') ||
    path === '/api/stripe/webhook' ||
    path.startsWith('/api/subscription') ||
    path.startsWith('/api/entitlements')
  ) {
    return outcome(
      SHARED,
      'platform_billing',
      ['apps/api/src/routes/billing.ts', 'apps/api/src/routes/module-marketplace-routes.ts'],
      ['apps/api/test/billing.test.ts', 'apps/api/test/marketplace-routes.test.ts'],
      'OperatorOS owns platform subscriptions, add-ons, and module entitlements.',
    );
  }
  if (path.startsWith('/api/call-recovery')) {
    return outcome(
      RETIRED_BOUNDARY,
      'callcommand',
      ['docs/adr/ADR-0025-callcommand-outcall-consent-and-provider-boundary.md'],
      ['apps/api/test/callcommand-state5-workflow.test.ts'],
      'This capability is owned by CallCommand/OutCall, not TradeFlowKit.',
    );
  }
  if (path.startsWith('/api/stripe/connect') || path.includes('/payment-link')) {
    return outcome(
      GAP,
      'business_payments',
      ['apps/api/src/lib/tradeflowkit-payment-provider.ts'],
      ['apps/api/test/tradeflowkit-state5-workflow.test.ts'],
      'Business payments require a centralized tenant provider-account adapter and signed idempotent webhook contract.',
    );
  }
  if (path.startsWith('/api/public/lead-') || path.includes('/capture-form') || path.includes('/source-adapters')) {
    return outcome(
      GAP,
      'public_lead_intake',
      [],
      [],
      'Public intake remains disabled pending consent, privacy, retention, abuse, and rate-limit controls.',
    );
  }
  if (path.includes('/score') || path.includes('/provider-status') || path.includes('/production-readiness')) {
    return outcome(
      RETIRED_BOUNDARY,
      'automated_lead_decisions',
      [],
      [],
      'Unreviewed AI scoring may not silently make customer decisions.',
    );
  }
  if (path.startsWith('/api/exports/quickbooks') || path.startsWith('/api/exports/xero') || path.includes('/export/quickbooks')) {
    return outcome(
      ACTIVE,
      'accounting_exports',
      ['apps/api/src/lib/tradeflowkit-accounting-exports.ts', 'apps/api/src/routes/tradeflowkit-routes.ts'],
      accountingExportEvidence,
      'Versioned, bounded QuickBooks IIF/invoice CSV and Xero customer/invoice/payment CSV exports use tenant-scoped normalized invoice lines and successful payment-ledger entries.',
    );
  }
  if (path.startsWith('/api/automations') || path.startsWith('/api/reminder-logs') || path.includes('/series')) {
    return outcome(
      RETIRED_BOUNDARY,
      'durable_scheduling',
      deterministicSchedulingBoundaryEvidence,
      deterministicSchedulingBoundaryEvidence,
      'Autonomous automation, reminders, and recurring job generation remain outside the accepted deterministic TradeFlowKit scope.',
    );
  }
  if (path.startsWith('/api/trash')) {
    return outcome(
      upperMethod === 'DELETE' ? RETIRED_SECURITY : ACTIVE,
      'retention',
      ['apps/api/src/routes/tradeflowkit-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitTrash.tsx'],
      ['apps/api/test/tradeflowkit-retention.test.ts', 'apps/api/test/tradeflowkit-retention-static.test.ts'],
      upperMethod === 'DELETE'
        ? 'Permanent module-local purge is prohibited.'
        : 'Archived customers, jobs, and invoices can be listed and restored in dependency order with optimistic versions and tenant-scoped audit.',
    );
  }
  if (path.startsWith('/api/review-requests')) {
    return outcome(
      SHARED,
      'outbound_communications',
      ['apps/api/src/routes/shared-service-routes.ts'],
      sharedServiceEvidence,
      'Shared notification, outbox, activity, and audit services replace the legacy table.',
    );
  }
  if (path.startsWith('/api/audit-log')) {
    return outcome(
      SHARED,
      'audit',
      ['apps/api/src/schema.ts', 'apps/api/src/lib/audit.ts'],
      ['apps/api/test/audit.test.ts'],
      'Platform audit is the canonical append-only audit source.',
    );
  }
  if (path.startsWith('/api/work/workflows') || path.startsWith('/api/work/stages') || path.includes('/transition')) {
    return outcome(
      ACTIVE,
      'restored_workflows',
      ['apps/api/src/routes/tradeflowkit-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitWorkManagement.tsx'],
      workManagementEvidence,
      'Tenant-scoped workflow templates, stages, optimistic mutation, archive, and job transitions are active.',
    );
  }
  if (path.startsWith('/api/work/tasks')) {
    if (path === '/api/work/tasks' && upperMethod === 'POST') {
      return outcome(
        RETIRED_BOUNDARY,
        'standalone_tasks',
        ['docs/adr/ADR-0010-tradeflowkit-job-task-model.md', 'docs/adr/ADR-0028-tradeflowkit-workflow-studio-boundary.md', 'docs/adr/ADR-0031-tradeflowkit-record-import-and-deterministic-scope-closure.md'],
        workManagementEvidence,
        'Standalone task creation is excluded; canonical tasks remain job-scoped under ADR-0010 and ADR-0028.',
      );
    }
    return outcome(
      ACTIVE,
      'restored_tasks',
      ['apps/api/src/routes/tradeflowkit-routes.ts'],
      workManagementEvidence,
      'Team list/detail/update/archive/comment/dependency behavior is active for canonical job-scoped tasks.',
    );
  }
  if (path.startsWith('/api/operations/companies') || path.startsWith('/api/operations/contacts')) {
    return outcome(
      SHARED,
      'business_directory',
      ['apps/api/src/routes/directory-routes.ts', 'apps/web/src/components/module-shells/BusinessDirectory.tsx'],
      directoryEvidence,
      'Shared Directory owns tenant organizations and contacts.',
    );
  }
  if (
    path.startsWith('/api/operations/notes') ||
    path.startsWith('/api/operations/comments') ||
    path.startsWith('/api/operations/tags') ||
    path.startsWith('/api/operations/attachments') ||
    path.startsWith('/api/operations/resources') ||
    path.startsWith('/api/operations/notifications') ||
    path.startsWith('/api/work/activity')
  ) {
    return outcome(
      SHARED,
      'shared_collaboration',
      ['apps/api/src/routes/tradeflowkit-routes.ts', 'apps/api/src/routes/shared-service-routes.ts'],
      [...sharedServiceEvidence, ...workManagementEvidence],
      'Canonical comments, tags, attachments, activity, notification, and audit services cover this collaboration domain.',
    );
  }
  if (path.startsWith('/api/operations/saved-views')) {
    return outcome(
      ACTIVE,
      'saved_views',
      ['apps/api/src/routes/tradeflowkit-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitOperations.tsx'],
      savedViewEvidence,
      'Bounded tenant/user saved views support personal ownership, admin-governed tenant sharing, persistence, application, and soft deletion.',
    );
  }
  if (path === '/api/search') {
    return outcome(
      ACTIVE,
      'global_search',
      ['apps/api/src/routes/tradeflowkit-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitGlobalSearch.tsx'],
      ['apps/api/test/tradeflowkit-global-search.test.ts', 'apps/api/test/tradeflowkit-global-search-static.test.ts'],
      'Bounded tenant-scoped search covers active leads, customers, jobs, tasks, shared Directory records, quotes, and invoices with canonical deep links.',
    );
  }
  if (path === '/api/work/summary') {
    return outcome(
      ACTIVE,
      'operations_dashboard',
      ['apps/api/src/routes/tradeflowkit-routes.ts', 'apps/api/src/routes/module-shell-routes.ts'],
      workflowEvidence,
      'The active operations and revenue projections provide persisted tenant-scoped summary metrics.',
    );
  }
  if (path.startsWith('/api/portal/')) {
    return outcome(
      ACTIVE,
      'customer_portal',
      ['apps/api/src/routes/tradeflowkit-routes.ts', 'apps/web/src/app/public/tradeflowkit/[documentType]/[token]/page.tsx'],
      workflowEvidence,
      'Hashed, bounded, non-cacheable public customer documents are active.',
    );
  }
  if (path.startsWith('/api/analytics') || path === '/api/dashboard') {
    return outcome(
      ACTIVE,
      'analytics',
      ['apps/api/src/routes/tradeflowkit-routes.ts', 'apps/api/src/lib/tradeflowkit-revenue.ts'],
      workflowEvidence,
      'Metrics are computed from tenant-scoped persisted records.',
    );
  }
  if (path.startsWith('/api/customers')) {
    if (path === '/api/customers/import' && upperMethod === 'POST') {
      return outcome(
        ACTIVE,
        'customer_import',
        ['apps/api/src/routes/module-shell-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx'],
        customerImportEvidence,
        'Bounded CSV-to-JSON import is replay safe, tenant scoped, validated, audited, and reconciled with shared Directory records.',
      );
    }
    if (path === '/api/customers/bulk-delete' || path === '/api/customers/bulk-restore') {
      return outcome(
        RETIRED_SECURITY,
        'customer_bulk_destructive',
        ['docs/adr/ADR-0011-tradeflowkit-approved-product-scope.md'],
        customerImportEvidence,
        'Legacy bulk destructive customer mutation remains prohibited by ADR-0011; bounded import is available without exposing these controls.',
      );
    }
    return outcome(
      ACTIVE,
      'customers',
      ['apps/api/src/routes/directory-routes.ts', 'apps/api/src/routes/module-shell-routes.ts'],
      [...directoryEvidence, ...workflowEvidence],
      'Customer CRUD and customer-linked operations use shared Directory plus TradeFlowKit profiles.',
    );
  }
  if (path.startsWith('/api/jobs')) {
    if (path === '/api/jobs/import') {
      return outcome(
        ACTIVE,
        'job_import',
        ['apps/api/src/routes/module-shell-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx'],
        recordImportEvidence,
        'Bounded CSV-to-JSON job import is tenant scoped, replay safe, customer reconciled, duplicate suppressed, numbered, and audited.',
      );
    }
    if (path === '/api/jobs/bulk-delete') {
      return outcome(
        RETIRED_SECURITY,
        'job_bulk_delete',
        ['docs/adr/ADR-0011-tradeflowkit-approved-product-scope.md', 'docs/adr/ADR-0029-tradeflowkit-bounded-bulk-operations.md'],
        safeBulkEvidence,
        'Bulk deletion remains prohibited; retained job records use dependency-safe restore and single-record history-safe archive.',
      );
    }
    if (path === '/api/jobs/bulk-status' || path === '/api/jobs/bulk-restore') {
      return outcome(
        ACTIVE,
        'job_safe_bulk',
        ['apps/api/src/lib/tradeflowkit-bulk-operations.ts', 'apps/api/src/routes/tradeflowkit-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitOperations.tsx', 'apps/web/src/components/module-shells/TradeFlowKitTrash.tsx'],
        safeBulkEvidence,
        'Admin-only job batches are capped at 25, tenant scoped, optimistic, atomic, audited, and protected by shared idempotency.',
      );
    }
    return outcome(
      ACTIVE,
      'jobs',
      ['apps/api/src/routes/module-shell-routes.ts', 'apps/api/src/routes/tradeflowkit-routes.ts'],
      workflowEvidence,
      'Tenant-scoped, numbered, versioned jobs and job tasks are active.',
    );
  }
  if (path.startsWith('/api/quotes')) {
    if ((upperMethod === 'PATCH' || upperMethod === 'DELETE') && path === '/api/quotes/:id') {
      return outcome(
        ACTIVE,
        'quote_edit_archive',
        ['apps/api/src/routes/module-shell-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx'],
        documentMutationEvidence,
        'Versioned draft editing and guarded soft archive reconcile normalized line items in one tenant-scoped transaction.',
      );
    }
    if (path.includes('/convert-to-job')) {
      return outcome(
        ACTIVE,
        'quote_to_job',
        ['apps/api/src/routes/module-shell-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx'],
        documentMutationEvidence,
        'Accepted quote conversion locks the quote and returns the single linked persistent job on retries.',
      );
    }
    return outcome(
      ACTIVE,
      'quotes',
      ['apps/api/src/routes/module-shell-routes.ts', 'apps/api/src/routes/tradeflowkit-routes.ts'],
      workflowEvidence,
      'Quote creation, decisions, public projection, and idempotent invoice conversion are active.',
    );
  }
  if (path.startsWith('/api/invoices')) {
    if (path === '/api/invoices/import') {
      return outcome(
        ACTIVE,
        'invoice_import',
        ['apps/api/src/routes/module-shell-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx'],
        recordImportEvidence,
        'Bounded CSV-to-JSON invoice import groups normalized lines, uses exact integer cents, rejects synthetic paid history, suppresses duplicate references, and is tenant scoped, replay safe, numbered, and audited.',
      );
    }
    if (path === '/api/invoices/bulk-delete') {
      return outcome(
        RETIRED_SECURITY,
        'invoice_bulk_delete',
        ['docs/adr/ADR-0011-tradeflowkit-approved-product-scope.md', 'docs/adr/ADR-0029-tradeflowkit-bounded-bulk-operations.md'],
        safeBulkEvidence,
        'Bulk deletion remains prohibited; invoices retain durable financial and payment history.',
      );
    }
    if (path === '/api/invoices/bulk-restore' || path === '/api/invoices/bulk-mark-paid') {
      return outcome(
        ACTIVE,
        'invoice_safe_bulk',
        ['apps/api/src/lib/tradeflowkit-bulk-operations.ts', 'apps/api/src/routes/tradeflowkit-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitTrash.tsx', 'apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx'],
        safeBulkEvidence,
        'Admin-only invoice batches are capped at 25, tenant scoped, optimistic, atomic, audited, replay safe, and create exact payment-ledger records.',
      );
    }
    if (
      (path === '/api/invoices' && upperMethod === 'POST') ||
      (path === '/api/invoices/:id' && ['PATCH', 'DELETE'].includes(upperMethod))
    ) {
      return outcome(
        ACTIVE,
        'invoice_direct_edit_archive',
        ['apps/api/src/routes/module-shell-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx'],
        documentMutationEvidence,
        'Direct creation, versioned draft editing, and history-safe soft archive are active with normalized line-item reconciliation.',
      );
    }
    return outcome(
      ACTIVE,
      'invoices_payments',
      ['apps/api/src/routes/module-shell-routes.ts', 'apps/api/src/routes/tradeflowkit-routes.ts'],
      workflowEvidence,
      'Invoice projection, status, manual partial payment, public view, and messages are active.',
    );
  }
  if (path.startsWith('/api/leads')) {
    if (path.includes('/send-sms') || path.includes('/send-email')) {
      return outcome(
        ACTIVE,
        'lead_messaging',
        ['apps/api/src/routes/tradeflowkit-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitLeadCenter.tsx'],
        leadMessagingEvidence,
        'Email and consent-gated SMS are queued through the shared replay-safe outbox using the tenant-owned lead destination.',
      );
    }
    if (
      path.includes('/settings') ||
      path.includes('/source-events') ||
      path.includes('/followups') ||
      path.includes('/test-message')
    ) {
      return outcome(GAP, 'lead_operations_extensions', [], [], 'This lead workflow extension is not yet equivalent in the shared runtime.');
    }
    return outcome(
      ACTIVE,
      'leads',
      ['apps/api/src/routes/module-shell-routes.ts', 'apps/api/src/routes/tradeflowkit-routes.ts'],
      ['apps/api/test/tradeflowkit-shared-runtime-leads.test.ts', ...workflowEvidence],
      'Manual tenant-scoped lead CRUD, activity, and idempotent conversion are active.',
    );
  }
  if (path.startsWith('/api/exports/status')) {
    return outcome(
      ACTIVE,
      'canonical_exports',
      ['apps/api/src/routes/tradeflowkit-routes.ts'],
      workflowEvidence,
      'Tenant-scoped canonical CSV exports are active.',
    );
  }
  return null;
}

function classifyTable(name) {
  if (['users', 'user_recovery_codes', 'orgs', 'memberships', 'invite_codes', 'processed_stripe_events'].includes(name)) {
    return outcome(
      RETIRED_SECURITY,
      'platform_authority',
      ['apps/api/src/schema.ts'],
      contractEvidence,
      'OperatorOS owns this authority; standalone rows are excluded from import.',
    );
  }
  if (name === 'audit_log') {
    return outcome(SHARED, 'audit', ['apps/api/src/schema.ts'], ['apps/api/test/audit.test.ts'], 'Platform audit replaces this table.');
  }
  if (['companies', 'contacts'].includes(name)) {
    return outcome(
      SHARED,
      'business_directory',
      ['apps/api/src/schema.ts', 'apps/api/src/routes/directory-routes.ts'],
      directoryEvidence,
      'Shared Directory replaces this tenant business identity data.',
    );
  }
  if (['entity_notes', 'entity_attachments', 'entity_comments', 'tags', 'entity_tags', 'notifications', 'activity_events'].includes(name)) {
    return outcome(
      SHARED,
      'shared_collaboration',
      ['apps/api/src/schema.ts', 'apps/api/src/routes/shared-service-routes.ts'],
      sharedServiceEvidence,
      'Shared tenant-scoped platform services replace this collaboration table.',
    );
  }
  if (['workflow_templates', 'workflow_stages'].includes(name)) {
    return outcome(
      ACTIVE,
      'restored_workflows',
      ['apps/api/src/schema.ts', 'apps/api/src/lib/tradeflowkit-db-init.ts'],
      workManagementEvidence,
      'Tenant-scoped, indexed, versioned workflow template and stage persistence is active.',
    );
  }
  if (name === 'work_tasks' || name === 'task_dependencies') {
    return outcome(
      ACTIVE,
      'restored_tasks',
      ['apps/api/src/schema.ts', 'apps/api/src/lib/tradeflowkit-db-init.ts'],
      workManagementEvidence,
      'Canonical job-scoped tasks and acyclic same-job dependencies provide the accepted work model.',
    );
  }
  if (name === 'saved_views') {
    return outcome(
      ACTIVE,
      'saved_views',
      ['apps/api/src/schema.ts', 'apps/api/src/lib/tradeflowkit-saved-views-db-init.ts'],
      savedViewEvidence,
      'Canonical tenant-scoped saved-view persistence is active with bounded JSON, ownership, audit, indexes, and soft-delete state.',
    );
  }
  if (['org_automations', 'reminder_log'].includes(name)) {
    return outcome(
      RETIRED_BOUNDARY,
      'durable_scheduling',
      deterministicSchedulingBoundaryEvidence,
      deterministicSchedulingBoundaryEvidence,
      'Legacy autonomous scheduling persistence is excluded from the accepted deterministic TradeFlowKit scope.',
    );
  }
  if (['call_recovery_subscriptions', 'missed_calls', 'ai_messages'].includes(name)) {
    return outcome(RETIRED_BOUNDARY, 'callcommand', ['docs/adr/ADR-0025-callcommand-outcall-consent-and-provider-boundary.md'], [], 'CallCommand/OutCall owns this capability.');
  }
  if (name === 'review_requests') {
    return outcome(SHARED, 'outbound_communications', ['apps/api/src/schema.ts'], sharedServiceEvidence, 'Shared outbox/activity/audit replaces this table.');
  }
  if (['lead_capture_forms', 'lead_source_events', 'lead_settings', 'lead_followup_tasks'].includes(name)) {
    return outcome(GAP, 'lead_operations_extensions', [], [], 'The full retained lead extension is not yet equivalent.');
  }
  if (name === 'lead_activities') {
    return outcome(ACTIVE, 'leads', ['apps/api/src/schema.ts'], workflowEvidence, 'Canonical activity/audit history preserves lead events.');
  }
  if (['customers', 'jobs', 'job_events', 'quotes', 'quote_items', 'invoices', 'invoice_items', 'leads'].includes(name)) {
    return outcome(
      ACTIVE,
      'lead_to_cash',
      ['apps/api/src/schema.ts', 'apps/api/src/lib/tradeflowkit-db-init.ts'],
      workflowEvidence,
      'An active tenant-scoped canonical table or shared replacement exists.',
    );
  }
  return null;
}

function classifyProvider(name) {
  if (name.startsWith('OPERATOROS_') || ['MODULE_SLUG', 'MODULE_SSO_SECRET', 'SESSION_SECRET'].includes(name)) {
    return outcome(
      name === 'MODULE_SSO_SECRET' ? RETIRED_SECURITY : SHARED,
      'platform_integration',
      ['apps/api/src/config.ts', 'apps/api/src/routes/sso-v1-routes.ts'],
      contractEvidence,
      name === 'MODULE_SSO_SECRET'
        ? 'The legacy shared-secret module SSO path is forbidden.'
        : 'OperatorOS owns this platform integration/configuration concern.',
    );
  }
  if (name.startsWith('STRIPE_')) {
    return outcome(
      GAP,
      'business_payments',
      ['apps/api/src/lib/tradeflowkit-payment-provider.ts'],
      ['apps/api/test/tradeflowkit-state5-workflow.test.ts'],
      'Platform billing is centralized; module business payments remain provider-gated.',
    );
  }
  if (name.startsWith('OPENAI_')) {
    return outcome(
      RETIRED_BOUNDARY,
      'automated_lead_decisions',
      ['docs/adr/ADR-0011-tradeflowkit-approved-product-scope.md', 'docs/adr/ADR-0031-tradeflowkit-record-import-and-deterministic-scope-closure.md'],
      leadMessagingEvidence,
      'Legacy unreviewed lead AI behavior is excluded from TradeFlowKit; deterministic operator-reviewed workflows remain active.',
    );
  }
  if (name.startsWith('TWILIO_') || name.startsWith('SENDGRID_')) {
    return outcome(
      SHARED,
      'external_provider',
      ['apps/api/src/lib/shared-provider-adapters.ts', 'apps/api/src/lib/shared-notification-outbox.ts'],
      [...sharedServiceEvidence, ...leadMessagingEvidence],
      'OperatorOS shared provider adapters and the replay-safe outbox replace module-owned email and SMS provider clients.',
    );
  }
  return null;
}

function extractInventory(source, commit) {
  const trackedFiles = git(source, 'ls-tree', '-r', '--name-only', commit)
    .split(/\r?\n/u)
    .filter(Boolean);
  const routeFiles = trackedFiles.filter(path => path.startsWith('server/') && path.endsWith('.ts'));
  const clientFiles = trackedFiles.filter(path => path.startsWith('client/src/') && /\.(?:ts|tsx)$/u.test(path));
  const relevantFiles = uniqueSorted(
    [
      'client/src/App.tsx',
      'shared/schema.ts',
      ...routeFiles.filter(path => path.startsWith('server/routes/')),
      ...clientFiles.filter(path => path.startsWith('client/src/pages/')),
    ].filter(path => trackedFiles.includes(path)),
    value => value,
  );
  const fileContents = new Map();
  for (const path of uniqueSorted([...routeFiles, ...clientFiles, 'shared/schema.ts'].filter(path => trackedFiles.includes(path)), value => value)) {
    fileContents.set(path, gitFile(source, commit, path));
  }

  const appSource = fileContents.get('client/src/App.tsx') ?? '';
  const pages = [...appSource.matchAll(/<Route\b[^>]*\bpath=["']([^"']+)["'][^>]*>/gu)].map(match => ({
    key: match[1],
    path: match[1],
    sourcePointer: 'client/src/App.tsx',
    ...classifyPage(match[1]),
  }));

  const apiRoutes = [];
  const routePattern = /\b(router|app)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gsu;
  for (const [path, content] of fileContents) {
    if (!path.startsWith('server/')) continue;
    for (const match of content.matchAll(routePattern)) {
      const method = match[2].toUpperCase();
      const route = match[3];
      if (!route.startsWith('/api/') && route !== '/sso' && !route.startsWith('/.well-known/')) continue;
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

  const providerNames = [];
  const envPattern = /\bprocess\.env(?:\.([A-Z][A-Z0-9_]+)|\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\])/gu;
  for (const [path, content] of fileContents) {
    for (const match of content.matchAll(envPattern)) {
      const name = match[1] ?? match[2];
      if (!/^(?:OPERATOROS_|MODULE_|SESSION_SECRET$|STRIPE_|TWILIO_|SENDGRID_|OPENAI_)/u.test(name)) continue;
      providerNames.push({
        key: name,
        name,
        sourcePointer: path,
        ...classifyProvider(name),
      });
    }
  }

  return {
    trackedFileCount: trackedFiles.length,
    relevantFileHashes: relevantFiles.map(path => ({
      path,
      sha256: sha256(gitFile(source, commit, path)),
    })),
    pages: uniqueSorted(pages, item => item.key),
    apiRoutes: uniqueSorted(apiRoutes, item => item.key),
    tables: uniqueSorted(tables, item => item.key),
    providers: uniqueSorted(providerNames, item => item.key),
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
    if (!item.domain) failures.push(`${name}:${item.key}: missing domain`);
    if (!item.sourcePointer) failures.push(`${name}:${item.key}: missing source pointer`);
    if ([ACTIVE, SHARED].includes(item.disposition)) {
      if (!Array.isArray(item.targetPointers) || item.targetPointers.length === 0) {
        failures.push(`${name}:${item.key}: active/shared item missing target pointer`);
      }
      if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
        failures.push(`${name}:${item.key}: active/shared item missing evidence`);
      }
    }
  }
  return failures;
}

function validateLedger(ledger) {
  const failures = [];
  if (ledger.schemaVersion !== 1) failures.push('Unsupported ledger schemaVersion');
  if (ledger.moduleSlug !== 'tradeflowkit') failures.push('Unexpected moduleSlug');
  if (!/^[0-9a-f]{40}$/u.test(ledger.source?.commit ?? '')) failures.push('Invalid source commit');
  if (ledger.source?.worktreeDirty !== false) failures.push('Source worktree was not clean at capture');
  for (const name of ['pages', 'apiRoutes', 'tables', 'providers']) {
    failures.push(...validateCollection(name, ledger.inventory?.[name]));
  }
  const unclassified = ['pages', 'apiRoutes', 'tables', 'providers']
    .flatMap(name => ledger.inventory?.[name] ?? [])
    .filter(item => !allowedDispositions.has(item.disposition));
  if (unclassified.length > 0) failures.push(`Found ${unclassified.length} unclassified item(s)`);
  return failures;
}

function summarize(ledger) {
  const all = ['pages', 'apiRoutes', 'tables', 'providers'].flatMap(name => ledger.inventory[name]);
  const dispositions = Object.fromEntries(
    [...allowedDispositions].map(disposition => [
      disposition,
      all.filter(item => item.disposition === disposition).length,
    ]),
  );
  return {
    sourceCommit: ledger.source.commit,
    pages: ledger.inventory.pages.length,
    apiRoutes: ledger.inventory.apiRoutes.length,
    tables: ledger.inventory.tables.length,
    providers: ledger.inventory.providers.length,
    unclassified: all.filter(item => !allowedDispositions.has(item.disposition)).length,
    dispositions,
  };
}

if (sourceRoot) {
  if (!existsSync(sourceRoot)) throw new Error(`Source path does not exist: ${sourceRoot}`);
  const status = git(sourceRoot, 'status', '--porcelain=v1', '--untracked-files=all');
  const commit = git(sourceRoot, 'rev-parse', 'HEAD');
  const remote = git(sourceRoot, 'config', '--get', 'remote.origin.url');
  const inventory = extractInventory(sourceRoot, commit);
  const ledger = {
    schemaVersion: 1,
    moduleSlug: 'tradeflowkit',
    capturedAtUtc: new Date().toISOString(),
    source: {
      repository: remote.replace(/^(https?:\/\/)[^/@]+@/u, '$1'),
      commit,
      branch: git(sourceRoot, 'branch', '--show-current'),
      worktreeDirty: status !== '',
      originalOperatorOsBaselineCommit: '6d0c13df5e324f6aba9cdf2cf14a550d0cf0ca55',
      restoredDeltaCommits: [
        '60b9e6d',
        '8e25ba3',
        '37aa67f',
      ],
      trackedFileCount: inventory.trackedFileCount,
    },
    inventory: {
      pages: inventory.pages,
      apiRoutes: inventory.apiRoutes,
      tables: inventory.tables,
      providers: inventory.providers,
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
