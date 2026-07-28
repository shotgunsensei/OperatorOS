process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-work-management-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
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

  await app.close();
  app = await createApp(true);
  const afterRestart = await app.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/workflows',
    headers: headers(ownerA, tenant),
  });
  assert.equal(afterRestart.statusCode, 200, afterRestart.body);
  assert.equal(afterRestart.json().find((item: any) => item.id === workflow.id).stages.length, 4);
  assert.equal(afterRestart.json().filter((item: any) => item.isDefault).length, 1);

  const archivedTask = await app.inject({
    method: 'DELETE',
    url: `/v1/modules/tradeflowkit/tasks/${task.id}`,
    headers: headers(ownerA, tenant),
    payload: { expectedVersion: task.version },
  });
  assert.equal(archivedTask.statusCode, 200, archivedTask.body);
  const archivedTaskRead = await app.inject({
    method: 'GET',
    url: `/v1/modules/tradeflowkit/tasks/${task.id}`,
    headers: headers(ownerA, tenant),
  });
  assert.equal(archivedTaskRead.statusCode, 404, archivedTaskRead.body);
});
