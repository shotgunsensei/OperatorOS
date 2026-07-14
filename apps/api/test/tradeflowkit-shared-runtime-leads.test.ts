import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseTradeFlowKitLeadCreate,
  parseTradeFlowKitLeadListQuery,
  parseTradeFlowKitLeadPatch,
  TRADEFLOWKIT_LEAD_STATUSES,
  TradeFlowKitLeadValidationError,
} from '../src/lib/tradeflowkit-leads.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

test('manual lead create normalizes bounded workflow fields', () => {
  const input = parseTradeFlowKitLeadCreate({
    name: '  Rivera Electric  ',
    phone: ' (555) 555-0114 ',
    email: ' LEADS@EXAMPLE.COM ',
    serviceType: ' Panel upgrade ',
    description: '  Needs an estimate this week. ',
    urgency: 'urgent',
    estimatedValueCents: 325_000,
    nextFollowUpAt: '2026-07-14T15:30:00.000Z',
  });

  assert.deepEqual(input, {
    name: 'Rivera Electric',
    phone: '(555) 555-0114',
    email: 'leads@example.com',
    serviceType: 'Panel upgrade',
    description: 'Needs an estimate this week.',
    urgency: 'urgent',
    estimatedValueCents: 325_000,
    nextFollowUpAt: new Date('2026-07-14T15:30:00.000Z'),
  });
});

test('manual lead contract rejects client-supplied authority fields', () => {
  for (const field of ['tenantId', 'createdByUserId', 'source', 'status', 'deletedAt']) {
    assert.throws(
      () => parseTradeFlowKitLeadCreate({ name: 'Rivera Electric', [field]: 'attacker-value' }),
      (error: unknown) => error instanceof TradeFlowKitLeadValidationError && error.field === field,
    );
  }
});

test('manual lead contract rejects invalid and oversized data', () => {
  for (const [body, field] of [
    [{ name: ' ' }, 'name'],
    [{ name: 'Valid', email: 'not-an-email' }, 'email'],
    [{ name: 'Valid', phone: '123' }, 'phone'],
    [{ name: 'Valid', urgency: 'critical' }, 'urgency'],
    [{ name: 'Valid', estimatedValueCents: 1.5 }, 'estimatedValueCents'],
    [{ name: 'Valid', description: 'x'.repeat(4_001) }, 'description'],
    [{ name: 'Valid', nextFollowUpAt: 'not-a-date' }, 'nextFollowUpAt'],
  ] as const) {
    assert.throws(
      () => parseTradeFlowKitLeadCreate(body),
      (error: unknown) => error instanceof TradeFlowKitLeadValidationError && error.field === field,
    );
  }
});

test('manual lead patch permits only explicit editable fields and no fake conversion state', () => {
  assert.deepEqual(TRADEFLOWKIT_LEAD_STATUSES, [
    'new',
    'contacted',
    'qualified',
    'follow_up',
    'lost',
  ]);
  assert.equal(TRADEFLOWKIT_LEAD_STATUSES.includes('converted' as never), false);

  const patch = parseTradeFlowKitLeadPatch({ status: 'contacted', nextFollowUpAt: null });
  assert.deepEqual(patch, { status: 'contacted', nextFollowUpAt: null });
  assert.throws(
    () => parseTradeFlowKitLeadPatch({ tenantId: 'other-tenant' }),
    TradeFlowKitLeadValidationError,
  );
  assert.throws(
    () => parseTradeFlowKitLeadPatch({ status: 'converted' }),
    TradeFlowKitLeadValidationError,
  );
});

test('manual lead list filters are bounded', () => {
  assert.deepEqual(parseTradeFlowKitLeadListQuery({ status: 'qualified', search: '  panel  ' }), {
    status: 'qualified',
    search: 'panel',
  });
  assert.throws(
    () => parseTradeFlowKitLeadListQuery({ search: 'x'.repeat(101) }),
    TradeFlowKitLeadValidationError,
  );
  assert.throws(
    () => parseTradeFlowKitLeadListQuery({ status: 'converted' }),
    TradeFlowKitLeadValidationError,
  );
  assert.throws(
    () => parseTradeFlowKitLeadListQuery({ tenantId: 'other-tenant' }),
    (error: unknown) => error instanceof TradeFlowKitLeadValidationError && error.field === 'tenantId',
  );
});

test('TradeFlowKit lead routes enforce module access and tenant predicates on every resource operation', () => {
  const routes = readRepoFile('apps/api/src/routes/module-shell-routes.ts');
  const start = routes.indexOf('// ===== TradeFlowKit: manual lead tracking');
  const end = routes.indexOf('// ===== CallCommand AI', start);
  assert.ok(start >= 0 && end > start, 'TradeFlowKit route block should be present');
  const block = routes.slice(start, end);

  assert.match(routes, /const tradeflowkitGuards = \[requireTenantMember, requireTenantModuleAccess\('tradeflowkit'\)\]/);
  assert.match(routes, /const tradeflowkitWriteGuards = \[\.\.\.tradeflowkitGuards, requireTenantModuleWriteAccess\]/);
  for (const signature of [
    "app.get(\n    '/v1/modules/tradeflowkit/leads'",
    "app.get(\n    '/v1/modules/tradeflowkit/leads/:id'",
    "app.post(\n    '/v1/modules/tradeflowkit/leads'",
    "app.patch(\n    '/v1/modules/tradeflowkit/leads/:id'",
    "app.delete(\n    '/v1/modules/tradeflowkit/leads/:id'",
  ]) {
    assert.ok(block.includes(signature), `missing route ${signature}`);
  }
  assert.equal((block.match(/preHandler: \[\.\.\.tradeflowkitGuards\]/g) ?? []).length, 2);
  assert.equal((block.match(/preHandler: \[\.\.\.tradeflowkitWriteGuards\]/g) ?? []).length, 3);
  assert.ok((block.match(/eq\(tradeflowkitLeads\.tenantId, ctx\.tenantId\)/g) ?? []).length >= 4);
  assert.ok((block.match(/isNull\(tradeflowkitLeads\.deletedAt\)/g) ?? []).length >= 4);
  assert.match(block, /tenantId: ctx\.tenantId/);
  assert.match(block, /createdByUserId: user\.id/);
  assert.match(block, /code: 'LEAD_NOT_FOUND'/);
  assert.match(block, /entityType: 'tradeflowkit_lead'/);
  assert.doesNotMatch(block, /\/convert|send-sms|send-email|stripe\.checkout|local login route/);
});

test('TradeFlowKit lead persistence is additive and bootstrapped idempotently', () => {
  const schema = readRepoFile('apps/api/src/schema.ts');
  const init = readRepoFile('apps/api/src/lib/saas-db-init.ts');

  assert.match(schema, /export const tradeflowkitLeads = pgTable\('tradeflowkit_leads'/);
  assert.match(schema, /tenantId:.*notNull\(\).*references\(\(\) => tenants\.id\)/);
  assert.match(schema, /createdByUserId:.*notNull\(\).*references\(\(\) => users\.id\)/);
  assert.match(init, /CREATE TABLE IF NOT EXISTS tradeflowkit_leads/);
  assert.match(init, /idx_tradeflowkit_leads_tenant_created/);
  assert.match(init, /CHECK \(status IN \('new','contacted','qualified','follow_up','lost'\)\)/);
});

test('TradeFlowKit shell exposes the live lead API with loading, empty, error, and mobile states', () => {
  const shell = readRepoFile('apps/web/src/components/module-shells/TradeFlowKitShell.tsx');
  const leadCenter = readRepoFile('apps/web/src/components/module-shells/TradeFlowKitLeadCenter.tsx');
  const client = readRepoFile('apps/web/src/lib/auth.ts');

  assert.match(shell, /TradeFlowKitLeadCenter/);
  assert.match(shell, /adapter\.tenantId/);
  assert.match(leadCenter, /tradeflowkit-lead-loading/);
  assert.match(leadCenter, /tradeflowkit-lead-empty/);
  assert.match(leadCenter, /tradeflowkit-lead-error/);
  assert.match(leadCenter, /@media \(max-width: 700px\)/);
  assert.match(leadCenter, /Provider messaging, public intake, and customer\/job conversion remain off/);
  assert.match(client, /\/modules\/tradeflowkit\/leads/);
});
