import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

test('PulseDesk persistence is additive, tenant-scoped, and keeps immutable event history', () => {
  const schema = readRepoFile('apps/api/src/schema.ts');
  const start = schema.indexOf('export const pulsedeskDepartments');
  const end = schema.indexOf(' * OperatorOS-owned TradeFlowKit lead pipeline.', start);
  assert.ok(start >= 0 && end > start, 'PulseDesk schema block should exist');
  const block = schema.slice(start, end);

  for (const table of [
    "pgTable('pulsedesk_departments'",
    "pgTable('pulsedesk_request_sequences'",
    "pgTable('pulsedesk_requests'",
    "pgTable('pulsedesk_request_events'",
  ]) {
    assert.ok(block.includes(table), `missing ${table}`);
  }
  assert.match(block, /uniqueIndex\('idx_pulsedesk_departments_tenant_name_ci'\)\.on\([\s\S]*sql`lower\(\$\{t\.name\}\)`/);
  assert.match(block, /uniqueIndex\('idx_pulsedesk_requests_number'\)\.on\(t\.tenantId, t\.number\)/);
  assert.match(block, /requestId:[\s\S]*references\([\s\S]*\(\) => pulsedeskRequests\.id,[\s\S]*\{ onDelete: 'restrict' \}/);
  assert.doesNotMatch(block, /pulsedeskRequests\.id, \{ onDelete: 'cascade' \}/);
  assert.match(block, /metadata: jsonb\('metadata'\)/);
  assert.match(block, /description: text\('description'\)/);
  assert.match(block, /export const pulsedeskTicketMessages/);
  assert.match(block, /export const pulsedeskTimeEntries/);
  assert.doesNotMatch(block, /patientName|medicalRecordNumber|dateOfBirth|diagnosis|treatmentPlan|insuranceId|clinicalNote/);
});

test('PulseDesk startup DDL is idempotent, constrained, case-insensitive, and restrictive', () => {
  const init = readRepoFile('apps/api/src/lib/saas-db-init.ts');
  const start = init.indexOf('-- PulseDesk shared-runtime slice');
  const end = init.indexOf('-- TradeFlowKit shared-runtime slice', start);
  assert.ok(start >= 0 && end > start, 'PulseDesk DDL block should exist');
  const block = init.slice(start, end);

  for (const table of [
    'pulsedesk_departments',
    'pulsedesk_request_sequences',
    'pulsedesk_requests',
    'pulsedesk_request_events',
  ]) {
    assert.match(block, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(block, /CREATE UNIQUE INDEX IF NOT EXISTS idx_pulsedesk_departments_tenant_name_ci\s+ON pulsedesk_departments\(tenant_id, lower\(name\)\)/);
  assert.match(block, /request_id VARCHAR\(36\) NOT NULL REFERENCES pulsedesk_requests\(id\) ON DELETE RESTRICT,/);
  assert.doesNotMatch(block, /request_id[^\n]+ON DELETE CASCADE/);
  assert.match(block, /confdeltype = 'c'/);
  assert.match(block, /FOREIGN KEY \(request_id\) REFERENCES pulsedesk_requests\(id\) ON DELETE RESTRICT/);
  assert.match(block, /CHECK \(last_number >= 0\)/);
  assert.match(block, /CHECK \(number >= 1\)/);
  assert.match(block, /CHECK \(version >= 1\)/);
  assert.match(block, /CHECK \(char_length\(summary\) BETWEEN 5 AND 160/);
  assert.match(block, /CHECK \(priority IN \('critical','high','normal','low'\)\)/);
  assert.match(block, /waiting_department/);
  assert.match(block, /medical_equipment/);
  assert.match(block, /department_changed/);
  assert.match(block, /ON CONFLICT \(tenant_id\) DO UPDATE SET/);
});

test('PulseDesk routes are guarded and expose only server-derived workflow capability', () => {
  const routes = readRepoFile('apps/api/src/routes/pulsedesk-routes.ts');
  const parentRoutes = readRepoFile('apps/api/src/routes/module-shell-routes.ts');

  assert.match(parentRoutes, /import \{ registerPulseDeskRoutes \} from '\.\/pulsedesk-routes\.js'/);
  assert.match(parentRoutes, /await registerPulseDeskRoutes\(app\)/);
  assert.match(routes, /const pulsedeskGuards = \[requireTenantMember, requireTenantModuleAccess\('pulsedesk'\)\]/);
  assert.match(routes, /const pulsedeskWriteGuards = \[\.\.\.pulsedeskGuards, requireTenantModuleWriteAccess\]/);
  for (const route of [
    '/v1/modules/pulsedesk/departments',
    '/v1/modules/pulsedesk/departments/:id',
    '/v1/modules/pulsedesk/assignees',
    '/v1/modules/pulsedesk/requests',
    '/v1/modules/pulsedesk/requests/:id',
    '/v1/modules/pulsedesk/requests/:id/transitions',
  ]) {
    assert.ok(routes.includes(`'${route}'`), `missing route ${route}`);
  }
  assert.equal((routes.match(/preHandler: \[\.\.\.pulsedeskGuards/g) ?? []).length, 4);
  assert.equal((routes.match(/preHandler: \[\.\.\.pulsedeskWriteGuards/g) ?? []).length, 5);
  assert.ok((routes.match(/requirePulseDeskWorkflowManager/g) ?? []).length >= 6);
  assert.match(routes, /moduleAccessLevel === 'manager'/);
  assert.match(routes, /ctx\.role === 'owner'/);
  assert.match(routes, /ctx\.role === 'admin'/);
  assert.match(routes, /canManageWorkflow:/);
  assert.match(routes, /capabilities: workflowCapabilities\(request\)/);
  assert.doesNotMatch(routes, /request\.body[\s\S]{0,120}canManageWorkflow/);
});

test('PulseDesk lookup and assignment rules mask tenant boundaries and eligibility', () => {
  const routes = readRepoFile('apps/api/src/routes/pulsedesk-routes.ts');

  assert.ok((routes.match(/eq\(pulsedeskRequests\.tenantId, ctx\.tenantId\)/g) ?? []).length >= 5);
  assert.ok((routes.match(/eq\(pulsedeskDepartments\.tenantId, (?:ctx\.)?tenantId\)/g) ?? []).length >= 3);
  assert.match(routes, /eq\(pulsedeskDepartments\.active, true\)/);
  assert.match(routes, /getTenantMembership\(userId, tenantId\)/);
  assert.match(routes, /resolveTenantModuleAccess\(userId, tenantId, 'pulsedesk'\)/);
  assert.match(routes, /eq\(users\.status, 'active'\)/);
  assert.match(routes, /code: 'PULSEDESK_REQUEST_NOT_FOUND'/);
  assert.match(routes, /code: 'PULSEDESK_DEPARTMENT_NOT_FOUND'/);
  assert.match(routes, /code: 'PULSEDESK_ASSIGNEE_NOT_FOUND'/);
  assert.doesNotMatch(routes, /select\(\)\.from\(pulsedeskRequests\)\.where\(eq\(pulsedeskRequests\.id/);
});

test('PulseDesk request state, SLA, numbering, and versions remain server-owned', () => {
  const routes = readRepoFile('apps/api/src/routes/pulsedesk-routes.ts');
  const domain = readRepoFile('apps/api/src/lib/pulsedesk-requests.ts');

  assert.match(routes, /onConflictDoUpdate\([\s\S]*lastNumber: sql`\$\{pulsedeskRequestSequences\.lastNumber\} \+ 1`/);
  assert.doesNotMatch(routes, /MAX\(number\)\s*\+\s*1/i);
  assert.match(routes, /status: 'new'/);
  assert.match(routes, /version: 1/);
  assert.match(routes, /calculatePulseDeskDueAt\(input\.priority, input\.isPatientImpacting, now\)/);
  assert.match(routes, /calculatePulseDeskDueAt\(effectivePriority, effectivePatientImpact, before\.createdAt\)/);
  assert.match(routes, /eq\(pulsedeskRequests\.version, input\.expectedVersion\)/);
  assert.match(routes, /version: sql`\$\{pulsedeskRequests\.version\} \+ 1`/);
  assert.match(routes, /assertPulseDeskStatusTransition/);
  assert.match(domain, /const PATCH_FIELDS = new Set\(\[/);
  const patchFields = domain.slice(domain.indexOf('const PATCH_FIELDS'), domain.indexOf('const TRANSITION_FIELDS'));
  assert.doesNotMatch(patchFields, /'dueAt'/);
  assert.doesNotMatch(patchFields, /'status'|'version'|'tenantId'|'createdByUserId'/);
});

test('PulseDesk audit surfaces structured metadata without narrative duplication', () => {
  const routes = readRepoFile('apps/api/src/routes/pulsedesk-routes.ts');
  const activityWrites = [...routes.matchAll(/tx\.insert\(activityFeed\)\.values\(\{([\s\S]*?)\n\s*\}\);/g)]
    .map((match) => match[1]);
  assert.ok(activityWrites.length >= 5);
  for (const write of activityWrites) {
    assert.doesNotMatch(write, /summary:\s*(?:row|before|updated|input|patch)\./);
    assert.doesNotMatch(write, /location(?:Label)?:\s*(?:row|before|updated|input|patch)\./i);
  }
  assert.match(routes, /eventType: PulseDeskRequestEventType/);
  assert.match(routes, /'department_changed'/);
  assert.match(routes, /'assignee_changed'/);
  assert.match(routes, /'priority_changed'/);
  assert.match(routes, /'status_changed'/);
  assert.match(routes, /reasonCode/);
  assert.doesNotMatch(routes, /app\.delete\(/);
  assert.doesNotMatch(routes, /\/notes|\/attachments|\/email|\/vendors|\/billing|\/auth/);
});
