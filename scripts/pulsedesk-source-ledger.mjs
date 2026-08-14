import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ledgerPath = join(repositoryRoot, 'docs', 'modules', 'pulsedesk', 'SOURCE_LEDGER.json');
const expectedSourceCommit = '937849471e489ed23db2a263d04160a388402740';
const args = process.argv.slice(2);
const captureIndex = args.indexOf('--capture');
const sourceRoot = captureIndex >= 0 ? resolve(args[captureIndex + 1] ?? '') : null;

const ACTIVE = 'active';
const SHARED = 'shared_replacement';
const GAP = 'restoration_gap';
const RETIRED_SECURITY = 'retired_security';
const RETIRED_BOUNDARY = 'retired_product_boundary';
const allowedDispositions = new Set([ACTIVE, SHARED, GAP, RETIRED_SECURITY, RETIRED_BOUNDARY]);

const platformEvidence = [
  'docs/auth/OPERATOROS_SSO_CONTRACT_V1.md',
  'apps/api/test/auth-security.test.ts',
  'apps/api/test/shared-sso-routes.test.ts',
  'apps/web/e2e/sso-v1.spec.ts',
];
const workflowEvidence = [
  'apps/api/test/pulsedesk-service-desk-domain.test.ts',
  'apps/api/test/pulsedesk-state5-workflow.test.ts',
  'apps/api/test/pulsedesk-service-desk-static.test.ts',
];
const directoryEvidence = [
  'apps/api/test/business-directory.test.ts',
  'apps/web/e2e/business-directory.spec.ts',
];
const sharedServiceEvidence = [
  'apps/api/test/shared-service-routes.test.ts',
  'apps/api/test/pulsedesk-state5-workflow.test.ts',
];
const routeEvidence = [
  'apps/api/test/core-module-deep-link-routing.test.ts',
  'apps/api/test/pulsedesk-service-desk-static.test.ts',
];
const boundaryTarget = ['docs/adr/ADR-0015-pulsedesk-healthcare-operations-boundary.md'];
const serviceTargets = [
  'apps/api/src/routes/pulsedesk-service-desk-routes.ts',
  'apps/web/src/components/module-shells/PulseDeskServiceDeskWorkspace.tsx',
];
const directoryTargets = [
  'apps/api/src/routes/directory-routes.ts',
  'apps/web/src/components/module-shells/BusinessDirectory.tsx',
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
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
  ).trim();
}

function gitFile(source, commit, path) {
  return execFileSync(
    'git',
    ['-c', `safe.directory=${normalizePath(source)}`, '-C', source, 'show', `${commit}:${path}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
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

function active(domain, note = 'The consolidated PulseDesk service desk provides the persistent tenant-scoped equivalent.') {
  return outcome(ACTIVE, domain, serviceTargets, workflowEvidence, note);
}

function shared(domain, targets, evidence, note) {
  return outcome(SHARED, domain, targets, evidence, note);
}

function retiredBoundary(domain, note, targets = boundaryTarget) {
  return outcome(RETIRED_BOUNDARY, domain, targets, [], note);
}

function retiredSecurity(domain, note, targets = boundaryTarget) {
  return outcome(RETIRED_SECURITY, domain, targets, [], note);
}

function gap(domain, note) {
  return outcome(GAP, domain, [], [], note);
}

function classifyPage(path) {
  if (['/privacy', '/terms'].includes(path)) {
    return retiredBoundary(
      'platform_legal',
      'Legacy module-specific legal copy is not authoritative product counsel; ecosystem legal publication remains a human-reviewed OperatorOS boundary.',
      ['docs/OPERATOROS_ECOSYSTEM_INTEGRATION_CONTRACT.md'],
    );
  }
  if (path === '/login') {
    return retiredSecurity(
      'identity',
      'Module-local login is prohibited; exact-host OperatorOS SSO is the only production entry.',
      ['apps/web/src/app/login/page.tsx', 'docs/auth/OPERATOROS_SSO_CONTRACT_V1.md'],
    );
  }
  if (path === '/admin') {
    return shared(
      'platform_administration',
      ['apps/web/src/app/app/platform/[[...slug]]/page.tsx'],
      platformEvidence,
      'OperatorOS owns root administration, tenants, memberships, roles, billing, and entitlements.',
    );
  }
  if (path === '/email-settings') {
    return retiredBoundary(
      'provider_inbox_ingestion',
      'Provider-specific inbox ingestion and OAuth/IMAP administration require a separate accepted provider contract and are intentionally absent.',
    );
  }
  if (['/clients', '/clients/:id', '/vendors'].includes(path)) {
    return shared(
      'business_directory',
      directoryTargets,
      directoryEvidence,
      'Shared Directory owns service-client, facility, contact, and vendor identity; canonical record deep links select the trusted tenant record.',
    );
  }
  if (
    path === '/' ||
    path === '/app' ||
    path === '/dashboard' ||
    path === '/tickets' ||
    path === '/tickets/:id' ||
    path === '/submit' ||
    path === '/departments' ||
    path === '/assets' ||
    path === '/assets/:assetId/report-issue' ||
    path === '/supply-requests' ||
    path === '/facility-requests' ||
    path === '/knowledge' ||
    path === '/service-desk-admin' ||
    path === '/analytics' ||
    path === '/settings'
  ) {
    return outcome(
      ACTIVE,
      'healthcare_operations_service_delivery',
      [
        'apps/web/src/components/module-shells/PulseDeskShell.tsx',
        'apps/web/src/components/module-shells/PulseDeskServiceDeskWorkspace.tsx',
        'apps/web/src/app/modules/[slug]/[...path]/route-map.ts',
      ],
      routeEvidence,
      'A canonical host-routed PulseDesk workflow or explicit legacy-compatible deep link is active.',
    );
  }
  return gap('page', `No approved disposition exists for source page ${path}.`);
}

function classifyApi(method, path) {
  const upperMethod = method.toUpperCase();

  if (path === '/.well-known/assetlinks.json') {
    return retiredBoundary(
      'standalone_mobile_shell',
      'Standalone Android/PWA association is outside the host-routed OperatorOS module boundary.',
    );
  }
  if (
    path === '/sso' ||
    path === '/logout' ||
    path === '/operatoros/return' ||
    path === '/webhooks/operatoros/entitlements' ||
    path === '/api/public/sso-config' ||
    path === '/api/public/operatoros-navigation'
  ) {
    return shared(
      'platform_integration',
      ['apps/api/src/routes/sso-routes.ts', 'apps/api/src/routes/module-routes.ts'],
      platformEvidence,
      'The unified runtime uses server-authoritative exact-host SSO, navigation, session revocation, and entitlements without a child synchronization authority.',
    );
  }
  if (path === '/api/health') {
    return shared(
      'production_health',
      ['apps/api/src/index.ts', 'scripts/start-unified-runtime.mjs'],
      ['apps/api/test/module-runtime-authority.test.ts'],
      'The unified runtime owns public health and private readiness.',
    );
  }
  if (path.startsWith('/api/billing')) {
    return shared(
      'platform_billing',
      ['apps/api/src/routes/billing-routes.ts', 'apps/api/src/routes/module-routes.ts'],
      ['apps/api/test/billing-resync.test.ts', 'apps/api/test/marketplace-rbac.test.ts'],
      'OperatorOS is the sole subscription, add-on, checkout, portal, webhook, and entitlement authority.',
    );
  }
  if (
    path.startsWith('/api/connectors') ||
    path.startsWith('/api/email') ||
    path.startsWith('/api/admin/connectors') ||
    path.startsWith('/api/admin/email') ||
    path.startsWith('/api/admin/imap')
  ) {
    return retiredBoundary(
      'provider_inbox_ingestion',
      'Standalone Google, Microsoft, IMAP, SendGrid, Mailgun, connector polling, and email-to-ticket surfaces are not mounted without a separate shared-provider decision.',
    );
  }
  if (path.startsWith('/api/auth') || path === '/api/members' || path.startsWith('/api/orgs') || path.startsWith('/api/invite-codes') || path.startsWith('/api/memberships')) {
    return retiredSecurity(
      'identity_tenant_authority',
      'Local credentials, sessions, account mutation, organizations, memberships, invites, auth configuration, and role mapping are prohibited.',
      ['apps/api/src/routes/auth-routes.ts', 'apps/api/src/routes/platform-routes.ts'],
    );
  }
  if (path.startsWith('/api/admin')) {
    if (path === '/api/admin/audit/purge' || upperMethod === 'DELETE') {
      return retiredSecurity(
        'platform_administration',
        'Child super-admin destructive or audit-purge operations are prohibited; OperatorOS retains append-only platform authority.',
        ['apps/api/src/routes/platform-routes.ts', 'apps/api/src/lib/audit.ts'],
      );
    }
    return shared(
      'platform_administration',
      ['apps/api/src/routes/platform-routes.ts', 'apps/api/src/lib/audit.ts'],
      ['apps/api/test/platform-route-contract.test.ts', 'apps/api/test/platform-rbac.test.ts'],
      'OperatorOS owns root administration and platform audit.',
    );
  }
  if (path.startsWith('/api/onboarding')) {
    return retiredBoundary(
      'standalone_setup_checklist',
      'The legacy editable setup checklist is not a healthcare-operations record; the live workspace, empty states, and OperatorOS launcher replace it without a second task authority.',
      ['apps/web/src/components/module-shells/PulseDeskShell.tsx'],
    );
  }
  if (path.startsWith('/api/notifications')) {
    return shared(
      'shared_notifications',
      ['apps/api/src/routes/shared-service-routes.ts', 'apps/api/src/lib/shared-notification-outbox.ts'],
      sharedServiceEvidence,
      'Shared notification/outbox services own delivery state; PulseDesk payloads remain content-free.',
    );
  }
  if (path.startsWith('/api/assets/:id/devices')) {
    return retiredBoundary(
      'technical_device_authority',
      'Documentation-grade devices, network, configuration, discovery, credentials, and lifecycle belong to TechDeck.',
      ['docs/adr/ADR-0015-pulsedesk-healthcare-operations-boundary.md', 'apps/api/src/routes/techdeck-routes.ts'],
    );
  }
  if (path.startsWith('/api/contracts')) {
    return retiredBoundary(
      'vendor_contract_authority',
      'PulseDesk retains ticket-specific vendor engagement state; a duplicate vendor contract or procurement system of record is outside ADR-0015.',
    );
  }
  if (path.startsWith('/api/knowledge/categories')) {
    return shared(
      'bounded_taxonomy',
      ['apps/api/src/routes/pulsedesk-service-desk-routes.ts'],
      workflowEvidence,
      'Bounded ticket options and tags replace a separate mutable knowledge-category hierarchy.',
    );
  }
  if (path.startsWith('/api/clients') || path.startsWith('/api/vendors')) {
    return shared(
      'business_directory',
      directoryTargets,
      directoryEvidence,
      upperMethod === 'DELETE'
        ? 'Shared Directory uses versioned archive instead of destructive child deletion.'
        : 'Shared Directory owns tenant-scoped service-client and vendor identity.',
    );
  }
  if (upperMethod === 'DELETE' && (
    path.startsWith('/api/tickets') ||
    path.startsWith('/api/assets') ||
    path.startsWith('/api/departments') ||
    path.startsWith('/api/supply-requests') ||
    path.startsWith('/api/facility-requests')
  )) {
    return retiredSecurity(
      'history_preserving_retention',
      'Destructive child deletion is retired; versioned archive, lifecycle status, and append-only events preserve operational history.',
      serviceTargets,
    );
  }
  if (
    path === '/api/analytics' ||
    path === '/api/dashboard' ||
    path.startsWith('/api/departments') ||
    path.startsWith('/api/assets') ||
    path.startsWith('/api/facility-requests') ||
    path.startsWith('/api/supply-requests') ||
    path.startsWith('/api/tickets') ||
    path.startsWith('/api/service-desk') ||
    path.startsWith('/api/attachments') ||
    path.startsWith('/api/queues') ||
    path.startsWith('/api/sla-policies') ||
    path.startsWith('/api/knowledge/articles') ||
    path.startsWith('/api/tags') ||
    path.startsWith('/api/teams') ||
    path.startsWith('/api/saved-views') ||
    path === '/api/activity' ||
    path.startsWith('/api/notification-preferences')
  ) {
    return active('healthcare_operations_service_delivery');
  }
  return gap('api_route', `No approved disposition exists for ${upperMethod} ${path}.`);
}

function classifyTable(name) {
  if (['users', 'orgs', 'memberships', 'invite_codes', 'org_auth_config', 'org_role_mappings', 'auth_audit_log', 'operatoros_entitlement_snapshots'].includes(name)) {
    return retiredSecurity(
      'identity_tenant_authority',
      'Standalone identity, tenant, role, auth-audit, and entitlement snapshot tables are prohibited.',
      ['apps/api/src/schema.ts', 'docs/auth/OPERATOROS_SSO_CONTRACT_V1.md'],
    );
  }
  if (['clients', 'sites', 'contacts', 'vendors'].includes(name)) {
    return shared(
      'business_directory',
      ['apps/api/src/schema.ts', 'apps/api/src/lib/business-directory.ts'],
      directoryEvidence,
      'Shared Directory owns this tenant identity and relationship data.',
    );
  }
  if (name === 'attachments') {
    return shared(
      'private_attachments',
      ['apps/api/src/schema.ts', 'apps/api/src/lib/shared-attachments.ts'],
      sharedServiceEvidence,
      'The shared private attachment/blob service replaces local filesystem storage.',
    );
  }
  if (name === 'notifications') {
    return shared(
      'shared_notifications',
      ['apps/api/src/schema.ts', 'apps/api/src/lib/shared-notification-outbox.ts'],
      sharedServiceEvidence,
      'Shared notification/outbox state replaces the child table.',
    );
  }
  if (name === 'activity_events') {
    return shared(
      'platform_activity_audit',
      ['apps/api/src/schema.ts', 'apps/api/src/lib/audit.ts'],
      ['apps/api/test/platform-route-contract.test.ts', ...workflowEvidence],
      'Canonical module activity and platform audit replace the child activity table.',
    );
  }
  if (name === 'knowledge_categories') {
    return shared(
      'bounded_taxonomy',
      ['apps/api/src/schema.ts', 'apps/api/src/routes/pulsedesk-service-desk-routes.ts'],
      workflowEvidence,
      'Bounded ticket options and tags replace a separate category authority.',
    );
  }
  if (name === 'devices') {
    return retiredBoundary(
      'technical_device_authority',
      'Technical devices, configuration, networking, and lifecycle belong to TechDeck.',
      ['docs/adr/ADR-0015-pulsedesk-healthcare-operations-boundary.md', 'apps/api/src/schema.ts'],
    );
  }
  if (name === 'contracts') {
    return retiredBoundary(
      'vendor_contract_authority',
      'Ticket-specific vendor engagements are active; a duplicate contract repository is outside the accepted boundary.',
    );
  }
  if (name === 'onboarding_items') {
    return retiredBoundary(
      'standalone_setup_checklist',
      'The editable standalone setup checklist is not an authoritative PulseDesk healthcare-operations record.',
    );
  }
  if (['email_settings', 'email_contacts', 'inbound_email_log', 'ticket_email_metadata', 'mail_connectors', 'connector_events'].includes(name)) {
    return retiredBoundary(
      'provider_inbox_ingestion',
      'Provider credentials, raw inbound mail, connector state, and email metadata require a separate shared-provider contract.',
    );
  }
  if ([
    'departments', 'queues', 'teams', 'team_members', 'ticket_statuses', 'ticket_priorities',
    'ticket_types', 'ticket_categories', 'sla_policies', 'ticket_counters', 'tickets',
    'ticket_events', 'ticket_comments', 'ticket_internal_notes', 'ticket_assignments',
    'sla_events', 'time_entries', 'tags', 'ticket_tags', 'assets', 'supply_requests',
    'facility_requests', 'knowledge_articles', 'saved_views', 'notification_preferences',
  ].includes(name)) {
    return active(
      'healthcare_operations_service_delivery',
      'A namespaced tenant-scoped canonical table, shared record, or history-preserving equivalent is active.',
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
      'The unified OperatorOS runtime owns database, environment, and port configuration.',
    );
  }
  if (['APP_BASE_URL', 'PUBLIC_BASE_URL', 'PULSEDESK_PUBLIC_URL', 'PULSEDESK_URL', 'REPLIT_DOMAINS'].includes(name)) {
    return shared(
      'canonical_navigation',
      ['packages/modules/registry.ts', 'packages/modules/public-url.ts'],
      routeEvidence,
      'Canonical module hosts and navigation come from the OperatorOS module registry.',
    );
  }
  if (name.startsWith('OPERATOROS_')) {
    return shared(
      'platform_integration',
      ['apps/api/src/index.ts', 'apps/api/src/routes/sso-routes.ts'],
      platformEvidence,
      'The unified runtime resolves OperatorOS authority directly; legacy child service tokens and snapshot sync are not required.',
    );
  }
  if (
    name === 'SESSION_SECRET' ||
    name === 'MODULE_SSO_SECRET' ||
    name === 'PULSEDESK_LOCAL_AUTH_ENABLED' ||
    name === 'PULSEDESK_MASTER_ADMIN_EMAIL' ||
    name === 'ENABLE_DEMO_SEEDS' ||
    name === 'ENABLE_LOCAL_REVIEWER' ||
    name === 'DEV_M365_MOCK'
  ) {
    return retiredSecurity(
      'child_identity_configuration',
      'Legacy local credentials, shared-secret SSO, master-admin, review bypass, and demo-auth configuration are prohibited.',
      ['docs/auth/OPERATOROS_SSO_CONTRACT_V1.md', 'apps/api/src/index.ts'],
    );
  }
  if (name === 'ATTACHMENT_STORAGE_DIR') {
    return shared(
      'private_attachments',
      ['apps/api/src/lib/shared-attachments.ts'],
      sharedServiceEvidence,
      'Shared private blob storage replaces a module-local attachment directory.',
    );
  }
  if (
    name.startsWith('STRIPE_') ||
    name.startsWith('SENDGRID_') ||
    name.startsWith('MAILGUN_') ||
    name.startsWith('GOOGLE_') ||
    name.startsWith('MICROSOFT_') ||
    name.startsWith('TWILIO_') ||
    ['REPLIT_CONNECTORS_HOSTNAME', 'REPL_ID', 'REPL_IDENTITY', 'WEB_REPL_RENEWAL', 'REPLIT_DEPLOYMENT'].includes(name)
  ) {
    return retiredBoundary(
      name.startsWith('STRIPE_') ? 'platform_billing_connector' : 'provider_connector',
      name.startsWith('STRIPE_')
        ? 'Child Stripe/provider connector configuration is retired; OperatorOS owns platform billing.'
        : 'Legacy provider credentials and Replit connector tokens are not mounted without an accepted shared-provider contract.',
    );
  }
  return gap('provider_configuration', `No approved disposition exists for source environment variable ${name}.`);
}

const backgroundDefinitions = [
  {
    key: 'billing-sync',
    sourcePointer: 'server/services/billingSync.ts',
    ...shared(
      'platform_billing',
      ['apps/api/src/routes/billing-routes.ts'],
      ['apps/api/test/billing-resync.test.ts'],
      'OperatorOS billing and signed webhook processing replace child subscription synchronization.',
    ),
  },
  {
    key: 'connector-poller',
    sourcePointer: 'server/services/connectorPoller.ts',
    ...retiredBoundary('provider_inbox_ingestion', 'Standalone connector polling is disabled pending a separate shared-provider decision.'),
  },
  {
    key: 'email-processor',
    sourcePointer: 'server/services/emailProcessor.ts',
    ...retiredBoundary('provider_inbox_ingestion', 'Raw provider email parsing and email-to-ticket creation are disabled pending a separate shared-provider decision.'),
  },
  {
    key: 'imap-poller',
    sourcePointer: 'server/services/imapPoller.ts',
    ...retiredBoundary('provider_inbox_ingestion', 'Standalone IMAP polling is disabled pending a separate shared-provider decision.'),
  },
  {
    key: 'operatoros-entitlement-sync',
    sourcePointer: 'server/services/operatorosEntitlements.ts',
    ...shared(
      'platform_entitlements',
      ['apps/api/src/routes/entitlement-routes.ts'],
      platformEvidence,
      'The consolidated runtime validates server-authoritative entitlements directly and does not maintain a child snapshot sync.',
    ),
  },
  {
    key: 'service-desk-migration',
    sourcePointer: 'server/serviceDeskMigration.ts',
    ...retiredSecurity(
      'database_release',
      'Child runtime migrations are prohibited; the ordered idempotent OperatorOS release contract is the only apply path.',
      ['apps/api/src/lib/database-release-contract.ts', 'apps/api/src/lib/pulsedesk-db-init.ts'],
    ),
  },
  {
    key: 'standalone-seeding',
    sourcePointer: 'server/seed.ts',
    ...retiredSecurity(
      'identity_seed',
      'Child users, passwords, organizations, roles, plans, and demo-auth seeding are prohibited.',
      ['apps/api/src/lib/seed-credential-policy.ts'],
    ),
  },
  {
    key: 'ticket-sla-projection',
    sourcePointer: 'server/services/ticketSla.ts',
    ...active(
      'sla',
      'Server-owned persisted response/resolution targets, events, and projections replace the standalone helper.',
    ),
  },
];

function extractInventory(source, commit) {
  const trackedFiles = git(source, 'ls-tree', '-r', '--name-only', commit)
    .split(/\r?\n/u)
    .filter(Boolean);
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
  if (ledger.moduleSlug !== 'pulsedesk') failures.push('Unexpected moduleSlug');
  if (ledger.source?.commit !== expectedSourceCommit) failures.push('PulseDesk source commit does not match the accepted provenance pin');
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
    throw new Error(`Expected PulseDesk source ${expectedSourceCommit}, received ${commit}`);
  }
  const inventory = extractInventory(sourceRoot, commit);
  const remote = git(sourceRoot, 'config', '--get', 'remote.origin.url');
  const ledger = {
    schemaVersion: 1,
    moduleSlug: 'pulsedesk',
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
