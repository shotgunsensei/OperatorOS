import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db.js';
import { ensureSchemaReady, createTestModule, createTestUser } from '../_setup.js';

export async function createRestartFixture() {
  await ensureSchemaReady();
  const existing = await db.execute(sql`SELECT id FROM modules WHERE slug='callcommand-ai'`);
  assert.equal(existing.rows.length, 0, 'Restart proof requires a fresh disposable module fixture; no existing module may be shadowed');
  const owner = await createTestUser();
  const module = await createTestModule('callcommand-ai');
  try {
  await db.execute(sql`INSERT INTO tenant_modules(tenant_id,module_id,status,source,allow_all_members) VALUES(${owner.currentTenantId},${module.id},'enabled','admin',TRUE)`);
  const profile = (await db.execute(sql`INSERT INTO callcommand_profiles(tenant_id,created_by_user_id,name,mode,greeting,intake_fields,status,product_mode,business_name,business_description,voice_id,fallback_behavior,recording_policy,transcription_policy)
    VALUES(${owner.currentTenantId},${owner.id},'Restart fixture','receptionist','Fixture greeting','[]'::jsonb,'active','general','Synthetic restart fixture','No live customers or recipients','marin','voicemail','disabled','disabled') RETURNING id`)).rows[0];
  const flow = (await db.execute(sql`INSERT INTO callcommand_flows(tenant_id,created_by_user_id,name,product_mode,status,active_version,start_node_key)
    VALUES(${owner.currentTenantId},${owner.id},'Restart fixture','general','active',1,'start') RETURNING id`)).rows[0];
  await db.execute(sql`INSERT INTO callcommand_flow_versions(tenant_id,flow_id,version,graph_json,validation_json,published_by_user_id)
    VALUES(${owner.currentTenantId},${flow.id},1,${JSON.stringify({ start: 'start', nodes: [{ key: 'start', type: 'route', config: {} }] })}::jsonb,'{"valid":true}'::jsonb,${owner.id})`);
  const secret = (await db.execute(sql`INSERT INTO shared_secret_references(tenant_id,module_id,purpose,ciphertext,iv,auth_tag,key_version,fingerprint,created_by_user_id)
    VALUES(${owner.currentTenantId},${module.id},'callcommand.restart-fixture',${randomBytes(32)},${randomBytes(12)},${randomBytes(16)},'test-v1',${createHash('sha256').update(randomUUID()).digest('hex')},${owner.id}) RETURNING id`)).rows[0];
  const accountSid = `AC${randomBytes(16).toString('hex')}`;
  const account = (await db.execute(sql`INSERT INTO callcommand_telephony_accounts(tenant_id,created_by_user_id,provider,account_mode,provider_account_sid,secret_reference_id,status,health_status,last_health_at,verified_at)
    VALUES(${owner.currentTenantId},${owner.id},'twilio','platform',${accountSid},${secret.id},'active','healthy',NOW(),NOW()) RETURNING id`)).rows[0];
  const channel = (await db.execute(sql`INSERT INTO callcommand_channels(tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,recording_enabled,require_recording_consent,status,profile_id,active_flow_id,product_mode,routing_mode,live_behavior,telephony_account_id,provider_number_sid,provider_number_status,health_status,provider_verified_at,health_checked_at)
    VALUES(${owner.currentTenantId},${owner.id},'Synthetic restart channel','+15550000001','UTC','No recording in synthetic fixture',FALSE,FALSE,'active',${profile.id},${flow.id},'general','general','ai_receptionist',${account.id},${`PN${randomBytes(16).toString('hex')}`},'active','healthy',NOW(),NOW()) RETURNING id`)).rows[0];
  await db.execute(sql`INSERT INTO callcommand_tenant_runtime_settings(tenant_id,overflow_policy,default_lease_seconds,maximum_lease_seconds,realtime_enabled) VALUES(${owner.currentTenantId},'refuse',120,600,TRUE)`);
  const sid = `CA${randomBytes(16).toString('hex')}`;
  const call = (await db.execute(sql`INSERT INTO callcommand_calls(tenant_id,created_by_user_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,direction,purpose,provider,provider_call_sid,status,idempotency_key,started_at,realtime_status)
    VALUES(${owner.currentTenantId},${owner.id},${channel.id},${profile.id},${createHash('sha256').update(randomUUID()).digest('hex')},'***0002','+15550000002','inbound','support','twilio',${sid},'ringing',${randomUUID()},NOW(),'pending') RETURNING id,started_at`)).rows[0];
  const lease = (await db.execute(sql`INSERT INTO callcommand_lane_leases(tenant_id,call_id,lane_number,provider_call_sid,idempotency_key,status,expires_at) VALUES(${owner.currentTenantId},${call.id},1,${sid},${randomUUID()},'active',NOW()+INTERVAL '10 minutes') RETURNING id`)).rows[0];
  await db.execute(sql`UPDATE callcommand_calls SET capacity_lease_id=${lease.id} WHERE tenant_id=${owner.currentTenantId} AND id=${call.id}`);
  await db.execute(sql`INSERT INTO callcommand_live_sessions(tenant_id,call_id,channel_id,provider_call_sid,state,caller_phone_masked) VALUES(${owner.currentTenantId},${call.id},${channel.id},${sid},'ringing','***0002')`);
  return { userId: owner.id, tenantId: owner.currentTenantId, moduleId: module.id, callId: String(call.id), providerSid: sid, startedAt: new Date(String(call.started_at)).toISOString() };
  } catch (error) {
    await cleanupRestartFixture({userId:owner.id,tenantId:owner.currentTenantId,moduleId:module.id});
    throw error;
  }
}

export async function cleanupRestartFixture(fixture: {userId:string;tenantId:string;moduleId:string}) {
  const tables = ['shared_delivery_attempts','shared_outbox_messages','callcommand_usage_events','callcommand_transfer_logs','callcommand_reports','callcommand_flow_traces','callcommand_tickets','callcommand_leads','callcommand_tasks','callcommand_action_runs','callcommand_ingestion_events','callcommand_live_sessions','callcommand_lane_leases','callcommand_events','callcommand_followups','callcommand_calls','callcommand_agent_knowledge','callcommand_consents','callcommand_automation_rules','callcommand_transfer_targets','callcommand_channels','callcommand_telephony_accounts','shared_secret_references','callcommand_flow_versions','callcommand_flows','callcommand_capacity_entitlements','callcommand_tenant_runtime_settings','callcommand_profiles','shared_usage_events','shared_activity_events','tenant_modules','tenant_users'];
  await db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL operatoros.allow_callcommand_usage_delete='on'`);
    await tx.execute(sql`UPDATE callcommand_calls SET capacity_lease_id=NULL WHERE tenant_id=${fixture.tenantId}`);
    for (const table of tables) await tx.execute(sql`DELETE FROM ${sql.raw(table)} WHERE tenant_id=${fixture.tenantId}`);
    await tx.execute(sql`UPDATE users SET current_tenant_id=NULL WHERE id=${fixture.userId}`);
    await tx.execute(sql`DELETE FROM tenants WHERE id=${fixture.tenantId}`);
    await tx.execute(sql`DELETE FROM users WHERE id=${fixture.userId}`);
    await tx.execute(sql`DELETE FROM modules WHERE id=${fixture.moduleId}`);
  });
  const residual: Record<string, number> = {};
  for (const table of tables) residual[table] = Number((await db.execute(sql`SELECT count(*)::int count FROM ${sql.raw(table)} WHERE tenant_id=${fixture.tenantId}`)).rows[0].count);
  residual.users = Number((await db.execute(sql`SELECT count(*)::int count FROM users WHERE id=${fixture.userId}`)).rows[0].count);
  residual.tenants = Number((await db.execute(sql`SELECT count(*)::int count FROM tenants WHERE id=${fixture.tenantId}`)).rows[0].count);
  residual.modules = Number((await db.execute(sql`SELECT count(*)::int count FROM modules WHERE id=${fixture.moduleId}`)).rows[0].count);
  return residual;
}
