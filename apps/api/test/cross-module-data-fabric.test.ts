import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.APP_ENV = 'test';
process.env.SESSION_SECRET ||= 'phase38-data-fabric-test-session-secret-v1';

let db: any;
let sql: any;
let owner: any;
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
  foreign = await setup.createTestUser();
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
        'techdeck_document_revisions','techdeck_evidence','techdeck_documents','techdeck_runbooks','techdeck_tickets',
        'faultlinelab_challenge_versions','faultlinelab_challenges','pulsedesk_requests',
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
  await setup.cleanupUser(foreign.id);
  for (const id of createdModuleIds.reverse()) await setup.cleanupModule(id);
  const { closeDatabasePool } = await import('../src/db.js');
  await closeDatabasePool();
});

function bearer(user: any) {
  return { authorization:`Bearer ${signToken({ userId:user.id,email:user.email,role:user.role,tokenVersion:user.tokenVersion,sessionType:'platform' })}` };
}

test('Phase 38 API queues idempotently, filters tenant activity, and exposes run provenance', async () => {
  const job = await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,status,priority,source_id)
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'API workflow job','scheduled','normal',${`phase38-api-${owner.id}`}) RETURNING id
  `);
  const jobId = String(job.rows[0].id);
  const url = `/v1/tenants/${owner.currentTenantId}/data-fabric/workflows/tradeflowkit.job_to_snapproof`;
  const payload = { aggregateId:jobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,idempotencyKey:`phase38:api:${jobId}` };
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

test('TradeFlowKit job publishes once and creates native SnapProofOS records with signed provenance', async () => {
  const job = await db.execute(sql`
    INSERT INTO tradeflowkit_jobs(tenant_id,customer_id,created_by_user_id,title,description,status,priority,source_id)
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'Replace rooftop controller','Capture arrival, work, and completion proof.','scheduled','normal',${`phase38-job-${owner.id}`}) RETURNING id
  `);
  const jobId = String(job.rows[0].id);
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const first = await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof',
    aggregateId:jobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,
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

  const replay = await fabric.publishDataFabricWorkflow({
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof',
    aggregateId:jobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,
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
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'Concurrent proof job','scheduled','normal',${`phase38-concurrent-${randomUUID()}`}) RETURNING id
  `);
  const jobId = String(job.rows[0].id);
  const input = {
    tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof' as const,
    aggregateId:jobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,
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
    VALUES (${owner.currentTenantId},${customerId},${owner.id},'Signature gate job','scheduled','normal',${`phase38-signature-${owner.id}`}) RETURNING id
  `);
  const jobId = String(job.rows[0].id);
  const queued = await fabric.publishDataFabricWorkflow({ tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey:'tradeflowkit.job_to_snapproof',aggregateId:jobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,idempotencyKey:`phase38:signature:${jobId}`,correlationId:`phase38-signature:${jobId}`,maxAttempts:1 });
  await db.execute(sql`UPDATE shared_domain_events SET payload_json='{"tampered":true}'::jsonb WHERE workflow_run_id=${String(queued.run.id)}`);
  await fabric.deliverDataFabricInbox(String(queued.run.inbox_id));
  const rejected = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE id=${String(queued.run.inbox_id)}`);
  assert.equal(rejected.rows[0].status,'dead_letter');
  assert.equal(rejected.rows[0].last_error_code,'FABRIC_EVENT_SIGNATURE_INVALID');

  await assert.rejects(
    () => fabric.publishDataFabricWorkflow({ tenantId:owner.currentTenantId,actorUserId:foreign.id,workflowKey:'tradeflowkit.job_to_snapproof',aggregateId:jobId,sourceDeepLink:`/modules/tradeflowkit/jobs/${jobId}`,idempotencyKey:`phase38:foreign:${jobId}`,correlationId:'phase38-foreign' }),
    (error: any) => error?.code === 'FABRIC_MODULE_ACCESS_DENIED',
  );
});

test('every named Phase 38 workflow creates native destination records and traceable links', async () => {
  const fabric = await import('../src/lib/cross-module-data-fabric.js');
  const crypto = await import('node:crypto');
  const publishAndDeliver = async (workflowKey: any, aggregateId: string, sourceDeepLink: string, suffix: string, payload: Record<string,unknown> = {}, sourceModuleSlug?: string, sourceType?: string) => {
    const queued = await fabric.publishDataFabricWorkflow({
      tenantId:owner.currentTenantId,actorUserId:owner.id,workflowKey,aggregateId,sourceDeepLink,
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
  const snapCustomer = await db.execute(sql`INSERT INTO snapproof_customers(tenant_id,created_by_user_id,name) VALUES (${owner.currentTenantId},${owner.id},'Approved report customer') RETURNING id`);
  const snapCase = await db.execute(sql`INSERT INTO snapproof_cases(tenant_id,created_by_user_id,customer_id,reference,title,case_type,source_context,status,job_type,job_status) VALUES (${owner.currentTenantId},${owner.id},${String(snapCustomer.rows[0].id)},${`APP-${randomUUID().slice(0,8)}`},'Approved field report','proof_of_work','{}'::jsonb,'approved','field_service','completed') RETURNING id`);
  const reportContent = { schemaVersion:1,approved:true };
  const reportHash = crypto.createHash('sha256').update(JSON.stringify(reportContent)).digest('hex');
  const report = await db.execute(sql`INSERT INTO snapproof_reports(tenant_id,case_id,created_by_user_id,approved_by_user_id,title,status,content,content_hash,approved_at) VALUES (${owner.currentTenantId},${String(snapCase.rows[0].id)},${owner.id},${owner.id},'Approved proof','approved',${JSON.stringify(reportContent)}::jsonb,${reportHash},NOW()) RETURNING id`);
  await db.execute(sql`INSERT INTO snapproof_exports(tenant_id,case_id,report_id,created_by_user_id,format,export_hash,provenance,content,content_type,filename,byte_length) VALUES (${owner.currentTenantId},${String(snapCase.rows[0].id)},${String(report.rows[0].id)},${owner.id},'pdf',${pdfHash},'{}'::jsonb,${pdf},'application/pdf','approved-proof.pdf',${pdf.length})`);
  const activeJob = await db.execute(sql`SELECT id FROM tradeflowkit_jobs WHERE tenant_id=${owner.currentTenantId} AND deleted_at IS NULL ORDER BY created_at LIMIT 1`);
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
    idempotencyKey:`phase38:matrix:call-destination-mismatch:${callId}`,correlationId:'phase38-matrix:call-destination-mismatch',
    payload:{ destinationType:'tradeflowkit_lead' },maxAttempts:1,
  });
  await fabric.deliverDataFabricInbox(String(mismatchedCallWorkflow.run.inbox_id));
  const mismatchedInbox = await db.execute(sql`SELECT status,last_error_code FROM shared_event_inbox WHERE id=${String(mismatchedCallWorkflow.run.inbox_id)}`);
  assert.equal(mismatchedInbox.rows[0].status,'dead_letter');
  assert.equal(mismatchedInbox.rows[0].last_error_code,'FABRIC_DESTINATION_TYPE_UNSUPPORTED');
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM tradeflowkit_leads WHERE tenant_id=${owner.currentTenantId}`)).rows[0].count),leadCountBeforeMismatch);
  await publishAndDeliver('callcommand.analysis_to_tradeflowkit',callId,`/modules/callcommand-ai/calls/${callId}`,'call-lead',{ destinationType:'tradeflowkit_lead' });
  await publishAndDeliver('callcommand.analysis_to_tradeflowkit',callId,`/modules/callcommand-ai/calls/${callId}`,'call-job',{ destinationType:'tradeflowkit_job' });
  await publishAndDeliver('callcommand.analysis_to_pulsedesk',callId,`/modules/callcommand-ai/calls/${callId}`,'call-pulse',{ destinationType:'pulsedesk_ticket' });
  await publishAndDeliver('callcommand.analysis_to_techdeck',callId,`/modules/callcommand-ai/calls/${callId}`,'call-tech',{ destinationType:'techdeck_ticket' });
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM tradeflowkit_leads WHERE tenant_id=${owner.currentTenantId} AND source_id=${`fabric:call:${callId}`}`)).rows[0].count),1);
  assert.equal(Number((await db.execute(sql`SELECT COUNT(*)::int AS count FROM pulsedesk_requests WHERE tenant_id=${owner.currentTenantId} AND location_label='CallCommand intake'`)).rows[0].count),1);

  const techSeq = await db.execute(sql`INSERT INTO techdeck_ticket_sequences(tenant_id,last_number) VALUES (${owner.currentTenantId},1) ON CONFLICT(tenant_id) DO UPDATE SET last_number=techdeck_ticket_sequences.last_number+1 RETURNING last_number`);
  const resolvedTech = await db.execute(sql`INSERT INTO techdeck_tickets(tenant_id,number,created_by_user_id,title,description,priority,status,resolved_at) VALUES (${owner.currentTenantId},${Number(techSeq.rows[0].last_number)},${owner.id},'Directory sync failure','Contact admin@example.test at 212-555-0199. Sync failed after update.','high','resolved',NOW()) RETURNING id`);
  await publishAndDeliver('support.resolved_to_faultlinelab',String(resolvedTech.rows[0].id),`/modules/techdeck/tickets/${resolvedTech.rows[0].id}`,'tech-training',{ authorApproved:true,sourceType:'techdeck_ticket' },'techdeck','techdeck_ticket');
  const pulseSeq = await db.execute(sql`INSERT INTO pulsedesk_request_sequences(tenant_id,last_number) VALUES (${owner.currentTenantId},1) ON CONFLICT(tenant_id) DO UPDATE SET last_number=pulsedesk_request_sequences.last_number+1 RETURNING last_number`);
  const resolvedPulse = await db.execute(sql`INSERT INTO pulsedesk_requests(tenant_id,number,created_by_user_id,summary,description,category,priority,status,resolved_at) VALUES (${owner.currentTenantId},${Number(pulseSeq.rows[0].last_number)},${owner.id},'Operations display unavailable','A department coordination display stopped refreshing.','it_infrastructure','normal','resolved',NOW()) RETURNING id`);
  await publishAndDeliver('support.resolved_to_faultlinelab',String(resolvedPulse.rows[0].id),`/modules/pulsedesk/tickets/${resolvedPulse.rows[0].id}`,'pulse-training',{ authorApproved:true,sourceType:'pulsedesk_request' },'pulsedesk','pulsedesk_request');
  const training = await db.execute(sql`SELECT v.content FROM faultlinelab_challenge_versions v WHERE v.tenant_id=${owner.currentTenantId} ORDER BY v.created_at DESC LIMIT 2`);
  assert.equal(training.rows.length,2);
  assert.doesNotMatch(JSON.stringify(training.rows),/admin@example\.test|212-555-0199/);

  const vehicle = await db.execute(sql`INSERT INTO torqueshed_vehicles(tenant_id,owner_user_id,nickname,year,make,model,ownership_status,visibility,created_by_user_id,updated_by_user_id) VALUES (${owner.currentTenantId},${owner.id},'Shop truck',2020,'Ford','F-150','owned','private',${owner.id},${owner.id}) RETURNING id`);
  const diagnostic = await db.execute(sql`INSERT INTO torqueshed_diagnostic_sessions(tenant_id,owner_user_id,vehicle_id,title,customer_concern,symptoms,status,visibility,created_by_user_id,updated_by_user_id) VALUES (${owner.currentTenantId},${owner.id},${String(vehicle.rows[0].id)},'Intermittent no-start','Engine intermittently cranks without starting.','No fuel pressure during failure.','testing','private',${owner.id},${owner.id}) RETURNING id`);
  await db.execute(sql`INSERT INTO torqueshed_diagnostic_entries(tenant_id,diagnostic_session_id,kind,title,value_text,outcome,created_by_user_id,updated_by_user_id) VALUES (${owner.currentTenantId},${String(diagnostic.rows[0].id)},'test','Fuel pressure test','0 psi during failure','Fuel delivery circuit requires review.',${owner.id},${owner.id})`);
  await publishAndDeliver('torqueshed.diagnostic_to_snapproof',String(diagnostic.rows[0].id),`/modules/torqueshed/diagnostics/${diagnostic.rows[0].id}`,'torque-proof');
  await publishAndDeliver('torqueshed.diagnostic_to_faultlinelab',String(diagnostic.rows[0].id),`/modules/torqueshed/diagnostics/${diagnostic.rows[0].id}`,'torque-training',{ authorApproved:true });

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
  const runbook = await db.execute(sql`SELECT * FROM techdeck_runbooks WHERE tenant_id=${owner.currentTenantId} AND name='Inventory reference' LIMIT 1`);
  assert.equal(runbook.rows[0].status,'draft');
  assert.equal(runbook.rows[0].script_text,scriptContent);

  const activity = await fabric.listDataFabricActivity({ tenantId:owner.currentTenantId,actorUserId:owner.id,limit:100 });
  assert.ok(activity.length >= 14);
  assert.ok(activity.every((row: any) => String(row.source_deep_link).startsWith('/')));
});
