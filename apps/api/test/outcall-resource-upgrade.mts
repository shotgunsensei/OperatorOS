import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db,databasePool} from '../src/db.js';
import {applyOperatorOSDatabaseRelease,verifyOperatorOSDatabaseRelease,DATABASE_RELEASE_CONTRACT} from '../src/lib/database-release.js';
const url=new URL(process.env.DATABASE_URL ?? '');
if(process.env.PARITY_DATABASE_IS_DISPOSABLE!=='1' || url.hostname!=='127.0.0.1' || url.pathname!=='/operatoros_outcall_upgrade_oct14_test')throw new Error('Exact task-owned disposable upgrade database required');
const start=await db.execute(sql`SELECT to_regclass('outcall_resource_reservations') AS resource,to_regclass('shared_ai_requests') AS v66`);
assert.equal(start.rows[0].resource,null,'upgrade must start without v67 storage');assert.ok(start.rows[0].v66);
const userId=crypto.randomUUID();const tenantId=crypto.randomUUID();const profileId=crypto.randomUUID();const callId=crypto.randomUUID();
await db.execute(sql`INSERT INTO users (id,email,password_hash,name,role,status,current_tenant_id) VALUES (${userId},${`upgrade-${userId}@example.test`},'synthetic-not-login','Upgrade fixture','user','active',NULL)`);
await db.execute(sql`INSERT INTO tenants (id,name,slug,type,owner_user_id,status) VALUES (${tenantId},'Upgrade fixture',${`upgrade-${tenantId}`},'personal',${userId},'active')`);
await db.execute(sql`UPDATE users SET current_tenant_id=${tenantId} WHERE id=${userId}`);
await db.execute(sql`INSERT INTO tenant_users (tenant_id,user_id,role) VALUES (${tenantId},${userId},'owner')`);
await db.execute(sql`INSERT INTO outcall_profiles (id,tenant_id,user_id,name,message) VALUES (${profileId},${tenantId},${userId},'Preserved profile','Your requested callback is ready.')`);
await db.execute(sql`INSERT INTO outcall_call_requests (id,tenant_id,user_id,profile_id,destination_fingerprint,destination_masked,source,status,provider,idempotency_key,scheduled_at)
  VALUES (${callId},${tenantId},${userId},${profileId},${'e'.repeat(64)},'+12****0101','web','scheduled','disabled',${callId},NOW()+interval '1 day')`);
async function snapshot() {
  const result=await db.execute(sql`SELECT jsonb_build_object(
    'user',(SELECT to_jsonb(u) FROM users u WHERE id=${userId}),
    'tenant',(SELECT to_jsonb(t) FROM tenants t WHERE id=${tenantId}),
    'membership',(SELECT jsonb_agg(to_jsonb(m)) FROM tenant_users m WHERE tenant_id=${tenantId}),
    'profile',(SELECT to_jsonb(p) FROM outcall_profiles p WHERE id=${profileId}),
    'call',(SELECT to_jsonb(c) FROM outcall_call_requests c WHERE id=${callId})) AS data`);
  return result.rows[0].data;
}
const before=await snapshot();const started=Date.now();
await applyOperatorOSDatabaseRelease();assert.deepEqual(await snapshot(),before);
const approvals=await db.execute(sql`SELECT COUNT(*)::int AS count FROM outcall_account_approvals`);assert.equal(Number(approvals.rows[0].count),0,'migration must not grant money authority');
await applyOperatorOSDatabaseRelease();await verifyOperatorOSDatabaseRelease();assert.deepEqual(await snapshot(),before);
assert.equal(DATABASE_RELEASE_CONTRACT.releaseVersion,67);
console.log(JSON.stringify({passed:true,upgrade:'populated v66 -> v67 -> reapply -> verify',unchangedSnapshotSha256:createHash('sha256').update(JSON.stringify(before)).digest('hex'),approvalRows:0,durationMs:Date.now()-started}));
await databasePool.end();
