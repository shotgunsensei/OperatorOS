import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compileOpsSql, loadOpsRoute } from './_ops-isolated-route-fixture.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

async function fixture() {
  const rawKey = 'SYNTHETIC_LICENSE_ONLY';
  const key = { id:'key-a', tenant_id:'tenant-a', product_id:'product-a', max_activations:1, expires_at:null as string | null, revoked_at:null as string | null, name:'Synthetic software', slug:'synthetic-only', active:true };
  const activations: Array<{id:string;tenant_id:string;license_key_id:string;device_fingerprint_hash:string;revoked_at:string|null}> = [];
  let lockedLookups = 0, transactions = 0, tail = Promise.resolve();
  async function execute(query: Parameters<typeof compileOpsSql>[0], inTransaction = false) {
    const compiled = compileOpsSql(query), sql = compiled.sql.replace(/\s+/g,' ').trim(), values = compiled.params;
    if (sql.startsWith('INSERT INTO techdeck_license_rate_limits')) return { rows:[{ request_count:1 }] };
    assert.ok(inTransaction, 'Key lookup, capacity check and activation write stay in one transaction');
    if (sql.includes('FROM techdeck_license_keys key')) {
      assert.match(sql, /FOR UPDATE OF key\b/, 'Actual PostgreSQL allocation must lock the key row');
      lockedLookups++;
      return { rows: values[0] === hash(rawKey) ? [{...key}] : [] };
    }
    const rows = activations.filter(row => row.tenant_id === values[0] && row.license_key_id === values[1]);
    if (sql.startsWith('SELECT id,revoked_at FROM techdeck_license_activations')) return { rows:rows.filter(row => row.device_fingerprint_hash === values[2]).map(row=>({...row})) };
    if (sql.startsWith('SELECT id FROM techdeck_license_activations')) return { rows:rows.filter(row => row.revoked_at === null).map(row=>({...row})) };
    if (sql.startsWith('INSERT INTO techdeck_license_activations')) {
      let existing = rows.find(row => row.device_fingerprint_hash === values[2]);
      if (!existing) { existing={id:`activation-${activations.length}`,tenant_id:String(values[0]),license_key_id:String(values[1]),device_fingerprint_hash:String(values[2]),revoked_at:null}; activations.push(existing); }
      return {rows:[{id:existing.id}]};
    }
    throw new Error(`Unsupported isolated license query: ${sql.slice(0,100)}`);
  }
  // Models serialized key allocation and checks the actual FOR UPDATE contract.
  // PostgreSQL lock scheduling itself requires separate disposable-PG acceptance.
  const db = { execute, async transaction<T>(run: (tx: {execute: typeof execute}) => Promise<T>) {
    const previous=tail; let release!:()=>void; tail=new Promise<void>(resolve=>{release=resolve;});
    await previous; transactions++;
    try { return await run({execute:query=>execute(query,true)}); } finally { release(); }
  } };
  const handlers = new Map<string,(request:any,reply:any)=>Promise<any>>();
  const app=Object.fromEntries(['get','post','patch','put','delete'].map(method=>[method,(path:string,...args:any[])=>handlers.set(`${method}:${path}`,args.at(-1))]));
  const dependencies: Record<string,unknown> = {
    '../db.js':{db}, '../schema.js':{},
    '../lib/tenant-auth.js':{requireTenantMember(){},requireTenantAdmin(){},requireTenantModuleWriteAccess(){},requireTenantModuleAccess:()=>()=>undefined},
    '../lib/shared-platform-control-plane.js':{}, '../lib/shared-outbound-webhooks.js':{}, '../lib/shared-attachments.js':{},
    '../lib/techdeck-ai-guidance.js':{}, '../lib/ai-cost-control.js':{},
    '../lib/shared-background-jobs.js':{registerSharedJobHandler(){}}, '../lib/shared-schedules-exports.js':{},
    '../lib/shared-usage-activity.js':{}, '../lib/shared-secret-vault.js':{}, '../lib/techdeck-compliance-export.js':{},
  };
  await loadOpsRoute('techdeck-literal-routes.ts',dependencies).registerTechDeckLiteralRoutes(app);
  return {key,activations,stats:()=>({lockedLookups,transactions}),async validate(deviceFingerprint:string, license=rawKey){
    const reply={code(){return this;},send(value:unknown){return value;}};
    return handlers.get('post:/v1/public/techdeck/license/validate')!({body:{key:license,deviceFingerprint},ip:'192.0.2.10',headers:{}},reply);
  },seed(device:string,revoked=false){activations.push({id:`seed-${activations.length}`,tenant_id:key.tenant_id,license_key_id:key.id,device_fingerprint_hash:hash(device),revoked_at:revoked?'2026-10-27':null});}};
}

test('concurrent new fingerprints allocate only the available license capacity',async()=>{
  const f=await fixture();
  const results=await Promise.all([f.validate('device-a'),f.validate('device-b')]);
  assert.equal(results.filter(row=>row.valid).length,1);
  assert.equal(results.filter(row=>row.code==='ACTIVATION_LIMIT_REACHED').length,1);
  assert.equal(f.activations.length,1);
  assert.deepEqual(f.stats(),{lockedLookups:2,transactions:2});
});

test('same-device retry stays valid at capacity without allocating another activation',async()=>{
  const f=await fixture(); f.seed('existing-device');
  assert.equal((await f.validate('existing-device')).valid,true);
  assert.equal((await f.validate('another-device')).code,'ACTIVATION_LIMIT_REACHED');
  assert.equal(f.activations.length,1);
});

test('revoked fingerprints cannot reactivate or bypass another device using capacity',async()=>{
  const f=await fixture(); f.seed('revoked-device',true); f.seed('active-device');
  assert.equal((await f.validate('revoked-device')).valid,false);
  assert.ok(f.activations[0].revoked_at);
  assert.equal(f.activations.length,2);
});

test('key revocation, expiry, product disabling and foreign key hashes fail closed under lock',async()=>{
  for(const invalid of ['revoked','expired','inactive','foreign']){
    const f=await fixture();
    if(invalid==='revoked')f.key.revoked_at='2026-10-27';
    if(invalid==='expired')f.key.expires_at='2000-01-01T00:00:00Z';
    if(invalid==='inactive')f.key.active=false;
    assert.equal((await f.validate('new-device',invalid==='foreign'?'OTHER_SYNTHETIC_KEY':undefined)).valid,false);
    assert.equal(f.activations.length,0);
    assert.equal(f.stats().lockedLookups,1);
  }
});
