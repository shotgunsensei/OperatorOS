import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseTechDeckTicketCreate,
  parseTechDeckTicketListQuery,
  parseTechDeckTicketPatch,
  parseTechDeckTicketStatus,
  TECHDECK_TICKET_PRIORITIES,
  TECHDECK_TICKET_STATUSES,
  TechDeckTicketValidationError,
} from '../src/lib/techdeck-tickets.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8').replaceAll('\r\n', '\n');
}

test('TechDeck ticket create normalizes its bounded workflow fields', () => {
  const input = parseTechDeckTicketCreate({
    title: '  VPN access failing  ',
    description: '  User cannot reach the remote gateway.  ',
    priority: 'high',
    assignedToUserId: '11111111-1111-4111-8111-111111111111',
    responseDeadline: '2026-07-14T13:00:00.000Z',
    resolutionDeadline: '2026-07-14T17:00:00.000Z',
  });

  assert.deepEqual(input, {
    title: 'VPN access failing',
    description: 'User cannot reach the remote gateway.',
    priority: 'high',
    assignedToUserId: '11111111-1111-4111-8111-111111111111',
    responseDeadline: new Date('2026-07-14T13:00:00.000Z'),
    resolutionDeadline: new Date('2026-07-14T17:00:00.000Z'),
    directoryOrganizationId: null,
    directorySiteId: null,
    configurationItemId: null,
  });
});

test('TechDeck ticket contract rejects client-supplied authority and lifecycle fields', () => {
  for (const field of [
    'tenantId',
    'createdByUserId',
    'number',
    'status',
    'respondedAt',
    'resolvedAt',
    'closedAt',
    'deletedAt',
  ]) {
    assert.throws(
      () => parseTechDeckTicketCreate({ title: 'VPN unavailable', [field]: 'attacker-value' }),
      (error: unknown) => error instanceof TechDeckTicketValidationError && error.field === field,
    );
  }
});

test('TechDeck ticket contract preserves imported status and priority semantics', () => {
  assert.deepEqual(TECHDECK_TICKET_PRIORITIES, ['critical', 'high', 'medium', 'low']);
  assert.deepEqual(TECHDECK_TICKET_STATUSES, [
    'open',
    'in_progress',
    'waiting_on_client',
    'resolved',
    'closed',
  ]);
  assert.equal('category' in parseTechDeckTicketCreate({ title: 'Printer offline' }), false);
  assert.equal(parseTechDeckTicketStatus({ status: 'waiting_on_client' }), 'waiting_on_client');
  assert.throws(
    () => parseTechDeckTicketStatus({ status: 'pending' }),
    TechDeckTicketValidationError,
  );
});

test('TechDeck ticket create and patch reject invalid or oversized input', () => {
  for (const [body, field] of [
    [{ title: ' ' }, 'title'],
    [{ title: 'x'.repeat(181) }, 'title'],
    [{ title: 'Valid', description: 'x'.repeat(6_001) }, 'description'],
    [{ title: 'Valid', priority: 'emergency' }, 'priority'],
    [{ title: 'Valid', assignedToUserId: 'not-a-user-id' }, 'assignedToUserId'],
    [{ title: 'Valid', assignedToUserId: '11111111-11114111-8111-111111111111' }, 'assignedToUserId'],
    [{ title: 'Valid', responseDeadline: 'not-a-date' }, 'responseDeadline'],
    [{ title: 'Valid', resolutionDeadline: 'not-a-date' }, 'resolutionDeadline'],
  ] as const) {
    assert.throws(
      () => parseTechDeckTicketCreate(body),
      (error: unknown) => error instanceof TechDeckTicketValidationError && error.field === field,
    );
  }

  assert.deepEqual(parseTechDeckTicketPatch({ priority: 'critical', responseDeadline: null }), {
    priority: 'critical',
    responseDeadline: null,
  });
  assert.throws(
    () => parseTechDeckTicketPatch({ tenantId: 'other', status: 'closed', deletedAt: 'now' }),
    TechDeckTicketValidationError,
  );
});

test('TechDeck ticket list filters are bounded', () => {
  assert.deepEqual(parseTechDeckTicketListQuery({
    status: 'in_progress',
    priority: 'high',
    assignment: 'mine',
    search: '  vpn  ',
  }), {
    status: 'in_progress',
    priority: 'high',
    assignment: 'mine',
    search: 'vpn',
  });
  assert.throws(
    () => parseTechDeckTicketListQuery({ assignment: 'anyone' }),
    TechDeckTicketValidationError,
  );
  assert.throws(
    () => parseTechDeckTicketListQuery({ tenantId: 'other-tenant' }),
    (error: unknown) => error instanceof TechDeckTicketValidationError && error.field === 'tenantId',
  );
  assert.throws(
    () => parseTechDeckTicketListQuery({ search: 'x'.repeat(101) }),
    TechDeckTicketValidationError,
  );
});

test('TechDeck ticket routes enforce module access, tenant masking, and server-owned lifecycle state', () => {
  const routes = readRepoFile('apps/api/src/routes/module-shell-routes.ts');
  const start = routes.indexOf('// ===== TechDeck: technician ticket queue');
  const end = routes.indexOf('// ===== CallCommand AI', start);
  assert.ok(start >= 0 && end > start, 'TechDeck ticket route block should be present');
  const block = routes.slice(start, end);

  assert.match(routes, /const techdeckGuards = \[requireTenantMember, requireTenantModuleAccess\('techdeck'\)\]/);
  assert.match(routes, /const techdeckWriteGuards = \[\.\.\.techdeckGuards, requireTenantModuleWriteAccess\]/);
  for (const signature of [
    "app.get(\n    '/v1/modules/techdeck/tickets'",
    "app.get(\n    '/v1/modules/techdeck/tickets/:id'",
    "app.post(\n    '/v1/modules/techdeck/tickets'",
    "app.patch(\n    '/v1/modules/techdeck/tickets/:id'",
    "app.patch(\n    '/v1/modules/techdeck/tickets/:id/status'",
    "app.delete(\n    '/v1/modules/techdeck/tickets/:id'",
  ]) {
    assert.ok(block.includes(signature), `missing route ${signature}`);
  }
  assert.equal((block.match(/preHandler: \[\.\.\.techdeckGuards\]/g) ?? []).length, 2);
  assert.equal((block.match(/preHandler: \[\.\.\.techdeckWriteGuards/g) ?? []).length, 4);
  assert.match(block, /preHandler: \[\.\.\.techdeckWriteGuards, requireTenantAdmin\]/);
  assert.ok((block.match(/eq\(techdeckTickets\.tenantId, ctx\.tenantId\)/g) ?? []).length >= 7);
  assert.ok((block.match(/isNull\(techdeckTickets\.deletedAt\)/g) ?? []).length >= 7);
  assert.match(block, /tenantId: ctx\.tenantId/);
  assert.match(block, /createdByUserId: user\.id/);
  assert.match(block, /status: 'open'/);
  assert.match(block, /code: 'TICKET_NOT_FOUND'/);
  assert.match(block, /respondedAt = before\.respondedAt \?\? now/);
  assert.match(block, /resolvedAt = now/);
  assert.match(block, /closedAt = now/);
});

test('TechDeck assignment and audit logic rejects foreign targets without leaking identity', () => {
  const routes = readRepoFile('apps/api/src/routes/module-shell-routes.ts');

  assert.match(routes, /getTenantMembership\(assignedToUserId, ctx\.tenantId\)/);
  assert.match(routes, /resolveTenantModuleAccess\(assignedToUserId, ctx\.tenantId, 'techdeck'\)/);
  assert.match(routes, /code: 'INVALID_ASSIGNEE'/);
  assert.match(routes, /code: 'TICKET_ASSIGNMENT_FORBIDDEN'/);
  assert.match(routes, /claimingAnotherUserTicket/);
  assert.match(routes, /ctx\.viaPlatformRole \|\| ctx\.role === 'owner' \|\| ctx\.role === 'admin'/);

  const start = routes.indexOf('// ===== TechDeck: technician ticket queue');
  const end = routes.indexOf('// ===== CallCommand AI', start);
  const block = routes.slice(start, end);
  assert.ok((block.match(/db\.transaction/g) ?? []).length >= 4);
  assert.ok((block.match(/entityType: 'techdeck_ticket'/g) ?? []).length >= 4);
  for (const action of ["action: 'created'", "action: 'updated'", "action: 'status_changed'", "action: 'deleted'"]) {
    assert.ok(block.includes(action), `missing activity action ${action}`);
  }
});

test('TechDeck ticket persistence is additive, tenant-numbered, and bootstrapped idempotently', () => {
  const schema = readRepoFile('apps/api/src/schema.ts');
  const init = readRepoFile('apps/api/src/lib/saas-db-init.ts');
  const routes = readRepoFile('apps/api/src/routes/module-shell-routes.ts');

  assert.match(schema, /export const techdeckTicketSequences = pgTable\('techdeck_ticket_sequences'/);
  assert.match(schema, /export const techdeckTickets = pgTable\('techdeck_tickets'/);
  assert.match(schema, /uniqueIndex\('idx_techdeck_tickets_number'\)\.on\(t\.tenantId, t\.number\)/);
  assert.match(schema, /responseDeadline: timestamp\('response_deadline'\)/);
  assert.match(schema, /respondedAt: timestamp\('responded_at'\)/);
  assert.match(init, /CREATE TABLE IF NOT EXISTS techdeck_ticket_sequences/);
  assert.match(init, /CREATE TABLE IF NOT EXISTS techdeck_tickets/);
  assert.match(init, /CREATE UNIQUE INDEX IF NOT EXISTS idx_techdeck_tickets_number/);
  assert.match(init, /CHECK \(priority IN \('critical','high','medium','low'\)\)/);
  assert.match(init, /CHECK \(status IN \('open','in_progress','waiting_on_client','resolved','closed'\)\)/);
  assert.match(routes, /onConflictDoUpdate/);
  assert.match(routes, /lastNumber: sql`\$\{techdeckTicketSequences\.lastNumber\} \+ 1`/);
  assert.doesNotMatch(routes, /SELECT\s+MAX\(number\)\s*\+\s*1/i);
});

test('TechDeck shell exposes the live ticket API with loading, empty, error, and mobile states', () => {
  const shell = readRepoFile('apps/web/src/components/module-shells/TechDeckShell.tsx');
  const queue = readRepoFile('apps/web/src/components/module-shells/TechDeckTicketQueue.tsx');
  const client = readRepoFile('apps/web/src/lib/auth.ts');

  assert.match(shell, /TechDeckTicketQueue/);
  assert.match(shell, /currentUserId=\{user\.id\}/);
  assert.match(queue, /techdeck-ticket-loading/);
  assert.match(queue, /techdeck-ticket-empty/);
  assert.match(queue, /techdeck-ticket-error/);
  assert.match(queue, /techdeck-ticket-create-form/);
  assert.match(queue, /@media \(max-width: 700px\)/);
  assert.match(client, /\/modules\/techdeck\/tickets/);
  assert.doesNotMatch(queue, /stripe|password|local auth/i);
});
