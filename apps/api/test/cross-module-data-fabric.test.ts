import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';

process.env.APP_ENV = 'test';
process.env.SESSION_SECRET ||= 'phase38-data-fabric-test-session-secret-v1';

let db: any;
let sql: any;
let owner: any;
let member: any;
let foreign: any;
let tfkModule: any;
let snapModule: any;
let customerId: string;
let app: any;
let signToken: any;
const createdModuleIds: string[] = [];

async function ensureModule(slug: string) {
  const found = await db.execute(sql`SELECT * FROM modules WHERE slug=${slug} LIMIT 1`);
  if (found.rows[0]) return found.rows[0];
  const setup = await import('./_setup.js');
  const module = await setup.createTestModule(slug);
  createdModuleIds.push(module.id);
  return module;
}

before(async () => {
  const setup = await import('./_setup.js');
  await setup.ensureSchemaReady();
  ({ db } = await import('../src/db.js'));
  ({ sql } = await import('drizzle-orm'));
  owner = await setup.createTestUser();
  member = await setup.createTestUser();
  foreign = await setup.createTestUser();
  await db.execute(sql`
    INSERT INTO tenant_users(tenant_id,user_id,role)
    VALUES (${owner.currentTenantId},${member.id},'member')
    ON CONFLICT (tenant_id,user_id) DO UPDATE SET role='member'
  `);
  const moduleRows = await Promise.all([
    'tradeflowkit','snapproofos','callcommand-ai','pulsedesk','techdeck','faultlinelab','torqueshed','brandforgeos','ninja-launch-kit','ninjamation',
  ].map(ensureModule));
  tfkModule = moduleRows[0];
  snapModule = moduleRows[1];
  for (const module of moduleRows) {
    await db.execute(sql`
      INSERT INTO tenant_modules(tenant_id,module_id,status,source,allow_all_members)
      VALUES (${owner.currentTenantId},${module.id},'enabled','admin',TRUE)
      ON CONFLICT (tenant_id,module_id) DO UPDATE SET status='enabled',allow_all_members=TRUE
    `);
    await db.execute(sql`
      INSERT INTO tenant_user_module_access(tenant_id,user_id,module_id,access_level,granted_by_user_id)
      VALUES (${owner.currentTenantId},${owner.id},${module.id},'manager',${owner.id})
      ON CONFLICT(tenant_id,user_id,module_id) DO UPDATE SET access_level='manager',updated_at=NOW()
    `);
  }
  const customer = await db.execute(sql`
    INSERT INTO tradeflowkit_customers(tenant_id,created_by_user_id,name,email,source_id)
    VALUES (${owner.currentTenantId},${owner.id},'Phase 38 Field Customer','field@example.test',${`phase38-customer-${owner.id}`}) RETURNING id
  `);
  customerId = String(customer.rows[0].id);
  ({ signToken } = await import('../src/lib/auth.js'));
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerCrossModuleDataFabricRoutes } = await import('../src/routes/cross-module-data-fabric-routes.js');
  app = Fastify();
  await app.register(cookie,{ secret:'phase38-route-cookie-secret' });
  await registerCrossModuleDataFabricRoutes(app);
  await app.ready();
});

after(async () => {
  const setup = await import('./_setup.js');
  if (app) await app.close();
  if (!owner?.id) return;
  try {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`SET LOCAL operatoros.tenant_hard_delete = 'on'`);
      for (const table of [
        'shared_workflow_compensations','shared_resource_links','shared_event_inbox','shared_domain_events','shared_workflow_runs','shared_workflow_rules','shared_resource_references',
        'techdeck_document_revisions','techdeck_ticket_comments','techdeck_evidence','techdeck_documents','techdeck_runbooks','techdeck_tickets',
        'faultlinelab_challenge_versions','faultlinelab_challenges','pulsedesk_ticket_messages','pulsedesk_requests',
        'callcommand_calls','callcommand_profiles','callcommand_channels',
        'torqueshed_diagnostic_entries','torqueshed_diagnostic_sessions','torqueshed_vehicles',
        'launchkit_product_revisions','launchkit_product_kits','launchkit_brand_profiles','launchkit_usage_counters',
        'brandforge_campaigns','brandforge_brands','ninjamation_script_versions','ninjamation_scripts',
        'snapproof_exports','snapproof_reports','snapproof_evidence_items','snapproof_cases','snapproof_customers',
        'tradeflowkit_leads','tradeflowkit_jobs','tradeflowkit_customers',
        'shared_jobs','shared_attachment_blobs','shared_attachments',
      ]) await tx.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id='${owner.currentTenantId}'`));
    });
  } catch {}
  await setup.cleanupUser(owner.id);
  await setup.cleanupUser(member.id);
  await setup.cleanupUser(foreign.id);
  for (const id of createdModuleIds.reverse()) await setup.cleanupModule(id);
  const { closeDatabasePool } = await import('../src/db.js');
  await closeDatabasePool();
});

function bearer(user: any) {
  return { authorization:`Bearer ${signToken({ userId:user.id,email:user.email,role:user.role,tokenVersion:user.tokenVersion,sessionType:'platform' })}` };
}

function stableForLegacyEnvelope(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableForLegacyEnvelope).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${stableForLegacyEnvelope(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function currentWorkflowSourceVersion(
  workflowKey: string,
  aggregateId: string,
  sourceModuleSlug?: string,
): Promise<string | number> {
  const found = workflowKey === 'tradeflowkit.job_to_snapproof'
    ? await db.execute(sql`SELECT version FROM tradeflowkit_jobs WHERE tenant_id=${owner.currentTenantId} AND id=${aggregateId} LIMIT 1`)
    : workflowKey === 'snapproof.approved_report_to_tradeflowkit'
      ? await db.execute(sql`SELECT version FROM snapproof_reports WHERE tenant_id=${owner.currentTenantId} AND id=${aggregateId} LIMIT 1`)
      : workflowKey.startsWith('callcommand.analysis_to_')
        ? await db.execute(sql`SELECT updated_at FROM callcommand_calls WHERE tenant_id=${owner.currentTenantId} AND id=${aggregateId} LIMIT 1`)
        : workflowKey === 'support.resolved_to_faultlinelab' && sourceModuleSlug === 'techdeck'
          ? await db.execute(sql`SELECT version FROM techdeck_tickets WHERE tenant_id=${owner.currentTenantId} AND id=${aggregateId} LIMIT 1`)
          : workflowKey === 'support.resolved_to_faultlinelab' && sourceModuleSlug === 'pulsedesk'
            ? await db.execute(sql`SELECT version FROM pulsedesk_requests WHERE tenant_id=${owner.currentTenantId} AND id=${aggregateId} LIMIT 1`)
            : workflowKey.startsWith('torqueshed.diagnostic_to_')
              ? await db.execute(sql`SELECT version FROM torqueshed_diagnostic_sessions WHERE tenant_id=${owner.currentTenantId} AND id=${aggregateId} LIMIT 1`)
              : workflowKey === 'brandforgeos.campaign_to_launchkit'
                ? await db.execute(sql`SELECT version FROM brandforge_campaigns WHERE tenant_id=${owner.currentTenantId} AND id=${aggregateId} LIMIT 1`)
                : workflowKey === 'ninjamation.script_to_techdeck'
                  ? await db.execute(sql`SELECT current_version_number FROM ninjamation_scripts WHERE tenant_id=${owner.currentTenantId} AND id=${aggregateId} LIMIT 1`)
                  : { rows: [] };
  const row = found.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error(`Missing source version fixture for ${workflowKey}:${aggregateId}`);
  const value = row.version ?? row.current_version_number ?? row.updated_at;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'string') return value;
  throw new Error(`Unsupported source version fixture for ${workflowKey}:${aggregateId}`);
}

test('Phase 38 routes reject malformed identifiers and non-finite or fractional bounds', async () => {
  const workflowUrl = `/v1/tenants/${owner.currentTenantId}/data-fabric/workflows/tradeflowkit.job_to_snapproof`;
  const aggregateId = randomUUID();
  const base = {
    aggregateId,
    sourceDeepLink:`/modules/tradeflowkit/jobs/${aggregateId}`,
    idempotencyKey:`phase38:route-bounds:${randomUUID()}`,
    expectedSourceVersion:1,
  };
  for (const payload of [
    { ...base, propagationDepth:'NaN' },
    { ...base, maxAttempts:'Infinity' },
    { ...base, maxAttempts:1.5 },
  ]) {
    const response = await app.inject({ method:'POST',url:workflowUrl,headers:bearer(owner),payload });
    assert.equal(response.statusCode,400,response.body);
    assert.equal(response.json().code,'FABRIC_NUMBER_INVALID');
  }
  const { expectedSourceVersion: _omittedVersion, ...withoutVersion } = base;
  const missingVersion = await app.inject({ method:'POST',url:workflowUrl,headers:bearer(owner),payload:withoutVersion });
  assert.equal(missingVersion.statusCode,400,missingVersion.body);
  assert.equal(missingVersion.json().code,'FABRIC_SOURCE_VERSION_REQUIRED');
  const malformed = 'aaaaaaaa-aaaa-6aaa-aaaa-aaaaaaaaaaaa';
  const invalidId = await app.inject({
    method:'POST',url:workflowUrl,headers:bearer(owner),
    payload:{ ...base,aggregateId:malformed,sourceDeepLink:`/modules/tradeflowkit/jobs/${malformed}` },
  });
  assert.equal(invalidId.statusCode,400,invalidId.body);
  assert.equal(invalidId.json().code,'FABRIC_IDENTIFIER_INVALID');

  const activity = await app.inject({ method:'GET',url:`/v1/tenants/${owner.currentTenantId}/data-fabric/activity?limit=1.5`,headers:bearer(owner) });
  assert.equal(activity.statusCode,400,activity.body);
  assert.equal(activity.json().code,'FABRIC_NUMBER_INVALID');
  const rule = await app.inject({
    method:'POST',url:`/v1/tenants/${owner.currentTenantId}/data-fabric/rules`,headers:bearer(owner),
    payload:{ name:'Invalid priority',sourceModuleSlug:'callcommand-ai',destinationModuleSlug:'tradeflowkit',sourceEventType:'callcommand.call.analyzed.v1',workflowKey:'callcommand.analysis_to_tradeflowkit',priority:'NaN' },
  });
  assert.equal(rule.statusCode,400,rule.body);
  assert.equal(rule.json().code,'FABRIC_NUMBER_INVALID');
});

test('workflow readiness reports destination and manager access before confirmation without widening authority', async () => {
  const regularUrl = `/v1/tenants/${owner.currentTenantId}/data-fabric/workflows/tradeflowkit.job_to_snapproof/readiness`;
  const ownerReady = await app.inject({ method:'GET',url:regularUrl,headers:bearer(owner) });
  assert.equal(ownerReady.statusCode,200,ownerReady.body);
  assert.equal(ownerReady.json().readiness.available,true);
  assert.equal(ownerReady.json().readiness.source.moduleSlug,'tradeflowkit');
  assert.equal(ownerReady.json().readiness.destination.moduleSlug,'snapproofos');
  assert.equal(ownerReady.json().readiness.destination.canWrite,true);

  const memberReady = await app.inject({ method:'GET',url:regularUrl,headers:bearer(member) });
  assert.equal(memberReady.statusCode,200,memberReady.body);
  assert.equal(memberReady.json().readiness.available,true);
  assert.equal(memberReady.json().readiness.minimumAccess,'user');

  const managerWorkflow = await app.inject({
    method:'GET',
    url:`/v1/tenants/${owner.currentTenantId}/data-fabric/workflows/support.resolved_to_faultlinelab/readiness?sourceModuleSlug=techdeck`,
    headers:bearer(member),
  });
  assert.equal(managerWorkflow.statusCode,200,managerWorkflow.body);
  assert.equal(managerWorkflow.json().readiness.available,false);
  assert.equal(managerWorkflow.json().readiness.managerAccessRequired,true);
  assert.equal(managerWorkflow.json().readiness.minimumAccess,'manager');
  assert.equal(managerWorkflow.json().readiness.blocker,'source_manager_required');

  await db.execute(sql`
    INSERT INTO tenant_user_module_access(tenant_id,user_id,module_id,access_level,granted_by_user_id)
    VALUES (${owner.currentTenantId},${member.id},${snapModule.id},'viewer',${owner.id})
    ON CONFLICT(tenant_id,user_id,module_id) DO UPDATE SET access_level='viewer',updated_at=NOW()
  `);
  try {
    const destinationBlocked = await app.inject({ method:'GET',url:regularUrl,headers:bearer(member) });
    assert.equal(destinationBlocked.statusCode,200,destinationBlocked.body);
    assert.equal(destinationBlocked.json().readiness.available,false);
    assert.equal(destinationBlocked.json().readiness.blocker,'destination_write_required');
    assert.equal(destinationBlocked.json().readiness.destination.accessLevel,'viewer');
    assert.equal(destinationBlocked.json().readiness.destination.canWrite,false);
  } finally {
    await db.execute(sql`
      DELETE FROM tenant_user_module_access
      WHERE tenant_id=${owner.currentTenantId} AND user_id=${member.id} AND module_id=${snapModule.id}
    `);
  }

  const missingDynamicSource = await app.inject({
    method:'GET',
    url:`/v1/tenants/${owner.currentTenantId}/data-fabric/workflows/support.resolved_to_faultlinelab/readiness`,
    headers:bearer(owner),
  });
  assert.equal(missingDynamicSource.statusCode,400,missingDynamicSource.body);
  assert.equal(missingDynamicSource.json().code,'FABRIC_SOURCE_MODULE_REQUIRED');

  const mismatchedSource = await app.inject({
    method:'GET',
    url:`${regularUrl}?sourceModuleSlug=pulsedesk`,
    headers:bearer(owner),
  });
  assert.equal(mismatchedSource.statusCode,400,mismatchedSource.body);
  assert.equal(mismatchedSource.json().code,'FABRIC_SOURCE_MODULE_MISMATCH');
});

test('Phase 38 API queues idempotently, filters tenant activity, and exposes run provenance', async () => {
  const job = await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'API workflow job','scheduled','normal',${`phase38-api-${owner.id}`}) RETURNING id,version
  `);
  const jobId = String(job.rows[0].id);
  const url = `/v1/tenants/${owner.currentTenantId}/data-fabric/workflows/tradeflowkit.job_to_snapproof`;
  const payload = { aggregateId:jobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,expectedSourceVersion:Number(job.rows[0].version),idempotencyKey:`phase38:api:${jobId}` };
  const first = await app.inject({ method:'POST',url,headers:bearer(owner),payload });
  assert.equal(first.statusCode,202,first.body);
  assert.equal(first.json().duplicate,false);
  const duplicate = await app.inject({ method:'POST',url,headers:bearer(owner),payload });
  assert.equal(duplicate.statusCode,200,duplicate.body);
  assert.equal(duplicate.json().duplicate,true);
  const runId = String(first.json().run.id);
  const inboxId = String(first.json().run.inbox_id);
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  await fabric.deliverDataFabricInbox(inboxId);
  const detail = await app.inject({ method:'GET',url:`/v1/tenants/${owner.currentTenantId}/data-fabric/runs/${runId}`,headers:bearer(owner) });
  assert.equal(detail.statusCode,200,detail.body);
  assert.equal(detail.json().run.status,'completed');
  assert.equal(detail.json().links.length,2);
  const foreignView = await app.inject({ method:'GET',url:`/v1/tenants/${owner.currentTenantId}/data-fabric/activity`,headers:bearer(foreign) });
  assert.equal(foreignView.statusCode,404,foreignView.body);
});

test('a pending signed event survives one controlled signing-key rotation window', async () => {
  const names = [
    'DATA_FABRIC_EVENT_SIGNING_KEY',
    'DATA_FABRIC_EVENT_SIGNING_KEY_VERSION',
    'DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY',
    'DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY_VERSION',
  ] as const;
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const firstKey = '1a'.repeat(32);
  const secondKey = '2b'.repeat(32);
  try {
    process.env.DATA_FABRIC_EVENT_SIGNING_KEY = firstKey;
    process.env.DATA_FABRIC_EVENT_SIGNING_KEY_VERSION = 'fabric-rotation-v1';
    delete process.env.DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY;
    delete process.env.DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY_VERSION;
    const job = await db.execute(sql`
      INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
      VALUES (${owner.currentTenantId},${customerId},${owner.id},'Signing rotation proof job','scheduled','normal',${`phase38-rotation-${randomUUID()}`}) RETURNING id,version
    `);
    const jobId = String(job.rows[0].id);
    const fabric = await import('../src/lib/cross-module-data-fabric.js');
    const queued = await fabric.publishDataFabricWorkflow({
      tenantId: owner.currentTenantId,
      actorUserId: owner.id,
      workflowKey: 'tradeflowkit.job_to_snapproof',
      aggregateId: jobId,
      sourceDeepLink: `/modules/tradeflowkit/jobs/${jobId}`,
      expectedSourceVersion: Number(job.rows[0].version),
      idempotencyKey: `phase38:rotation:${jobId}`,
      correlationId: `phase38-rotation:${jobId}`,
    });
    const signed = await db.execute(sql`SELECT signing_key_version FROM shared_domain_events WHERE tenant_id=${owner.currentTenantId} AND workflow_run_id=${String(queued.run.id)}`);
    assert.equal(signed.rows[0].signing_key_version, 'fabric-rotation-v1');

    process.env.DATA_FABRIC_EVENT_SIGNING_KEY = secondKey;
    process.env.DATA_FABRIC_EVENT_SIGNING_KEY_VERSION = 'fabric-rotation-v2';
    process.env.DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY = firstKey;
    process.env.DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY_VERSION = 'fabric-rotation-v1';
    await fabric.deliverDataFabricInbox(String(queued.run.inbox_id));
    const delivered = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE tenant_id=${owner.currentTenantId} AND id=${String(queued.run.inbox_id)}`);
    assert.equal(delivered.rows[0].status, 'completed');
    assert.equal(delivered.rows[0].last_error_code, null);
  } finally {
    for (const name of names) {
      const value = saved[name];
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('legacy envelope v1 events remain deliverable during the compatibility window', async () => {
  const names = [
    'DATA_FABRIC_EVENT_SIGNING_KEY',
    'DATA_FABRIC_EVENT_SIGNING_KEY_VERSION',
    'DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY',
    'DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY_VERSION',
  ] as const;
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const signingRoot = '3c'.repeat(32);
  try {
    process.env.DATA_FABRIC_EVENT_SIGNING_KEY = signingRoot;
    process.env.DATA_FABRIC_EVENT_SIGNING_KEY_VERSION = 'fabric-legacy-compat-v1';
    delete process.env.DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY;
    delete process.env.DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY_VERSION;
    const job = await db.execute(sql`
      INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
      VALUES (${owner.currentTenantId},${customerId},${owner.id},'Legacy signed envelope job','scheduled','normal',${`phase38-legacy-envelope-${randomUUID()}`}) RETURNING id,version
    `);
    const jobId = String(job.rows[0].id);
    const fabric = await import('../src/lib/cross-module-data-fabric.js');
    const queued = await fabric.publishDataFabricWorkflow({
      tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof',
      aggregateId:jobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,
      expectedSourceVersion:Number(job.rows[0].version),idempotencyKey:`phase38:legacy-envelope:${jobId}`,
      correlationId:`phase38-legacy-envelope:${jobId}`,
    });
    const selected = await db.execute(sql`
      SELECT * FROM shared_domain_events
      WHERE tenant_id=${owner.currentTenantId} AND workflow_run_id=${String(queued.run.id)}
      LIMIT 1
    `);
    const event = selected.rows[0] as Record<string, any>;
    const legacyEnvelope = {
      tenantId:String(event.tenant_id),sourceModuleId:String(event.source_module_id),eventType:String(event.event_type),
      eventVersion:Number(event.event_version),aggregateType:String(event.aggregate_type),aggregateId:String(event.aggregate_id),
      aggregateSequence:Number(event.aggregate_sequence),idempotencyKey:String(event.idempotency_key),
      correlationId:String(event.correlation_id),causationId:event.causation_id ? String(event.causation_id) : null,
      rootEventId:event.root_event_id ? String(event.root_event_id) : null,propagationDepth:Number(event.propagation_depth),
      sourceDeepLink:String(event.source_deep_link),payload:event.payload_json,
    };
    const key = createHmac('sha256',Buffer.from(signingRoot,'hex')).update('operatoros:data-fabric:event-signing:v1').digest();
    const signature = createHmac('sha256',key).update(stableForLegacyEnvelope(legacyEnvelope)).digest('hex');
    const payloadSha256 = createHash('sha256').update(stableForLegacyEnvelope(legacyEnvelope.payload)).digest('hex');
    await db.execute(sql`
      UPDATE shared_domain_events
      SET signature_envelope_version=1,signature_hmac_sha256=${signature},payload_sha256=${payloadSha256}
      WHERE tenant_id=${owner.currentTenantId} AND id=${String(event.id)}
    `);
    await fabric.deliverDataFabricInbox(String(queued.run.inbox_id));
    const delivered = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE tenant_id=${owner.currentTenantId} AND id=${String(queued.run.inbox_id)}`);
    assert.equal(delivered.rows[0].status,'completed');
    assert.equal(delivered.rows[0].last_error_code,null);
  } finally {
    for (const name of names) {
      const value = saved[name];
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('write-capable tenant members can create outcomes but cannot use fabric administration', async () => {
  const job = await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
    VALUES (${owner.currentTenantId},${customerId},${member.id},'Member-created proof job','scheduled','normal',${`phase38-member-${member.id}`}) RETURNING id,version
  `);
  const jobId = String(job.rows[0].id);
  const url = `/v1/tenants/${owner.currentTenantId}/data-fabric/workflows/tradeflowkit.job_to_snapproof`;
  const created = await app.inject({
    method:'POST', url, headers:bearer(member),
    payload:{ aggregateId:jobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,expectedSourceVersion:Number(job.rows[0].version),idempotencyKey:`phase38:member:${jobId}` },
  });
  assert.equal(created.statusCode,202,created.body);
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  await fabric.deliverDataFabricInbox(String(created.json().run.inbox_id));
  const detail = await app.inject({ method:'GET',url:`/v1/tenants/${owner.currentTenantId}/data-fabric/runs/${created.json().run.id}`,headers:bearer(member) });
  assert.equal(detail.statusCode,200,detail.body);
  assert.equal(detail.json().run.status,'completed');
  const activity = await app.inject({ method:'GET',url:`/v1/tenants/${owner.currentTenantId}/data-fabric/activity`,headers:bearer(member) });
  assert.equal(activity.statusCode,403,activity.body);
  const rules = await app.inject({ method:'GET',url:`/v1/tenants/${owner.currentTenantId}/data-fabric/rules`,headers:bearer(member) });
  assert.equal(rules.statusCode,403,rules.body);
});

test('tenant-owned customer outcomes deduplicate across actors, remain reviewable, and reject stale previews', async () => {
  const job = await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'Version-guarded proof job','scheduled','normal',${`phase38-version-${randomUUID()}`})
    RETURNING id,version
  `);
  const jobId = String(job.rows[0].id);
  const version = Number(job.rows[0].version);
  const url = `/v1/tenants/${owner.currentTenantId}/data-fabric/workflows/tradeflowkit.job_to_snapproof`;
  const base = {
    aggregateId:jobId,
    sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,
    expectedSourceVersion:version,
  };
  const first = await app.inject({
    method:'POST',url,headers:bearer(owner),
    payload:{ ...base,idempotencyKey:`phase38:semantic-a:${randomUUID()}` },
  });
  assert.equal(first.statusCode,202,first.body);
  const secondClient = await app.inject({
    method:'POST',url,headers:bearer(member),
    payload:{ ...base,idempotencyKey:`phase38:semantic-b:${randomUUID()}` },
  });
  assert.equal(secondClient.statusCode,200,secondClient.body);
  assert.equal(secondClient.json().duplicate,true);
  assert.equal(String(secondClient.json().run.id),String(first.json().run.id));
  assert.equal(secondClient.json().run.actor_user_id,undefined);
  assert.equal(secondClient.json().run.idempotency_key,undefined);
  assert.equal(secondClient.json().run.details_json.requestFingerprint,undefined);
  assert.equal(secondClient.json().run.details_json.requestIdempotencyKey,undefined);
  const persistedScope = await db.execute(sql`SELECT idempotency_scope FROM shared_workflow_runs WHERE tenant_id=${owner.currentTenantId} AND id=${String(first.json().run.id)}`);
  assert.equal(persistedScope.rows[0].idempotency_scope,'tenant');
  const memberDetail = await app.inject({
    method:'GET',url:`/v1/tenants/${owner.currentTenantId}/data-fabric/runs/${first.json().run.id}`,headers:bearer(member),
  });
  assert.equal(memberDetail.statusCode,200,memberDetail.body);
  assert.equal(memberDetail.json().run.actor_email,undefined);
  assert.equal(memberDetail.json().run.details_json.requestFingerprint,undefined);
  assert.equal(memberDetail.json().run.details_json.requestIdempotencyKey,undefined);

  await db.execute(sql`UPDATE tradeflowkit_jobs SET version=version+1,updated_at=NOW() WHERE tenant_id=${owner.currentTenantId} AND id=${jobId}`);
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  await fabric.deliverDataFabricInbox(String(first.json().run.inbox_id));
  const stale = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE tenant_id=${owner.currentTenantId} AND id=${String(first.json().run.inbox_id)}`);
  assert.equal(stale.rows[0].status,'dead_letter');
  assert.equal(stale.rows[0].last_error_code,'FABRIC_SOURCE_VERSION_CHANGED');
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM snapproof_cases WHERE tenant_id=${owner.currentTenantId} AND source_context->>'jobId'=${jobId}`)).rows[0].count),0);

  const refreshed = await app.inject({
    method:'POST',url,headers:bearer(owner),
    payload:{ ...base,expectedSourceVersion:version+1,idempotencyKey:`phase38:semantic-c:${randomUUID()}` },
  });
  assert.equal(refreshed.statusCode,202,refreshed.body);
  await fabric.deliverDataFabricInbox(String(refreshed.json().run.inbox_id));
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM snapproof_cases WHERE tenant_id=${owner.currentTenantId} AND source_context->>'jobId'=${jobId}`)).rows[0].count),1);
});

test('actor-owned outcomes do not deduplicate across users and run detail remains actor scoped', async () => {
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const brand = await db.execute(sql`
    INSERT INTO brandforge_brands(tenant_id,created_by_user_id,name,description,primary_color,accent_color,voice_tone)
    VALUES (${owner.currentTenantId},${owner.id},'Actor scoped brand','Per-user launch package proof','#111827','#DC2626','Professional')
    RETURNING id
  `);
  const campaign = await db.execute(sql`
    INSERT INTO brandforge_campaigns(tenant_id,created_by_user_id,brand_id,name,objective,target_audience,core_message,offer,status,channels)
    VALUES (${owner.currentTenantId},${owner.id},${String(brand.rows[0].id)},'Actor scoped campaign','Prepare a launch package','Field service teams','Use approved proof','Proof package','planning','["email"]'::jsonb)
    RETURNING id,version
  `);
  const campaignId = String(campaign.rows[0].id);
  const sourceDeepLink = `/modules/brandforgeos/campaigns/${campaignId}`;
  const common = {
    tenantId:owner.currentTenantId,
    workflowKey:'brandforgeos.campaign_to_launchkit' as const,
    aggregateId:campaignId,
    sourceDeepLink,
    expectedSourceVersion:Number(campaign.rows[0].version),
    correlationId:`phase38-actor-scope:${campaignId}`,
  };
  const ownerRun = await fabric.publishDataFabricWorkflow({ ...common,actorUserId:owner.id,idempotencyKey:`phase38:actor-owner:${randomUUID()}` });
  const memberRun = await fabric.publishDataFabricWorkflow({ ...common,actorUserId:member.id,idempotencyKey:`phase38:actor-member:${randomUUID()}` });
  assert.equal(ownerRun.duplicate,false);
  assert.equal(memberRun.duplicate,false);
  assert.notEqual(String(ownerRun.run.id),String(memberRun.run.id));
  const actorScopes = await db.execute(sql`
    SELECT idempotency_scope FROM shared_workflow_runs
    WHERE tenant_id=${owner.currentTenantId} AND id IN (${String(ownerRun.run.id)},${String(memberRun.run.id)})
  `);
  assert.equal(actorScopes.rows.length,2);
  assert.ok(actorScopes.rows.every((row: any) => row.idempotency_scope === 'actor'));

  const memberRetry = await fabric.publishDataFabricWorkflow({ ...common,actorUserId:member.id,idempotencyKey:`phase38:actor-member-retry:${randomUUID()}` });
  assert.equal(memberRetry.duplicate,true);
  assert.equal(String(memberRetry.run.id),String(memberRun.run.id));

  const memberReadingOwner = await app.inject({
    method:'GET',
    url:`/v1/tenants/${owner.currentTenantId}/data-fabric/runs/${ownerRun.run.id}`,
    headers:bearer(member),
  });
  assert.equal(memberReadingOwner.statusCode,404,memberReadingOwner.body);
  const ownerReadingMember = await app.inject({
    method:'GET',
    url:`/v1/tenants/${owner.currentTenantId}/data-fabric/runs/${memberRun.run.id}`,
    headers:bearer(owner),
  });
  assert.equal(ownerReadingMember.statusCode,200,ownerReadingMember.body);

  await fabric.deliverDataFabricInbox(String(ownerRun.run.inbox_id));
  await fabric.deliverDataFabricInbox(String(memberRun.run.inbox_id));
  const kits = await db.execute(sql`
    SELECT user_id FROM launchkit_product_kits
    WHERE tenant_id=${owner.currentTenantId} AND provenance_json->>'campaignId'=${campaignId}
  `);
  assert.deepEqual(new Set(kits.rows.map((row: any) => String(row.user_id))),new Set([owner.id,member.id]));
});

test('a reused client key and a semantic-key race cannot resolve a mismatched request', async () => {
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const firstJob = await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'Fingerprint source A','scheduled','normal',${`phase38-fingerprint-a-${randomUUID()}`})
    RETURNING id,version
  `);
  const secondJob = await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'Fingerprint source B','scheduled','normal',${`phase38-fingerprint-b-${randomUUID()}`})
    RETURNING id,version
  `);
  const clientKey = `phase38:fingerprint:${randomUUID()}`;
  const firstId = String(firstJob.rows[0].id);
  const secondId = String(secondJob.rows[0].id);
  await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof',
    aggregateId:firstId,sourceDeepLink:`/modules/tradeflowkit/jobs/${firstId}`,
    expectedSourceVersion:Number(firstJob.rows[0].version),idempotencyKey:clientKey,correlationId:`phase38-fingerprint:${firstId}`,
  });
  await assert.rejects(
    () => fabric.publishDataFabricWorkflow({
      tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof',
      aggregateId:secondId,sourceDeepLink:`/modules/tradeflowkit/jobs/${secondId}`,
      expectedSourceVersion:Number(secondJob.rows[0].version),idempotencyKey:clientKey,correlationId:`phase38-fingerprint:${secondId}`,
    }),
    (error: any) => error?.code === 'FABRIC_IDEMPOTENCY_CONFLICT',
  );

  const raceId = String((await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'Fingerprint race source','scheduled','normal',${`phase38-fingerprint-race-${randomUUID()}`})
    RETURNING id
  `)).rows[0].id);
  const version = await currentWorkflowSourceVersion('tradeflowkit.job_to_snapproof',raceId);
  const raceBase = {
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof' as const,
    aggregateId:raceId,sourceDeepLink:`/modules/tradeflowkit/jobs/${raceId}`,expectedSourceVersion:version,
    correlationId:`phase38-fingerprint-race:${raceId}`,
  };
  const raced = await Promise.allSettled([
    fabric.publishDataFabricWorkflow({ ...raceBase,idempotencyKey:`phase38:fingerprint-race-a:${randomUUID()}`,payload:{ requestLabel:'A' } }),
    fabric.publishDataFabricWorkflow({ ...raceBase,idempotencyKey:`phase38:fingerprint-race-b:${randomUUID()}`,payload:{ requestLabel:'B' } }),
  ]);
  assert.equal(raced.filter(result => result.status === 'fulfilled').length,1);
  const rejected = raced.find(result => result.status === 'rejected') as PromiseRejectedResult | undefined;
  assert.equal((rejected?.reason as any)?.code,'FABRIC_IDEMPOTENCY_CONFLICT');
});

test('background data-fabric jobs cannot dispatch an inbox from another tenant or destination module', async () => {
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const jobs = await import('../src/lib/shared-background-jobs.js');
  const source = await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'Bound job context source','scheduled','normal',${`phase38-bound-job-${randomUUID()}`})
    RETURNING id,version
  `);
  const sourceId = String(source.rows[0].id);
  const queued = await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof',
    aggregateId:sourceId,sourceDeepLink:`/modules/tradeflowkit/jobs/${sourceId}`,
    expectedSourceVersion:Number(source.rows[0].version),idempotencyKey:`phase38:bound-job:${randomUUID()}`,
    correlationId:`phase38-bound-job:${sourceId}`,maxAttempts:1,
  });
  const inboxId = String(queued.run.inbox_id);
  const beforeTarget = await db.execute(sql`
    SELECT status,attempt_count FROM shared_event_inbox
    WHERE tenant_id=${owner.currentTenantId} AND id=${inboxId}
  `);
  assert.equal(beforeTarget.rows[0].status,'pending');
  assert.equal(Number(beforeTarget.rows[0].attempt_count),0);

  async function processMismatchedJob(tenantId: string, moduleId: string, label: string) {
    const workerId = `phase38-bound-${label}`;
    const inserted = await db.execute(sql`
      INSERT INTO shared_jobs(
        tenant_id,module_id,requested_by_user_id,handler_key,payload_json,status,
        attempt_count,max_attempts,lease_owner,lease_expires_at,idempotency_key,correlation_id
      ) VALUES (
        ${tenantId},${moduleId},${tenantId === foreign.currentTenantId ? foreign.id : owner.id},
        ${fabric.DATA_FABRIC_JOB_HANDLER},${JSON.stringify({ inboxId })}::jsonb,'processing',
        0,1,${workerId},NOW()+interval '1 minute',${`phase38:bound-job:${label}:${randomUUID()}`},${`phase38-bound-job:${label}`}
      ) RETURNING *
    `);
    await jobs.processSharedJob(inserted.rows[0] as Record<string, unknown>);
    const failed = await db.execute(sql`
      SELECT status,last_error_code FROM shared_jobs WHERE tenant_id=${tenantId} AND id=${String(inserted.rows[0].id)}
    `);
    assert.equal(failed.rows[0].status,'dead_letter');
    assert.equal(failed.rows[0].last_error_code,'FABRIC_INBOX_NOT_FOUND');
  }

  await processMismatchedJob(foreign.currentTenantId,String(snapModule.id),'foreign-tenant');
  await processMismatchedJob(owner.currentTenantId,String(tfkModule.id),'wrong-module');
  const unchanged = await db.execute(sql`
    SELECT status,attempt_count FROM shared_event_inbox
    WHERE tenant_id=${owner.currentTenantId} AND id=${inboxId}
  `);
  assert.equal(unchanged.rows[0].status,'pending');
  assert.equal(Number(unchanged.rows[0].attempt_count),0);
  assert.equal(Number((await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM snapproof_cases
    WHERE tenant_id=${owner.currentTenantId} AND source_context->>'jobId'=${sourceId}
  `)).rows[0].count),0);
});

test('TorqueShed proof handoff preserves private diagnostic ownership at publish and delivery', async () => {
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const modules = await db.execute(sql`SELECT id,slug FROM modules WHERE slug IN ('torqueshed','snapproofos')`);
  const ids = Object.fromEntries(modules.rows.map((row: any) => [String(row.slug),String(row.id)]));
  for (const moduleId of [ids.torqueshed,ids.snapproofos]) {
    await db.execute(sql`
      INSERT INTO tenant_user_module_access(tenant_id,user_id,module_id,access_level,granted_by_user_id)
      VALUES (${owner.currentTenantId},${member.id},${moduleId},'user',${owner.id})
      ON CONFLICT(tenant_id,user_id,module_id) DO UPDATE SET access_level='user',updated_at=NOW()
    `);
  }
  const vehicle = await db.execute(sql`
    INSERT INTO torqueshed_vehicles(tenant_id,owner_user_id,nickname,year,make,model,ownership_status,visibility,created_by_user_id,updated_by_user_id)
    VALUES (${owner.currentTenantId},${owner.id},'Private diagnostic vehicle',2022,'Toyota','Tacoma','owned','private',${owner.id},${owner.id})
    RETURNING id
  `);
  const diagnostic = await db.execute(sql`
    INSERT INTO torqueshed_diagnostic_sessions(tenant_id,owner_user_id,vehicle_id,title,customer_concern,symptoms,status,visibility,created_by_user_id,updated_by_user_id)
    VALUES (${owner.currentTenantId},${owner.id},${String(vehicle.rows[0].id)},'Private no-start diagnosis','Customer concern must remain private.','Intermittent no-start.','testing','private',${owner.id},${owner.id})
    RETURNING id,version
  `);
  const diagnosticId = String(diagnostic.rows[0].id);
  const input = {
    tenantId:owner.currentTenantId,actorUserId:member.id,workflowKey:'torqueshed.diagnostic_to_snapproof' as const,
    aggregateId:diagnosticId,sourceDeepLink:`/modules/torqueshed/diagnostics/${diagnosticId}`,
    expectedSourceVersion:Number(diagnostic.rows[0].version),correlationId:`phase38-torque-private:${diagnosticId}`,maxAttempts:1,
  };
  await assert.rejects(
    () => fabric.publishDataFabricWorkflow({ ...input,idempotencyKey:`phase38:torque-private:${randomUUID()}` }),
    (error: any) => error?.code === 'FABRIC_SOURCE_NOT_FOUND' && error?.statusCode === 404,
  );
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM shared_workflow_runs WHERE tenant_id=${owner.currentTenantId} AND workflow_key='torqueshed.diagnostic_to_snapproof' AND actor_user_id=${member.id} AND source_reference_id IN (SELECT id FROM shared_resource_references WHERE tenant_id=${owner.currentTenantId} AND resource_id=${diagnosticId})`)).rows[0].count),0);

  await db.execute(sql`UPDATE torqueshed_diagnostic_sessions SET visibility='tenant' WHERE tenant_id=${owner.currentTenantId} AND id=${diagnosticId}`);
  const queued = await fabric.publishDataFabricWorkflow({ ...input,idempotencyKey:`phase38:torque-visible:${randomUUID()}` });
  await db.execute(sql`UPDATE torqueshed_diagnostic_sessions SET visibility='private' WHERE tenant_id=${owner.currentTenantId} AND id=${diagnosticId}`);
  await fabric.deliverDataFabricInbox(String(queued.run.inbox_id));
  const denied = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE tenant_id=${owner.currentTenantId} AND id=${String(queued.run.inbox_id)}`);
  assert.equal(denied.rows[0].status,'dead_letter');
  assert.equal(denied.rows[0].last_error_code,'FABRIC_SOURCE_NOT_FOUND');
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM snapproof_cases WHERE tenant_id=${owner.currentTenantId} AND source_context->>'diagnosticId'=${diagnosticId}`)).rows[0].count),0);

  await db.execute(sql`UPDATE torqueshed_diagnostic_sessions SET visibility='tenant' WHERE tenant_id=${owner.currentTenantId} AND id=${diagnosticId}`);
  const recovered = await fabric.publishDataFabricWorkflow({ ...input,idempotencyKey:`phase38:torque-visible-retry:${randomUUID()}` });
  assert.equal(recovered.duplicate,true);
  assert.equal(recovered.requeued,true);
  await fabric.deliverDataFabricInbox(String(recovered.run.inbox_id));
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM snapproof_cases WHERE tenant_id=${owner.currentTenantId} AND source_context->>'diagnosticId'=${diagnosticId}`)).rows[0].count),1);
});

test('training drafts allow tenant owners or explicit module managers and reject ordinary members', async () => {
  const modules = await db.execute(sql`SELECT id,slug FROM modules WHERE slug IN ('techdeck','faultlinelab')`);
  const ids = Object.fromEntries(modules.rows.map((row: any) => [String(row.slug),String(row.id)]));
  const sequence = await db.execute(sql`
    INSERT INTO techdeck_ticket_sequences(tenant_id,last_number) VALUES (${owner.currentTenantId},1)
    ON CONFLICT(tenant_id) DO UPDATE SET last_number=techdeck_ticket_sequences.last_number+1 RETURNING last_number
  `);
  const ticket = await db.execute(sql`
    INSERT INTO techdeck_tickets(tenant_id,number,created_by_user_id,title,description,priority,status,resolved_at)
    VALUES (${owner.currentTenantId},${Number(sequence.rows[0].last_number)},${member.id},'Manager-reviewed training source','No customer-sensitive data.','medium','resolved',NOW())
    RETURNING id,version
  `);
  const ticketId = String(ticket.rows[0].id);
  const url = `/v1/tenants/${owner.currentTenantId}/data-fabric/workflows/support.resolved_to_faultlinelab`;
  const requestPayload = {
    aggregateId:ticketId,
    sourceDeepLink:`/modules/techdeck/tickets/${ticketId}`,
    sourceModuleSlug:'techdeck',
    sourceType:'techdeck_ticket',
    sourceKind:'ticket',
    expectedSourceVersion:Number(ticket.rows[0].version),
    payload:{ authorApproved:true,privacyReviewed:true },
  };
  const ordinaryUser = await app.inject({
    method:'POST',url,headers:bearer(member),
    payload:{ ...requestPayload,idempotencyKey:`phase38:training-user:${randomUUID()}` },
  });
  assert.equal(ordinaryUser.statusCode,403,ordinaryUser.body);
  assert.equal(ordinaryUser.json().code,'FABRIC_MODULE_MANAGER_REQUIRED');

  for (const moduleId of [ids.techdeck,ids.faultlinelab]) {
    await db.execute(sql`
      INSERT INTO tenant_user_module_access(tenant_id,user_id,module_id,access_level,granted_by_user_id)
      VALUES (${owner.currentTenantId},${member.id},${moduleId},'manager',${owner.id})
      ON CONFLICT(tenant_id,user_id,module_id) DO UPDATE SET access_level='manager',updated_at=NOW()
    `);
  }
  const manager = await app.inject({
    method:'POST',url,headers:bearer(member),
    payload:{ ...requestPayload,idempotencyKey:`phase38:training-manager:${randomUUID()}` },
  });
  assert.equal(manager.statusCode,202,manager.body);
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  await fabric.deliverDataFabricInbox(String(manager.json().run.inbox_id));
  const completed = await db.execute(sql`SELECT status FROM shared_workflow_runs WHERE tenant_id=${owner.currentTenantId} AND id=${String(manager.json().run.id)}`);
  assert.equal(completed.rows[0].status,'completed');

  for (const moduleId of [ids.techdeck,ids.faultlinelab]) {
    await db.execute(sql`
      UPDATE tenant_user_module_access SET access_level='user',updated_at=NOW()
      WHERE tenant_id=${owner.currentTenantId} AND user_id=${owner.id} AND module_id=${moduleId}
    `);
  }
  const ownerSequence = await db.execute(sql`
    INSERT INTO techdeck_ticket_sequences(tenant_id,last_number) VALUES (${owner.currentTenantId},1)
    ON CONFLICT(tenant_id) DO UPDATE SET last_number=techdeck_ticket_sequences.last_number+1 RETURNING last_number
  `);
  const ownerTicket = await db.execute(sql`
    INSERT INTO techdeck_tickets(tenant_id,number,created_by_user_id,title,description,priority,status,resolved_at)
    VALUES (${owner.currentTenantId},${Number(ownerSequence.rows[0].last_number)},${owner.id},'Owner-reviewed training source','No customer-sensitive data.','medium','resolved',NOW())
    RETURNING id,version
  `);
  const ownerTicketId = String(ownerTicket.rows[0].id);
  const tenantOwner = await app.inject({
    method:'POST',url,headers:bearer(owner),
    payload:{
      ...requestPayload,
      aggregateId:ownerTicketId,
      sourceDeepLink:`/modules/techdeck/tickets/${ownerTicketId}`,
      expectedSourceVersion:Number(ownerTicket.rows[0].version),
      idempotencyKey:`phase38:training-owner:${randomUUID()}`,
    },
  });
  assert.equal(tenantOwner.statusCode,202,tenantOwner.body);
  await fabric.deliverDataFabricInbox(String(tenantOwner.json().run.inbox_id));
  const ownerCompleted = await db.execute(sql`SELECT status FROM shared_workflow_runs WHERE tenant_id=${owner.currentTenantId} AND id=${String(tenantOwner.json().run.id)}`);
  assert.equal(ownerCompleted.rows[0].status,'completed');
});

test('TorqueShed training drafts require manager review, a completed diagnosis, and delivery-time authority', async () => {
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const modules = await db.execute(sql`SELECT id,slug FROM modules WHERE slug IN ('torqueshed','faultlinelab')`);
  const ids = Object.fromEntries(modules.rows.map((row: any) => [String(row.slug),String(row.id)]));
  await db.execute(sql`
    INSERT INTO tenant_user_module_access(tenant_id,user_id,module_id,access_level,granted_by_user_id)
    VALUES (${owner.currentTenantId},${member.id},${ids.faultlinelab},'manager',${owner.id})
    ON CONFLICT(tenant_id,user_id,module_id) DO UPDATE SET access_level='manager',updated_at=NOW()
  `);
  const vehicle = await db.execute(sql`INSERT INTO torqueshed_vehicles(tenant_id,owner_user_id,nickname,year,make,model,ownership_status,visibility,created_by_user_id,updated_by_user_id) VALUES (${owner.currentTenantId},${member.id},'Training vehicle',2021,'Honda','Accord','customer','private',${member.id},${member.id}) RETURNING id`);

  for (const status of ['open','testing','repairing']) {
    const incomplete = await db.execute(sql`
      INSERT INTO torqueshed_diagnostic_sessions(tenant_id,owner_user_id,vehicle_id,title,customer_concern,symptoms,status,visibility,created_by_user_id,updated_by_user_id)
      VALUES (${owner.currentTenantId},${owner.id},${String(vehicle.rows[0].id)},${`Incomplete ${status} diagnosis`},'Intermittent concern','Testing remains incomplete.',${status},'private',${owner.id},${owner.id}) RETURNING id,version
    `);
    const queued = await fabric.publishDataFabricWorkflow({
      tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'torqueshed.diagnostic_to_faultlinelab',
      aggregateId:String(incomplete.rows[0].id),sourceDeepLink:`/modules/torqueshed/diagnostics/${incomplete.rows[0].id}`,
      expectedSourceVersion:Number(incomplete.rows[0].version),idempotencyKey:`phase38:torque-incomplete-${status}:${randomUUID()}`,
      correlationId:`phase38:torque-incomplete-${status}`,payload:{ authorApproved:true,privacyReviewed:true },maxAttempts:1,
    });
    await fabric.deliverDataFabricInbox(String(queued.run.inbox_id));
    const rejected = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE id=${String(queued.run.inbox_id)}`);
    assert.equal(rejected.rows[0].status,'dead_letter');
    assert.equal(rejected.rows[0].last_error_code,'FABRIC_SOURCE_NOT_RESOLVED');
  }

  const diagnostic = await db.execute(sql`
    INSERT INTO torqueshed_diagnostic_sessions(tenant_id,owner_user_id,vehicle_id,title,customer_concern,symptoms,status,visibility,created_by_user_id,updated_by_user_id,resolution)
    VALUES (${owner.currentTenantId},${member.id},${String(vehicle.rows[0].id)},'Diagnosis for owner@example.test','Call 212-555-0188 for follow-up.','Fuel pressure verified low.','resolved','private',${member.id},${member.id},'Fuel pump circuit repaired.') RETURNING id,version
  `);
  const diagnosticId = String(diagnostic.rows[0].id);
  const input = {
    tenantId:owner.currentTenantId,actorUserId:member.id,workflowKey:'torqueshed.diagnostic_to_faultlinelab' as const,
    aggregateId:diagnosticId,sourceDeepLink:`/modules/torqueshed/diagnostics/${diagnosticId}`,
    expectedSourceVersion:Number(diagnostic.rows[0].version),correlationId:`phase38:torque-manager:${diagnosticId}`,
    payload:{ authorApproved:true,privacyReviewed:true },maxAttempts:1,
  };
  await assert.rejects(
    () => fabric.publishDataFabricWorkflow({ ...input,idempotencyKey:`phase38:torque-user:${randomUUID()}` }),
    (error: any) => error?.code === 'FABRIC_MODULE_MANAGER_REQUIRED',
  );
  await db.execute(sql`
    INSERT INTO tenant_user_module_access(tenant_id,user_id,module_id,access_level,granted_by_user_id)
    VALUES (${owner.currentTenantId},${member.id},${ids.torqueshed},'manager',${owner.id})
    ON CONFLICT(tenant_id,user_id,module_id) DO UPDATE SET access_level='manager',updated_at=NOW()
  `);
  const queued = await fabric.publishDataFabricWorkflow({ ...input,idempotencyKey:`phase38:torque-manager-a:${randomUUID()}` });
  await db.execute(sql`UPDATE tenant_user_module_access SET access_level='user',updated_at=NOW() WHERE tenant_id=${owner.currentTenantId} AND user_id=${member.id} AND module_id=${ids.torqueshed}`);
  await fabric.deliverDataFabricInbox(String(queued.run.inbox_id));
  const revoked = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE id=${String(queued.run.inbox_id)}`);
  assert.equal(revoked.rows[0].status,'dead_letter');
  assert.equal(revoked.rows[0].last_error_code,'FABRIC_MODULE_MANAGER_REQUIRED');

  await db.execute(sql`UPDATE tenant_user_module_access SET access_level='manager',updated_at=NOW() WHERE tenant_id=${owner.currentTenantId} AND user_id=${member.id} AND module_id=${ids.torqueshed}`);
  const recovered = await fabric.publishDataFabricWorkflow({ ...input,idempotencyKey:`phase38:torque-manager-b:${randomUUID()}` });
  assert.equal(recovered.duplicate,true);
  assert.equal(recovered.requeued,true);
  await fabric.deliverDataFabricInbox(String(recovered.run.inbox_id));
  const restored = await db.execute(sql`SELECT status FROM shared_workflow_runs WHERE id=${String(recovered.run.id)}`);
  assert.equal(restored.rows[0].status,'completed');
  const draft = await db.execute(sql`
    SELECT challenge.title,version.content,version.validation
    FROM faultlinelab_challenges challenge
    JOIN faultlinelab_challenge_versions version
      ON version.tenant_id=challenge.tenant_id AND version.challenge_id=challenge.id
      AND version.version_number=challenge.current_version_number
    WHERE challenge.tenant_id=${owner.currentTenantId} AND challenge.owner_user_id=${member.id}
    ORDER BY challenge.created_at DESC
    LIMIT 1
  `);
  assert.doesNotMatch(String(draft.rows[0].title),/owner@example\.test|212-555-0188/);
  const draftContent = draft.rows[0].content as any;
  assert.equal(draftContent.rootCauseOptions.length,4);
  assert.ok(draftContent.rootCauseOptions.every((option: any) => /unvalidated/i.test(String(option.title))));
  assert.match(String(draftContent.remediation),/Fuel pump circuit repaired/);
  assert.ok(draftContent.hints.every((hint: any) => !/placeholder/i.test(String(hint.text))));
  assert.ok(draftContent.commands.some((command: any) => command.command === 'review reported condition'));
  assert.ok(draftContent.commands.some((command: any) => command.command === 'review recorded remediation'));
  assert.equal(draft.rows[0].validation?.valid,false);
  assert.equal(draft.rows[0].validation?.importedWorkflowDraft,true);
  assert.equal(draft.rows[0].validation?.requiresAuthorReview,true);
  assert.equal(draft.rows[0].validation?.structuralValidationPassed,true);
  assert.doesNotMatch(JSON.stringify(draftContent),new RegExp(diagnosticId,'i'));

  const toctou = await db.execute(sql`
    INSERT INTO torqueshed_diagnostic_sessions(tenant_id,owner_user_id,vehicle_id,title,customer_concern,status,visibility,created_by_user_id,updated_by_user_id)
    VALUES (${owner.currentTenantId},${owner.id},${String(vehicle.rows[0].id)},'Status changed before delivery','Initially complete.','resolved','private',${owner.id},${owner.id}) RETURNING id,version
  `);
  const statusRun = await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'torqueshed.diagnostic_to_faultlinelab',
    aggregateId:String(toctou.rows[0].id),sourceDeepLink:`/modules/torqueshed/diagnostics/${toctou.rows[0].id}`,
    expectedSourceVersion:Number(toctou.rows[0].version),idempotencyKey:`phase38:torque-toctou:${randomUUID()}`,
    correlationId:'phase38:torque-toctou',payload:{ authorApproved:true,privacyReviewed:true },maxAttempts:1,
  });
  await db.execute(sql`UPDATE torqueshed_diagnostic_sessions SET status='testing' WHERE tenant_id=${owner.currentTenantId} AND id=${String(toctou.rows[0].id)}`);
  await fabric.deliverDataFabricInbox(String(statusRun.run.inbox_id));
  const changedStatus = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE id=${String(statusRun.run.inbox_id)}`);
  assert.equal(changedStatus.rows[0].status,'dead_letter');
  assert.equal(changedStatus.rows[0].last_error_code,'FABRIC_SOURCE_NOT_RESOLVED');
});

test('CallCommand simulations never trigger configured or manual production handoffs', async () => {
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const phone = `+1555${Math.floor(1000000 + Math.random()*8999999)}`;
  const channel = await db.execute(sql`INSERT INTO callcommand_channels(tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,status) VALUES (${owner.currentTenantId},${owner.id},'Simulation-only line',${phone},'America/New_York','Simulation only.','active') RETURNING id`);
  const profile = await db.execute(sql`INSERT INTO callcommand_profiles(tenant_id,created_by_user_id,name,mode,greeting,intake_fields,status) VALUES (${owner.currentTenantId},${owner.id},'Simulation receptionist','receptionist','How may we help?','[]'::jsonb,'active') RETURNING id`);
  const simulated = await db.execute(sql`
    INSERT INTO callcommand_calls(tenant_id,created_by_user_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,subject_name,direction,purpose,provider,status,idempotency_key,summary,customer_name,intent,priority,analyzed_at,completed_at)
    VALUES (${owner.currentTenantId},${owner.id},${String(channel.rows[0].id)},${String(profile.rows[0].id)},${'b'.repeat(64)},'***-***-3434',${phone},'Simulation Caller','inbound','support','simulator','completed',${`phase38-simulator-${randomUUID()}`},'Simulated request only.','Simulation Caller','Create no production work','medium',NOW(),NOW())
    RETURNING id,updated_at
  `);
  const callId = String(simulated.rows[0].id);
  const simulationRule = await fabric.createDataFabricRule({
    tenantId:owner.currentTenantId,
    actorUserId:owner.id,
    name:`Simulation suppression ${callId}`,
    sourceModuleSlug:'callcommand-ai',
    destinationModuleSlug:'tradeflowkit',
    sourceEventType:'callcommand.call.analyzed.v1',
    workflowKey:'callcommand.analysis_to_tradeflowkit',
    configuration:{ destinationType:'tradeflowkit_lead' },
  });
  const automatic = await fabric.publishConfiguredCallWorkflows({ tenantId:owner.currentTenantId,actorUserId:owner.id,callId,correlationId:`phase38-simulator:${callId}` });
  assert.deepEqual(automatic,[]);
  await db.execute(sql`UPDATE shared_workflow_rules SET enabled=FALSE WHERE tenant_id=${owner.currentTenantId} AND id=${String(simulationRule.id)}`);
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM shared_workflow_runs WHERE tenant_id=${owner.currentTenantId} AND idempotency_key LIKE ${`%${callId}%`}`)).rows[0].count),0);
  const leadsBefore = Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM tradeflowkit_leads WHERE tenant_id=${owner.currentTenantId}`)).rows[0].count);

  const manual = await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'callcommand.analysis_to_tradeflowkit',
    aggregateId:callId,sourceDeepLink:`/modules/callcommand-ai/calls/${callId}`,
    expectedSourceVersion:new Date(simulated.rows[0].updated_at).toISOString(),
    idempotencyKey:`phase38:simulator-manual:${callId}`,correlationId:`phase38-simulator-manual:${callId}`,
    payload:{ destinationType:'tradeflowkit_lead' },maxAttempts:1,
  });
  await fabric.deliverDataFabricInbox(String(manual.run.inbox_id));
  const rejected = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE id=${String(manual.run.inbox_id)}`);
  assert.equal(rejected.rows[0].status,'dead_letter');
  assert.equal(rejected.rows[0].last_error_code,'FABRIC_SIMULATION_SOURCE_REJECTED');
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM tradeflowkit_leads WHERE tenant_id=${owner.currentTenantId}`)).rows[0].count),leadsBefore);
});

test('configured call rules honor conditions and never automate PulseDesk privacy approval', async () => {
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  await assert.rejects(
    () => fabric.createDataFabricRule({
      tenantId:owner.currentTenantId,
      actorUserId:owner.id,
      name:'Disallowed automatic clinical handoff',
      sourceModuleSlug:'callcommand-ai',
      destinationModuleSlug:'pulsedesk',
      sourceEventType:'callcommand.call.analyzed.v1',
      workflowKey:'callcommand.analysis_to_pulsedesk',
      conditions:{ purpose:'operations' },
      configuration:{ operationsOnlyApproved:true },
    }),
    (error: any) => error?.code === 'FABRIC_PER_CALL_REVIEW_REQUIRED',
  );

  const modules = await db.execute(sql`SELECT id,slug FROM modules WHERE slug IN ('callcommand-ai','tradeflowkit','pulsedesk')`);
  const ids = Object.fromEntries(modules.rows.map((row: any) => [String(row.slug),String(row.id)]));
  const nonmatching = await fabric.createDataFabricRule({
    tenantId:owner.currentTenantId,
    actorUserId:owner.id,
    name:'Sales calls only',
    sourceModuleSlug:'callcommand-ai',
    destinationModuleSlug:'tradeflowkit',
    sourceEventType:'callcommand.call.analyzed.v1',
    workflowKey:'callcommand.analysis_to_tradeflowkit',
    conditions:{ purpose:'sales',intentIncludes:'estimate' },
    configuration:{ destinationType:'tradeflowkit_lead' },
  });
  const legacyPulse = await db.execute(sql`
    INSERT INTO shared_workflow_rules(
      tenant_id,name,source_module_id,destination_module_id,source_event_type,workflow_key,
      conditions_json,configuration_json,priority,created_by_user_id,updated_by_user_id
    ) VALUES (
      ${owner.currentTenantId},'Legacy PulseDesk rule',${ids['callcommand-ai']},${ids.pulsedesk},
      'callcommand.call.analyzed.v1','callcommand.analysis_to_pulsedesk',
      ${JSON.stringify({ purpose:'operations' })}::jsonb,${JSON.stringify({ operationsOnlyApproved:true })}::jsonb,
      10,${owner.id},${owner.id}
    ) RETURNING id
  `);

  const phone = `+1555${Math.floor(1000000 + Math.random()*8999999)}`;
  const channel = await db.execute(sql`INSERT INTO callcommand_channels(tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,status) VALUES (${owner.currentTenantId},${owner.id},'Reviewed live line',${phone},'America/New_York','Consent recorded.','active') RETURNING id`);
  const profile = await db.execute(sql`INSERT INTO callcommand_profiles(tenant_id,created_by_user_id,name,mode,greeting,intake_fields,status) VALUES (${owner.currentTenantId},${owner.id},'Operations receptionist','receptionist','How may we help?','[]'::jsonb,'active') RETURNING id`);
  const call = await db.execute(sql`
    INSERT INTO callcommand_calls(tenant_id,created_by_user_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,subject_name,direction,purpose,provider,status,idempotency_key,summary,customer_name,intent,priority,analyzed_at,completed_at)
    VALUES (${owner.currentTenantId},${owner.id},${String(channel.rows[0].id)},${String(profile.rows[0].id)},${'c'.repeat(64)},'***-***-4545',${phone},'Clinical Caller','inbound','operations','test-verified','completed',${`phase38-conditions-${randomUUID()}`},'Caller described patient treatment and clinical details that must not be forwarded automatically.','Clinical Caller','Route a clinical request','high',NOW(),NOW())
    RETURNING id
  `);
  const callId = String(call.rows[0].id);
  const runsBefore = Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM shared_workflow_runs WHERE tenant_id=${owner.currentTenantId}`)).rows[0].count);
  const requestsBefore = Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM pulsedesk_requests WHERE tenant_id=${owner.currentTenantId}`)).rows[0].count);
  const outcomes = await fabric.publishConfiguredCallWorkflows({
    tenantId:owner.currentTenantId,
    actorUserId:owner.id,
    callId,
    correlationId:`phase38:conditions:${callId}`,
  });
  const mismatch = outcomes.find((outcome: any) => String(outcome.ruleId) === String(nonmatching.id));
  const blockedPulse = outcomes.find((outcome: any) => String(outcome.ruleId) === String(legacyPulse.rows[0].id));
  assert.equal(mismatch?.queued,false);
  assert.equal(mismatch?.errorCode,'FABRIC_RULE_CONDITIONS_NOT_MATCHED');
  assert.equal(blockedPulse?.queued,false);
  assert.equal(blockedPulse?.errorCode,'FABRIC_PER_CALL_REVIEW_REQUIRED');
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM shared_workflow_runs WHERE tenant_id=${owner.currentTenantId}`)).rows[0].count),runsBefore);
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM pulsedesk_requests WHERE tenant_id=${owner.currentTenantId}`)).rows[0].count),requestsBefore);
});

test('configured CallCommand rules reject a call changed after automatic queueing', async () => {
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const phone = `+1555${Math.floor(1000000 + Math.random()*8999999)}`;
  const channel = await db.execute(sql`
    INSERT INTO callcommand_channels(tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,status)
    VALUES (${owner.currentTenantId},${owner.id},'Version-guarded live line',${phone},'America/New_York','Consent recorded.','active')
    RETURNING id
  `);
  const channelId = String(channel.rows[0].id);
  const profile = await db.execute(sql`
    INSERT INTO callcommand_profiles(tenant_id,created_by_user_id,name,mode,greeting,intake_fields,status)
    VALUES (${owner.currentTenantId},${owner.id},'Version-guarded receptionist','receptionist','How may we help?','[]'::jsonb,'active')
    RETURNING id
  `);
  const rule = await fabric.createDataFabricRule({
    tenantId:owner.currentTenantId,
    actorUserId:owner.id,
    name:`Version guard ${channelId}`,
    sourceModuleSlug:'callcommand-ai',
    destinationModuleSlug:'tradeflowkit',
    sourceEventType:'callcommand.call.analyzed.v1',
    workflowKey:'callcommand.analysis_to_tradeflowkit',
    conditions:{ channelId },
    configuration:{ destinationType:'tradeflowkit_lead' },
  });
  const call = await db.execute(sql`
    INSERT INTO callcommand_calls(
      tenant_id,created_by_user_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,
      subject_name,direction,purpose,provider,status,idempotency_key,summary,customer_name,intent,priority,
      analyzed_at,completed_at
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${channelId},${String(profile.rows[0].id)},${'d'.repeat(64)},
      '***-***-5656',${phone},'Versioned Caller','inbound','support','test-verified','completed',
      ${`phase38-auto-version-${randomUUID()}`},'Caller requested the original estimate.','Versioned Caller',
      'Request an estimate','medium',NOW(),NOW()
    ) RETURNING id,updated_at
  `);
  const callId = String(call.rows[0].id);
  const first = await fabric.publishConfiguredCallWorkflows({
    tenantId:owner.currentTenantId,
    actorUserId:owner.id,
    callId,
    correlationId:`phase38:auto-version:${callId}`,
  });
  const firstOutcome = first.find((outcome: any) => String(outcome.ruleId) === String(rule.id));
  assert.equal(firstOutcome?.queued,true);
  assert.equal(firstOutcome?.duplicate,false);

  const duplicate = await fabric.publishConfiguredCallWorkflows({
    tenantId:owner.currentTenantId,
    actorUserId:owner.id,
    callId,
    correlationId:`phase38:auto-version-retry:${callId}`,
  });
  const duplicateOutcome = duplicate.find((outcome: any) => String(outcome.ruleId) === String(rule.id));
  assert.equal(duplicateOutcome?.queued,true);
  assert.equal(duplicateOutcome?.duplicate,true);

  const pending = await db.execute(sql`
    SELECT r.id AS run_id,i.id AS inbox_id,e.payload_json
    FROM shared_workflow_runs r
    JOIN shared_domain_events e ON e.tenant_id=r.tenant_id AND e.workflow_run_id=r.id
    JOIN shared_event_inbox i ON i.tenant_id=r.tenant_id AND i.workflow_run_id=r.id
    WHERE r.tenant_id=${owner.currentTenantId}
      AND r.workflow_key='callcommand.analysis_to_tradeflowkit'
      AND e.aggregate_id=${callId}
      AND e.payload_json->>'ruleId'=${String(rule.id)}
    LIMIT 1
  `);
  assert.ok(pending.rows[0]);
  assert.equal(
    String(pending.rows[0].payload_json.expectedSourceVersion),
    new Date(call.rows[0].updated_at).toISOString(),
  );

  await db.execute(sql`
    UPDATE callcommand_calls
    SET summary='Caller changed the requested work after queueing.',updated_at=updated_at+interval '1 second'
    WHERE tenant_id=${owner.currentTenantId} AND id=${callId}
  `);
  await fabric.deliverDataFabricInbox(String(pending.rows[0].inbox_id));
  const rejected = await db.execute(sql`
    SELECT status,last_error_code FROM shared_event_inbox
    WHERE tenant_id=${owner.currentTenantId} AND id=${String(pending.rows[0].inbox_id)}
  `);
  assert.equal(rejected.rows[0].status,'dead_letter');
  assert.equal(rejected.rows[0].last_error_code,'FABRIC_SOURCE_VERSION_CHANGED');
  assert.equal(
    Number((await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM tradeflowkit_leads
      WHERE tenant_id=${owner.currentTenantId} AND source_id=${`fabric:call:${callId}`}
    `)).rows[0].count),
    0,
  );
});

test('CallCommand re-analysis records versioned TradeFlowKit provenance without overwriting human edits', async () => {
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const phone = `+1555${Math.floor(1000000 + Math.random()*8999999)}`;
  const channel = await db.execute(sql`
    INSERT INTO callcommand_channels(tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,status)
    VALUES (${owner.currentTenantId},${owner.id},'Safe refresh line',${phone},'America/New_York','Consent recorded.','active')
    RETURNING id
  `);
  const profile = await db.execute(sql`
    INSERT INTO callcommand_profiles(tenant_id,created_by_user_id,name,mode,greeting,intake_fields,status)
    VALUES (${owner.currentTenantId},${owner.id},'Safe refresh receptionist','receptionist','How may we help?','[]'::jsonb,'active')
    RETURNING id
  `);
  const call = await db.execute(sql`
    INSERT INTO callcommand_calls(
      tenant_id,created_by_user_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,
      subject_name,direction,purpose,provider,status,idempotency_key,summary,customer_name,intent,priority,
      analyzed_at,completed_at
    ) VALUES (
      ${owner.currentTenantId},${owner.id},${String(channel.rows[0].id)},${String(profile.rows[0].id)},${'e'.repeat(64)},
      '***-***-6767',${phone},'Initial Caller','inbound','support','test-verified','completed',
      ${`phase38-safe-refresh-${randomUUID()}`},'Initial reviewed analysis.','Initial Customer','Initial service request','medium',NOW(),NOW()
    ) RETURNING id,updated_at
  `);
  const callId = String(call.rows[0].id);
  const sourceDeepLink = `/modules/callcommand-ai/calls/${callId}`;
  const initialVersion = new Date(call.rows[0].updated_at).toISOString();

  async function publishCallOutcome(
    actorUserId: string,
    destinationType: 'tradeflowkit_lead' | 'tradeflowkit_job',
    version: string,
    suffix: string,
  ) {
    const queued = await fabric.publishDataFabricWorkflow({
      tenantId:owner.currentTenantId,actorUserId,workflowKey:'callcommand.analysis_to_tradeflowkit',
      aggregateId:callId,sourceDeepLink,expectedSourceVersion:version,
      idempotencyKey:`phase38:safe-refresh:${suffix}:${randomUUID()}`,
      correlationId:`phase38-safe-refresh:${suffix}:${callId}`,payload:{ destinationType },maxAttempts:1,
    });
    await fabric.deliverDataFabricInbox(String(queued.run.inbox_id));
    const delivered = await db.execute(sql`
      SELECT status,result_json FROM shared_event_inbox
      WHERE tenant_id=${owner.currentTenantId} AND id=${String(queued.run.inbox_id)}
    `);
    assert.equal(delivered.rows[0].status,'completed');
    return { queued, summary:String(delivered.rows[0].result_json.summary) };
  }

  const createdLead = await publishCallOutcome(owner.id,'tradeflowkit_lead',initialVersion,'lead-created');
  const createdJob = await publishCallOutcome(owner.id,'tradeflowkit_job',initialVersion,'job-created');
  assert.match(createdLead.summary,/^Created a TradeFlowKit lead/);
  assert.match(createdJob.summary,/^Created a TradeFlowKit customer and job/);
  const destination = await db.execute(sql`
    SELECT
      lead.id AS lead_id,lead.version AS lead_version,
      customer.id AS customer_id,customer.version AS customer_version,
      job.id AS job_id,job.version AS job_version
    FROM tradeflowkit_leads lead
    JOIN tradeflowkit_customers customer ON customer.tenant_id=lead.tenant_id AND customer.source_id=lead.source_id
    JOIN tradeflowkit_jobs job ON job.tenant_id=lead.tenant_id AND job.source_id=lead.source_id AND job.customer_id=customer.id
    WHERE lead.tenant_id=${owner.currentTenantId} AND lead.source_id=${`fabric:call:${callId}`}
  `);
  const leadId = String(destination.rows[0].lead_id);
  const customerRecordId = String(destination.rows[0].customer_id);
  const jobId = String(destination.rows[0].job_id);

  await db.execute(sql`
    UPDATE tradeflowkit_leads SET
      name='Human lead name',phone='human-lead-phone',email='human-lead@example.test',
      service_type='Human service type',description='Human lead description',urgency='emergency',status='qualified',
      version=version+1,updated_at=NOW()
    WHERE tenant_id=${owner.currentTenantId} AND id=${leadId}
  `);
  await db.execute(sql`
    UPDATE tradeflowkit_customers SET
      name='Human customer name',phone='human-customer-phone',email='human-customer@example.test',
      address='Human customer address',notes='Human customer notes',version=version+1,updated_at=NOW()
    WHERE tenant_id=${owner.currentTenantId} AND id=${customerRecordId}
  `);
  await db.execute(sql`
    UPDATE tradeflowkit_jobs SET
      title='Human job title',description='Human job description',internal_notes='Human internal notes',
      status='scheduled',priority='high',scheduled_start=NOW()+interval '1 day',scheduled_end=NOW()+interval '2 days',
      version=version+1,updated_at=NOW()
    WHERE tenant_id=${owner.currentTenantId} AND id=${jobId}
  `);
  const humanState = await db.execute(sql`
    SELECT
      lead.name AS lead_name,lead.phone AS lead_phone,lead.email AS lead_email,lead.service_type,lead.description AS lead_description,
      lead.urgency,lead.status AS lead_status,lead.version AS lead_version,
      customer.name AS customer_name,customer.phone AS customer_phone,customer.email AS customer_email,
      customer.address AS customer_address,customer.notes AS customer_notes,customer.version AS customer_version,
      job.title AS job_title,job.description AS job_description,job.internal_notes,job.status AS job_status,
      job.priority AS job_priority,job.scheduled_start,job.scheduled_end,job.version AS job_version
    FROM tradeflowkit_leads lead
    JOIN tradeflowkit_customers customer ON customer.tenant_id=lead.tenant_id AND customer.id=${customerRecordId}
    JOIN tradeflowkit_jobs job ON job.tenant_id=lead.tenant_id AND job.id=${jobId}
    WHERE lead.tenant_id=${owner.currentTenantId} AND lead.id=${leadId}
  `);

  const reanalyzed = await db.execute(sql`
    UPDATE callcommand_calls SET
      summary='New reviewed analysis that must be appended, not overwrite human work.',
      customer_name='New analyzed customer',intent='New analyzed service request',priority='urgent',
      analyzed_at=NOW()+interval '2 seconds',updated_at=NOW()+interval '2 seconds'
    WHERE tenant_id=${owner.currentTenantId} AND id=${callId}
    RETURNING updated_at
  `);
  const refreshedVersion = new Date(reanalyzed.rows[0].updated_at).toISOString();
  assert.notEqual(refreshedVersion,initialVersion);
  const refreshedLead = await publishCallOutcome(owner.id,'tradeflowkit_lead',refreshedVersion,'lead-refreshed');
  const refreshedJob = await publishCallOutcome(owner.id,'tradeflowkit_job',refreshedVersion,'job-refreshed');
  assert.match(refreshedLead.summary,/^Added the latest reviewed CallCommand summary/);
  assert.match(refreshedJob.summary,/^Added the latest reviewed CallCommand summary/);

  const afterRefresh = await db.execute(sql`
    SELECT
      lead.name AS lead_name,lead.phone AS lead_phone,lead.email AS lead_email,lead.service_type,lead.description AS lead_description,
      lead.urgency,lead.status AS lead_status,lead.version AS lead_version,
      customer.name AS customer_name,customer.phone AS customer_phone,customer.email AS customer_email,
      customer.address AS customer_address,customer.notes AS customer_notes,customer.version AS customer_version,
      job.title AS job_title,job.description AS job_description,job.internal_notes,job.status AS job_status,
      job.priority AS job_priority,job.scheduled_start,job.scheduled_end,job.version AS job_version
    FROM tradeflowkit_leads lead
    JOIN tradeflowkit_customers customer ON customer.tenant_id=lead.tenant_id AND customer.id=${customerRecordId}
    JOIN tradeflowkit_jobs job ON job.tenant_id=lead.tenant_id AND job.id=${jobId}
    WHERE lead.tenant_id=${owner.currentTenantId} AND lead.id=${leadId}
  `);
  assert.deepEqual(afterRefresh.rows[0],humanState.rows[0]);
  const provenance = await db.execute(sql`
    SELECT entity_type,metadata FROM activity_feed
    WHERE tenant_id=${owner.currentTenantId} AND action='callcommand_analysis_applied'
      AND metadata->>'callId'=${callId}
    ORDER BY entity_type,created_at
  `);
  assert.equal(provenance.rows.length,6);
  for (const entityType of ['tradeflowkit_lead','tradeflowkit_customer','tradeflowkit_job']) {
    const history = provenance.rows.filter((row: any) => row.entity_type === entityType);
    assert.deepEqual(history.map((row: any) => row.metadata.appliedSourceVersion),[initialVersion,refreshedVersion]);
    assert.deepEqual(history.map((row: any) => row.metadata.disposition),['created','refreshed']);
  }
  const notesBeforeRetry = await db.execute(sql`
    SELECT entity_type,body FROM tradeflowkit_comments
    WHERE tenant_id=${owner.currentTenantId} AND entity_id IN (${leadId},${customerRecordId},${jobId}) AND deleted_at IS NULL
    ORDER BY entity_type,created_at
  `);
  assert.equal(notesBeforeRetry.rows.length,6);
  assert.equal(notesBeforeRetry.rows.filter((row: any) => String(row.body).includes(refreshedVersion)).length,0);
  assert.equal(notesBeforeRetry.rows.filter((row: any) => String(row.body).includes(callId)).length,0);
  assert.ok(notesBeforeRetry.rows.every((row: any) => String(row.body).startsWith('CallCommand update')));
  assert.equal(notesBeforeRetry.rows.filter((row: any) => String(row.body).includes('New reviewed analysis')).length,3);

  const linkedLead = await publishCallOutcome(member.id,'tradeflowkit_lead',refreshedVersion,'lead-already-linked');
  const linkedJob = await publishCallOutcome(member.id,'tradeflowkit_job',refreshedVersion,'job-already-linked');
  assert.equal(linkedLead.queued.duplicate,true);
  assert.equal(linkedJob.queued.duplicate,true);
  assert.equal(String(linkedLead.queued.run.id),String(refreshedLead.queued.run.id));
  assert.equal(String(linkedJob.queued.run.id),String(refreshedJob.queued.run.id));
  assert.match(linkedLead.summary,/^Added the latest reviewed CallCommand summary/);
  assert.match(linkedJob.summary,/^Added the latest reviewed CallCommand summary/);
  const notesAfterRetry = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM tradeflowkit_comments
    WHERE tenant_id=${owner.currentTenantId} AND entity_id IN (${leadId},${customerRecordId},${jobId}) AND deleted_at IS NULL
  `);
  assert.equal(Number(notesAfterRetry.rows[0].count),6);
  assert.equal(Number((await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM activity_feed
    WHERE tenant_id=${owner.currentTenantId} AND action='callcommand_analysis_applied' AND metadata->>'callId'=${callId}
  `)).rows[0].count),6);
  const finalState = await db.execute(sql`
    SELECT lead.name AS lead_name,customer.name AS customer_name,job.title AS job_title
    FROM tradeflowkit_leads lead
    JOIN tradeflowkit_customers customer ON customer.tenant_id=lead.tenant_id AND customer.id=${customerRecordId}
    JOIN tradeflowkit_jobs job ON job.tenant_id=lead.tenant_id AND job.id=${jobId}
    WHERE lead.tenant_id=${owner.currentTenantId} AND lead.id=${leadId}
  `);
  assert.deepEqual(finalState.rows[0],{
    lead_name:'Human lead name',customer_name:'Human customer name',job_title:'Human job title',
  });
});

test('TradeFlowKit job publishes once and creates native SnapProofOS records with signed provenance', async () => {
  const job = await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,description,status,priority,source_id)
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'Replace rooftop controller','Capture arrival, work, and completion proof.','scheduled','normal',${`phase38-job-${owner.id}`}) RETURNING id,version
  `);
  const jobId = String(job.rows[0].id);
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const first = await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof',
    aggregateId:jobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,
    expectedSourceVersion:Number(job.rows[0].version),
    idempotencyKey:`phase38:job:${jobId}`,correlationId:`phase38-test:${jobId}`,
  });
  assert.equal(first.duplicate,false);
  await fabric.deliverDataFabricInbox(String(first.run.inbox_id));
  const run = await db.execute(sql`SELECT * FROM shared_workflow_runs WHERE id=${String(first.run.id)}`);
  assert.equal(run.rows[0].status,'completed');
  const event = await db.execute(sql`SELECT * FROM shared_domain_events WHERE workflow_run_id=${String(first.run.id)}`);
  assert.equal(event.rows[0].status,'delivered');
  assert.match(String(event.rows[0].signature_hmac_sha256),/^[0-9a-f]{64}$/);
  const cases = await db.execute(sql`SELECT * FROM snapproof_cases WHERE tenant_id=${owner.currentTenantId} AND source_context->>'jobId'=${jobId}`);
  assert.equal(cases.rows.length,1);
  const reports = await db.execute(sql`SELECT * FROM snapproof_reports WHERE tenant_id=${owner.currentTenantId} AND case_id=${String(cases.rows[0].id)}`);
  assert.equal(reports.rows.length,1);
  const links = await db.execute(sql`SELECT * FROM shared_resource_links WHERE tenant_id=${owner.currentTenantId} AND workflow_run_id=${String(first.run.id)}`);
  assert.equal(links.rows.length,2);

  await assert.rejects(
    () => fabric.publishDataFabricWorkflow({
      tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof',
      aggregateId:jobId,sourceDeepLink:'/logout',expectedSourceVersion:Number(job.rows[0].version),idempotencyKey:`phase38:poisoned-link:${jobId}`,
      correlationId:`phase38-poisoned-link:${jobId}`,
    }),
    (error: any) => error?.code === 'FABRIC_SOURCE_LINK_MISMATCH',
  );
  const sourceReference = await db.execute(sql`SELECT deep_link FROM shared_resource_references WHERE tenant_id=${owner.currentTenantId} AND resource_type='tradeflowkit_job' AND resource_id=${jobId}`);
  assert.equal(sourceReference.rows[0].deep_link,`/modules/tradeflowkit/jobs/${jobId}`);

  const replay = await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof',
    aggregateId:jobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,
    expectedSourceVersion:Number(job.rows[0].version),
    idempotencyKey:`phase38:job:${jobId}`,correlationId:`phase38-test:${jobId}`,
  });
  assert.equal(replay.duplicate,true);
  const stillOne = await db.execute(sql`SELECT id FROM snapproof_cases WHERE tenant_id=${owner.currentTenantId} AND source_context->>'jobId'=${jobId}`);
  assert.equal(stillOne.rows.length,1);
});

test('concurrent publication resolves to one run, event, inbox, and destination mutation', async () => {
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const job = await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'Concurrent proof job','scheduled','normal',${`phase38-concurrent-${randomUUID()}`}) RETURNING id,version
  `);
  const jobId = String(job.rows[0].id);
  const input = {
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof' as const,
    aggregateId:jobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,
    expectedSourceVersion:Number(job.rows[0].version),
    idempotencyKey:`phase38:concurrent:${jobId}`,correlationId:`phase38-concurrent:${jobId}`,
  };
  const outcomes = await Promise.all([1,2,3,4,5].map(() => fabric.publishDataFabricWorkflow(input)));
  assert.equal(outcomes.filter(item => !item.duplicate).length,1);
  assert.equal(new Set(outcomes.map(item => String(item.run.id))).size,1);
  const runId = String(outcomes[0].run.id);
  const counts = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM shared_workflow_runs WHERE tenant_id=${owner.currentTenantId} AND id=${runId}) AS runs,
      (SELECT COUNT(*)::int FROM shared_domain_events WHERE tenant_id=${owner.currentTenantId} AND workflow_run_id=${runId}) AS events,
      (SELECT COUNT(*)::int FROM shared_event_inbox WHERE tenant_id=${owner.currentTenantId} AND workflow_run_id=${runId}) AS inboxes
  `);
  assert.deepEqual(
    { runs:Number(counts.rows[0].runs),events:Number(counts.rows[0].events),inboxes:Number(counts.rows[0].inboxes) },
    { runs:1,events:1,inboxes:1 },
  );
  const inboxId = String(outcomes.find(item => item.run.inbox_id)?.run.inbox_id);
  await fabric.deliverDataFabricInbox(inboxId);
  const created = await db.execute(sql`SELECT COUNT(*)::int AS count FROM snapproof_cases WHERE tenant_id=${owner.currentTenantId} AND source_context->>'jobId'=${jobId}`);
  assert.equal(Number(created.rows[0].count),1);
});

test('missing source dead-letters without source mutation, then repairs by audited replay', async () => {
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const missingJobId = randomUUID();
  const queued = await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof',
    aggregateId:missingJobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${missingJobId}`,
    expectedSourceVersion:1,
    idempotencyKey:`phase38:repair:${missingJobId}`,correlationId:`phase38-repair:${missingJobId}`,maxAttempts:1,
  });
  await fabric.deliverDataFabricInbox(String(queued.run.inbox_id));
  const dead = await db.execute(sql`SELECT * FROM shared_event_inbox WHERE id=${String(queued.run.inbox_id)}`);
  assert.equal(dead.rows[0].status,'dead_letter');
  assert.equal(dead.rows[0].last_error_code,'FABRIC_SOURCE_ARCHIVED');
  const compensation = await db.execute(sql`SELECT * FROM shared_workflow_compensations WHERE workflow_run_id=${String(queued.run.id)}`);
  assert.equal(compensation.rows[0].action,'source_unchanged');

  await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(id,tenant_id,customer_id,created_by_user_id,title,description,status,priority,source_id)
    VALUES (${missingJobId},${owner.currentTenantId},${customerId},${owner.id},'Recovered field job','Created after source-system repair.','scheduled','normal',${`phase38-recovered-${missingJobId}`})
  `);
  await fabric.replayDataFabricInbox({ tenantId:owner.currentTenantId,actorUserId:owner.id,inboxId:String(queued.run.inbox_id) });
  await fabric.deliverDataFabricInbox(String(queued.run.inbox_id));
  const repaired = await db.execute(sql`SELECT status,replay_count FROM shared_event_inbox WHERE id=${String(queued.run.inbox_id)}`);
  assert.equal(repaired.rows[0].status,'completed');
  assert.equal(Number(repaired.rows[0].replay_count),1);
});

test('signature tampering is rejected and cross-tenant actors cannot publish', async () => {
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const job = await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'Signature gate job','scheduled','normal',${`phase38-signature-${owner.id}`}) RETURNING id,version
  `);
  const jobId = String(job.rows[0].id);
  const queued = await fabric.publishDataFabricWorkflow({ tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof',aggregateId:jobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,expectedSourceVersion:Number(job.rows[0].version),idempotencyKey:`phase38:signature:${jobId}`,correlationId:`phase38-signature:${jobId}`,maxAttempts:1 });
  await db.execute(sql`UPDATE shared_domain_events SET payload_json='{"tampered":true}'::jsonb WHERE workflow_run_id=${String(queued.run.id)}`);
  await fabric.deliverDataFabricInbox(String(queued.run.inbox_id));
  const rejected = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE id=${String(queued.run.inbox_id)}`);
  assert.equal(rejected.rows[0].status,'dead_letter');
  assert.equal(rejected.rows[0].last_error_code,'FABRIC_EVENT_SIGNATURE_INVALID');

  const actorJob = await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'Signed actor authority job','scheduled','normal',${`phase38-signature-actor-${randomUUID()}`}) RETURNING id,version
  `);
  const actorJobId = String(actorJob.rows[0].id);
  const actorQueued = await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof',
    aggregateId:actorJobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${actorJobId}`,
    expectedSourceVersion:Number(actorJob.rows[0].version),idempotencyKey:`phase38:signature-actor:${actorJobId}`,
    correlationId:`phase38-signature-actor:${actorJobId}`,maxAttempts:1,
  });
  const envelope = await db.execute(sql`
    SELECT signature_envelope_version FROM shared_domain_events
    WHERE tenant_id=${owner.currentTenantId} AND workflow_run_id=${String(actorQueued.run.id)}
  `);
  assert.equal(Number(envelope.rows[0].signature_envelope_version),2);
  await db.transaction(async (tx: any) => {
    await tx.execute(sql`UPDATE shared_domain_events SET actor_user_id=${member.id} WHERE tenant_id=${owner.currentTenantId} AND workflow_run_id=${String(actorQueued.run.id)}`);
    await tx.execute(sql`UPDATE shared_workflow_runs SET actor_user_id=${member.id} WHERE tenant_id=${owner.currentTenantId} AND id=${String(actorQueued.run.id)}`);
  });
  await fabric.deliverDataFabricInbox(String(actorQueued.run.inbox_id));
  const actorRejected = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE tenant_id=${owner.currentTenantId} AND id=${String(actorQueued.run.inbox_id)}`);
  assert.equal(actorRejected.rows[0].status,'dead_letter');
  assert.equal(actorRejected.rows[0].last_error_code,'FABRIC_EVENT_SIGNATURE_INVALID');
  const actorDestinations = await db.execute(sql`SELECT COUNT(*)::int AS count FROM snapproof_cases WHERE tenant_id=${owner.currentTenantId} AND source_context->>'jobId'=${actorJobId}`);
  assert.equal(Number(actorDestinations.rows[0].count),0);
  await assert.rejects(
    () => db.execute(sql`
      UPDATE shared_event_inbox SET consumer_key='tampered.workflow.route'
      WHERE tenant_id=${owner.currentTenantId} AND id=${String(actorQueued.run.inbox_id)}
    `),
    (error: any) => error?.code === '23503' || error?.cause?.code === '23503',
  );

  await assert.rejects(
    () => fabric.publishDataFabricWorkflow({ tenantId:owner.currentTenantId,actorUserId:foreign.id,workflowKey:'tradeflowkit.job_to_snapproof',aggregateId:jobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,expectedSourceVersion:Number(job.rows[0].version),idempotencyKey:`phase38:foreign:${jobId}`,correlationId:'phase38-foreign' }),
    (error: any) => error?.code === 'FABRIC_MODULE_ACCESS_DENIED',
  );
});

test('every named Phase 38 workflow creates native destination records and traceable links', async () => {
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const crypto = await import('node:crypto');
  const publishAndDeliver = async (workflowKey: any, aggregateId: string, sourceDeepLink: string, suffix: string, payload: Record<string,unknown> = {}, sourceModuleSlug?: string, sourceType?: string) => {
    const queued = await fabric.publishDataFabricWorkflow({
      tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey,aggregateId,sourceDeepLink,
      expectedSourceVersion:await currentWorkflowSourceVersion(workflowKey,aggregateId,sourceModuleSlug),
      idempotencyKey:`phase38:matrix:${suffix}:${aggregateId}`,correlationId:`phase38-matrix:${suffix}`,
      payload,sourceModuleSlug,sourceType,maxAttempts:1,
    });
    await fabric.deliverDataFabricInbox(String(queued.run.inbox_id));
    const result = await db.execute(sql`SELECT * FROM shared_workflow_runs WHERE id=${String(queued.run.id)}`);
    assert.equal(result.rows[0].status,'completed',`${workflowKey} did not complete: ${result.rows[0].last_error_code}`);
    const links = await db.execute(sql`SELECT * FROM shared_resource_links WHERE workflow_run_id=${String(queued.run.id)}`);
    assert.ok(links.rows.length >= 1,`${workflowKey} did not persist provenance links`);
    return { queued, links:links.rows };
  };

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n');
  const pdfHash = crypto.createHash('sha256').update(pdf).digest('hex');
  const activeJob = await db.execute(sql`SELECT id FROM tradeflowkit_jobs WHERE tenant_id=${owner.currentTenantId} AND deleted_at IS NULL ORDER BY created_at LIMIT 1`);
  const alternateJob = await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'Alternate attachment target','scheduled','normal',${`phase38-alternate-${randomUUID()}`}) RETURNING id
  `);
  const snapCustomer = await db.execute(sql`INSERT INTO snapproof_customers(tenant_id,created_by_user_id,name) VALUES (${owner.currentTenantId},${owner.id},'Approved report customer') RETURNING id`);
  const snapCase = await db.execute(sql`INSERT INTO snapproof_cases(tenant_id,created_by_user_id,customer_id,reference,title,case_type,source_context,status,job_type,job_status) VALUES (${owner.currentTenantId},${owner.id},${String(snapCustomer.rows[0].id)},${`APP-${randomUUID().slice(0,8)}`},'Approved field report','proof_of_work',${JSON.stringify({ schemaVersion:1,sourceModule:'tradeflowkit',jobId:String(activeJob.rows[0].id) })}::jsonb,'approved','field_service','completed') RETURNING id`);
  const reportContent = { schemaVersion:1,approved:true };
  const reportHash = crypto.createHash('sha256').update(JSON.stringify(reportContent)).digest('hex');
  const report = await db.execute(sql`INSERT INTO snapproof_reports(tenant_id,case_id,created_by_user_id,approved_by_user_id,title,status,content,content_hash,approved_at) VALUES (${owner.currentTenantId},${String(snapCase.rows[0].id)},${owner.id},${owner.id},'Approved proof','approved',${JSON.stringify(reportContent)}::jsonb,${reportHash},NOW()) RETURNING id`);
  await db.execute(sql`INSERT INTO snapproof_exports(tenant_id,case_id,report_id,created_by_user_id,format,export_hash,provenance,content,content_type,filename,byte_length) VALUES (${owner.currentTenantId},${String(snapCase.rows[0].id)},${String(report.rows[0].id)},${owner.id},'pdf',${pdfHash},'{}'::jsonb,${pdf},'application/pdf','approved-proof.pdf',${pdf.length})`);

  const mismatchedProvenance = await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'snapproof.approved_report_to_tradeflowkit',
    aggregateId:String(report.rows[0].id),sourceDeepLink:`/modules/snapproofos/reports/${report.rows[0].id}`,
    expectedSourceVersion:await currentWorkflowSourceVersion('snapproof.approved_report_to_tradeflowkit',String(report.rows[0].id)),
    idempotencyKey:`phase38:matrix:snap-mismatch:${report.rows[0].id}`,correlationId:'phase38-matrix:snap-mismatch',
    payload:{ tradeFlowJobId:String(alternateJob.rows[0].id) },maxAttempts:1,
  });
  await fabric.deliverDataFabricInbox(String(mismatchedProvenance.run.inbox_id));
  const mismatchInbox = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE id=${String(mismatchedProvenance.run.inbox_id)}`);
  assert.equal(mismatchInbox.rows[0].status,'dead_letter');
  assert.equal(mismatchInbox.rows[0].last_error_code,'FABRIC_PROVENANCE_MISMATCH');
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM shared_attachments WHERE tenant_id=${owner.currentTenantId} AND object_id=${String(alternateJob.rows[0].id)}`)).rows[0].count),0);

  const unconnectedCase = await db.execute(sql`INSERT INTO snapproof_cases(tenant_id,created_by_user_id,customer_id,reference,title,case_type,source_context,status,job_type,job_status) VALUES (${owner.currentTenantId},${owner.id},${String(snapCustomer.rows[0].id)},${`APP-${randomUUID().slice(0,8)}`},'Unconnected approved report','proof_of_work','{}'::jsonb,'approved','field_service','completed') RETURNING id`);
  const unconnectedReport = await db.execute(sql`INSERT INTO snapproof_reports(tenant_id,case_id,created_by_user_id,approved_by_user_id,title,status,content,content_hash,approved_at) VALUES (${owner.currentTenantId},${String(unconnectedCase.rows[0].id)},${owner.id},${owner.id},'Unconnected proof','approved',${JSON.stringify(reportContent)}::jsonb,${reportHash},NOW()) RETURNING id`);
  await db.execute(sql`INSERT INTO snapproof_exports(tenant_id,case_id,report_id,created_by_user_id,format,export_hash,provenance,content,content_type,filename,byte_length) VALUES (${owner.currentTenantId},${String(unconnectedCase.rows[0].id)},${String(unconnectedReport.rows[0].id)},${owner.id},'pdf',${pdfHash},'{}'::jsonb,${pdf},'application/pdf','unconnected-proof.pdf',${pdf.length})`);
  const missingProvenance = await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'snapproof.approved_report_to_tradeflowkit',
    aggregateId:String(unconnectedReport.rows[0].id),sourceDeepLink:`/modules/snapproofos/reports/${unconnectedReport.rows[0].id}`,
    expectedSourceVersion:await currentWorkflowSourceVersion('snapproof.approved_report_to_tradeflowkit',String(unconnectedReport.rows[0].id)),
    idempotencyKey:`phase38:matrix:snap-missing:${unconnectedReport.rows[0].id}`,correlationId:'phase38-matrix:snap-missing',
    payload:{ tradeFlowJobId:String(activeJob.rows[0].id) },maxAttempts:1,
  });
  await fabric.deliverDataFabricInbox(String(missingProvenance.run.inbox_id));
  const missingInbox = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE id=${String(missingProvenance.run.inbox_id)}`);
  assert.equal(missingInbox.rows[0].status,'dead_letter');
  assert.equal(missingInbox.rows[0].last_error_code,'FABRIC_PROVENANCE_MISSING');

  await publishAndDeliver('snapproof.approved_report_to_tradeflowkit',String(report.rows[0].id),`/modules/snapproofos/reports/${report.rows[0].id}`,'snap-back',{ tradeFlowJobId:String(activeJob.rows[0].id) });
  const attachment = await db.execute(sql`SELECT * FROM shared_attachments WHERE tenant_id=${owner.currentTenantId} AND module_id=${tfkModule.id} AND object_type='tradeflowkit_job' AND object_id=${String(activeJob.rows[0].id)}`);
  assert.equal(attachment.rows.length,1);
  assert.equal(attachment.rows[0].sha256,pdfHash);

  const phone = `+1555${Math.floor(1000000 + Math.random()*8999999)}`;
  const channel = await db.execute(sql`INSERT INTO callcommand_channels(tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,status) VALUES (${owner.currentTenantId},${owner.id},'Phase 38 line',${phone},'America/New_York','This call may be recorded.','active') RETURNING id`);
  const profile = await db.execute(sql`INSERT INTO callcommand_profiles(tenant_id,created_by_user_id,name,mode,greeting,intake_fields,status) VALUES (${owner.currentTenantId},${owner.id},'Phase 38 receptionist','receptionist','How may we help?','[]'::jsonb,'active') RETURNING id`);
  const call = await db.execute(sql`INSERT INTO callcommand_calls(tenant_id,created_by_user_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,subject_name,direction,purpose,provider,status,idempotency_key,summary,customer_name,intent,priority,analyzed_at,completed_at) VALUES (${owner.currentTenantId},${owner.id},${String(channel.rows[0].id)},${String(profile.rows[0].id)},${'a'.repeat(64)},'***-***-1212',${phone},'Casey Caller','inbound','support','test','completed',${`phase38-call-${randomUUID()}`},'Caller needs operational follow-up.','Casey Caller','Schedule a service visit','high',NOW(),NOW()) RETURNING id`);
  const callId = String(call.rows[0].id);
  const leadCountBeforeMismatch = Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM tradeflowkit_leads WHERE tenant_id=${owner.currentTenantId}`)).rows[0].count);
  const mismatchedCallWorkflow = await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'callcommand.analysis_to_pulsedesk',
    aggregateId:callId,sourceDeepLink:`/modules/callcommand-ai/calls/${callId}`,
    expectedSourceVersion:await currentWorkflowSourceVersion('callcommand.analysis_to_pulsedesk',callId),
    idempotencyKey:`phase38:matrix:call-destination-mismatch:${callId}`,correlationId:'phase38-matrix:call-destination-mismatch',
    payload:{ destinationType:'tradeflowkit_lead' },maxAttempts:1,
  });
  await fabric.deliverDataFabricInbox(String(mismatchedCallWorkflow.run.inbox_id));
  const mismatchedInbox = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE id=${String(mismatchedCallWorkflow.run.inbox_id)}`);
  assert.equal(mismatchedInbox.rows[0].status,'dead_letter');
  assert.equal(mismatchedInbox.rows[0].last_error_code,'FABRIC_DESTINATION_TYPE_UNSUPPORTED');
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM tradeflowkit_leads WHERE tenant_id=${owner.currentTenantId}`)).rows[0].count),leadCountBeforeMismatch);
  const unreviewedPulseWorkflow = await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'callcommand.analysis_to_pulsedesk',
    aggregateId:callId,sourceDeepLink:`/modules/callcommand-ai/calls/${callId}`,
    expectedSourceVersion:await currentWorkflowSourceVersion('callcommand.analysis_to_pulsedesk',callId),
    idempotencyKey:`phase38:matrix:call-pulse-unreviewed:${callId}`,correlationId:'phase38-matrix:call-pulse-unreviewed',
    payload:{ destinationType:'pulsedesk_ticket' },maxAttempts:1,
  });
  await fabric.deliverDataFabricInbox(String(unreviewedPulseWorkflow.run.inbox_id));
  const unreviewedPulseInbox = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE id=${String(unreviewedPulseWorkflow.run.inbox_id)}`);
  assert.equal(unreviewedPulseInbox.rows[0].status,'dead_letter');
  assert.equal(unreviewedPulseInbox.rows[0].last_error_code,'FABRIC_PULSEDESK_OPERATIONS_REVIEW_REQUIRED');
  await publishAndDeliver('callcommand.analysis_to_tradeflowkit',callId,`/modules/callcommand-ai/calls/${callId}`,'call-lead',{ destinationType:'tradeflowkit_lead' });
  await publishAndDeliver('callcommand.analysis_to_tradeflowkit',callId,`/modules/callcommand-ai/calls/${callId}`,'call-job',{ destinationType:'tradeflowkit_job' });
  await publishAndDeliver('callcommand.analysis_to_pulsedesk',callId,`/modules/callcommand-ai/calls/${callId}`,'call-pulse',{ destinationType:'pulsedesk_ticket',operationsOnlyApproved:true });
  await publishAndDeliver('callcommand.analysis_to_techdeck',callId,`/modules/callcommand-ai/calls/${callId}`,'call-tech',{ destinationType:'techdeck_ticket' });
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM tradeflowkit_leads WHERE tenant_id=${owner.currentTenantId} AND source_id=${`fabric:call:${callId}`}`)).rows[0].count),1);
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM pulsedesk_requests WHERE tenant_id=${owner.currentTenantId} AND location_label='CallCommand intake'`)).rows[0].count),1);

  const techSeq = await db.execute(sql`INSERT INTO techdeck_ticket_sequences(tenant_id,last_number) VALUES (${owner.currentTenantId},1) ON CONFLICT(tenant_id) DO UPDATE SET last_number=techdeck_ticket_sequences.last_number+1 RETURNING last_number`);
  const resolvedTech = await db.execute(sql`INSERT INTO techdeck_tickets(tenant_id,number,created_by_user_id,title,description,priority,status,resolved_at) VALUES (${owner.currentTenantId},${Number(techSeq.rows[0].last_number)},${owner.id},'Directory sync failure','Contact admin@example.test at 212-555-0199. Sync failed after update.','high','resolved',NOW()) RETURNING id`);
  await db.execute(sql`
    INSERT INTO techdeck_evidence(tenant_id,ticket_id,title,evidence_type,summary,observed_at,created_by_user_id)
    VALUES (${owner.currentTenantId},${String(resolvedTech.rows[0].id)},'Directory connector test','test_result','The sync connector was running with stale directory state.',NOW(),${owner.id})
  `);
  await db.execute(sql`
    INSERT INTO techdeck_ticket_comments(tenant_id,ticket_id,author_user_id,body)
    VALUES (${owner.currentTenantId},${String(resolvedTech.rows[0].id)},${owner.id},'Restarted the connector, completed a clean sync, and confirmed the expected directory count.')
  `);
  const missingPrivacyReview = await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'support.resolved_to_faultlinelab',
    aggregateId:String(resolvedTech.rows[0].id),sourceDeepLink:`/modules/techdeck/tickets/${resolvedTech.rows[0].id}`,
    expectedSourceVersion:await currentWorkflowSourceVersion('support.resolved_to_faultlinelab',String(resolvedTech.rows[0].id),'techdeck'),
    sourceModuleSlug:'techdeck',sourceType:'techdeck_ticket',sourceKind:'ticket',
    idempotencyKey:`phase38:matrix:tech-training-no-privacy:${resolvedTech.rows[0].id}`,correlationId:'phase38-matrix:tech-training-no-privacy',
    payload:{ authorApproved:true },maxAttempts:1,
  });
  await fabric.deliverDataFabricInbox(String(missingPrivacyReview.run.inbox_id));
  const privacyInbox = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE id=${String(missingPrivacyReview.run.inbox_id)}`);
  assert.equal(privacyInbox.rows[0].status,'dead_letter');
  assert.equal(privacyInbox.rows[0].last_error_code,'FABRIC_PRIVACY_REVIEW_REQUIRED');
  await publishAndDeliver('support.resolved_to_faultlinelab',String(resolvedTech.rows[0].id),`/modules/techdeck/tickets/${resolvedTech.rows[0].id}`,'tech-training',{ authorApproved:true,privacyReviewed:true,sourceType:'techdeck_ticket' },'techdeck','techdeck_ticket');
  const pulseSeq = await db.execute(sql`INSERT INTO pulsedesk_request_sequences(tenant_id,last_number) VALUES (${owner.currentTenantId},1) ON CONFLICT(tenant_id) DO UPDATE SET last_number=pulsedesk_request_sequences.last_number+1 RETURNING last_number`);
  const resolvedPulse = await db.execute(sql`INSERT INTO pulsedesk_requests(tenant_id,number,created_by_user_id,summary,description,category,priority,status,resolved_at) VALUES (${owner.currentTenantId},${Number(pulseSeq.rows[0].last_number)},${owner.id},'Operations display unavailable','A department coordination display stopped refreshing.','it_infrastructure','normal','resolved',NOW()) RETURNING id`);
  await db.execute(sql`
    INSERT INTO pulsedesk_ticket_messages(tenant_id,ticket_id,author_user_id,visibility,body,idempotency_key)
    VALUES (${owner.currentTenantId},${String(resolvedPulse.rows[0].id)},${owner.id},'internal','Restored the display connection and confirmed the operations board refreshed with non-clinical test data.','training-resolution-note')
  `);
  await publishAndDeliver('support.resolved_to_faultlinelab',String(resolvedPulse.rows[0].id),`/modules/pulsedesk/tickets/${resolvedPulse.rows[0].id}`,'pulse-training',{ authorApproved:true,privacyReviewed:true,sourceType:'pulsedesk_request' },'pulsedesk','pulsedesk_request');
  const training = await db.execute(sql`SELECT v.content,v.validation FROM faultlinelab_challenge_versions v WHERE v.tenant_id=${owner.currentTenantId} ORDER BY v.created_at DESC LIMIT 2`);
  assert.equal(training.rows.length,2);
  assert.doesNotMatch(JSON.stringify(training.rows),/admin@example\.test|212-555-0199/);
  assert.ok(training.rows.every((row: any) => row.validation?.basicIdentifierMaskingApplied === true));
  assert.ok(training.rows.every((row: any) => row.validation?.privacyReviewRequired === true));
  assert.ok(training.rows.every((row: any) => row.validation?.valid === false));
  assert.ok(training.rows.every((row: any) => row.validation?.importedWorkflowDraft === true));
  assert.ok(training.rows.every((row: any) => row.content?.rootCauseOptions?.length === 4));
  assert.ok(training.rows.every((row: any) => row.content?.hints?.every((hint: any) => !/placeholder/i.test(String(hint.text)))));
  assert.ok(training.rows.every((row: any) => row.content?.commands?.length >= 5));
  assert.ok(training.rows.every((row: any) => row.validation?.redactionVerified === undefined));
  assert.match(JSON.stringify(training.rows),/stale directory state/);
  assert.match(JSON.stringify(training.rows),/Restarted the connector/);
  assert.match(JSON.stringify(training.rows),/Restored the display connection/);

  const vehicle = await db.execute(sql`INSERT INTO torqueshed_vehicles(tenant_id,owner_user_id,nickname,year,make,model,ownership_status,visibility,created_by_user_id,updated_by_user_id) VALUES (${owner.currentTenantId},${owner.id},'Shop truck',2020,'Ford','F-150','owned','private',${owner.id},${owner.id}) RETURNING id`);
  const diagnostic = await db.execute(sql`INSERT INTO torqueshed_diagnostic_sessions(tenant_id,owner_user_id,vehicle_id,title,customer_concern,symptoms,confirmed_cause,repair_performed,verification,resolution,status,visibility,created_by_user_id,updated_by_user_id) VALUES (${owner.currentTenantId},${owner.id},${String(vehicle.rows[0].id)},'Intermittent no-start','Engine intermittently cranks without starting.','No fuel pressure during failure.','Open fuel-pump power circuit.','Repaired the fuel-pump power connection.','Repeated hot and cold starts with stable fuel pressure.','The engine starts consistently and fuel pressure remains in range.','resolved','private',${owner.id},${owner.id}) RETURNING id`);
  await db.execute(sql`INSERT INTO torqueshed_diagnostic_entries(tenant_id,diagnostic_session_id,kind,title,value_text,outcome,created_by_user_id,updated_by_user_id) VALUES (${owner.currentTenantId},${String(diagnostic.rows[0].id)},'test','Fuel pressure test','0 psi during failure','Fuel delivery circuit requires review.',${owner.id},${owner.id})`);
  await publishAndDeliver('torqueshed.diagnostic_to_snapproof',String(diagnostic.rows[0].id),`/modules/torqueshed/diagnostics/${diagnostic.rows[0].id}`,'torque-proof');
  await publishAndDeliver('torqueshed.diagnostic_to_faultlinelab',String(diagnostic.rows[0].id),`/modules/torqueshed/diagnostics/${diagnostic.rows[0].id}`,'torque-training',{ authorApproved:true,privacyReviewed:true });
  const torqueTraining = await db.execute(sql`
    SELECT version.content,version.validation
    FROM faultlinelab_challenges challenge
    JOIN faultlinelab_challenge_versions version
      ON version.tenant_id=challenge.tenant_id AND version.challenge_id=challenge.id
    WHERE challenge.tenant_id=${owner.currentTenantId} AND challenge.title='Training draft: Intermittent no-start'
    ORDER BY challenge.created_at DESC
    LIMIT 1
  `);
  assert.equal(torqueTraining.rows[0].validation?.valid,false);
  assert.equal(torqueTraining.rows[0].content?.rootCauseOptions?.length,4);
  assert.match(JSON.stringify(torqueTraining.rows[0].content),/Open fuel-pump power circuit/);
  assert.match(JSON.stringify(torqueTraining.rows[0].content),/Fuel pressure test/);
  assert.match(JSON.stringify(torqueTraining.rows[0].content),/Repeated hot and cold starts/);
  assert.doesNotMatch(JSON.stringify(torqueTraining.rows[0].content),new RegExp(String(diagnostic.rows[0].id),'i'));

  const brand = await db.execute(sql`INSERT INTO brandforge_brands(tenant_id,created_by_user_id,name,description,primary_color,accent_color,voice_tone) VALUES (${owner.currentTenantId},${owner.id},'Phase 38 Brand','Field service launch brand','#111827','#DC2626','Professional and direct') RETURNING id`);
  const campaign = await db.execute(sql`INSERT INTO brandforge_campaigns(tenant_id,created_by_user_id,brand_id,name,objective,target_audience,core_message,offer,status,channels) VALUES (${owner.currentTenantId},${owner.id},${String(brand.rows[0].id)},'Field service launch','Launch a proof-backed field service','Commercial property teams','Document every completed visit','Proof-backed service package','planning','["email","social"]'::jsonb) RETURNING id`);
  await publishAndDeliver('brandforgeos.campaign_to_launchkit',String(campaign.rows[0].id),`/modules/brandforgeos/campaigns/${campaign.rows[0].id}`,'brand-launch');
  const kit = await db.execute(sql`SELECT * FROM launchkit_product_kits WHERE tenant_id=${owner.currentTenantId} AND provenance_json->>'campaignId'=${String(campaign.rows[0].id)} LIMIT 1`);
  assert.equal((kit.rows[0].visual_promo_json as unknown[]).length,9);
  assert.equal(kit.rows[0].watermarked,true);
  assert.equal(kit.rows[0].brand_profile_id,null);

  const scriptContent = 'Write-Output "Inventory only"';
  const scriptHash = crypto.createHash('sha256').update(scriptContent).digest('hex');
  const script = await db.execute(sql`INSERT INTO ninjamation_scripts(tenant_id,created_by_user_id,approved_by_user_id,name,description,language,category,source,risk_tier,status,current_version_number,approved_at) VALUES (${owner.currentTenantId},${owner.id},${owner.id},'Inventory reference','Read-only inventory documentation.','powershell','Inventory','manual','low','approved',1,NOW()) RETURNING id`);
  await db.execute(sql`INSERT INTO ninjamation_script_versions(tenant_id,script_id,version_number,content,content_sha256,static_analysis,created_by_user_id) VALUES (${owner.currentTenantId},${String(script.rows[0].id)},1,${scriptContent},${scriptHash},'{"analyzerVersion":"phase38-test","findings":[]}'::jsonb,${owner.id})`);
  await publishAndDeliver('ninjamation.script_to_techdeck',String(script.rows[0].id),`/modules/ninjamation/scripts/${script.rows[0].id}`,'script-doc');
  const runbook = await db.execute(sql`SELECT * FROM techdeck_documents WHERE tenant_id=${owner.currentTenantId} AND title='Inventory reference' AND page_type='runbook' LIMIT 1`);
  assert.equal(runbook.rows[0].status,'draft');
  assert.match(String(runbook.rows[0].content),/Write-Output "Inventory only"/);

  const activity = await fabric.listDataFabricActivity({ tenantId:owner.currentTenantId,actorUserId:owner.id,limit:100 });
  assert.ok(activity.length >= 14);
  assert.ok(activity.every((row: any) => String(row.source_deep_link).startsWith('/')));
});
