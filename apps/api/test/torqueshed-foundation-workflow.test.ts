process.env.SESSION_SECRET ||= 'operatoros-torqueshed-foundation-test-v1';
process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
} from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let member: any;
let viewer: any;
let moduleRow: any;
let moduleCreated = false;
let signToken: typeof import('../src/lib/auth.js').signToken;

function headers(actor: any, extra: Record<string, string> = {}) {
  const tenantId = actor === ownerB ? ownerB.currentTenantId : ownerA.currentTenantId;
  return {
    authorization: `Bearer ${signToken({ userId: actor.id, email: actor.email, role: actor.role, tokenVersion: actor.tokenVersion, sessionType: 'platform' })}`,
    'x-tenant-id': tenantId,
    ...extra,
  };
}

async function inject(
  method: string,
  url: string,
  actor: any,
  payload?: unknown,
  extra: Record<string, string> = {},
) {
  return app.inject({
    method,
    url,
    headers: headers(actor, extra),
    ...(payload === undefined ? {} : { payload }),
  });
}

async function buildApp() {
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerTorqueShedRoutes } = await import('../src/routes/torqueshed-routes.js');
  const { registerTorqueAssistRoutes } = await import('../src/routes/torque-assist-routes.js');
  const instance = Fastify();
  await instance.register(cookie);
  await registerTorqueShedRoutes(instance);
  await registerTorqueAssistRoutes(instance);
  await instance.ready();
  return instance;
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  member = await createTestUser();
  viewer = await createTestUser();
  [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'torqueshed')).limit(1);
  if (!moduleRow) {
    moduleRow = await createTestModule('torqueshed');
    moduleCreated = true;
  }
  await db.insert(tenantUsers).values([
    { tenantId: ownerA.currentTenantId, userId: member.id, role: 'member' },
    { tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'member' },
  ]);
  await db.insert(tenantModules).values([
    {
      tenantId: ownerA.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
    },
    {
      tenantId: ownerB.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
    },
  ]);
  await db.insert(tenantUserModuleAccess).values([
    {
      tenantId: ownerA.currentTenantId,
      userId: member.id,
      moduleId: moduleRow.id,
      accessLevel: 'user',
    },
    {
      tenantId: ownerA.currentTenantId,
      userId: viewer.id,
      moduleId: moduleRow.id,
      accessLevel: 'viewer',
    },
  ]);
  app = await buildApp();
});

after(async () => {
  if (app) await app.close();
  for (const actor of [ownerA, ownerB]) {
    if (!actor) continue;
    const tenantId = String(actor.currentTenantId).replaceAll("'", "''");
    for (const table of [
      'shared_attachment_blobs',
      'shared_jobs',
      'shared_attachments',
      'shared_idempotency_keys',
      'torqueshed_assist_rate_windows',
      'torqueshed_ai_provider_circuits',
      'torqueshed_assist_requests',
      'operatoros_token_purchase_intents',
      'torqueshed_diagnostic_entries',
      'torqueshed_diagnostic_trouble_codes',
      'torqueshed_diagnostic_sessions',
      'torqueshed_service_parts',
      'torqueshed_service_records',
      'torqueshed_mileage_events',
      'torqueshed_service_reminders',
      'torqueshed_build_tasks',
      'torqueshed_build_stages',
      'torqueshed_builds',
      'torqueshed_diagnostic_templates',
      'torqueshed_vendors',
      'torqueshed_migration_refs',
      'torqueshed_vehicles',
      'activity_feed',
    ]) {
      try {
        await db.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id = '${tenantId}'`));
      } catch {}
    }
  }
  if (moduleRow && ownerA && ownerB) {
    const tenantIds = [ownerA.currentTenantId, ownerB.currentTenantId];
    await db
      .delete(tenantUserModuleAccess)
      .where(
        and(
          eq(tenantUserModuleAccess.moduleId, moduleRow.id),
          inArray(tenantUserModuleAccess.tenantId, tenantIds),
        ),
      );
    await db
      .delete(tenantModules)
      .where(
        and(eq(tenantModules.moduleId, moduleRow.id), inArray(tenantModules.tenantId, tenantIds)),
      );
  }
  for (const actor of [viewer, member, ownerA, ownerB]) if (actor) await cleanupUser(actor.id);
  if (moduleRow && moduleCreated) await cleanupModule(moduleRow.id);
});

test('TorqueShed completes a durable garage-to-repair diagnostic workflow with ownership and tenant isolation', async () => {
  const vehicleResponse = await inject('POST', '/v1/modules/torqueshed/vehicles', ownerA, {
    nickname: 'Trail Ranger',
    year: 1997,
    make: 'Ford',
    model: 'Ranger',
    trim: 'XLT',
    engine: '4.0L V6',
    transmission: '5-speed manual',
    drivetrain: '4WD',
    currentMileage: 181200,
    vin: '1FTCR15X0VTA12345',
    visibility: 'private',
  });
  assert.equal(vehicleResponse.statusCode, 201, vehicleResponse.body);
  let vehicle = vehicleResponse.json();
  assert.equal(vehicle.vinMasked, '***********A12345');
  assert.ok(!vehicleResponse.body.includes('1FTCR15X0VTA12345'));
  assert.equal(vehicle.version, 1);

  const vinStorage = await db.execute(
    sql`SELECT vin_sha256, vin_last6, to_jsonb(v.*)::text AS serialized FROM torqueshed_vehicles v WHERE tenant_id=${ownerA.currentTenantId} AND id=${vehicle.id}`,
  );
  assert.equal(String(vinStorage.rows[0]!.vin_sha256).length, 64);
  assert.equal(vinStorage.rows[0]!.vin_last6, 'A12345');
  assert.ok(!String(vinStorage.rows[0]!.serialized).includes('1FTCR15X0VTA12345'));

  const privateRead = await inject('GET', `/v1/modules/torqueshed/vehicles/${vehicle.id}`, member);
  assert.equal(privateRead.statusCode, 404, privateRead.body);
  const foreignRead = await inject('GET', `/v1/modules/torqueshed/vehicles/${vehicle.id}`, ownerB);
  assert.equal(foreignRead.statusCode, 404, foreignRead.body);
  const viewerWrite = await inject('POST', '/v1/modules/torqueshed/vehicles', viewer, {
    year: 2000,
    make: 'Denied',
    model: 'Vehicle',
  });
  assert.equal(viewerWrite.statusCode, 403, viewerWrite.body);

  const shareVehicle = await inject(
    'PATCH',
    `/v1/modules/torqueshed/vehicles/${vehicle.id}`,
    ownerA,
    { expectedVersion: vehicle.version, visibility: 'tenant' },
  );
  assert.equal(shareVehicle.statusCode, 200, shareVehicle.body);
  vehicle = shareVehicle.json();
  assert.equal(vehicle.version, 2);
  const staleVehicle = await inject(
    'PATCH',
    `/v1/modules/torqueshed/vehicles/${vehicle.id}`,
    ownerA,
    { expectedVersion: 1, nickname: 'Stale edit' },
  );
  assert.equal(staleVehicle.statusCode, 409, staleVehicle.body);
  assert.equal(
    (await inject('GET', `/v1/modules/torqueshed/vehicles/${vehicle.id}`, member)).statusCode,
    200,
  );

  const mileageHeaders = { 'idempotency-key': 'phase7-mileage-ranger-001' };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const mileage = await inject(
      'POST',
      `/v1/modules/torqueshed/vehicles/${vehicle.id}/mileage-events`,
      ownerA,
      { mileage: 181250, source: 'maintenance' },
      mileageHeaders,
    );
    assert.equal(mileage.statusCode, 201, mileage.body);
  }
  const mileageCount = await db.execute(
    sql`SELECT COUNT(*)::int AS count FROM torqueshed_mileage_events WHERE tenant_id=${ownerA.currentTenantId} AND vehicle_id=${vehicle.id}`,
  );
  assert.equal(mileageCount.rows[0]!.count, 1);

  const vendorResponse = await inject('POST', '/v1/modules/torqueshed/vendors', ownerA, {
    name: 'Northside Parts',
    phone: '555-0100',
  });
  assert.equal(vendorResponse.statusCode, 201, vendorResponse.body);
  const vendor = vendorResponse.json();
  const serviceResponse = await inject(
    'POST',
    `/v1/modules/torqueshed/vehicles/${vehicle.id}/service-records`,
    ownerA,
    {
      vendorId: vendor.id,
      kind: 'maintenance',
      title: 'Engine oil and filter',
      description: '5W-30 synthetic and inspection',
      mileage: 181250,
      laborMinutes: 35,
      laborCostMinor: 3500,
      partsCostMinor: 4899,
      status: 'completed',
      parts: [
        {
          name: 'Oil filter',
          manufacturer: 'Motorcraft',
          partNumber: 'FL-1A',
          quantity: 1,
          unitCostMinor: 899,
        },
      ],
    },
    { 'idempotency-key': 'phase7-service-ranger-001' },
  );
  assert.equal(serviceResponse.statusCode, 201, serviceResponse.body);
  const service = serviceResponse.json();
  assert.equal(service.partsCostMinor, 4899);
  const partCount = await db.execute(
    sql`SELECT COUNT(*)::int AS count FROM torqueshed_service_parts WHERE tenant_id=${ownerA.currentTenantId} AND service_record_id=${service.id}`,
  );
  assert.equal(partCount.rows[0]!.count, 1);

  const reminderResponse = await inject(
    'POST',
    `/v1/modules/torqueshed/vehicles/${vehicle.id}/reminders`,
    ownerA,
    { title: 'Next oil service', dueMileage: 186250, intervalMiles: 5000 },
  );
  assert.equal(reminderResponse.statusCode, 201, reminderResponse.body);

  const buildResponse = await inject('POST', '/v1/modules/torqueshed/builds', ownerA, {
    vehicleId: vehicle.id,
    title: 'Trail reliability build',
    budgetMinor: 250000,
    visibility: 'tenant',
  });
  assert.equal(buildResponse.statusCode, 201, buildResponse.body);
  const build = buildResponse.json();
  const stageResponse = await inject(
    'POST',
    `/v1/modules/torqueshed/builds/${build.id}/stages`,
    ownerA,
    { title: 'Fuel system', position: 1 },
  );
  assert.equal(stageResponse.statusCode, 201, stageResponse.body);
  const stage = stageResponse.json();
  const taskResponse = await inject(
    'POST',
    `/v1/modules/torqueshed/builds/${build.id}/tasks`,
    ownerA,
    { stageId: stage.id, title: 'Verify fuel pressure under load', costMinor: 12500 },
  );
  assert.equal(taskResponse.statusCode, 201, taskResponse.body);
  const task = taskResponse.json();
  const taskUpdate = await inject(
    'PATCH',
    `/v1/modules/torqueshed/build-tasks/${task.id}`,
    ownerA,
    { expectedVersion: task.version, status: 'completed' },
  );
  assert.equal(taskUpdate.statusCode, 200, taskUpdate.body);
  assert.ok(taskUpdate.json().completedAt);

  const diagnosticResponse = await inject('POST', '/v1/modules/torqueshed/diagnostics', ownerA, {
    vehicleId: vehicle.id,
    title: 'Lean bank one under load',
    customerConcern: 'Hesitation during warm acceleration',
    symptoms: 'Intermittent stumble above 2500 RPM',
    conditions: { coolantTemperatureF: 195, ambientTemperatureF: 82 },
    visibility: 'private',
  });
  assert.equal(diagnosticResponse.statusCode, 201, diagnosticResponse.body);
  let diagnostic = diagnosticResponse.json();
  assert.equal(
    (await inject('GET', `/v1/modules/torqueshed/diagnostics/${diagnostic.id}`, member)).statusCode,
    404,
  );
  const codeResponse = await inject(
    'POST',
    `/v1/modules/torqueshed/diagnostics/${diagnostic.id}/trouble-codes`,
    ownerA,
    {
      code: 'P0171',
      description: 'System too lean bank 1',
      freezeFrame: { rpm: 2680, shortTermFuelTrimPercent: 18.2 },
    },
  );
  assert.equal(codeResponse.statusCode, 201, codeResponse.body);
  const measurementHeaders = { 'idempotency-key': 'phase7-diagnostic-pressure-001' };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const measurement = await inject(
      'POST',
      `/v1/modules/torqueshed/diagnostics/${diagnostic.id}/entries`,
      ownerA,
      {
        kind: 'measurement',
        title: 'Fuel pressure',
        valueNumeric: 35,
        unit: 'psi',
        referenceMin: 40,
        referenceMax: 55,
        outcome: 'Below specification under load',
      },
      measurementHeaders,
    );
    assert.equal(measurement.statusCode, attempt === 0 ? 201 : 200, measurement.body);
  }
  const hypothesis = await inject(
    'POST',
    `/v1/modules/torqueshed/diagnostics/${diagnostic.id}/entries`,
    ownerA,
    {
      kind: 'hypothesis',
      title: 'Weak fuel delivery',
      valueText: 'Pressure falls below specification under load.',
    },
    { 'idempotency-key': 'phase7-diagnostic-hypothesis-001' },
  );
  assert.equal(hypothesis.statusCode, 201, hypothesis.body);
  const attachment = await inject(
    'POST',
    `/v1/modules/torqueshed/diagnostics/${diagnostic.id}/attachments`,
    ownerA,
    {
      originalName: 'fuel-pressure.txt',
      declaredMimeType: 'text/plain',
      contentBase64: Buffer.from('35 psi under load').toString('base64'),
    },
  );
  assert.equal(attachment.statusCode, 201, attachment.body);

  const invalidTransition = await inject(
    'PATCH',
    `/v1/modules/torqueshed/diagnostics/${diagnostic.id}`,
    ownerA,
    { expectedVersion: diagnostic.version, status: 'resolved' },
  );
  assert.equal(invalidTransition.statusCode, 409, invalidTransition.body);
  for (const status of ['testing', 'repairing', 'verified', 'resolved']) {
    const update = await inject(
      'PATCH',
      `/v1/modules/torqueshed/diagnostics/${diagnostic.id}`,
      ownerA,
      {
        expectedVersion: diagnostic.version,
        status,
        ...(status === 'repairing'
          ? {
              confirmedCause: 'Restricted fuel delivery',
              repairPerformed: 'Replaced restricted filter',
            }
          : {}),
        ...(status === 'verified' ? { verification: 'Fuel pressure held 47 psi under load' } : {}),
        ...(status === 'resolved'
          ? { resolution: 'Warm acceleration verified without hesitation' }
          : {}),
      },
    );
    assert.equal(update.statusCode, 200, update.body);
    diagnostic = update.json();
  }
  const shareDiagnostic = await inject(
    'PATCH',
    `/v1/modules/torqueshed/diagnostics/${diagnostic.id}`,
    ownerA,
    { expectedVersion: diagnostic.version, visibility: 'tenant' },
  );
  assert.equal(shareDiagnostic.statusCode, 200, shareDiagnostic.body);
  diagnostic = shareDiagnostic.json();
  const memberDetail = await inject(
    'GET',
    `/v1/modules/torqueshed/diagnostics/${diagnostic.id}`,
    member,
  );
  assert.equal(memberDetail.statusCode, 200, memberDetail.body);
  assert.equal(memberDetail.json().timeline.length, 4);
  assert.equal(
    (
      await inject('POST', `/v1/modules/torqueshed/diagnostics/${diagnostic.id}/entries`, viewer, {
        kind: 'test',
        title: 'Denied',
        valueText: 'Denied',
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await inject('GET', `/v1/modules/torqueshed/diagnostics/${diagnostic.id}`, ownerB)).statusCode,
    404,
  );

  const template = await inject('POST', '/v1/modules/torqueshed/diagnostic-templates', ownerA, {
    name: 'Lean condition under load',
    concernPattern: 'Hesitation and positive trims',
    testPlan: [{ title: 'Capture freeze frame' }, { title: 'Measure fuel pressure' }],
    visibility: 'tenant',
  });
  assert.equal(template.statusCode, 201, template.body);
  assert.equal(
    (await inject('GET', '/v1/modules/torqueshed/diagnostic-templates', member)).json().templates
      .length,
    1,
  );
  const assistWithoutBalance = await inject(
    'POST',
    '/v1/modules/torqueshed/torque-assist',
    ownerA,
    { diagnosticSessionId: diagnostic.id },
    { 'idempotency-key': 'phase7-assist-no-balance-001' },
  );
  assert.equal(assistWithoutBalance.statusCode, 402, assistWithoutBalance.body);

  const dashboard = await inject('GET', '/v1/modules/torqueshed/dashboard', ownerA);
  assert.equal(dashboard.statusCode, 200, dashboard.body);
  assert.deepEqual(dashboard.json().metrics, {
    vehicles: 1,
    serviceRecords: 1,
    builds: 1,
    diagnostics: 1,
    reminders: 1,
    serviceCostMinor: '8399',
  });

  await app.close();
  app = await buildApp();
  const persisted = await inject(
    'GET',
    `/v1/modules/torqueshed/diagnostics/${diagnostic.id}`,
    ownerA,
  );
  assert.equal(persisted.statusCode, 200, persisted.body);
  assert.equal(persisted.json().diagnostic.status, 'resolved');
  assert.equal(persisted.json().entries.length, 2);
});
