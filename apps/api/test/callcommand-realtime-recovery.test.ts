import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test, {after,afterEach} from 'node:test';
import { sql } from 'drizzle-orm';
import { db, databasePool } from '../src/db.js';
import { createCallCommandSipRouteToken } from '../src/lib/callcommand-realtime.js';
import { createRecoveryFixture, cleanupRecoveryFixture } from './fixtures/callcommand-recovery-fixture.js';
import { acquireCallCommandLane, reconcileCallCommandTerminalUsage } from '../src/lib/callcommand-capacity.js';
import { registerCallCommandRealtimeSideband } from '../src/lib/callcommand-realtime-session-registry.js';
import { stopCallCommandRealtimeRecovery, getCallCommandRealtimeRecoveryStatus } from '../src/lib/callcommand-realtime-recovery.js';

interface Stats { actions: string[]; sockets: number; greetings: number; sentTypes:string[] }
interface Reply { statusCode: number; body: Record<string, unknown>; stats: Stats; registryActive: boolean }
const childPath = fileURLToPath(new URL('./fixtures/callcommand-recovery-worker.ts', import.meta.url));
const keptEnvironment = ['SystemRoot','WINDIR','COMSPEC','ProgramFiles','ProgramFiles(x86)','ProgramW6432','APPDATA','LOCALAPPDATA','USERPROFILE','TEMP','TMP','PATHEXT','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','OS','PATH'];
const explicitTestEnvironment = ['DATABASE_URL','DATABASE_POOL_MAX','DATABASE_POOL_CONNECTION_TIMEOUT_MS','PGOPTIONS','PARITY_DATABASE_IS_DISPOSABLE','SESSION_SECRET','NODE_OPTIONS'];
const webhookBytes = randomBytes(32);
const routeSecret = randomBytes(32).toString('hex');
const evidence: Record<string, unknown> = {
  startedAt: new Date().toISOString(), action: 'New automatic recovery without additional webhook; not the stopped 108-case integration command',
  provider: 'Actual local SDK signature validation; synthetic remote operations and media',
  checkpoints: [], children: [],
};
const checkpoints: Array<Record<string, unknown>> = [];
const childReceipts: Array<Record<string, unknown>> = [];
evidence.checkpoints = checkpoints; evidence.children = childReceipts;
function saveEvidence(){if(process.env.CALLCOMMAND_RECOVERY_EVIDENCE)writeFileSync(process.env.CALLCOMMAND_RECOVERY_EVIDENCE,JSON.stringify(evidence,null,2));}
const pendingChildren = new Set<RecoveryWorker>();

function asReply(value: unknown): Reply {
  assert(value && typeof value === 'object');
  assert('statusCode' in value && typeof value.statusCode === 'number');
  assert('body' in value && value.body && typeof value.body === 'object' && !Array.isArray(value.body));
  assert('registryActive' in value && typeof value.registryActive === 'boolean');
  assert('stats' in value && value.stats && typeof value.stats === 'object');
  const stats = value.stats;
  assert('actions' in stats && Array.isArray(stats.actions) && stats.actions.every(item => typeof item === 'string'));
  assert('sockets' in stats && typeof stats.sockets === 'number');
  assert('greetings' in stats && typeof stats.greetings === 'number');
  assert('sentTypes' in stats && Array.isArray(stats.sentTypes) && stats.sentTypes.every(item=>typeof item==='string'));
  return { statusCode: value.statusCode, body: Object.fromEntries(Object.entries(value.body)), registryActive: value.registryActive, stats: { actions: stats.actions, sockets: stats.sockets, greetings: stats.greetings,sentTypes:stats.sentTypes } };
}

class RecoveryWorker {
  readonly child: ChildProcess;
  readonly marker = randomBytes(16).toString('hex');
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  readonly ready: Promise<void>;
  verified = false;
  readonly observations:string[]=[];
  private serial = 0;
  private readonly waits = new Map<string, { resolve(value: Reply): void; reject(error: Error): void }>();
  private readonly receipt: Record<string, unknown>;
  constructor() {
    const env: NodeJS.ProcessEnv = Object.fromEntries(keptEnvironment.filter(key => process.env[key]).map(key => [key, process.env[key]]));
    for (const key of explicitTestEnvironment) if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, { NODE_ENV: 'test', APP_ENV: 'test', CI: 'true', CALLCOMMAND_RESTART_WORKER_MARKER: this.marker,
      OPENAI_API_KEY: 'sk-restart-synthetic-fixture-not-a-provider-credential', OPENAI_PROJECT_ID: 'proj_restart_fixture_12345678',
      OPENAI_WEBHOOK_SECRET: `whsec_${webhookBytes.toString('base64')}`, CALLCOMMAND_SIP_ROUTE_SECRET: routeSecret, CALLCOMMAND_REALTIME_MODEL: 'gpt-realtime-2.1-mini' });
    this.child = spawn(process.execPath, ['--import','tsx',childPath], { env, windowsHide: true, stdio: ['ignore','pipe','pipe','ipc'] });
    this.receipt = { pid: this.child.pid, marker: this.marker, script: childPath, launchedAt: new Date().toISOString(), inheritedProviderCredentials: false };
    childReceipts.push(this.receipt); pendingChildren.add(this);saveEvidence();
    const output: string[] = [];
    this.child.stdout?.on('data', value => { output.push(String(value)); });
    this.child.stderr?.on('data', value => { output.push(String(value)); });
    this.exited = new Promise(resolve => this.child.once('exit', (code, signal) => {
      Object.assign(this.receipt, { exitedAt: new Date().toISOString(), code, signal, output: output.join('').slice(-4000) });
      pendingChildren.delete(this);saveEvidence();
      for (const waiter of this.waits.values()) waiter.reject(new Error('Owned restart worker exited'));
      this.waits.clear(); resolve({ code, signal });
    }));
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Owned restart worker handshake timed out')), 15000);
      this.child.once('error', error => { clearTimeout(timer); reject(error); });
      this.child.on('message', value => {
        try {
          assert(value && typeof value === 'object' && 'type' in value);
          if (value.type === 'ready') {
            assert('pid' in value && value.pid === this.child.pid && 'marker' in value && value.marker === this.marker);
            this.verified = true; this.receipt.identityVerified = true;saveEvidence(); clearTimeout(timer); resolve();
          } else if(value.type==='observer'){
            assert('name'in value && typeof value.name==='string');this.observations.push(value.name);
          } else if (value.type === 'result') {
            assert('id' in value && typeof value.id === 'string');
            const waiting = this.waits.get(value.id); assert(waiting);
            this.waits.delete(value.id); waiting.resolve(asReply(value));
          } else throw new Error('Restart worker reported failure');
        } catch (error) { clearTimeout(timer); reject(error); for (const waiter of this.waits.values()) waiter.reject(error instanceof Error ? error : new Error('Invalid restart message')); }
      });
    });
  }
  async request(input: Record<string, unknown>): Promise<Reply> {
    await this.ready; assert(this.verified && this.child.connected && this.child.exitCode === null && this.child.signalCode === null);
    const id = `${this.marker}:${++this.serial}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waits.delete(id); reject(new Error('Owned restart command timed out')); }, 15000);
      this.waits.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      this.child.send({ ...input, id });
    });
  }
  async killAbruptly() {
    await this.ready;
    assert(this.verified && this.child.pid === this.receipt.pid && this.child.exitCode === null && this.child.signalCode === null);
    assert(this.child.kill('SIGKILL'), 'Only the identity-verified child created by this harness may be terminated');
    this.receipt.requestedTermination = 'SIGKILL';
    const result = await this.exited;
    assert(result.signal === 'SIGKILL' || result.code !== 0);
    return result;
  }
  async stop() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) { await this.exited; return; }
    await this.request({ type: 'stop' }); await this.exited;
  }
}

function envelope(input: { callId: string; providerSid: string }, eventId: string, openAiCallId: string) {
  const routeToken = createCallCommandSipRouteToken({ internalCallId: input.callId, providerCallSid: input.providerSid, routeSecret });
  return JSON.stringify({ id: eventId, type: 'realtime.call.incoming', created_at: Math.floor(Date.now()/1000), data: { call_id: openAiCallId,
    sip_headers: [{ name: 'X-CallCommand-Call-ID', value: input.callId }, { name: 'X-CallCommand-Route-Token', value: routeToken }] } });
}
function signed(rawBody: string, eventId: string) {
  const timestamp = String(Math.floor(Date.now()/1000));
  const signature = createHmac('sha256', webhookBytes).update(`${eventId}.${timestamp}.${rawBody}`).digest('base64');
  return { 'webhook-id': eventId, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` };
}


type Fixture=Awaited<ReturnType<typeof createRecoveryFixture>>;
const fixtures:Fixture[]=[];
async function fixture(){const f=await createRecoveryFixture();fixtures.push(f);return f;}
async function worker(){const w=new RecoveryWorker();await w.ready;return w;}
async function incoming(w:RecoveryWorker,f:Fixture,eventId=`evt_recovery_${randomBytes(8).toString('hex')}`,openAiCallId=`call_recovery_${randomBytes(8).toString('hex')}`){
  const rawBody=envelope(f,eventId,openAiCallId);
  const r=await w.request({type:'inject',callId:f.callId,rawBody,headers:signed(rawBody,eventId)});
  return {r,eventId,openAiCallId,rawBody};
}
async function receipt(f:Fixture,eventId:string){return (await db.execute(sql`SELECT * FROM callcommand_ingestion_events WHERE tenant_id=${f.tenantId} AND source='openai_realtime' AND provider_event_id=${eventId}`)).rows[0];}
async function until(check:()=>Promise<boolean>,message:string,timeout=45000){const deadline=Date.now()+timeout;while(!await check()){assert(Date.now()<deadline,message);await new Promise<void>(resolve=>setTimeout(resolve,200));}}
const cleanupReceipts:Array<Record<string,unknown>>=[];evidence.cleanups=cleanupReceipts;
afterEach(async context=>{
  for(const w of [...pendingChildren]){
    if(w.verified){try{await w.request({type:'release'});await w.stop();}catch{if(w.child.exitCode===null && w.child.signalCode===null)await w.killAbruptly();}}
    else assert.fail('Unverified owned child needs explicit identity diagnosis');
  }
  const cleanup=[];
  for(const f of fixtures.reverse()){const residual=await cleanupRecoveryFixture(f);assert(Object.values(residual).every(v=>v===0));cleanup.push(residual);}
  fixtures.length=0;cleanupReceipts.push({name:context.name,residual:cleanup});saveEvidence();
});
after(async()=>{await databasePool.end();evidence.finishedAt=new Date().toISOString();evidence.poolClosed=true;
  if(process.env.CALLCOMMAND_RECOVERY_EVIDENCE)writeFileSync(process.env.CALLCOMMAND_RECOVERY_EVIDENCE,JSON.stringify(evidence,null,2));
});

test('automatic cycle reattaches an actually killed process after real lease expiry with no new webhook', {timeout:90000},async()=>{
  const f=await fixture(),first=await worker(),event=await incoming(first,f);
  assert.equal(event.r.statusCode,200,JSON.stringify(event.r));assert.equal(event.r.stats.greetings,1);assert.deepEqual(event.r.stats.actions,['accept']);
  const original=await receipt(f,event.eventId);assert.equal(original.status,'sideband_connected');
  await first.killAbruptly();
  const second=await worker();await second.request({type:'start'});
  const early=await second.request({type:'status',callId:f.callId});assert.equal(early.registryActive,false);assert.equal(early.stats.sockets,0);
  await until(async()=>{const current=await receipt(f,event.eventId);return current.status==='sideband_connected' && current.processing_owner!==original.processing_owner;},'automatic recovery after actual processing lease expiry');
  const recovered=await second.request({type:'status',callId:f.callId});
  assert.equal(recovered.registryActive,true);assert.equal(recovered.stats.sockets,1);assert.equal(recovered.stats.greetings,0);assert.deepEqual(recovered.stats.actions,[]);
  const budget=(await db.execute(sql`SELECT attempts FROM callcommand_ingestion_events WHERE tenant_id=${f.tenantId} AND source='openai_realtime_recovery' AND call_id=${f.callId}`)).rows[0];assert.equal(budget.attempts,1);
  checkpoints.push({name:'Actual OS death, real expiry, automatic background recovery without incoming replay',status:'pass',newWebhookDeliveries:0,repeatAccepts:0,repeatGreetings:0});
});

async function expireReceipt(f:Fixture,eventId:string){await db.execute(sql`UPDATE callcommand_ingestion_events
  SET processing_lease_expires_at=clock_timestamp()-INTERVAL '1 second' WHERE tenant_id=${f.tenantId} AND source='openai_realtime' AND provider_event_id=${eventId}`);}
async function replay(w:RecoveryWorker,f:Fixture,event:{eventId:string;rawBody:string}){return w.request({type:'inject',callId:f.callId,rawBody:event.rawBody,headers:signed(event.rawBody,event.eventId)});}
async function state(f:Fixture){return (await db.execute(sql`SELECT c.status,c.realtime_status,c.realtime_error_code,c.ai_input_tokens,c.ai_output_tokens,c.transcript,c.summary,l.status lease_status,
  (SELECT count(*)::int FROM callcommand_events e WHERE e.tenant_id=c.tenant_id AND e.call_id=c.id) event_count,
  (SELECT count(*)::int FROM callcommand_usage_events u WHERE u.tenant_id=c.tenant_id AND u.call_id=c.id) usage_count
  FROM callcommand_calls c JOIN callcommand_lane_leases l ON l.tenant_id=c.tenant_id AND l.id=c.capacity_lease_id
  WHERE c.tenant_id=${f.tenantId} AND c.id=${f.callId}`)).rows[0];}

test('two independent contenders attach once and delayed old callbacks cannot mutate the replacement',{timeout:60000},async()=>{
  const f=await fixture(),old=await worker(),left=await worker(),right=await worker(),event=await incoming(old,f);
  assert.equal(event.r.statusCode,200);await expireReceipt(f,event.eventId);
  const contenders=await Promise.all([left.request({type:'cycle'}),right.request({type:'cycle'})]);
  assert.equal(contenders.reduce((n,r)=>n+Number(r.body.attached),0),1);
  assert.equal(contenders.reduce((n,r)=>n+r.stats.sockets,0),1);
  const before=await state(f),ownerBefore=(await receipt(f,event.eventId)).processing_owner;
  for(const kind of ['usage','transcript','error','tool','closed']){
    const r=await old.request({type:'invoke',kind,callId:f.callId,openAiCallId:event.openAiCallId});
    assert.equal(r.statusCode,kind==='closed'?200:409);assert.deepEqual(r.stats.actions,['accept']);
  }
  assert.deepEqual(await state(f),before);assert.equal((await receipt(f,event.eventId)).processing_owner,ownerBefore);
  checkpoints.push({name:'Independent claim race and stale usage/transcript/error/tool/close fenced atomically',status:'pass'});
});

test('an already-reserved control effect may finish after handover but cannot be repeated or free replacement capacity',{timeout:60000},async()=>{
  const f=await fixture(),old=await worker(),next=await worker(),event=await incoming(old,f);assert.equal(event.r.statusCode,200);
  await old.request({type:'configure',holdHangup:true});
  await old.request({type:'emitTool',callId:f.callId,openAiCallId:event.openAiCallId});
  await until(async()=>old.observations.includes('hangup_waiting'),'synthetic provider gate',10000);
  await expireReceipt(f,event.eventId);const attached=await next.request({type:'cycle'});assert.equal(attached.body.attached,1);
  const duplicate=await next.request({type:'invoke',kind:'tool',callId:f.callId,openAiCallId:event.openAiCallId});
  assert.equal(duplicate.statusCode,200);assert(duplicate.body.result && typeof duplicate.body.result==='object' && 'duplicate'in duplicate.body.result && duplicate.body.result.duplicate===true);
  assert.deepEqual(duplicate.stats.actions,[]);
  await old.request({type:'release'});
  await until(async()=>{const row=(await db.execute(sql`SELECT status FROM callcommand_action_runs WHERE tenant_id=${f.tenantId} AND call_id=${f.callId} AND action_type='end_call'`)).rows[0];return row?.status==='failed';},'stable effect receipt after handover');
  await until(async()=>!(await old.request({type:'status',callId:f.callId})).registryActive,'stale controller closes without model continuation');
  const ended=await old.request({type:'status',callId:f.callId});
  assert.deepEqual(ended.stats.actions,['accept','hangup']);
  assert.equal(ended.stats.greetings,1);assert(!ended.stats.sentTypes.includes('conversation.item.create'));
  const current=await state(f);assert.equal(current.status,'in_progress');assert.equal(current.lease_status,'active');
  const reserved=(await db.execute(sql`SELECT status,safe_result FROM callcommand_action_runs WHERE tenant_id=${f.tenantId} AND call_id=${f.callId} AND action_type='end_call'`)).rows;
  assert.equal(reserved.length,1);assert.equal((reserved[0].safe_result as Record<string,unknown>).providerActionConfirmed,true);
  assert.equal((reserved[0].safe_result as Record<string,unknown>).outcomeUnknown,true);
  checkpoints.push({name:'Stable in-flight effect reservation survives handover without repeated hangup or stale lane release',status:'pass'});
});

test('same-owner terminal tool succeeds once through the actual sideband controller',{timeout:45000},async()=>{
  const f=await fixture(),w=await worker(),event=await incoming(w,f);assert.equal(event.r.statusCode,200);
  await w.request({type:'emitTool',callId:f.callId,openAiCallId:event.openAiCallId});
  await until(async()=>(await state(f)).status==='completed','same-owner terminal mutation');
  await until(async()=>(await w.request({type:'status'})).stats.sentTypes.includes('conversation.item.create'),'successful tool receipt sent');
  const snapshot=await state(f),result=await w.request({type:'status'});assert.equal(snapshot.lease_status,'released');assert.deepEqual(result.stats.actions,['accept','hangup']);
  const action=(await db.execute(sql`SELECT status,safe_result FROM callcommand_action_runs WHERE tenant_id=${f.tenantId} AND call_id=${f.callId} AND action_type='end_call'`)).rows[0];
  assert.equal(action.status,'completed');assert.equal((action.safe_result as Record<string,unknown>).providerActionConfirmed,true);
  checkpoints.push({name:'Successful same-owner end remains completed with one hangup and ordinary tool output',status:'pass'});
});

test('failed opens retain unknown call state and durable retry budget survives signed replay and exhaustion',{timeout:60000},async()=>{
  const f=await fixture(),first=await worker(),bad=await worker(),event=await incoming(first,f);assert.equal(event.r.statusCode,200);await first.stop();
  await bad.request({type:'configure',failOpen:true});
  const fail=await bad.request({type:'cycle'});assert.equal(fail.body.failed,1);assert.equal(fail.stats.sockets,1);assert.deepEqual(fail.stats.actions,[]);
  let snapshot=await state(f);assert.equal(snapshot.status,'in_progress');assert.equal(snapshot.lease_status,'active');
  const immediate=await bad.request({type:'cycle'});assert.equal(immediate.body.examined,0);assert.equal(immediate.stats.sockets,1);
  await expireReceipt(f,event.eventId);const signedFailure=await replay(bad,f,event);assert.equal(signedFailure.statusCode,503);assert.deepEqual(signedFailure.stats.actions,[]);
  let budget=(await db.execute(sql`SELECT attempts FROM callcommand_ingestion_events WHERE tenant_id=${f.tenantId} AND source='openai_realtime_recovery'`)).rows[0];assert.equal(budget.attempts,1);
  for(let index=0;index<2;index++){await expireReceipt(f,event.eventId);const r=await bad.request({type:'cycle'});assert.equal(r.body.failed,1);}
  budget=(await db.execute(sql`SELECT attempts FROM callcommand_ingestion_events WHERE tenant_id=${f.tenantId} AND source='openai_realtime_recovery'`)).rows[0];assert.equal(budget.attempts,3);
  await expireReceipt(f,event.eventId);const exhausted=await bad.request({type:'cycle'});assert.equal(exhausted.body.examined,0);assert.equal(exhausted.stats.sockets,4);
  snapshot=await state(f);assert.equal(snapshot.realtime_error_code,'CALLCOMMAND_REALTIME_RECOVERY_EXHAUSTED');assert.equal(snapshot.status,'in_progress');assert.equal(snapshot.lease_status,'active');
  await bad.request({type:'configure'});await expireReceipt(f,event.eventId);const explicit=await replay(bad,f,event);assert.equal(explicit.statusCode,200);assert.equal(explicit.stats.greetings,0);assert.deepEqual(explicit.stats.actions,[]);
  budget=(await db.execute(sql`SELECT attempts FROM callcommand_ingestion_events WHERE tenant_id=${f.tenantId} AND source='openai_realtime_recovery'`)).rows[0];assert.equal(budget.attempts,3);
  checkpoints.push({name:'Failed open/local close never infers terminal; three durable automatic attempts/backoff are not reset by signed replay',status:'pass'});
});

test('unknown accept cannot be promoted by a failed signed reattach into automatic recovery',{timeout:45000},async()=>{
  const f=await fixture(),w=await worker();await w.request({type:'configure',acceptFailure:true});
  const event=await incoming(w,f);assert.equal(event.r.statusCode,503);assert.deepEqual(event.r.stats.actions,['accept']);
  assert.equal((await receipt(f,event.eventId)).status,'accepting');
  await w.request({type:'configure',failOpen:true});await expireReceipt(f,event.eventId);
  const failed=await replay(w,f,event);assert.equal(failed.statusCode,503);assert.equal((await receipt(f,event.eventId)).status,'accepting');
  await expireReceipt(f,event.eventId);const scan=await w.request({type:'cycle'});assert.equal(scan.body.examined,0);assert.equal(scan.stats.sockets,1);assert.deepEqual(scan.stats.actions,['accept']);
  const proofs=(await db.execute(sql`SELECT count(*)::int count FROM callcommand_ingestion_events WHERE tenant_id=${f.tenantId} AND source IN ('openai_realtime_proof','openai_realtime_recovery')`)).rows[0];assert.equal(proofs.count,0);
  const snapshot=await state(f);assert.equal(snapshot.status,'ringing');assert.equal(snapshot.lease_status,'active');
  checkpoints.push({name:'Unknown accept plus failed signed pre-open reattach never manufactures confirmation or repeats accept',status:'pass'});
});

test('revoked candidates back off without starving an eligible tenant and corrupt foreign proof is rejected',{timeout:60000},async()=>{
  const a=await fixture(),b=await fixture(),c=await fixture(),owner=await worker(),scanner=await worker();
  const ea=await incoming(owner,a),eb=await incoming(owner,b),ec=await incoming(owner,c);assert.equal(ec.r.statusCode,200);await owner.stop();
  // Shutdown drains controllers concurrently; define candidate order explicitly
  // rather than assuming completion order of independent receipt transactions.
  for(const [index,f] of [a,b,c].entries())await db.execute(sql`UPDATE callcommand_ingestion_events
    SET processing_lease_expires_at=clock_timestamp()-INTERVAL '100 seconds'+make_interval(secs=>${index})
    WHERE tenant_id=${f.tenantId} AND source='openai_realtime'`);
  for(const f of [a,b])await db.execute(sql`UPDATE tenant_modules SET status='disabled' WHERE tenant_id=${f.tenantId} AND module_id=${f.moduleId}`);
  const skipped=await scanner.request({type:'cycle'});assert.equal(skipped.body.examined,2);assert.equal(skipped.body.attached,0);
  const accepted=await scanner.request({type:'cycle'});assert.equal(accepted.body.attached,1);assert.equal(accepted.stats.sockets,1);assert.deepEqual(accepted.stats.actions,[]);
  assert.equal((await receipt(a,ea.eventId)).error_code,'CALLCOMMAND_REALTIME_RECOVERY_INELIGIBLE');assert.equal((await receipt(b,eb.eventId)).error_code,'CALLCOMMAND_REALTIME_RECOVERY_INELIGIBLE');
  const corrupt=await fixture(),corruptOwner=await worker(),ed=await incoming(corruptOwner,corrupt);assert.equal(ed.r.statusCode,200);await corruptOwner.stop();
  await db.execute(sql`UPDATE callcommand_ingestion_events SET payload_sha256=(SELECT payload_sha256 FROM callcommand_ingestion_events WHERE tenant_id=${c.tenantId} AND source='openai_realtime_proof')
    WHERE tenant_id=${corrupt.tenantId} AND source='openai_realtime_proof'`);
  const reject=await scanner.request({type:'cycle'});assert.equal(reject.body.attached,0);assert.equal(reject.stats.sockets,1);
  checkpoints.push({name:'Revoked candidate fairness and exact tenant/call/provider/generation proof binding',status:'pass'});
});

async function siblingCall(f:Fixture){return String((await db.execute(sql`INSERT INTO callcommand_calls(tenant_id,created_by_user_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,direction,purpose,provider,provider_call_sid,status,idempotency_key,started_at)
  SELECT tenant_id,created_by_user_id,channel_id,profile_id,phone_fingerprint,phone_masked,phone_e164,'inbound',purpose,'twilio',${`CA${randomBytes(16).toString('hex')}`},'ringing',${randomUUID()},NOW()
  FROM callcommand_calls WHERE tenant_id=${f.tenantId} AND id=${f.callId} RETURNING id`)).rows[0].id);}

test('expired unresolved lane stays reserved without renewal, spare capacity works, and authoritative terminal clears the hold',{timeout:45000},async()=>{
  const f=await fixture(),w=await worker(),scan=await worker(),event=await incoming(w,f);assert.equal(event.r.statusCode,200);await w.stop();
  await db.execute(sql`UPDATE callcommand_lane_leases SET expires_at=acquired_at+INTERVAL '1 microsecond' WHERE tenant_id=${f.tenantId} AND call_id=${f.callId}`);
  const before=(await db.execute(sql`SELECT id,expires_at::text expiry,EXTRACT(EPOCH FROM acquired_at)::text generation FROM callcommand_lane_leases WHERE tenant_id=${f.tenantId} AND call_id=${f.callId}`)).rows[0];
  const recovery=await scan.request({type:'cycle'});assert.equal(recovery.body.examined,0);assert.equal(recovery.stats.sockets,0);
  const nextCall=await siblingCall(f),same=await acquireCallCommandLane({tenantId:f.tenantId,callId:f.callId,idempotencyKey:'same-expired'});
  assert.equal(same.admitted,false);assert.equal(same.code,'CALLCOMMAND_RECONCILIATION_REQUIRED');
  const denied=await acquireCallCommandLane({tenantId:f.tenantId,callId:nextCall,idempotencyKey:'next-base'});assert.equal(denied.admitted,false);assert.equal(denied.code,'CALLCOMMAND_RECONCILIATION_REQUIRED');
  await db.execute(sql`INSERT INTO callcommand_capacity_entitlements(tenant_id,base_lanes) VALUES(${f.tenantId},2)`);
  const spare=await acquireCallCommandLane({tenantId:f.tenantId,callId:nextCall,idempotencyKey:'next-spare'});assert.equal(spare.admitted,true);assert.equal(spare.lease.lane_number,2);
  const unchanged=(await db.execute(sql`SELECT status,expires_at::text expiry,EXTRACT(EPOCH FROM acquired_at)::text generation FROM callcommand_lane_leases WHERE tenant_id=${f.tenantId} AND id=${before.id}`)).rows[0];
  assert.equal(unchanged.status,'active');assert.equal(unchanged.expiry,before.expiry);assert.equal(unchanged.generation,before.generation);
  await reconcileCallCommandTerminalUsage({tenantId:f.tenantId,callId:f.callId,terminalEventId:'synthetic-terminal-hold',providerOutcome:'completed',providerSequence:1,
    usage:{startedAt:f.startedAt,answeredAt:f.startedAt,endedAt:new Date().toISOString(),providerCostMinor:0,aiInputTokens:0,aiOutputTokens:0,aiInputMinorPerMillion:0,aiOutputMinorPerMillion:0}});
  const last=await siblingCall(f),admitted=await acquireCallCommandLane({tenantId:f.tenantId,callId:last,idempotencyKey:'after-authoritative-terminal'});assert.equal(admitted.admitted,true);assert.equal(admitted.lease.lane_number,1);
  await expireReceipt(f,event.eventId);const ended=await scan.request({type:'cycle'});assert.equal(ended.body.examined,0);
  checkpoints.push({name:'Unknown expired capacity never reused/revived; spare lane preserved; actual terminal domain clears hold',status:'pass'});
});

test('late opening original socket cannot greet or overwrite a replacement owner',{timeout:45000},async()=>{
  const f=await fixture(),old=await worker(),next=await worker();await old.request({type:'configure',holdOpen:true});
  const pending=incoming(old,f);await until(async()=>old.observations.includes('open_waiting'),'initial socket open gate',10000);
  const original=(await db.execute(sql`SELECT provider_event_id FROM callcommand_ingestion_events WHERE tenant_id=${f.tenantId} AND source='openai_realtime'`)).rows[0];
  await expireReceipt(f,String(original.provider_event_id));const replacement=await next.request({type:'cycle'});assert.equal(replacement.body.attached,1);assert.equal(replacement.stats.greetings,0);
  const before=await state(f),owner=(await receipt(f,String(original.provider_event_id))).processing_owner;
  await old.request({type:'release'});const late=await pending;assert.equal(late.r.statusCode,409);assert.equal(late.r.stats.greetings,0);assert.deepEqual(late.r.stats.actions,['accept']);
  assert.deepEqual(await state(f),before);assert.equal((await receipt(f,String(original.provider_event_id))).processing_owner,owner);
  checkpoints.push({name:'Post-open fenced greeting reservation prevents stale initial socket greeting/overwrite',status:'pass'});
});

test('same-row capacity generation change is not inherited by recovery or old callbacks',{timeout:45000},async()=>{
  const f=await fixture(),old=await worker(),next=await worker(),event=await incoming(old,f);assert.equal(event.r.statusCode,200);
  await expireReceipt(f,event.eventId);await db.execute(sql`UPDATE callcommand_lane_leases SET acquired_at=clock_timestamp(),expires_at=clock_timestamp()+INTERVAL '10 minutes' WHERE tenant_id=${f.tenantId} AND call_id=${f.callId}`);
  const scan=await next.request({type:'cycle'});assert.equal(scan.body.examined,0);assert.equal(scan.stats.sockets,0);
  const before=await state(f);for(const kind of ['usage','tool','error'])assert.equal((await old.request({type:'invoke',kind,callId:f.callId,openAiCallId:event.openAiCallId})).statusCode,409);
  assert.deepEqual(await state(f),before);
  checkpoints.push({name:'Exact server-side microsecond capacity generation rejects same-row reassignment',status:'pass'});
});

test('signed replay uses database lease time even when the contender application clock is ahead',{timeout:45000},async()=>{
  const f=await fixture(),current=await worker(),ahead=await worker(),event=await incoming(current,f);assert.equal(event.r.statusCode,200);
  const original=await receipt(f,event.eventId);await ahead.request({type:'configure',clockSkewSeconds:60});
  const duplicate=await replay(ahead,f,event);assert.equal(duplicate.statusCode,200);assert.equal(duplicate.body.duplicate,true);
  assert.equal(duplicate.stats.sockets,0);assert.deepEqual(duplicate.stats.actions,[]);assert.equal((await receipt(f,event.eventId)).processing_owner,original.processing_owner);
  checkpoints.push({name:'Database clock and exact lease precision fence a future lease despite contender clock skew',status:'pass'});
});

test('shutdown drains an already-closed controller and its later queued callback before acknowledging pool closure',{timeout:45000},async()=>{
  const f=await fixture(),w=await worker(),event=await incoming(w,f);assert.equal(event.r.statusCode,200);
  let release=()=>{},locked=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<void>(resolve=>{locked=resolve;});
  const holder=db.transaction(async tx=>{await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`callcommand-capacity:${f.tenantId}`},0))`);locked();await gate;});
  await ready;
  try{
    await w.request({type:'closeAndLateCallback',callId:f.callId,openAiCallId:event.openAiCallId});
    let stopped=false;const pending=w.stop().then(()=>{stopped=true;});
    await new Promise<void>(resolve=>setTimeout(resolve,250));assert.equal(stopped,false);
    release();await holder;await pending;
  }finally{release();await holder;}
  const logged=(await db.execute(sql`SELECT count(*)::int count FROM callcommand_events WHERE tenant_id=${f.tenantId} AND call_id=${f.callId}
    AND event_type='provider.openai_realtime.callback_failed' AND safe_payload->>'callback'='onClosed'`)).rows[0];
  assert.equal(logged.count,1);
  checkpoints.push({name:'Closed controller remains drain-tracked through blocked and dynamically queued late callback before child pool-close',status:'pass'});
});

test('shutdown reports finite incomplete drainage and retains pending work for honest later completion',{timeout:45000},async()=>{
  let release:()=>void=()=>{};const pending=new Promise<void>(resolve=>{release=resolve;});
  const unregister=registerCallCommandRealtimeSideband('synthetic-drain-fixture',{close(){},drain:()=>pending});
  unregister(); // Closed/removed from active routing while its callback remains held.
  const began=Date.now();await assert.rejects(stopCallCommandRealtimeRecovery(),(error:unknown)=>Boolean(error && typeof error==='object' && 'code'in error && error.code==='CALLCOMMAND_REALTIME_DRAIN_INCOMPLETE'));
  assert(Date.now()-began>=29000);assert.equal(getCallCommandRealtimeRecoveryStatus().stopping,true);
  release();await stopCallCommandRealtimeRecovery();assert.equal(getCallCommandRealtimeRecoveryStatus().stopping,false);
  checkpoints.push({name:'30-second drain bound reports incomplete, retains pending work and prevents premature pool-close acknowledgement',status:'pass'});
});
