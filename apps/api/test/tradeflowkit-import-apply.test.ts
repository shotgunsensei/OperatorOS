process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-import-apply-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { applyTradeFlowKitImport } from '../src/lib/tradeflowkit-import-apply.js';
import { planTradeFlowKitImport } from '../src/lib/tradeflowkit-import.js';
import {
  adminAuditLogs,
  directoryOrganizations,
  tenantModules,
  tenantUsers,
  tradeflowkitCustomers,
  tradeflowkitInvoices,
  tradeflowkitJobs,
  tradeflowkitMigrationRefs,
  tradeflowkitPayments,
  tradeflowkitQuotes,
  tradeflowkitTasks,
} from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let owner: any;
let otherTenantOwner: any;
let viewer: any;
let moduleRow: any;

function exportFixture() {
  const orgId = 'legacy-org-phase16';
  return {
    exportVersion: 1,
    exportedAt: '2026-07-28T12:00:00.000Z',
    sourceCommit: '37aa67f1da804fc3ac56f36e50e01362077d7a26',
    orgs: [{ id: orgId, name: 'Legacy authority', stripeCustomerId: 'cus_must_not_import' }],
    users: [{ id: 'legacy-owner', email: 'legacy@example.test', passwordHash: 'hash_must_not_import' }],
    memberships: [{ id: 'legacy-membership', orgId, userId: 'legacy-owner', role: 'owner' }],
    sessions: [{ id: 'legacy-session', sid: 'session_must_not_import' }],
    subscriptions: [{ id: 'legacy-subscription', stripeSubscriptionId: 'sub_must_not_import' }],
    processedStripeEvents: [{ id: 'legacy-event', eventId: 'evt_must_not_import' }],
    customers: [{
      id: 'legacy-customer',
      orgId,
      name: 'Phase 16 Mechanical',
      phone: '555-0100',
      email: 'dispatch@phase16.test',
      address: '100 Migration Way',
      notes: 'Priority customer',
      createdAt: '2026-01-01T10:00:00.000Z',
    }],
    jobs: [{
      id: 'legacy-job',
      orgId,
      customerId: 'legacy-customer',
      title: 'Replace compressor',
      description: 'Existing persisted work order',
      status: 'in_progress',
      priority: 'high',
      createdBy: 'legacy-owner',
      createdAt: '2026-01-02T10:00:00.000Z',
      updatedAt: '2026-01-03T10:00:00.000Z',
    }],
    jobEvents: [{
      id: 'legacy-job-event',
      orgId,
      jobId: 'legacy-job',
      type: 'technician_assigned',
      payload: { privateProviderToken: 'must_not_import' },
      createdBy: 'legacy-owner',
      createdAt: '2026-01-03T10:00:00.000Z',
    }],
    quotes: [{
      id: 'legacy-quote',
      orgId,
      customerId: 'legacy-customer',
      jobId: 'legacy-job',
      status: 'accepted',
      taxRate: '8.00',
      discount: '25.00',
      notes: 'Approved scope',
      createdBy: 'legacy-owner',
      createdAt: '2026-01-04T10:00:00.000Z',
    }],
    quoteItems: [{
      id: 'legacy-quote-item',
      orgId,
      quoteId: 'legacy-quote',
      description: 'Compressor and labor',
      qty: '2.000',
      unitPrice: '500.00',
    }],
    invoices: [{
      id: 'legacy-invoice',
      orgId,
      customerId: 'legacy-customer',
      jobId: 'legacy-job',
      status: 'paid',
      taxRate: '8.00',
      discount: '25.00',
      paidViaStripe: true,
      stripePaymentIntentId: 'pi_must_not_import',
      notes: 'Paid before cutover',
      createdBy: 'legacy-owner',
      createdAt: '2026-01-05T10:00:00.000Z',
      paidAt: '2026-01-06T10:00:00.000Z',
    }],
    invoiceItems: [{
      id: 'legacy-invoice-item',
      orgId,
      invoiceId: 'legacy-invoice',
      description: 'Compressor and labor',
      qty: '2.000',
      unitPrice: '500.00',
    }],
    leads: [{
      id: 'legacy-lead',
      orgId,
      source: 'referral',
      status: 'converted',
      name: 'Phase 16 Mechanical',
      customerId: 'legacy-customer',
      jobId: 'legacy-job',
      urgency: 'urgent',
      estimatedValue: '1000.00',
      createdBy: 'legacy-owner',
      createdAt: '2025-12-31T10:00:00.000Z',
      convertedAt: '2026-01-02T10:00:00.000Z',
    }],
    leadActivities: [{
      id: 'legacy-lead-activity',
      orgId,
      leadId: 'legacy-lead',
      type: 'qualified',
      body: 'Customer private note must not enter audit metadata',
      createdBy: 'legacy-owner',
      createdAt: '2026-01-01T09:00:00.000Z',
    }],
    leadFollowupTasks: [{
      id: 'legacy-followup',
      orgId,
      leadId: 'legacy-lead',
      stepNumber: 1,
      channel: 'email',
      dueAt: '2026-01-02T08:00:00.000Z',
      status: 'completed',
      messageTemplate: 'Confirm requested appointment',
      completedAt: '2026-01-02T09:00:00.000Z',
      createdAt: '2026-01-01T08:00:00.000Z',
    }],
    reminderLog: [{
      id: 'legacy-reminder',
      orgId,
      targetType: 'invoice',
      targetId: 'legacy-invoice',
      phoneNumber: '555-0199',
      message: 'Sensitive reminder content',
      status: 'sent',
      sentAt: '2026-01-05T12:00:00.000Z',
    }],
  };
}

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  otherTenantOwner = await createTestUser();
  viewer = await createTestUser();
  moduleRow = await createTestModule('tradeflowkit');
  await db.insert(tenantUsers).values({
    tenantId: owner.currentTenantId,
    userId: viewer.id,
    role: 'viewer',
  });
  await db.insert(tenantModules).values([
    {
      tenantId: owner.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
    },
    {
      tenantId: otherTenantOwner.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
    },
  ]);
});

after(async () => {
  if (owner) {
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.adminId, owner.id));
  }
  for (const user of [viewer, owner, otherTenantOwner]) {
    if (user) await cleanupUser(user.id);
  }
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('TradeFlowKit import apply is transactional, tenant-authoritative, idempotent, reconciled, and audited', async () => {
  const source = exportFixture();
  const plan = planTradeFlowKitImport(source);
  assert.equal(plan.readyToApply, true, plan.errors.join('\n'));
  const options = {
    tenantId: owner.currentTenantId,
    actorUserId: owner.id,
    sourceOrgId: 'legacy-org-phase16',
    expectedSourceFingerprint: plan.sourceFingerprint,
    backupReference: 'phase16-test-backup-001',
    userMap: { 'legacy-owner': owner.id },
  };

  const first = await applyTradeFlowKitImport(source, options);
  assert.equal(first.mode, 'apply');
  assert.equal(first.inserted.tradeflowkit_customers, 1);
  assert.equal(first.inserted.tradeflowkit_jobs, 1);
  assert.equal(first.inserted.tradeflowkit_quotes, 1);
  assert.equal(first.inserted.tradeflowkit_invoices, 1);
  assert.equal(first.inserted.tradeflowkit_payments, 1);
  assert.equal(first.inserted.tradeflowkit_tasks, 1);
  assert.equal(first.reconciliation.targetQuoteSubtotalCents, 100_000);
  assert.equal(first.reconciliation.targetInvoiceSubtotalCents, 100_000);
  assert.equal(first.reconciliation.targetPaidInvoiceCents, 105_500);

  const [customer] = await db.select().from(tradeflowkitCustomers).where(and(
    eq(tradeflowkitCustomers.tenantId, owner.currentTenantId),
    eq(tradeflowkitCustomers.sourceId, 'legacy-customer'),
  ));
  const [job] = await db.select().from(tradeflowkitJobs).where(and(
    eq(tradeflowkitJobs.tenantId, owner.currentTenantId),
    eq(tradeflowkitJobs.sourceId, 'legacy-job'),
  ));
  const [quote] = await db.select().from(tradeflowkitQuotes).where(and(
    eq(tradeflowkitQuotes.tenantId, owner.currentTenantId),
    eq(tradeflowkitQuotes.sourceId, 'legacy-quote'),
  ));
  const [invoice] = await db.select().from(tradeflowkitInvoices).where(and(
    eq(tradeflowkitInvoices.tenantId, owner.currentTenantId),
    eq(tradeflowkitInvoices.sourceId, 'legacy-invoice'),
  ));
  assert.ok(customer?.organizationId);
  assert.equal(job.customerId, customer.id);
  assert.equal(quote.jobId, job.id);
  assert.equal(invoice.jobId, job.id);
  assert.equal(invoice.paidCents, 105_500);
  assert.equal(invoice.balanceCents, 0);
  assert.equal(invoice.paymentReference, null);
  assert.equal((await db.select().from(tradeflowkitTasks).where(eq(tradeflowkitTasks.tenantId, owner.currentTenantId))).length, 1);
  assert.equal((await db.select().from(directoryOrganizations).where(eq(directoryOrganizations.tenantId, otherTenantOwner.currentTenantId))).length, 0);

  const payment = (await db.select().from(tradeflowkitPayments).where(eq(tradeflowkitPayments.tenantId, owner.currentTenantId)))[0];
  assert.equal(payment.method, 'other');
  assert.equal(payment.provider, null);
  assert.equal(payment.providerReference, null);

  const second = await applyTradeFlowKitImport(source, options);
  assert.deepEqual(second.inserted, {});
  assert.equal(second.reused.tradeflowkit_customers, 1);
  assert.equal(second.reused.tradeflowkit_jobs, 1);
  assert.equal(second.reused.tradeflowkit_invoices, 1);
  assert.equal((await db.select().from(tradeflowkitMigrationRefs).where(eq(tradeflowkitMigrationRefs.tenantId, owner.currentTenantId))).length, 13);

  const audits = await db.select().from(adminAuditLogs).where(and(
    eq(adminAuditLogs.adminId, owner.id),
    eq(adminAuditLogs.action, 'tradeflowkit_import_applied'),
  ));
  assert.equal(audits.length, 2);
  const serializedEvidence = JSON.stringify({ first, second, audits });
  assert.doesNotMatch(serializedEvidence, /cus_must_not_import|hash_must_not_import|session_must_not_import|sub_must_not_import|evt_must_not_import|pi_must_not_import|privateProviderToken|Sensitive reminder content/);
});

test('TradeFlowKit import apply rejects drift, cross-org rows, and non-admin actors without partial writes', async () => {
  const baseline = exportFixture();
  const drifted = exportFixture();
  drifted.customers[0].notes = 'Changed after reviewed dry-run';
  const driftedPlan = planTradeFlowKitImport(drifted);
  await assert.rejects(
    applyTradeFlowKitImport(drifted, {
      tenantId: owner.currentTenantId,
      actorUserId: owner.id,
      sourceOrgId: 'legacy-org-phase16',
      expectedSourceFingerprint: driftedPlan.sourceFingerprint,
      backupReference: 'phase16-test-backup-001',
      userMap: { 'legacy-owner': owner.id },
    }),
    /Source (snapshot )?drift detected/,
  );

  const crossOrg = exportFixture();
  crossOrg.jobs[0].orgId = 'unapproved-org';
  const crossOrgPlan = planTradeFlowKitImport(crossOrg);
  await assert.rejects(
    applyTradeFlowKitImport(crossOrg, {
      tenantId: owner.currentTenantId,
      actorUserId: owner.id,
      sourceOrgId: 'legacy-org-phase16',
      expectedSourceFingerprint: crossOrgPlan.sourceFingerprint,
      backupReference: 'phase16-test-backup-001',
    }),
    /outside the approved source organization/,
  );

  const cleanPlan = planTradeFlowKitImport(baseline);
  await assert.rejects(
    applyTradeFlowKitImport(baseline, {
      tenantId: owner.currentTenantId,
      actorUserId: viewer.id,
      sourceOrgId: 'legacy-org-phase16',
      expectedSourceFingerprint: cleanPlan.sourceFingerprint,
      backupReference: 'phase16-test-backup-001',
    }),
    /must be an owner or admin/,
  );

  assert.equal((await db.select().from(tradeflowkitCustomers).where(eq(tradeflowkitCustomers.tenantId, otherTenantOwner.currentTenantId))).length, 0);
});
