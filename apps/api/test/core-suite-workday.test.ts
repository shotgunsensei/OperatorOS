import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPulseDeskWorkday,
  buildTechDeckWorkday,
  buildTradeFlowKitWorkday,
} from '../../web/src/lib/core-suite-workday.ts';
import type {
  PulseDeskServiceDashboard,
  PulseDeskServiceTicket,
  TechDeckTicket,
  TechDeckWorkspaceResponse,
  TradeFlowKitOperationsResponse,
  TradeFlowKitRevenueResponse,
} from '../../web/src/lib/auth.js';

const now = Date.UTC(2026, 8, 1, 16, 0, 0);

const emptyTradeOperations: TradeFlowKitOperationsResponse = {
  jobs: [], tasks: [], payments: [], settings: null,
  metrics: { leads: 0, jobs: 0, tasks: 0, completed_tasks: 0, invoiced_cents: '0', collected_cents: '0', outstanding_cents: '0' },
  pagination: { limit: 50, offset: 0, returned: 0 },
};
const emptyTradeRevenue: TradeFlowKitRevenueResponse = { customers: [], jobs: [], quotes: [], invoices: [] };

const emptyTechWorkspace: TechDeckWorkspaceResponse = {
  configurationItems: [], relationships: [], folders: [], documents: [], evidence: [], reports: [],
  timeEntries: [], comments: [], alerts: [], lifecycleDue: [], incomplete: [],
  execution: { enabled: false, reason: 'Documentation only' },
};

const emptyPulseDashboard: PulseDeskServiceDashboard = {
  metrics: { tickets: 0, openTickets: 0, atRisk: 0, overdue: 0, operationalAssets: 0, pendingSupplyRequests: 0, openFacilityRequests: 0, timeMinutes: 0 },
  byStatus: {},
  generatedAt: new Date(now).toISOString(),
};

test('TradeFlowKit workday ranks cash, handoff, and delivery risks without mutating them', () => {
  const operations: TradeFlowKitOperationsResponse = {
    ...emptyTradeOperations,
    jobs: [{ id: 'job-1', customerId: 'customer-1', number: 42, title: 'Roof inspection', description: null, status: 'done', priority: 'normal', version: 1 }],
    tasks: [
      { id: 'task-1', jobId: 'job-1', title: 'Confirm permit', description: null, status: 'todo', priority: 'urgent', assignedToUserId: null, dueAt: '2026-08-31T12:00:00.000Z', sortOrder: 0, completedAt: null, version: 1, jobTitle: 'Roof inspection' },
      { id: 'task-2', jobId: 'job-1', title: 'Order flashing', description: null, status: 'blocked', priority: 'high', assignedToUserId: null, dueAt: null, sortOrder: 1, completedAt: null, version: 1, jobTitle: 'Roof inspection' },
    ],
    metrics: { leads: 1, jobs: 1, tasks: 2, completed_tasks: 0, invoiced_cents: '90000', collected_cents: '45000', outstanding_cents: '45000' },
  };
  const revenue: TradeFlowKitRevenueResponse = {
    customers: [{ id: 'customer-1', name: 'Acme', phone: null, email: null, address: null, notes: null, version: 1 }],
    jobs: operations.jobs,
    quotes: [{ id: 'quote-1', number: 11, customerId: 'customer-1', jobId: 'job-1', status: 'accepted', lineItems: [], subtotalCents: 90000, taxRateBps: 0, taxCents: 0, discountCents: 0, totalCents: 90000, notes: null, expiresAt: null, version: 1 }],
    invoices: [{ id: 'invoice-1', number: 8, customerId: 'customer-1', jobId: null, status: 'sent', lineItems: [], subtotalCents: 45000, taxRateBps: 0, taxCents: 0, discountCents: 0, totalCents: 45000, notes: null, expiresAt: null, version: 1, sourceQuoteId: null, dueDate: '2026-08-20T00:00:00.000Z', paidAt: null, paidCents: 0, balanceCents: 45000, paymentMethod: null, paymentReference: null }],
  };

  const brief = buildTradeFlowKitWorkday(operations, revenue, now);
  assert.equal(brief.state, 'active');
  assert.equal(brief.title, 'Move the next job toward payment');
  assert.equal(brief.actions[0]?.id, 'invoice-invoice-1');
  assert.ok(brief.actions.some(action => action.id === 'quote-quote-1'));
  assert.ok(brief.actions.some(action => action.id === 'job-job-1'));
  assert.ok(brief.actions.some(action => action.id === 'task-overdue-task-1'));
  assert.ok(brief.actions.some(action => action.id === 'task-blocked-task-2'));
  assert.equal(brief.metrics[0]?.value, '$450');
  assert.equal(brief.primaryAction.href, '/invoices/invoice-1');
});

test('TradeFlowKit empty workspace gives one bounded three-step start path', () => {
  const brief = buildTradeFlowKitWorkday(emptyTradeOperations, emptyTradeRevenue, now);
  assert.equal(brief.state, 'setup');
  assert.equal(brief.primaryAction.href, '/customers');
  assert.deepEqual(brief.setupSteps.map(step => step.href), ['/customers', '/quotes/new', '/recurring-jobs']);
});

test('TechDeck workday ranks overdue dispatch and technical risk ahead of review work', () => {
  const ticket: TechDeckTicket = {
    id: 'ticket-1', tenantId: 'tenant-1', number: 77, createdByUserId: 'user-1', assignedToUserId: null,
    directoryOrganizationId: null, directorySiteId: null, configurationItemId: null, title: 'Firewall offline', description: null,
    priority: 'critical', status: 'open', responseDeadline: '2026-08-31T12:00:00.000Z', resolutionDeadline: '2026-08-31T14:00:00.000Z',
    respondedAt: null, resolvedAt: null, closedAt: null, version: 1, createdAt: '2026-08-31T10:00:00.000Z', updatedAt: '2026-08-31T10:00:00.000Z',
  };
  const asset = {
    id: 'asset-1', tenantId: 'tenant-1', name: 'Edge firewall', type: 'firewall' as const, status: 'active' as const,
    directoryOrganizationId: null, directorySiteId: null, hostname: null, ipAddress: null, operatingSystem: null, vendor: null, product: null, model: null,
    serialNumber: null, macAddress: null, externalVaultReference: null, vlanNumber: null, cidr: null, gateway: null, dhcpStart: null, dhcpEnd: null,
    dnsServers: [], health: 'offline' as const, lastSeenAt: null, expirationDate: null, renewalDate: null, warrantyEndDate: null,
    details: {}, tags: [], notes: null, version: 1, updatedAt: '2026-08-31T10:00:00.000Z',
  };
  const workspace: TechDeckWorkspaceResponse = {
    ...emptyTechWorkspace,
    configurationItems: [asset],
    alerts: [asset],
    documents: [{ id: 'doc-1', title: 'Firewall recovery', slug: 'firewall-recovery', pageType: 'runbook', summary: null, content: 'Review only', status: 'in_review', minimumRole: 'member', tags: [], version: 2, updatedAt: '2026-08-31T10:00:00.000Z', directoryOrganizationId: null, directorySiteId: null }],
  };

  const brief = buildTechDeckWorkday(workspace, [ticket], now);
  assert.equal(brief.state, 'active');
  assert.equal(brief.title, 'Handle the highest-risk work first');
  assert.equal(brief.actions[0]?.id, 'ticket-overdue-ticket-1');
  assert.ok(brief.actions.some(action => action.id === 'asset-risk-asset-1'));
  assert.ok(brief.actions.some(action => action.id === 'document-doc-1'));
  assert.equal(brief.primaryAction.href, '/tickets/ticket-1');
  assert.equal(brief.automations[1]?.href, '/compliance');
});

test('TechDeck empty workspace starts with shared client authority rather than duplicated setup', () => {
  const brief = buildTechDeckWorkday(emptyTechWorkspace, [], now);
  assert.equal(brief.state, 'setup');
  assert.equal(brief.primaryAction.href, '/clients');
  assert.deepEqual(brief.setupSteps.map(step => step.href), ['/clients', '/assets', '/tickets']);
});

test('PulseDesk workday ranks PHI-minimized SLA and ownership pressure', () => {
  const dashboard: PulseDeskServiceDashboard = {
    ...emptyPulseDashboard,
    metrics: { tickets: 2, openTickets: 2, atRisk: 1, overdue: 1, operationalAssets: 3, pendingSupplyRequests: 2, openFacilityRequests: 1, timeMinutes: 45 },
  };
  const tickets: PulseDeskServiceTicket[] = [
    { id: 'request-1', humanId: 'PD-101', number: 101, summary: 'Sterile storage door will not latch', description: '', locationLabel: 'Supply room', status: 'new', priority: 'critical', category: 'facilities_building', ticketTypeKey: 'incident', directoryOrganizationId: null, directorySiteId: null, requesterContactId: null, departmentId: null, assetId: null, queueId: null, teamId: null, assignedToUserId: null, slaPolicyId: null, responseDueAt: null, resolutionDueAt: null, firstRespondedAt: null, resolvedAt: null, closedAt: null, archivedAt: null, version: 1, createdAt: '2026-08-31T10:00:00.000Z', updatedAt: '2026-08-31T10:00:00.000Z', sla: { state: 'overdue', responseOverdue: true, resolutionOverdue: true } },
    { id: 'request-2', humanId: 'PD-102', number: 102, summary: 'Wheelchair inventory count low', description: '', locationLabel: 'Main entrance', status: 'triage', priority: 'high', category: 'supplies_inventory', ticketTypeKey: 'supply', directoryOrganizationId: null, directorySiteId: null, requesterContactId: null, departmentId: null, assetId: null, queueId: null, teamId: null, assignedToUserId: null, slaPolicyId: null, responseDueAt: null, resolutionDueAt: null, firstRespondedAt: null, resolvedAt: null, closedAt: null, archivedAt: null, version: 1, createdAt: '2026-08-31T10:00:00.000Z', updatedAt: '2026-08-31T10:00:00.000Z', sla: { state: 'at_risk', responseOverdue: false, resolutionOverdue: false } },
  ];

  const brief = buildPulseDeskWorkday(dashboard, tickets, true);
  assert.equal(brief.state, 'active');
  assert.equal(brief.title, 'Resolve the most urgent operational issue');
  assert.equal(brief.actions[0]?.id, 'request-overdue-request-1');
  assert.ok(brief.actions.some(action => action.id === 'request-risk-request-2'));
  assert.ok(brief.actions.some(action => action.id === 'pending-supplies'));
  assert.equal(brief.primaryAction.href, '/requests/request-1');
  assert.deepEqual(brief.automations.map(action => action.href), ['/inbound', '/settings']);
});

test('PulseDesk empty workspace keeps setup short and role-aware', () => {
  const manager = buildPulseDeskWorkday(emptyPulseDashboard, [], true);
  const member = buildPulseDeskWorkday(emptyPulseDashboard, [], false);
  assert.equal(manager.state, 'setup');
  assert.equal(manager.primaryAction.href, '/requests');
  assert.equal(manager.setupSteps[2]?.href, '/settings');
  assert.equal(member.setupSteps[2]?.href, '/requests');
  assert.deepEqual(member.automations.map(action => action.href), ['/requests', '/assignments']);
});
