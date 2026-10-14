import { sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { outCallAccountKey, outCallPolicyHash, reserveOutCallResource, type OutCallResourcePolicy } from '../src/lib/outcall-resources.js';
import { createTestUser, ensureSchemaReady, cleanupUser } from './_setup.js';

// Synthetic ceilings only: this file cannot grant an allowance outside the
// explicit disposable loopback database and never ships with production code.
export const SYNTHETIC_OUTCALL_POLICY:OutCallResourcePolicy={currency:'USD',dailyMicros:10_000_000,monthlyMicros:100_000_000,voiceCeilingMicros:10_000,verificationCeilingMicros:5_000,smsCeilingMicros:1_000,dailyVoiceRequests:100,dailyVerificationRequests:100,dailySmsReplies:100,maxOutstanding:200,maxCallSeconds:120,maxQueueLatenessSeconds:300};
export async function createOutCallResourceFixture() {
  const url=new URL(process.env.DATABASE_URL ?? '');
  if(process.env.PARITY_DATABASE_IS_DISPOSABLE!=='1' || !['127.0.0.1','localhost','::1'].includes(url.hostname) || !url.pathname.endsWith('_test'))throw new Error('Disposable loopback test database required');
  await ensureSchemaReady();
  const user=await createTestUser();
  await db.execute(sql`UPDATE users SET platform_role='super_admin' WHERE id=${user.id}`);
  const profile=await db.execute(sql`INSERT INTO outcall_profiles (tenant_id,user_id,name,message) VALUES (${user.currentTenantId},${user.id},'Synthetic provider profile','Your requested callback is ready.') RETURNING id`);
  const accountKeys=new Set<string>();
  return {
    user,
    async approve(value=SYNTHETIC_OUTCALL_POLICY) {
      const key=outCallAccountKey();accountKeys.add(key);
      await db.execute(sql`INSERT INTO outcall_account_approvals (account_key,policy_hash,approval_reference,approved_by_user_id,approved_at,expires_at)
        VALUES (${key},${outCallPolicyHash(value)},'isolated-test-only',${user.id},NOW(),NOW()+interval '1 day')
        ON CONFLICT (account_key) DO UPDATE SET policy_hash=EXCLUDED.policy_hash,approved_by_user_id=EXCLUDED.approved_by_user_id,revoked_at=NULL,approved_at=NOW(),expires_at=NOW()+interval '1 day'`);
    },
    context() {return {tenantId:user.currentTenantId,userId:user.id,idempotencyKey:crypto.randomUUID()};},
    async voice() {
      return db.transaction(async tx=>{
        const id=crypto.randomUUID();
        await tx.execute(sql`INSERT INTO outcall_call_requests (id,tenant_id,user_id,profile_id,destination_fingerprint,destination_masked,source,status,provider,idempotency_key,scheduled_at)
          VALUES (${id},${user.currentTenantId},${user.id},${String(profile.rows[0].id)},${'f'.repeat(64)},'+12****0101','web','scheduled','twilio',${id},NOW())`);
        const reservationId=await reserveOutCallResource({tenantId:user.currentTenantId,userId:user.id,operation:'voice',idempotencyKey:id,callId:id},tx);
        return {requestId:id,reservationId,tenantId:user.currentTenantId,userId:user.id,destination:'+12025550101',message:'Your requested callback is ready.',voice:'alice',language:'en-US'};
      });
    },
    async cleanup() {
      for(const key of accountKeys) {
        await db.execute(sql`DELETE FROM outcall_resource_reservations WHERE account_key=${key}`);
        await db.execute(sql`DELETE FROM outcall_account_approvals WHERE account_key=${key}`);
      }
      await db.execute(sql`DELETE FROM outcall_call_requests WHERE user_id=${user.id}`);
      await db.execute(sql`DELETE FROM outcall_profiles WHERE user_id=${user.id}`);
      await cleanupUser(user.id);
    },
  };
}
