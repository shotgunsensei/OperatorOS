import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

test('PulseDesk service-desk schema and release contract are tenant-scoped and additive', () => {
  const schema = read('apps/api/src/schema.ts');
  const ddl = read('apps/api/src/lib/pulsedesk-db-init.ts');
  const release = read('apps/api/src/lib/database-release-contract.ts');
  for (const name of [
    'pulsedesk_queues', 'pulsedesk_teams', 'pulsedesk_ticket_options', 'pulsedesk_sla_policies',
    'pulsedesk_assets', 'pulsedesk_ticket_messages', 'pulsedesk_ticket_assignments',
    'pulsedesk_time_entries', 'pulsedesk_sla_events', 'pulsedesk_vendor_engagements',
    'pulsedesk_supply_requests', 'pulsedesk_facility_requests', 'pulsedesk_saved_views',
    'pulsedesk_knowledge_articles', 'pulsedesk_notification_preferences', 'pulsedesk_migration_refs',
  ]) {
    assert.match(schema, new RegExp(`pgTable\\('${name}'`), `missing schema table ${name}`);
    assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${name}`), `missing release DDL ${name}`);
  }
  assert.match(ddl, /FOREIGN KEY \(tenant_id, directory_organization_id\)/);
  assert.match(ddl, /FOREIGN KEY \(tenant_id, ticket_id\)/);
  assert.match(ddl, /CHECK \(visibility IN \('requester','internal'\)\)/);
  assert.match(release, /id: 'pulsedesk_tables'/);
});

test('PulseDesk routes enforce module guards, privacy acknowledgement, concurrency, idempotency, shared services, and transactional writes', () => {
  const routes = read('apps/api/src/routes/pulsedesk-service-desk-routes.ts');
  assert.match(routes, /requireTenantModuleAccess\('pulsedesk'\)/);
  assert.match(routes, /requireTenantModuleWriteAccess/);
  assert.match(routes, /requireNoPhiAcknowledgement/);
  assert.match(routes, /pulseDeskIdempotencyKey/);
  assert.match(routes, /enqueueOutboxMessage/);
  assert.match(routes, /createAttachment/);
  assert.match(routes, /db\.transaction\(async \(tx\) =>/);
  assert.match(routes, /eq\(pulsedeskRequests\.version, expectedVersion\)/);
  assert.match(routes, /visibility === 'internal'/);
  assert.match(routes, /PULSEDESK_TECHDECK_FIELD_PROHIBITED/);
  assert.match(routes, /app\.patch\('\/v1\/modules\/pulsedesk\/tickets\/:id'/);
  assert.match(routes, /app\.post\('\/v1\/modules\/pulsedesk\/tickets\/bulk'/);
  assert.match(routes, /listOrganizations\(directoryActor\(request\)/);
  assert.match(routes, /listSites\(directoryActor\(request\)/);
  assert.doesNotMatch(routes, /localStorage|parent-domain|document\.cookie/);
});

test('PulseDesk UI exposes real persisted workflows, privacy guidance, responsive states, and supported deep links', () => {
  const shell = read('apps/web/src/components/module-shells/PulseDeskShell.tsx');
  const workspace = read('apps/web/src/components/module-shells/PulseDeskServiceDeskWorkspace.tsx');
  const routeContract = read('apps/web/src/components/module-shells/PulseDeskRoute.contract.ts');
  const auth = read('apps/web/src/lib/auth.ts');
  const routeMap = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  assert.match(shell, /PulseDeskServiceDeskWorkspace/);
  assert.match(shell, /BusinessDirectory moduleSlug="pulsedesk"/);
  assert.match(workspace, /No patient data \/ no unnecessary PHI/);
  for (const label of ['dashboard', 'tickets', 'operations', 'knowledge', 'admin']) assert.match(workspace, new RegExp(`'${label}'`));
  for (const state of ['pulsedesk-service-desk-loading', 'pulsedesk-service-error', 'No tickets match']) assert.match(workspace, new RegExp(state));
  assert.match(workspace, /createServiceTicket/);
  assert.match(workspace, /addTicketReply/);
  assert.match(workspace, /addTicketInternalNote/);
  assert.match(workspace, /addTicketTime/);
  assert.match(workspace, /assignServiceTicket/);
  assert.match(workspace, /transitionServiceTicket/);
  assert.match(workspace, /uploadTicketAttachment/);
  assert.match(auth, /\/modules\/pulsedesk\/tickets/);
  for (const path of ['/app', '/assets', '/submit', '/supply-requests', '/facility-requests', '/knowledge', '/service-desk/admin', '/service-desk-admin', '/analytics']) assert.ok(routeMap.includes(`'${path}'`));
  assert.match(workspace, /assetIssueMatch/);
  assert.match(workspace, /requestedAssetId/);
  assert.match(shell, /data-pulsedesk-route/);
  assert.doesNotMatch(workspace, /role="tablist"/);
  for (const path of ['requests', 'assignments', 'contacts', 'operations', 'inbound', 'analytics', 'knowledge', 'integrations', 'settings']) {
    assert.match(routeContract, new RegExp(`canonicalPath: '/${path}'`));
  }
  assert.match(routeContract, /service-desk-admin/);
  assert.match(workspace, /Reporting an issue for the equipment selected by this deep link/);
  assert.match(read('apps/web/src/components/module-shells/BusinessDirectory.tsx'), /organizationMatch/);
  assert.doesNotMatch(workspace, /Math\.random|mock ticket|fake CRUD|TODO/);
});

test('PulseDesk importer is dry-run only and excludes standalone authority and provider secrets', () => {
  const importer = read('apps/api/src/lib/pulsedesk-import.ts');
  const command = read('apps/api/src/scripts/pulsedesk-import.ts');
  assert.match(importer, /const AUTHORITY/);
  assert.match(importer, /const PROVIDER_OR_SENSITIVE/);
  assert.match(importer, /assertNoProhibitedPhi/);
  assert.match(importer, /sourceFingerprint/);
  assert.match(importer, /referencesMissing/);
  assert.match(command, /Only --dry-run is supported/);
  assert.doesNotMatch(command, /db\.|DATABASE_URL|INSERT INTO|UPDATE /);
});
