import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { sql } from 'drizzle-orm';
import { db, databasePool } from '../src/db.js';
import { createCallCommandSipRouteToken } from '../src/lib/callcommand-realtime.js';
import { createRestartFixture, cleanupRestartFixture } from './fixtures/callcommand-restart-fixture.js';

interface Stats { actions: string[]; sockets: number; greetings: number }
interface Reply { statusCode: number; body: Record<string, unknown>; stats: Stats; registryActive: boolean }
const childPath = fileURLToPath(new URL('./fixtures/callcommand-restart-worker.ts', import.meta.url));
const keptEnvironment = ['SystemRoot','WINDIR','COMSPEC','ProgramFiles','ProgramFiles(x86)','ProgramW6432','APPDATA','LOCALAPPDATA','USERPROFILE','TEMP','TMP','PATHEXT','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','OS','PATH'];
const explicitTestEnvironment = ['DATABASE_URL','DATABASE_POOL_MAX','DATABASE_POOL_CONNECTION_TIMEOUT_MS','PGOPTIONS','PARITY_DATABASE_IS_DISPOSABLE','SESSION_SECRET','NODE_OPTIONS'];
const webhookBytes = randomBytes(32);
const routeSecret = randomBytes(32).toString('hex');
const evidence: Record<string, unknown> = {
  startedAt: new Date().toISOString(), action: 'New single-process-death/restart journey; not the stopped 108-case integration command',
  provider: 'Actual local SDK signature validation; synthetic remote operations and media',
  checkpoints: [], children: [],
};
const checkpoints: Array<Record<string, unknown>> = [];
const childReceipts: Array<Record<string, unknown>> = [];
evidence.checkpoints = checkpoints; evidence.children = childReceipts;
const pendingChildren = new Set<RestartWorker>();

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
  return { statusCode: value.statusCode, body: Object.fromEntries(Object.entries(value.body)), registryActive: value.registryActive, stats: { actions: stats.actions, sockets: stats.sockets, greetings: stats.greetings } };
}

class RestartWorker {
  readonly child: ChildProcess;
  readonly marker = randomBytes(16).toString('hex');
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  readonly ready: Promise<void>;
  verified = false;
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
    childReceipts.push(this.receipt); pendingChildren.add(this);
    const output: string[] = [];
    this.child.stdout?.on('data', value => { output.push(String(value)); });
    this.child.stderr?.on('data', value => { output.push(String(value)); });
    this.exited = new Promise(resolve => this.child.once('exit', (code, signal) => {
      Object.assign(this.receipt, { exitedAt: new Date().toISOString(), code, signal, output: output.join('').slice(-4000) });
      pendingChildren.delete(this);
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
            this.verified = true; this.receipt.identityVerified = true; clearTimeout(timer); resolve();
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

test('actual killed sideband process recovers only through a signed replay after its real lease expires', { timeout: 120000 }, async () => {
  let fixture: Awaited<ReturnType<typeof createRestartFixture>> | undefined;
  try {
    fixture = await createRestartFixture();
    const eventId = `evt_restart_${randomBytes(8).toString('hex')}`, openAiCallId = `call_restart_${randomBytes(8).toString('hex')}`;
    const rawBody = envelope(fixture, eventId, openAiCallId);
    const inject = (worker: RestartWorker, body = rawBody, headers = signed(body,eventId)) => worker.request({ type: 'inject', callId: fixture!.callId, rawBody: body, headers });
    const first = new RestartWorker(); await first.ready;
    const forged = await inject(first, rawBody, { ...signed(rawBody,eventId), 'webhook-signature': 'v1,invalid' });
    assert.equal(forged.statusCode,401); assert.equal(forged.stats.actions.length,0); assert.equal(forged.stats.sockets,0);
    checkpoints.push({ name: 'Actual SDK signature rejects forgery before provider action', status: 'pass' });
    const accepted = await inject(first);
    assert.equal(accepted.statusCode,200,JSON.stringify(accepted)); assert.equal(accepted.body.duplicate,false); assert.deepEqual(accepted.stats.actions,['accept']);
    assert.equal(accepted.stats.sockets,1); assert.equal(accepted.stats.greetings,1); assert.equal(accepted.registryActive,true);
    const original = (await db.execute(sql`SELECT status,processing_owner,processing_lease_expires_at,attempts FROM callcommand_ingestion_events WHERE tenant_id=${fixture.tenantId} AND provider_event_id=${eventId}`)).rows[0];
    assert.equal(original.status,'sideband_connected');
    await first.killAbruptly();
    checkpoints.push({ name: 'Verified original OS child killed after durable connected acknowledgement', status: 'pass', providerAccepts: 1 });

    const second = new RestartWorker(); await second.ready;
    const immediate = await inject(second);
    assert.equal(immediate.statusCode,200); assert.equal(immediate.body.duplicate,true); assert.equal(immediate.registryActive,false);
    assert.deepEqual(immediate.stats.actions,[]); assert.equal(immediate.stats.sockets,0);
    checkpoints.push({ name: 'Fresh process does not accept or attach while old durable lease is current', status: 'pass' });
    const expiry = new Date(String(original.processing_lease_expires_at)).getTime();
    assert(Number.isFinite(expiry) && expiry-Date.now()<35000);
    while (Date.now()<=expiry+150) await new Promise<void>(resolve=>setTimeout(resolve,Math.min(1000,Math.max(1,expiry+151-Date.now()))));
    const recovered = await inject(second);
    assert.equal(recovered.statusCode,200); assert.equal(recovered.body.duplicate,false); assert.equal(recovered.registryActive,true);
    assert.deepEqual(recovered.stats.actions,[]); assert.equal(recovered.stats.sockets,1); assert.equal(recovered.stats.greetings,0);
    const persisted = (await db.execute(sql`SELECT status,processing_owner,attempts FROM callcommand_ingestion_events WHERE tenant_id=${fixture.tenantId} AND provider_event_id=${eventId}`)).rows[0];
    assert.equal(persisted.status,'sideband_connected'); assert.notEqual(persisted.processing_owner,original.processing_owner); assert.equal(Number(persisted.attempts),2);
    const repeat = await inject(second); assert.equal(repeat.body.duplicate,true); assert.equal(repeat.stats.sockets,1);
    checkpoints.push({ name: 'Signed replay after actual 30-second lease expiry reattaches once, without accept or greeting', status: 'pass', sourceLeaseExpiredAt:new Date(expiry).toISOString() });
    const changed = rawBody.replace(openAiCallId,`${openAiCallId}_conflict`);
    const conflict = await inject(second,changed);
    assert.equal(conflict.statusCode,409); assert.equal(conflict.stats.sockets,1); assert.deepEqual(conflict.stats.actions,[]);
    checkpoints.push({ name: 'Conflicting signed event cannot rebind the persisted call', status: 'pass' });
    await second.killAbruptly();

    await db.execute(sql`UPDATE tenant_modules SET status='disabled' WHERE tenant_id=${fixture.tenantId} AND module_id=${fixture.moduleId}`);
    const third = new RestartWorker(); await third.ready;
    const denied = await inject(third);
    assert.equal(denied.statusCode,403); assert.equal(denied.stats.sockets,0); assert.deepEqual(denied.stats.actions,['reject']);
    await db.execute(sql`UPDATE tenant_modules SET status='enabled' WHERE tenant_id=${fixture.tenantId} AND module_id=${fixture.moduleId}`);
    checkpoints.push({ name: 'Fresh process rechecks current tenant module authority after process death', status: 'pass' });
    const terminalInput = { type: 'reconcile', tenantId:fixture.tenantId,callId:fixture.callId,eventId:`terminal_${eventId}`,startedAt:fixture.startedAt };
    const terminal = await third.request(terminalInput); assert.equal(terminal.body.duplicate,false);
    const duplicateTerminal = await third.request(terminalInput); assert.equal(duplicateTerminal.body.duplicate,true);
    const terminalState = (await db.execute(sql`SELECT c.status,l.status lease_status,(SELECT count(*)::int FROM callcommand_usage_events u WHERE u.tenant_id=c.tenant_id AND u.call_id=c.id AND u.event_type='call.terminal') usage_count
      FROM callcommand_calls c JOIN callcommand_lane_leases l ON l.tenant_id=c.tenant_id AND l.call_id=c.id WHERE c.tenant_id=${fixture.tenantId} AND c.id=${fixture.callId}`)).rows[0];
    assert.equal(terminalState.status,'completed');assert.equal(terminalState.lease_status,'released');assert.equal(terminalState.usage_count,1);
    const afterEnd = await inject(third); assert.equal(afterEnd.statusCode,409);assert.equal(afterEnd.stats.sockets,0);
    await third.stop();
    checkpoints.push({ name: 'Actual terminal domain reconciliation releases lane and records usage once; ended call cannot reattach', status:'pass', signedTwilioHttp:false });
    evidence.outcome = 'pass';
  } finally {
    for (const worker of pendingChildren) {
      if (worker.verified) await worker.killAbruptly();
      else if (worker.child.exitCode !== null || worker.child.signalCode !== null) await worker.exited;
      else assert.fail('Unverified owned worker requires explicit identity diagnosis before cleanup');
    }
    if (fixture) {
      const residual = await cleanupRestartFixture(fixture); assert(Object.values(residual).every(count=>count===0));
      evidence.cleanup = { residual, allOwnedRowsRemoved:true };
    }
    await databasePool.end();
    evidence.finishedAt = new Date().toISOString(); evidence.poolClosed = true;
    if (process.env.CALLCOMMAND_RESTART_EVIDENCE) writeFileSync(process.env.CALLCOMMAND_RESTART_EVIDENCE,JSON.stringify(evidence,null,2));
  }
});
