import './_pulsedesk-mailbox-network-guard.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolveMailboxSecret, revokeMailboxSecret, storeMailboxSecret, type MailboxSecretScope, type PulseDeskMailboxVaultPort } from '../src/lib/pulsedesk-mailbox-vault.js';
const tenantId='10000000-0000-4000-8000-000000000001',connectorId='20000000-0000-4000-8000-000000000001',actor='30000000-0000-4000-8000-000000000001';
function memoryVault(){
  const records=new Map<string,{tenantId:string;moduleKey:string;purpose:string;reference:string;revoked:boolean}>();
  const accesses:Array<{kind:string;tenantId:string;id?:string;purpose:string}>=[];
  const vault:PulseDeskMailboxVaultPort={
    async store(input){assert.ok(input.reference.length<=2000);const id=randomUUID();records.set(id,{...input,reference:input.reference.trim(),revoked:false});accesses.push({kind:'store',...input,id});return{id};},
    async resolve(input){accesses.push({kind:'resolve',...input});const row=records.get(input.id);return row&&!row.revoked&&row.tenantId===input.tenantId&&row.moduleKey===input.moduleKey&&row.purpose===input.purpose?row.reference:null;},
    async revoke(input){accesses.push({kind:'revoke',...input});const row=records.get(input.id);if(row&&row.tenantId===input.tenantId&&row.moduleKey===input.moduleKey&&row.purpose===input.purpose)row.revoked=true;},
  };return{vault,records,accesses};
}
const scope:MailboxSecretScope={tenantId,connectorId,provider:'microsoft',kind:'credentials'};
test('large provider tokens, Unicode and whitespace roundtrip through bounded server-vault references',async()=>{
  const f=memoryVault();const payload={accessToken:'a'.repeat(8192),refreshToken:'b'.repeat(8192),note:' leading Ω value trailing ',expiresAt:1800000000000};
  const id=await storeMailboxSecret(f.vault,scope,actor,payload);
  assert.deepEqual(await resolveMailboxSecret(f.vault,scope,id),payload);
  assert.ok(f.records.size>2);assert.ok([...f.records.values()].every(row=>row.reference.length<=2000&&row.moduleKey==='pulsedesk'&&row.tenantId===tenantId));
  const manifest=f.records.get(id)!.reference;assert.doesNotMatch(manifest,/aaaaaaa|bbbbbbbb|leading/);
});
for(const alteration of [
  {tenantId:'10000000-0000-4000-8000-000000000002'},
  {connectorId:'20000000-0000-4000-8000-000000000002'},
  {provider:'google' as const},{kind:'pending' as const},
])test('secret resolution rejects foreign tenant/connector/provider/purpose',async()=>{
  const f=memoryVault();const id=await storeMailboxSecret(f.vault,scope,actor,{accessToken:'SYNTHETIC'});
  await assert.rejects(resolveMailboxSecret(f.vault,{...scope,...alteration},id));
  assert.ok([...f.records.values()].every(row=>!row.revoked));
});
test('part tampering and revoked parts fail integrity without returning partial provider credentials',async()=>{
  for(const revoke of [false,true]){
    const f=memoryVault();const id=await storeMailboxSecret(f.vault,scope,actor,{accessToken:'SYNTHETIC_PRIVATE'});
    const entry=JSON.parse(f.records.get(id)!.reference) as {parts:string[]};const part=f.records.get(entry.parts[0])!;
    if(revoke)part.revoked=true;else part.reference='tampered';
    await assert.rejects(resolveMailboxSecret(f.vault,scope,id),error=>{assert.doesNotMatch(String(error),/SYNTHETIC_PRIVATE/);return true;});
  }
});
test('revocation scopes every manifest/part to tenant, module and exact connector purpose',async()=>{
  const f=memoryVault();const id=await storeMailboxSecret(f.vault,scope,actor,{accessToken:'SYNTHETIC'});
  const foreign=await storeMailboxSecret(f.vault,{...scope,tenantId:'10000000-0000-4000-8000-000000000002'},actor,{accessToken:'OTHER_SYNTHETIC'});
  await revokeMailboxSecret(f.vault,scope,id);await assert.rejects(resolveMailboxSecret(f.vault,scope,id));
  assert.equal(f.records.get(foreign)!.revoked,false);
  assert.ok(f.accesses.filter(a=>a.kind==='revoke').every(a=>a.tenantId===tenantId&&a.purpose.includes(connectorId)));
});
test('invalid scope and oversized payload are rejected before any vault write',async()=>{
  const f=memoryVault();await assert.rejects(storeMailboxSecret(f.vault,{...scope,tenantId:'not-a-tenant'},actor,{x:'safe'}));
  await assert.rejects(storeMailboxSecret(f.vault,scope,actor,{x:'a'.repeat(18001)}));assert.equal(f.records.size,0);
});
