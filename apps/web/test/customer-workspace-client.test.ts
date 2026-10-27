import test from 'node:test';
import assert from 'node:assert/strict';
import { customerWorkspaceApi } from '../src/lib/auth.js';

test('actual Customer Workspace client sends explicit selected tenant and unchanged qualified handoff body',async()=>{
 const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',customer='11111111-1111-4111-8111-111111111111',site='22222222-2222-4222-8222-222222222222',contact='33333333-3333-4333-8333-333333333333',job='44444444-4444-4444-8444-444444444444';
 const requests:Array<{url:string;options:RequestInit}>=[];
 const previousFetch=globalThis.fetch,previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{hostname:'app.example.invalid'}}});
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}});
 globalThis.fetch=async(url,options={})=>{requests.push({url:String(url),options});return{ok:true,json:async()=>({fixture:true})} as Response;};
 try{
  const controller=new AbortController();
  await customerWorkspaceApi.list(tenant,{search:'Synthetic North',limit:30,offset:30},controller.signal);
  await customerWorkspaceApi.detail(tenant,customer,{siteId:site,contactId:contact},controller.signal);
  const body={jobId:job,expectedSourceVersion:7,directoryContext:{organizationId:customer,siteId:site,contactId:contact,revision:'a'.repeat(64)},idempotencyKey:'workspace-proof:55555555-5555-4555-8555-555555555555'};
  await customerWorkspaceApi.requestFieldProof(tenant,body);
  await customerWorkspaceApi.run(tenant,'66666666-6666-4666-8666-666666666666',controller.signal);
  assert.equal(requests.length,4);
  for(const request of requests){assert.equal((request.options.headers as Record<string,string>)['X-Tenant-Id'],tenant);assert.equal(request.options.credentials,'include');}
  assert.equal(requests[0].url,'/api/customer-workspace/customers?search=Synthetic+North&limit=30&offset=30');
  assert.equal(requests[1].url,`/api/customer-workspace/customers/${customer}?siteId=${site}&contactId=${contact}`);
  assert.equal(requests[2].url,'/api/customer-workspace/field-proof');assert.equal(requests[2].options.method,'POST');assert.deepEqual(JSON.parse(String(requests[2].options.body)),body);
  assert.equal(requests[3].url,`/api/tenants/${tenant}/data-fabric/runs/66666666-6666-4666-8666-666666666666`);
  assert.equal(requests[0].options.signal,controller.signal);assert.equal(requests[3].options.signal,controller.signal);
 }finally{
  globalThis.fetch=previousFetch;
  if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');
  if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else Reflect.deleteProperty(globalThis,'localStorage');
 }
});
