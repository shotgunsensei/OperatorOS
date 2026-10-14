import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {sql} from 'drizzle-orm';
import {db} from '../src/db.js';
import {createOutCallResourceFixture,SYNTHETIC_OUTCALL_POLICY} from './outcall-resource-fixture.js';
import {beginOutCallSubmission,finishOutCallResource,finishOutCallCallResource,hasApprovedOutCallResourcePolicy,outCallAccountKey,readOutCallResourcePolicy,recoverOutCallResources,reserveOutCallResource,type OutCallResourcePolicy} from '../src/lib/outcall-resources.js';
import {ensureOutCallResourceTables,verifyOutCallResourceTables} from '../src/lib/outcall-resource-db-init.js';
let a:Awaited<ReturnType<typeof createOutCallResourceFixture>>;
let b:Awaited<ReturnType<typeof createOutCallResourceFixture>>;
const beforeEnv=new Map<string,string|undefined>();
before(async()=>{
  for(const key of ['TWILIO_ACCOUNT_SID','OUTCALL_RESOURCE_POLICY_JSON'])beforeEnv.set(key,process.env[key]);
  process.env.TWILIO_ACCOUNT_SID=`AC${'9'.repeat(32)}`;
  a=await createOutCallResourceFixture();b=await createOutCallResourceFixture();
});
after(async()=>{
  await a?.cleanup();await b?.cleanup();
  for(const [key,value] of beforeEnv)if(value===undefined)delete process.env[key];else process.env[key]=value;
});
async function configure(overrides:Partial<OutCallResourcePolicy>={}) {
  await db.execute(sql`DELETE FROM outcall_resource_reservations WHERE account_key=${outCallAccountKey()}`);
  await db.execute(sql`DELETE FROM outcall_call_requests WHERE user_id IN (${a.user.id},${b.user.id})`);
  const value={...SYNTHETIC_OUTCALL_POLICY,...overrides};
  process.env.OUTCALL_RESOURCE_POLICY_JSON=JSON.stringify(value);await a.approve(value);return value;
}
const reserve=(owner=a,operation:'verify_start'|'verify_check'|'sms_reply'='verify_start')=>db.transaction(tx=>reserveOutCallResource({...owner.context(),operation},tx));

test('resource limits require a live matching privileged approval; configuration is insufficient',async()=>{
  await configure();assert.equal(await hasApprovedOutCallResourcePolicy(),true);
  await db.execute(sql`UPDATE outcall_account_approvals SET revoked_at=NOW() WHERE account_key=${outCallAccountKey()}`);
  await assert.rejects(()=>reserve(),(error:any)=>error.code==='OUTCALL_RESOURCE_APPROVAL_REQUIRED');
  assert.equal(await hasApprovedOutCallResourcePolicy(),false);
  await a.approve();await db.execute(sql`UPDATE users SET platform_role='user' WHERE id=${a.user.id}`);
  assert.equal(await hasApprovedOutCallResourcePolicy(),false);
  await db.execute(sql`UPDATE users SET platform_role='super_admin' WHERE id=${a.user.id}`);
  await db.execute(sql`UPDATE outcall_account_approvals SET approved_at=NOW()-interval '2 hours',expires_at=NOW()-interval '1 hour' WHERE account_key=${outCallAccountKey()}`);
  assert.equal(await hasApprovedOutCallResourcePolicy(),false,'expired approval cannot authorize spending');
  await a.approve();
  process.env.OUTCALL_RESOURCE_POLICY_JSON=JSON.stringify({...SYNTHETIC_OUTCALL_POLICY,maxOutstanding:201});
  assert.equal(await hasApprovedOutCallResourcePolicy(),false);
  process.env.OUTCALL_RESOURCE_POLICY_JSON=JSON.stringify({...SYNTHETIC_OUTCALL_POLICY,dailyMicros:0});
  assert.equal(readOutCallResourcePolicy(),null);
});

test('concurrent tenants share one atomic account concurrency reservation limit',async()=>{
  await configure({maxOutstanding:2});
  const results=await Promise.allSettled(Array.from({length:20},(_,index)=>reserve(index%2?a:b)));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,2);
  for(const result of results)if(result.status==='rejected')assert.equal(result.reason.code,'OUTCALL_RESOURCE_LIMIT');
  const held=await db.execute(sql`SELECT COUNT(*)::int AS count FROM outcall_resource_reservations WHERE account_key=${outCallAccountKey()} AND state='queued'`);
  assert.equal(Number(held.rows[0].count),2);
});

test('daily money, monthly money and verification/SMS quotas close before another submission',async()=>{
  await configure({dailyMicros:10_000,monthlyMicros:10_000,voiceCeilingMicros:5_000});
  const first=await reserve();await beginOutCallSubmission(first,a.user.currentTenantId,a.user.id,'verify_start');
  await db.transaction(tx=>finishOutCallResource(first,'spent',tx));
  await reserve(b);await assert.rejects(()=>reserve(),(error:any)=>error.code==='OUTCALL_RESOURCE_LIMIT');
  await configure({dailyVerificationRequests:1});await reserve();await assert.rejects(()=>reserve(b),(error:any)=>error.code==='OUTCALL_RESOURCE_LIMIT');
  await configure({dailySmsReplies:1});await reserve(a,'sms_reply');await assert.rejects(()=>reserve(b,'sms_reply'),(error:any)=>error.code==='OUTCALL_RESOURCE_LIMIT');
  await configure({dailyMicros:10_000,monthlyMicros:10_000,voiceCeilingMicros:5_000});
  const monthly=await reserve();await beginOutCallSubmission(monthly,a.user.currentTenantId,a.user.id,'verify_start');
  await db.transaction(tx=>finishOutCallResource(monthly,'spent',tx));
  await db.execute(sql`UPDATE outcall_resource_reservations SET settled_at=date_trunc('month',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHERE id=${monthly}`);
  await reserve(b);await assert.rejects(()=>reserve(),(error:any)=>error.code==='OUTCALL_RESOURCE_LIMIT');
});

test('queued voice reservations bind call, actor and account; a repeated submit cannot dial twice',async()=>{
  await configure({dailyVoiceRequests:1});
  const call=await a.voice();
  await assert.rejects(()=>b.voice(),(error:any)=>error.code==='OUTCALL_RESOURCE_LIMIT');
  await assert.rejects(()=>beginOutCallSubmission(call.reservationId,b.user.currentTenantId,b.user.id,'voice',call.requestId),(error:any)=>error.code==='OUTCALL_RESERVATION_CONFLICT');
  await assert.rejects(()=>beginOutCallSubmission(call.reservationId,a.user.currentTenantId,a.user.id,'voice',crypto.randomUUID()),(error:any)=>error.code==='OUTCALL_RESERVATION_CONFLICT');
  assert.equal(await beginOutCallSubmission(call.reservationId,a.user.currentTenantId,a.user.id,'voice',call.requestId),120);
  await assert.rejects(()=>beginOutCallSubmission(call.reservationId,a.user.currentTenantId,a.user.id,'voice',call.requestId),(error:any)=>error.code==='OUTCALL_RESERVATION_CONFLICT');
  await db.transaction(tx=>finishOutCallResource(call.reservationId,'released',tx));
  const held=await db.execute(sql`SELECT state FROM outcall_resource_reservations WHERE id=${call.reservationId}`);
  assert.equal(held.rows[0].state,'submitting','a submission hold cannot be canceled as unsent');
});

test('cancellation releases unsent holds; expired work is bounded and uncertain work retains capacity and money',async()=>{
  await configure({maxOutstanding:1});const canceled=await a.voice();
  await db.transaction(tx=>finishOutCallCallResource(canceled.requestId,'released',tx));
  await db.execute(sql`UPDATE outcall_call_requests SET status='canceled' WHERE id=${canceled.requestId}`);
  const queued=await b.voice();
  await db.execute(sql`UPDATE outcall_resource_reservations SET expires_at=NOW()-interval '1 second' WHERE id=${queued.reservationId}`);
  assert.equal(await recoverOutCallResources(),1);
  const expired=await db.execute(sql`SELECT status FROM outcall_call_requests WHERE id=${queued.requestId}`);assert.equal(expired.rows[0].status,'canceled');
  const submitted=await a.voice();await beginOutCallSubmission(submitted.reservationId,a.user.currentTenantId,a.user.id,'voice',submitted.requestId);
  await db.execute(sql`UPDATE outcall_call_requests SET status='processing' WHERE id=${submitted.requestId}`);
  await db.execute(sql`UPDATE outcall_resource_reservations SET lease_expires_at=NOW()-interval '1 second',created_at=NOW()-interval '40 days' WHERE id=${submitted.reservationId}`);
  assert.equal(await recoverOutCallResources(),1);assert.equal(await recoverOutCallResources(),0);
  const uncertain=await db.execute(sql`SELECT state FROM outcall_resource_reservations WHERE id=${submitted.reservationId}`);assert.equal(uncertain.rows[0].state,'unknown');
  await assert.rejects(()=>reserve(b),(error:any)=>error.code==='OUTCALL_RESOURCE_LIMIT');
  await db.transaction(tx=>finishOutCallCallResource(submitted.requestId,'spent',tx));
  await db.execute(sql`UPDATE outcall_call_requests SET status='completed' WHERE id=${submitted.requestId}`);
  await reserve(b);
});

test('unreserved legacy in-flight calls block new authority rather than receiving a migration grant',async()=>{
  await configure();const legacy=await a.voice();
  await db.execute(sql`DELETE FROM outcall_resource_reservations WHERE id=${legacy.reservationId}`);
  await assert.rejects(()=>reserve(b),(error:any)=>error.code==='OUTCALL_LEGACY_CALLS_UNRECONCILED');
  await db.execute(sql`UPDATE outcall_call_requests SET status='failed' WHERE id=${legacy.requestId}`);
  await reserve(b);
});

test('resource schema applies repeatedly without granting or changing approval/reservation state',async()=>{
  await configure();await reserve();
  const snapshot=()=>db.execute(sql`SELECT jsonb_agg(to_jsonb(r) ORDER BY id) AS data FROM outcall_resource_reservations r WHERE account_key=${outCallAccountKey()}`);
  const before=(await snapshot()).rows[0];await ensureOutCallResourceTables();await ensureOutCallResourceTables();await verifyOutCallResourceTables();
  assert.deepEqual((await snapshot()).rows[0],before);
});
