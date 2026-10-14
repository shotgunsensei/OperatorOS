import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';

type Executor = Pick<typeof db, 'execute'>;
export type OutCallOperation = 'voice' | 'verify_start' | 'verify_check' | 'sms_reply';
export interface OutCallResourcePolicy {
  currency: 'USD'; dailyMicros: number; monthlyMicros: number;
  voiceCeilingMicros: number; verificationCeilingMicros: number; smsCeilingMicros: number;
  dailyVoiceRequests: number; dailyVerificationRequests: number; dailySmsReplies: number;
  maxOutstanding: number; maxCallSeconds: number; maxQueueLatenessSeconds: number;
}
export class OutCallResourceError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 503) {
    super(code === 'OUTCALL_RESOURCE_LIMIT' ? 'OutCall account capacity or budget is exhausted. Try later or contact support.' : 'OutCall requires a current approved account resource policy.');
  }
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function outCallAccountKey(accountSid = process.env.TWILIO_ACCOUNT_SID ?? ''): string {
  if (!/^AC[a-zA-Z0-9]{8,}$/.test(accountSid)) throw new OutCallResourceError('OUTCALL_RESOURCE_POLICY_REQUIRED');
  return digest(`outcall:twilio:${accountSid}`);
}
export function readOutCallResourcePolicy(): OutCallResourcePolicy | null {
  try {
    const value = JSON.parse(process.env.OUTCALL_RESOURCE_POLICY_JSON ?? '') as Record<string, unknown>;
    const names = ['dailyMicros','monthlyMicros','voiceCeilingMicros','verificationCeilingMicros','smsCeilingMicros','dailyVoiceRequests','dailyVerificationRequests','dailySmsReplies','maxOutstanding','maxCallSeconds','maxQueueLatenessSeconds'] as const;
    if (value.currency !== 'USD' || Object.keys(value).length !== names.length + 1) return null;
    for (const name of names) if (!Number.isSafeInteger(value[name]) || Number(value[name]) < 1 || Number(value[name]) > (name.includes('Micros') ? 1e12 : 10000)) return null;
    if (Number(value.maxCallSeconds) > 300 || Number(value.maxQueueLatenessSeconds) > 600
      || Number(value.dailyMicros) > Number(value.monthlyMicros)
      || ['voiceCeilingMicros','verificationCeilingMicros','smsCeilingMicros'].some(name => Number(value[name]) > Number(value.dailyMicros))) return null;
    return Object.fromEntries([['currency','USD'], ...names.map(name => [name,value[name]])]) as unknown as OutCallResourcePolicy;
  } catch { return null; }
}
export const outCallPolicyHash = (policy: OutCallResourcePolicy) => digest(JSON.stringify({
  policy:Object.entries(policy).sort(([left],[right])=>left<right?-1:left>right?1:0),
  countries:[...new Set(String(process.env.TWILIO_ALLOWED_COUNTRIES ?? '').split(',').map(value=>value.trim().toUpperCase()).filter(Boolean))].sort(),
  verifyService:String(process.env.TWILIO_VERIFY_SERVICE_SID ?? ''),
  caller:String(process.env.TWILIO_PHONE_NUMBER ?? ''),
}));
function policy(): OutCallResourcePolicy {
  const value = readOutCallResourcePolicy();
  if (!value) throw new OutCallResourceError('OUTCALL_RESOURCE_POLICY_REQUIRED');
  return value;
}
async function approve(accountKey: string, value: OutCallResourcePolicy, tx: Executor, lock = false): Promise<void> {
  const result = await tx.execute(sql`
    SELECT a.account_key FROM outcall_account_approvals a JOIN users u ON u.id=a.approved_by_user_id
    WHERE a.account_key=${accountKey} AND a.policy_hash=${outCallPolicyHash(value)}
      AND a.revoked_at IS NULL AND a.approved_at<=NOW() AND a.expires_at>NOW()
      AND u.status='active' AND u.platform_role='super_admin'
    ${lock ? sql`FOR UPDATE OF a` : sql``}
  `);
  if (!result.rows[0]) throw new OutCallResourceError('OUTCALL_RESOURCE_APPROVAL_REQUIRED');
}
export async function hasApprovedOutCallResourcePolicy(): Promise<boolean> {
  try { const value=policy(); await approve(outCallAccountKey(),value,db); return true; } catch { return false; }
}
export async function reserveOutCallResource(input: {
  tenantId: string; userId: string; operation: OutCallOperation; idempotencyKey: string; callId?: string; dueAt?: Date;
}, tx: Executor): Promise<string> {
  const value=policy(); const accountKey=outCallAccountKey();
  await approve(accountKey,value,tx,true);
  const requestDigest=digest(JSON.stringify([accountKey,input.tenantId,input.userId,input.operation,input.idempotencyKey]));
  const existing=await tx.execute(sql`SELECT id FROM outcall_resource_reservations WHERE request_digest=${requestDigest}`);
  if(existing.rows[0]) return String(existing.rows[0].id);
  // Old unreserved calls cannot silently escape the new account limit. They
  // require independent reconciliation; migration never invents an allowance.
  const legacy=await tx.execute(sql`SELECT 1 FROM outcall_call_requests c
    WHERE c.provider='twilio' AND c.status IN ('scheduled','processing') AND c.id<>${input.callId ?? ''}
      AND NOT EXISTS (SELECT 1 FROM outcall_resource_reservations r WHERE r.call_request_id=c.id) LIMIT 1`);
  if(legacy.rows[0]) throw new OutCallResourceError('OUTCALL_LEGACY_CALLS_UNRECONCILED');
  const totals=await tx.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE state IN ('queued','submitting','active','unknown'))::int AS outstanding,
      COALESCE(SUM(ceiling_micros) FILTER (WHERE state IN ('queued','submitting','active','unknown') OR (state='spent' AND settled_at>=date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')),0)::text AS daily,
      COALESCE(SUM(ceiling_micros) FILTER (WHERE state IN ('queued','submitting','active','unknown') OR (state='spent' AND settled_at>=date_trunc('month',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')),0)::text AS monthly,
      COUNT(*) FILTER (WHERE operation='voice' AND (state IN ('queued','submitting','active','unknown') OR (state='spent' AND settled_at>=date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')))::int AS voice,
      COUNT(*) FILTER (WHERE operation IN ('verify_start','verify_check') AND (state IN ('queued','submitting','active','unknown') OR (state='spent' AND settled_at>=date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')))::int AS verify,
      COUNT(*) FILTER (WHERE operation='sms_reply' AND (state IN ('queued','submitting','active','unknown') OR (state='spent' AND settled_at>=date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')))::int AS sms
    FROM outcall_resource_reservations WHERE account_key=${accountKey}
      AND (state IN ('queued','submitting','active','unknown') OR (state='spent' AND settled_at>=date_trunc('month',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))
  `);
  const count=totals.rows[0]; const ceiling=input.operation==='voice' ? value.voiceCeilingMicros : input.operation==='sms_reply' ? value.smsCeilingMicros : value.verificationCeilingMicros;
  const quota=input.operation==='voice' ? [count.voice,value.dailyVoiceRequests] : input.operation==='sms_reply' ? [count.sms,value.dailySmsReplies] : [count.verify,value.dailyVerificationRequests];
  if(Number(count.outstanding)>=value.maxOutstanding || Number(quota[0])>=Number(quota[1])
    || BigInt(String(count.daily))+BigInt(ceiling)>BigInt(value.dailyMicros)
    || BigInt(String(count.monthly))+BigInt(ceiling)>BigInt(value.monthlyMicros)) throw new OutCallResourceError('OUTCALL_RESOURCE_LIMIT',429);
  const due=input.dueAt ?? new Date();
  const row=await tx.execute(sql`INSERT INTO outcall_resource_reservations
    (account_key,policy_hash,tenant_id,user_id,call_request_id,operation,request_digest,ceiling_micros,max_call_seconds,due_at,expires_at)
    VALUES (${accountKey},${outCallPolicyHash(value)},${input.tenantId},${input.userId},${input.callId ?? null},${input.operation},${requestDigest},${ceiling},${value.maxCallSeconds},${due},${new Date(due.getTime()+value.maxQueueLatenessSeconds*1000)}) RETURNING id`);
  return String(row.rows[0].id);
}
export async function beginOutCallSubmission(id: string, tenantId: string, userId: string, operation: OutCallOperation, callId?:string): Promise<number> {
  return db.transaction(async tx=>{
    const value=policy();const accountKey=outCallAccountKey(); await approve(accountKey,value,tx,true);
    const result=await tx.execute(sql`UPDATE outcall_resource_reservations SET state='submitting',lease_expires_at=NOW()+interval '120 seconds',updated_at=NOW()
      WHERE id=${id} AND account_key=${accountKey} AND policy_hash=${outCallPolicyHash(value)} AND tenant_id=${tenantId} AND user_id=${userId}
        AND operation=${operation} AND (${operation}<>'voice' OR call_request_id=${callId ?? null})
        AND state='queued' AND due_at<=NOW() AND expires_at>NOW() RETURNING max_call_seconds`);
    if(!result.rows[0]) throw new OutCallResourceError('OUTCALL_RESERVATION_CONFLICT',409);
    return Number(result.rows[0].max_call_seconds);
  });
}
export async function finishOutCallResource(id: string, state: 'active'|'unknown'|'spent'|'released', tx: Executor): Promise<void> {
  // All accounting changes share the same account lock, including callbacks.
  const row=await tx.execute(sql`SELECT account_key FROM outcall_resource_reservations WHERE id=${id}`);
  if(!row.rows[0]) return;
  await tx.execute(sql`SELECT account_key FROM outcall_account_approvals WHERE account_key=${String(row.rows[0].account_key)} FOR UPDATE`);
  await tx.execute(sql`UPDATE outcall_resource_reservations SET state=${state},
    settled_at=CASE WHEN ${state} IN ('spent','released') THEN NOW() ELSE NULL END,
    lease_expires_at=CASE WHEN ${state}='active' THEN NOW()+(max_call_seconds+120)*interval '1 second' ELSE NULL END,updated_at=NOW()
    WHERE id=${id} AND state NOT IN ('spent','released')
      AND (${state}<>'released' OR state='queued')`);
}
export async function finishOutCallCallResource(callId: string, state: 'active'|'unknown'|'spent'|'released', tx: Executor): Promise<void> {
  const result=await tx.execute(sql`SELECT id FROM outcall_resource_reservations WHERE call_request_id=${callId}`);
  if(result.rows[0]) await finishOutCallResource(String(result.rows[0].id),state,tx);
}
export async function clearOutCallResourceOwner(tenantId: string, userId: string, tx: Executor): Promise<void> {
  // Privacy deletion cannot erase monetary holds or silently free a submitted
  // operation. Release only unsent work and retain the account ledger without
  // a user link. Lock accounts in a consistent order before changing totals.
  const accounts = await tx.execute(sql`SELECT DISTINCT account_key FROM outcall_resource_reservations
    WHERE tenant_id=${tenantId} AND user_id=${userId} ORDER BY account_key`);
  for (const account of accounts.rows) {
    await tx.execute(sql`SELECT account_key FROM outcall_account_approvals WHERE account_key=${String(account.account_key)} FOR UPDATE`);
  }
  await tx.execute(sql`UPDATE outcall_resource_reservations SET
    state=CASE WHEN state='queued' THEN 'released' ELSE state END,
    settled_at=CASE WHEN state='queued' THEN NOW() ELSE settled_at END,
    user_id=NULL,updated_at=NOW()
    WHERE tenant_id=${tenantId} AND user_id=${userId}`);
}
export async function outCallCallReservation(callId: string, tenantId: string, userId: string): Promise<string> {
  const result=await db.execute(sql`SELECT id FROM outcall_resource_reservations WHERE call_request_id=${callId} AND tenant_id=${tenantId} AND user_id=${userId} AND operation='voice'`);
  if(!result.rows[0]) throw new OutCallResourceError('OUTCALL_RESERVATION_REQUIRED');
  return String(result.rows[0].id);
}
export async function recoverOutCallResources(): Promise<number> {
  const rows=await db.execute(sql`SELECT id,account_key FROM outcall_resource_reservations
    WHERE (state='queued' AND expires_at<=NOW()) OR (state IN ('submitting','active') AND lease_expires_at<=NOW())
    ORDER BY updated_at LIMIT 50`);
  let recovered=0;
  for(const candidate of rows.rows) {
    const row=await db.transaction(async tx=>{
      await tx.execute(sql`SELECT account_key FROM outcall_account_approvals WHERE account_key=${String(candidate.account_key)} FOR UPDATE`);
      const updated=await tx.execute(sql`UPDATE outcall_resource_reservations SET
        state=CASE WHEN state='queued' THEN 'released' ELSE 'unknown' END,
        settled_at=CASE WHEN state='queued' THEN NOW() ELSE NULL END,
        failure_code=CASE WHEN state='queued' THEN 'OUTCALL_QUEUE_EXPIRED' ELSE 'OUTCALL_PROVIDER_OUTCOME_UNKNOWN' END,
        lease_expires_at=NULL,updated_at=NOW()
        WHERE id=${String(candidate.id)} AND ((state='queued' AND expires_at<=NOW()) OR (state IN ('submitting','active') AND lease_expires_at<=NOW()))
        RETURNING call_request_id,state,failure_code`);
      return updated.rows[0];
    });
    if(!row)continue;
    recovered++;
    if(row.call_request_id) await db.execute(sql`UPDATE outcall_call_requests SET
      status=CASE WHEN ${String(row.state)}='released' THEN 'canceled' ELSE status END,
      failure_code=${String(row.failure_code)},updated_at=NOW(),
      canceled_at=CASE WHEN ${String(row.state)}='released' THEN NOW() ELSE canceled_at END
      WHERE id=${String(row.call_request_id)} AND status IN ('scheduled','processing')`);
  }
  return recovered;
}
