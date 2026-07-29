process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-work-management-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  directoryContacts,
  directoryOrganizations,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
} from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let viewer: any;
let moduleRow: any;
let signToken: typeof import('../src/lib/auth.js').signToken;

function headers(user: any, tenantId: string) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
  };
}

async function createApp(tradeflowOnly = false) {
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const instance = Fastify();
  await instance.register(cookie);
  if (tradeflowOnly) {
    const { registerTradeFlowKitRoutes } = await import('../src/routes/tradeflowkit-routes.js');
    await registerTradeFlowKitRoutes(instance);
  } else {
    const { registerModuleShellRoutes } = await import('../src/routes/module-shell-routes.js');
    await registerModuleShellRoutes(instance);
  }
  await instance.ready();
  return instance;
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();
  moduleRow = await createTestModule('tradeflowkit');
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'viewer' });
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId,
    userId: viewer.id,
    moduleId: moduleRow.id,
    accessLevel: 'viewer',
  });
  app = await createApp();
});

after(async () => {
  if (app) await app.close();
  if (moduleRow) {
    try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.moduleId, moduleRow.id)); } catch {}
    try { await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id)); } catch {}
  }
  for (const user of [viewer, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('workflow studio is tenant isolated, admin governed, versioned, persistent, and connected to real jobs and tasks', async () => {
  const tenant = ownerA.currentTenantId;
  const customerResponse = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/customers',
    headers: headers(ownerA, tenant),
    payload: { name: 'Phase 16 Field Services', email: 'dispatch@phase16.test' },
  });
  assert.equal(customerResponse.statusCode, 201, customerResponse.body);
  const customer = customerResponse.json();
  const jobResponse = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/jobs',
    headers: headers(ownerA, tenant),
    payload: { customerId: customer.id, title: 'Restore compressor workflow', priority: 'normal' },
  });
  assert.equal(jobResponse.statusCode, 201, jobResponse.body);
  const job = jobResponse.json();

  const viewerCreate = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/workflows',
    headers: headers(viewer, tenant),
    payload: {
      name: 'Denied workflow',
      entityType: 'job',
      stages: [{ name: 'New', mappedStatus: 'lead' }],
    },
  });
  assert.equal(viewerCreate.statusCode, 403, viewerCreate.body);

  const workflowResponse = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/workflows',
    headers: headers(ownerA, tenant),
    payload: {
      name: 'HVAC service delivery',
      description: 'Governed job delivery stages.',
      entityType: 'job',
      isDefault: true,
      stages: [
        { name: 'Intake', color: '#2563eb', position: 0, mappedStatus: 'lead' },
        { name: 'Scheduled', color: '#0f766e', position: 1, mappedStatus: 'scheduled' },
        { name: 'Working', color: '#b7791f', position: 2, mappedStatus: 'in_progress' },
        { name: 'Complete', color: '#059669', position: 3, mappedStatus: 'done' },
      ],
    },
  });
  assert.equal(workflowResponse.statusCode, 201, workflowResponse.body);
  const workflow = workflowResponse.json();
  assert.equal(workflow.version, 1);
  assert.equal(workflow.stages.length, 4);
  assert.equal(workflow.isDefault, true);

  const alternateResponse = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/workflows',
    headers: headers(ownerA, tenant),
    payload: {
      name: 'Commercial service',
      entityType: 'job',
      stages: [{ name: 'Ready', mappedStatus: 'scheduled' }],
    },
  });
  assert.equal(alternateResponse.statusCode, 201, alternateResponse.body);
  const alternate = alternateResponse.json();
  const promotedResponse = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/tradeflowkit/workflows/${alternate.id}`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: alternate.version, isDefault: true },
  });
  assert.equal(promotedResponse.statusCode, 200, promotedResponse.body);
  assert.equal(promotedResponse.json().isDefault, true);

  const tenantList = await app.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/workflows',
    headers: headers(ownerA, tenant),
  });
  assert.equal(tenantList.statusCode, 200, tenantList.body);
  assert.equal(tenantList.json().length, 2);
  assert.equal(tenantList.json().filter((item: any) => item.isDefault).length, 1);
  assert.equal(tenantList.json().find((item: any) => item.id === alternate.id).isDefault, true);
  assert.equal(tenantList.json().find((item: any) => item.id === workflow.id).isDefault, false);
  const foreignList = await app.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/workflows',
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreignList.statusCode, 200, foreignList.body);
  assert.deepEqual(foreignList.json(), []);

  const scheduledStage = workflow.stages.find((stage: any) => stage.mappedStatus === 'scheduled');
  assert.ok(scheduledStage);
  const transition = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/jobs/${job.id}/workflow-transition`,
    headers: headers(ownerA, tenant),
    payload: { workflowStageId: scheduledStage.id, expectedVersion: job.version },
  });
  assert.equal(transition.statusCode, 200, transition.body);
  assert.equal(transition.json().status, 'scheduled');
  assert.equal(transition.json().workflowStageId, scheduledStage.id);
  assert.equal(transition.json().version, job.version + 1);
  const staleTransition = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/jobs/${job.id}/workflow-transition`,
    headers: headers(ownerA, tenant),
    payload: { workflowStageId: scheduledStage.id, expectedVersion: job.version },
  });
  assert.equal(staleTransition.statusCode, 409, staleTransition.body);
  const foreignTransition = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/jobs/${job.id}/workflow-transition`,
    headers: headers(ownerB, ownerB.currentTenantId),
    payload: { workflowStageId: scheduledStage.id, expectedVersion: job.version + 1 },
  });
  assert.equal(foreignTransition.statusCode, 404, foreignTransition.body);

  const taskResponse = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/jobs/${job.id}/tasks`,
    headers: headers(ownerA, tenant),
    payload: { title: 'Confirm replacement part', priority: 'high' },
  });
  assert.equal(taskResponse.statusCode, 201, taskResponse.body);
  const task = taskResponse.json();
  const taskList = await app.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/tasks?scope=team&search=replacement',
    headers: headers(ownerA, tenant),
  });
  assert.equal(taskList.statusCode, 200, taskList.body);
  assert.equal(taskList.json().pagination.total, 1);
  assert.equal(taskList.json().items[0].jobTitle, job.title);
  assert.equal(taskList.json().items[0].customerName, customer.name);
  const foreignTask = await app.inject({
    method: 'GET',
    url: `/v1/modules/tradeflowkit/tasks/${task.id}`,
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreignTask.statusCode, 404, foreignTask.body);

  const taskDetail = await app.inject({
    method: 'GET',
    url: `/v1/modules/tradeflowkit/tasks/${task.id}`,
    headers: headers(ownerA, tenant),
  });
  assert.equal(taskDetail.statusCode, 200, taskDetail.body);
  assert.equal(taskDetail.json().id, task.id);
  assert.ok(taskDetail.json().activity.some((event: any) => event.action === 'created'));

  const activity = await app.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/activity?entityType=job',
    headers: headers(ownerA, tenant),
  });
  assert.equal(activity.statusCode, 200, activity.body);
  assert.ok(activity.json().items.some((event: any) => event.action === 'workflow_transition'));

  const workflowRestartApp = await createApp(true);
  const afterRestart = await workflowRestartApp.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/workflows',
    headers: headers(ownerA, tenant),
  });
  assert.equal(afterRestart.statusCode, 200, afterRestart.body);
  assert.equal(afterRestart.json().find((item: any) => item.id === workflow.id).stages.length, 4);
  assert.equal(afterRestart.json().filter((item: any) => item.isDefault).length, 1);

  const archivedTask = await workflowRestartApp.inject({
    method: 'DELETE',
    url: `/v1/modules/tradeflowkit/tasks/${task.id}`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: task.version },
  });
  assert.equal(archivedTask.statusCode, 200, archivedTask.body);
  const archivedTaskRead = await workflowRestartApp.inject({
    method: 'GET',
    url: `/v1/modules/tradeflowkit/tasks/${task.id}`,
    headers: headers(ownerA, tenant),
  });
  assert.equal(archivedTaskRead.statusCode, 404, archivedTaskRead.body);
  await workflowRestartApp.close();
});

test('customer, job, and task records support tenant-safe edit, restart persistence, and dependency-ordered archive', async () => {
  const tenant = ownerA.currentTenantId;

  const customerResponse = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/customers',
    headers: headers(ownerA, tenant),
    payload: {
      name: 'Functional Parity Test Client',
      address: '100 Original Avenue',
      notes: 'Created without contact details for core CRUD proof.',
    },
  });
  assert.equal(customerResponse.statusCode, 201, customerResponse.body);
  const customer = customerResponse.json();

  const viewerUpdate = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/tradeflowkit/customers/${customer.id}`,
    headers: headers(viewer, tenant),
    payload: { ...customer, expectedVersion: customer.version, name: 'Denied update' },
  });
  assert.equal(viewerUpdate.statusCode, 403, viewerUpdate.body);

  const foreignUpdate = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/tradeflowkit/customers/${customer.id}`,
    headers: headers(ownerB, ownerB.currentTenantId),
    payload: { expectedVersion: customer.version, name: 'Foreign update' },
  });
  assert.equal(foreignUpdate.statusCode, 404, foreignUpdate.body);
  assert.equal(foreignUpdate.json().code, 'CUSTOMER_NOT_FOUND');

  const customerUpdate = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/tradeflowkit/customers/${customer.id}`,
    headers: headers(ownerA, tenant),
    payload: {
      expectedVersion: customer.version,
      name: 'Functional Parity Test Client Updated',
      email: 'service@functional-parity.test',
      phone: '+15555550200',
      address: '200 Updated Boulevard',
      notes: 'Customer edit persisted.',
    },
  });
  assert.equal(customerUpdate.statusCode, 200, customerUpdate.body);
  const updatedCustomer = customerUpdate.json();
  assert.equal(updatedCustomer.version, customer.version + 1);
  assert.equal(updatedCustomer.address, '200 Updated Boulevard');

  const [organization] = await db.select().from(directoryOrganizations).where(eq(directoryOrganizations.id, customer.organizationId)).limit(1);
  assert.equal(customer.primaryContactId, null);
  assert.ok(updatedCustomer.primaryContactId);
  const [contact] = await db.select().from(directoryContacts).where(eq(directoryContacts.id, updatedCustomer.primaryContactId)).limit(1);
  assert.equal(organization.name, 'Functional Parity Test Client Updated');
  assert.equal(contact.email, 'service@functional-parity.test');
  assert.equal(contact.phone, '+15555550200');

  const staleCustomerUpdate = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/tradeflowkit/customers/${customer.id}`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: customer.version, name: 'Stale edit' },
  });
  assert.equal(staleCustomerUpdate.statusCode, 409, staleCustomerUpdate.body);
  assert.equal(staleCustomerUpdate.json().code, 'CUSTOMER_VERSION_CONFLICT');

  const jobResponse = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/jobs',
    headers: headers(ownerA, tenant),
    payload: { customerId: customer.id, title: 'Functional parity project', priority: 'normal' },
  });
  assert.equal(jobResponse.statusCode, 201, jobResponse.body);
  const job = jobResponse.json();
  const jobUpdate = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/tradeflowkit/jobs/${job.id}`,
    headers: headers(ownerA, tenant),
    payload: {
      expectedVersion: job.version,
      title: 'Functional parity project updated',
      description: 'Edited field-work scope.',
      status: 'scheduled',
      priority: 'high',
    },
  });
  assert.equal(jobUpdate.statusCode, 200, jobUpdate.body);
  const updatedJob = jobUpdate.json();
  assert.equal(updatedJob.version, job.version + 1);
  assert.equal(updatedJob.status, 'scheduled');

  const taskResponse = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/jobs/${job.id}/tasks`,
    headers: headers(ownerA, tenant),
    payload: { title: 'Initial work step', description: 'Original task scope.', priority: 'normal' },
  });
  assert.equal(taskResponse.statusCode, 201, taskResponse.body);
  const task = taskResponse.json();
  const taskUpdate = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/tradeflowkit/tasks/${task.id}`,
    headers: headers(ownerA, tenant),
    payload: {
      expectedVersion: task.version,
      title: 'Updated work step',
      description: 'Edited task scope.',
      status: 'in_progress',
      priority: 'urgent',
      dueAt: '2030-01-15',
    },
  });
  assert.equal(taskUpdate.statusCode, 200, taskUpdate.body);
  const updatedTask = taskUpdate.json();
  assert.equal(updatedTask.version, task.version + 1);
  assert.equal(updatedTask.status, 'in_progress');

  const viewerSearch = await app.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/search?q=Functional%20parity&limit=10',
    headers: headers(viewer, tenant),
  });
  assert.equal(viewerSearch.statusCode, 200, viewerSearch.body);
  assert.ok(viewerSearch.json().items.some((item: any) => item.kind === 'customer' && item.id === customer.id));
  assert.ok(viewerSearch.json().items.some((item: any) => item.kind === 'job' && item.id === job.id));
  const foreignSearch = await app.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/search?q=Functional%20parity&limit=10',
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreignSearch.statusCode, 200, foreignSearch.body);
  assert.deepEqual(foreignSearch.json().items, []);

  const privateViewResponse = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/saved-views',
    headers: headers(ownerA, tenant),
    payload: {
      resource: 'search',
      name: 'Functional work',
      filters: { query: 'Functional parity' },
      sort: { field: 'updatedAt', direction: 'desc' },
    },
  });
  assert.equal(privateViewResponse.statusCode, 201, privateViewResponse.body);
  const privateView = privateViewResponse.json();
  const sharedViewResponse = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/saved-views',
    headers: headers(ownerA, tenant),
    payload: {
      resource: 'search',
      name: 'Urgent work',
      filters: { query: 'Updated work step', priority: 'urgent' },
      isShared: true,
    },
  });
  assert.equal(sharedViewResponse.statusCode, 201, sharedViewResponse.body);
  const sharedView = sharedViewResponse.json();
  const duplicateView = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/saved-views',
    headers: headers(ownerA, tenant),
    payload: { resource: 'search', name: privateView.name, filters: { query: 'different' } },
  });
  assert.equal(duplicateView.statusCode, 409, duplicateView.body);
  assert.equal(duplicateView.json().code, 'SAVED_VIEW_NAME_CONFLICT');
  const viewerViews = await app.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/saved-views?resource=search',
    headers: headers(viewer, tenant),
  });
  assert.equal(viewerViews.statusCode, 200, viewerViews.body);
  assert.deepEqual(viewerViews.json().items.map((item: any) => item.id), [sharedView.id]);
  assert.equal(viewerViews.json().items[0].owned, false);
  const viewerCreateView = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/saved-views',
    headers: headers(viewer, tenant),
    payload: { resource: 'search', name: 'Denied view', filters: { query: 'denied' } },
  });
  assert.equal(viewerCreateView.statusCode, 403, viewerCreateView.body);
  const foreignViews = await app.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/saved-views',
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreignViews.statusCode, 200, foreignViews.body);
  assert.deepEqual(foreignViews.json().items, []);
  const foreignDeleteView = await app.inject({
    method: 'DELETE',
    url: `/v1/modules/tradeflowkit/saved-views/${privateView.id}`,
    headers: headers(ownerB, ownerB.currentTenantId),
    payload: { expectedVersion: privateView.version },
  });
  assert.equal(foreignDeleteView.statusCode, 404, foreignDeleteView.body);
  const deletePrivateView = await app.inject({
    method: 'DELETE',
    url: `/v1/modules/tradeflowkit/saved-views/${privateView.id}`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: privateView.version },
  });
  assert.equal(deletePrivateView.statusCode, 200, deletePrivateView.body);

  const quoteResponse = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/quotes',
    headers: headers(ownerA, tenant),
    payload: {
      customerId: customer.id,
      jobId: job.id,
      lineItems: [{ description: 'Retained diagnostic work', quantity: 1, unitPriceCents: 12500 }],
    },
  });
  assert.equal(quoteResponse.statusCode, 201, quoteResponse.body);
  const quote = quoteResponse.json();
  const invoiceResponse = await app.inject({
    method: 'POST',
    url: '/v1/modules/tradeflowkit/invoices',
    headers: headers(ownerA, tenant),
    payload: {
      customerId: customer.id,
      jobId: job.id,
      lineItems: [{ description: 'Retained repair work', quantity: 1, unitPriceCents: 25000 }],
    },
  });
  assert.equal(invoiceResponse.statusCode, 201, invoiceResponse.body);
  const invoice = invoiceResponse.json();
  const jobAfterDocuments = await app.inject({
    method: 'GET',
    url: `/v1/modules/tradeflowkit/jobs/${job.id}`,
    headers: headers(ownerA, tenant),
  });
  assert.equal(jobAfterDocuments.statusCode, 200, jobAfterDocuments.body);
  const jobVersionWithDocuments = jobAfterDocuments.json().job.version;

  const blockedCustomerArchive = await app.inject({
    method: 'DELETE',
    url: `/v1/modules/tradeflowkit/customers/${customer.id}`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: updatedCustomer.version },
  });
  assert.equal(blockedCustomerArchive.statusCode, 409, blockedCustomerArchive.body);
  assert.equal(blockedCustomerArchive.json().code, 'CUSTOMER_HAS_ACTIVE_HISTORY');

  const blockedJobArchive = await app.inject({
    method: 'DELETE',
    url: `/v1/modules/tradeflowkit/jobs/${job.id}`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: jobVersionWithDocuments },
  });
  assert.equal(blockedJobArchive.statusCode, 409, blockedJobArchive.body);
  assert.equal(blockedJobArchive.json().code, 'JOB_HAS_ACTIVE_HISTORY');

  const crudRestartApp = await createApp(true);
  const persistedJob = await crudRestartApp.inject({
    method: 'GET',
    url: `/v1/modules/tradeflowkit/jobs/${job.id}`,
    headers: headers(ownerA, tenant),
  });
  assert.equal(persistedJob.statusCode, 200, persistedJob.body);
  assert.equal(persistedJob.json().job.title, 'Functional parity project updated');
  const persistedTask = await crudRestartApp.inject({
    method: 'GET',
    url: `/v1/modules/tradeflowkit/tasks/${task.id}`,
    headers: headers(ownerA, tenant),
  });
  assert.equal(persistedTask.statusCode, 200, persistedTask.body);
  assert.equal(persistedTask.json().title, 'Updated work step');
  await crudRestartApp.close();

  const taskArchive = await app.inject({
    method: 'DELETE',
    url: `/v1/modules/tradeflowkit/tasks/${task.id}`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: updatedTask.version },
  });
  assert.equal(taskArchive.statusCode, 200, taskArchive.body);
  const quoteArchive = await app.inject({
    method: 'DELETE',
    url: `/v1/modules/tradeflowkit/quotes/${quote.id}`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: quote.version },
  });
  assert.equal(quoteArchive.statusCode, 200, quoteArchive.body);
  const invoiceArchive = await app.inject({
    method: 'DELETE',
    url: `/v1/modules/tradeflowkit/invoices/${invoice.id}`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: invoice.version },
  });
  assert.equal(invoiceArchive.statusCode, 200, invoiceArchive.body);
  const jobArchive = await app.inject({
    method: 'DELETE',
    url: `/v1/modules/tradeflowkit/jobs/${job.id}`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: jobVersionWithDocuments },
  });
  assert.equal(jobArchive.statusCode, 200, jobArchive.body);
  const customerArchive = await app.inject({
    method: 'DELETE',
    url: `/v1/modules/tradeflowkit/customers/${customer.id}`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: updatedCustomer.version },
  });
  assert.equal(customerArchive.statusCode, 200, customerArchive.body);

  const [directoryAfterArchive] = await db.select().from(directoryOrganizations).where(eq(directoryOrganizations.id, customer.organizationId)).limit(1);
  assert.equal(directoryAfterArchive.archivedAt, null, 'archiving the module customer must not archive the shared Directory organization');
  const archivedSearch = await app.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/search?q=Updated%20work%20step',
    headers: headers(ownerA, tenant),
  });
  assert.equal(archivedSearch.statusCode, 200, archivedSearch.body);
  assert.equal(archivedSearch.json().items.some((item: any) => item.id === task.id), false);

  const foreignTrash = await app.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/trash',
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreignTrash.statusCode, 200, foreignTrash.body);
  assert.deepEqual(foreignTrash.json().items, []);

  const viewerTrash = await app.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/trash',
    headers: headers(viewer, tenant),
  });
  assert.equal(viewerTrash.statusCode, 200, viewerTrash.body);
  assert.deepEqual(
    new Set(viewerTrash.json().items.map((item: any) => item.kind)),
    new Set(['customer', 'job', 'task', 'quote', 'invoice']),
  );
  const archivedById = new Map<string, any>(viewerTrash.json().items.map((item: any) => [item.id, item]));
  assert.equal(archivedById.get(customer.id)?.restoreBlockedReason, null);
  assert.match(archivedById.get(job.id)?.restoreBlockedReason, /customer first/i);
  assert.match(archivedById.get(task.id)?.restoreBlockedReason, /job first/i);

  const deniedRestore = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/trash/customers/${customer.id}/restore`,
    headers: headers(viewer, tenant),
    payload: { expectedVersion: customerArchive.json().customer.version },
  });
  assert.equal(deniedRestore.statusCode, 403, deniedRestore.body);

  const blockedTaskRestore = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/trash/tasks/${task.id}/restore`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: updatedTask.version + 1 },
  });
  assert.equal(blockedTaskRestore.statusCode, 409, blockedTaskRestore.body);
  assert.equal(blockedTaskRestore.json().code, 'TASK_JOB_ARCHIVED');

  const blockedJobRestore = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/trash/jobs/${job.id}/restore`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: jobArchive.json().job.version },
  });
  assert.equal(blockedJobRestore.statusCode, 409, blockedJobRestore.body);
  assert.equal(blockedJobRestore.json().code, 'JOB_CUSTOMER_ARCHIVED');

  const staleCustomerRestore = await app.inject({
    method: 'POST',
    url: `/v1/modules/tradeflowkit/trash/customers/${customer.id}/restore`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: updatedCustomer.version },
  });
  assert.equal(staleCustomerRestore.statusCode, 409, staleCustomerRestore.body);
  assert.equal(staleCustomerRestore.json().code, 'TRASH_VERSION_CONFLICT');

  const restoreRequests = [
    {
      path: `/v1/modules/tradeflowkit/trash/customers/${customer.id}/restore`,
      version: customerArchive.json().customer.version,
    },
    {
      path: `/v1/modules/tradeflowkit/trash/jobs/${job.id}/restore`,
      version: jobArchive.json().job.version,
    },
    {
      path: `/v1/modules/tradeflowkit/trash/tasks/${task.id}/restore`,
      version: updatedTask.version + 1,
    },
    {
      path: `/v1/modules/tradeflowkit/trash/quotes/${quote.id}/restore`,
      version: quoteArchive.json().quote.version,
    },
    {
      path: `/v1/modules/tradeflowkit/trash/invoices/${invoice.id}/restore`,
      version: invoiceArchive.json().invoice.version,
    },
  ];
  for (const request of restoreRequests) {
    const restored = await app.inject({
      method: 'POST',
      url: request.path,
      headers: headers(ownerA, tenant),
      payload: { expectedVersion: request.version },
    });
    assert.equal(restored.statusCode, 200, restored.body);
  }

  const retentionRestartApp = await createApp(true);
  const afterRestore = await retentionRestartApp.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/trash',
    headers: headers(ownerA, tenant),
  });
  assert.equal(afterRestore.statusCode, 200, afterRestore.body);
  assert.equal(afterRestore.json().items.some((item: any) => [
    customer.id, job.id, task.id, quote.id, invoice.id,
  ].includes(item.id)), false);
  const restoredJob = await retentionRestartApp.inject({
    method: 'GET',
    url: `/v1/modules/tradeflowkit/jobs/${job.id}`,
    headers: headers(ownerA, tenant),
  });
  assert.equal(restoredJob.statusCode, 200, restoredJob.body);
  assert.equal(restoredJob.json().tasks[0].id, task.id);
  const restoredSearch = await retentionRestartApp.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/search?q=Updated%20work%20step',
    headers: headers(ownerA, tenant),
  });
  assert.equal(restoredSearch.statusCode, 200, restoredSearch.body);
  assert.equal(restoredSearch.json().items.find((item: any) => item.id === task.id).href, `/modules/tradeflowkit/tasks/${task.id}`);
  await retentionRestartApp.close();
});
