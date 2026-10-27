import test from 'node:test';
import assert from 'node:assert/strict';
import { compileOpsSql, loadOpsRoute, opsSelectMatches } from './_ops-isolated-route-fixture.js';

async function fixture() {
  const assignments = [{tenant_id:'tenant-a',user_id:'portal-user',directory_organization_id:'org-a',directory_site_id:'site-a' as string|null,can_create_tickets:true,can_comment:true,can_view_evidence:true,revoked_at:null as string|null}];
  const tickets = [
    {id:'assigned-ticket',tenant_id:'tenant-a',directory_organization_id:'org-a',directory_site_id:'site-a',deleted_at:null},
    {id:'other-site-ticket',tenant_id:'tenant-a',directory_organization_id:'org-a',directory_site_id:'site-b',deleted_at:null},
    {id:'organization-ticket',tenant_id:'tenant-a',directory_organization_id:'org-a',directory_site_id:null,deleted_at:null},
    {id:'foreign-ticket',tenant_id:'tenant-b',directory_organization_id:'org-a',directory_site_id:'site-a',deleted_at:null},
  ];
  const evidence=tickets.map(ticket=>({...ticket,id:ticket.id.replace('ticket','evidence'),archived_at:null}));
  const comments=tickets.map(ticket=>({id:`comment-${ticket.id}`,tenant_id:ticket.tenant_id,ticket_id:ticket.id,body:`Note for ${ticket.id}`,deleted_at:null}));
  let writes=0;
  const db={async execute(query:Parameters<typeof compileOpsSql>[0]){
    const compiled=compileOpsSql(query),sql=compiled.sql.replace(/\s+/g,' ').trim();
    if(sql.startsWith('SELECT')){
      const table=/\bFROM\s+(\w+)/i.exec(sql)?.[1];
      const rows=table==='techdeck_portal_assignments'?assignments:table==='techdeck_tickets'?tickets:table==='techdeck_evidence'?evidence:table==='techdeck_ticket_comments'?comments:null;
      if(rows)return {rows:rows.filter(row=>opsSelectMatches(compiled,row))};
    }
    if(sql.startsWith('INSERT INTO techdeck_ticket_sequences'))return {rows:[{last_number:1}]};
    if(sql.startsWith('INSERT INTO techdeck_ticket_comments')||sql.startsWith('INSERT INTO techdeck_tickets')){writes++;return {rows:[{id:'synthetic-created'}]};}
    throw new Error(`Unsupported portal fixture query: ${sql.slice(0,100)}`);
  }};
  const handlers=new Map<string,(request:any,reply:any)=>Promise<any>>();
  const app=Object.fromEntries(['get','post','patch','put','delete'].map(method=>[method,(path:string,...args:any[])=>handlers.set(`${method}:${path}`,args.at(-1))]));
  const dependencies:Record<string,unknown>={
    '../db.js':{db},'../schema.js':{},'../lib/tenant-auth.js':{requireTenantMember(){},requireTenantAdmin(){},requireTenantModuleWriteAccess(){},requireTenantModuleAccess:()=>()=>undefined},
    '../lib/shared-platform-control-plane.js':{},'../lib/shared-outbound-webhooks.js':{},'../lib/shared-attachments.js':{},'../lib/techdeck-ai-guidance.js':{},'../lib/ai-cost-control.js':{},'../lib/shared-background-jobs.js':{registerSharedJobHandler(){}},'../lib/shared-schedules-exports.js':{},'../lib/shared-usage-activity.js':{},'../lib/shared-secret-vault.js':{},'../lib/techdeck-compliance-export.js':{},
  };
  await loadOpsRoute('techdeck-literal-routes.ts',dependencies).registerTechDeckLiteralRoutes(app);
  return {assignments,writes:()=>writes,async invoke(method:string,path:string,id?:string,payload?:unknown){
    const reply={status:200,payload:undefined as unknown,code(value:number){this.status=value;return this;},send(value:unknown){this.payload=value;return value;}};
    const result=await handlers.get(`${method}:${path}`)!({tenantContext:{tenantId:'tenant-a'},user:{id:'portal-user'},params:{id},body:payload},reply);
    return {status:reply.status,body:result??reply.payload};
  }};
}

test('a site-specific portal assignment excludes other sites and organization-level records',async()=>{
  const f=await fixture();const {body}=await f.invoke('get','/v1/modules/techdeck/portal/me');
  assert.deepEqual(body.tickets.map((row:any)=>row.id),['assigned-ticket']);
  assert.deepEqual(body.evidence.map((row:any)=>row.id),['assigned-evidence']);
});

test('portal evidence respects the explicit evidence permission',async()=>{
  const f=await fixture();f.assignments[0].can_view_evidence=false;
  const {body}=await f.invoke('get','/v1/modules/techdeck/portal/me');
  assert.equal(body.evidence.length,0);assert.equal(body.tickets.length,1);
});

test('ticket comment reads and writes cannot escape the assigned site',async()=>{
  const f=await fixture();const path='/v1/modules/techdeck/portal/tickets/:id/comments';
  assert.equal((await f.invoke('get',path,'assigned-ticket')).body.comments.length,1);
  for(const id of ['other-site-ticket','organization-ticket','foreign-ticket','missing-ticket']){
    assert.equal((await f.invoke('get',path,id)).status,404);
    assert.equal((await f.invoke('post',path,id,{body:'Operational follow-up'})).status,404);
  }
  assert.equal(f.writes(),0);
});

test('portal ticket creation requires matching site while organization-wide grants retain all sites',async()=>{
  const f=await fixture();const path='/v1/modules/techdeck/portal/tickets';
  for(const directorySiteId of ['site-b',undefined])assert.equal((await f.invoke('post',path,undefined,{directoryOrganizationId:'org-a',directorySiteId,title:'Synthetic request'})).status,404);
  assert.equal((await f.invoke('post',path,undefined,{directoryOrganizationId:'org-a',directorySiteId:'site-a',title:'Synthetic request'})).status,201);
  f.assignments[0].directory_site_id=null;
  assert.equal((await f.invoke('post',path,undefined,{directoryOrganizationId:'org-a',directorySiteId:'site-b',title:'Synthetic request'})).status,201);
  assert.equal(f.writes(),2);
});

test('overlapping grants preserve the permitted action only within its site',async()=>{
  const f=await fixture();
  const narrower={...f.assignments[0]};
  Object.assign(f.assignments[0],{directory_site_id:null,can_create_tickets:false,can_comment:false,can_view_evidence:false});
  f.assignments.push(narrower);
  const path='/v1/modules/techdeck/portal/tickets/:id/comments';
  assert.equal((await f.invoke('post',path,'assigned-ticket',{body:'Allowed operational note'})).status,201);
  assert.equal((await f.invoke('post',path,'other-site-ticket',{body:'Forbidden operational note'})).status,403);
  const {body}=await f.invoke('get','/v1/modules/techdeck/portal/me');
  assert.equal(body.tickets.length,3);
  assert.deepEqual(body.evidence.map((row:any)=>row.id),['assigned-evidence']);
  assert.equal(f.writes(),1);
});

test('revoked assignments grant neither portal reads nor comment writes',async()=>{
  const f=await fixture();f.assignments[0].revoked_at='2026-10-27';
  const {body}=await f.invoke('get','/v1/modules/techdeck/portal/me');
  assert.equal(body.tickets.length,0);assert.equal(body.evidence.length,0);
  assert.equal((await f.invoke('post','/v1/modules/techdeck/portal/tickets/:id/comments','assigned-ticket',{body:'Not permitted'})).status,404);
  assert.equal(f.writes(),0);
});
