import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify, { type LightMyRequestResponse } from 'fastify';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createRevenueReadRepository, parseRevenueQuery, revenueCursor, revenueKind, revenueId, revenueReadSql, type RevenueReadRepository, type RevenueRow } from '../src/lib/tradeflowkit-revenue-reads.js';
import { registerTradeFlowKitRevenueReadRoutes } from '../src/routes/tradeflowkit-revenue-read-routes.js';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = '2026-11-09T12:00:00.123456';
const dialect = new PgDialect();
const compile = (query: ReturnType<typeof revenueReadSql>) => dialect.sqlToQuery(query);

test('query validates bounds, unknown fields, IDs, malformed and mismatched cursors', () => {
  assert.equal(parseRevenueQuery('customers', {}).limit, 25);
  assert.equal(parseRevenueQuery('jobs', { limit: '50', customerId: id(1) }).limit, 50);
  for (const query of [{ limit:'0' }, {limit:'51'}, {limit:'1.5'}, {limit:25}, {q:'x'.repeat(161)}, {q:['x']}, {q:'\0'}, {tenantId:id(1)}, {customerId:id(1)}, {cursor:'!'}, {cursor:Buffer.from('{}').toString('base64url')}]) assert.throws(() => parseRevenueQuery('customers', query));
  assert.throws(() => revenueKind('__proto__')); assert.throws(() => revenueId('no'));
  const cursor = revenueCursor('jobs', {q:'a',limit:25}, at, id(1));
  assert.deepEqual(parseRevenueQuery('jobs', {q:'a',cursor}).cursor, {at,id:id(1)});
  assert.throws(() => parseRevenueQuery('jobs', {q:'b',cursor}));
  assert.throws(() => parseRevenueQuery('quotes', {q:'a',cursor}));
  assert.throws(() => parseRevenueQuery('jobs', {q:'a',customerId:id(1),cursor}));
  for (const date of ['0000-01-01T12:00:00.123456','2026-02-30T12:00:00.123456','2026-11-09T25:00:00.123456','2026-11-09T12:00:00.123Z']) assert.throws(() => parseRevenueQuery('jobs', {cursor:revenueCursor('jobs',{q:'',limit:25},date,id(1))}));
});

test('SQL is tenant scoped, bounded, literal wildcard safe, and uses immutable microsecond keyset', () => {
  for (const kind of ['customers','jobs','quotes','invoices'] as const) {
    const query = compile(revenueReadSql('trusted',kind,{q:"%_\\'",limit:50,cursor:{at,id:id(1)}}));
    assert.match(query.sql, /tenant_id.* = \$1/); assert.match(query.sql,/deleted_at.* is null/);
    assert.match(query.sql,/created_at.*desc.*id.*desc limit \$/); assert.match(query.sql,/::timestamp/);
    assert.ok(query.params.includes(at)); assert.ok(query.params.includes("%\\%\\_\\\\'%")); assert.ok(query.params.includes('\\'));
    assert.equal(query.params.at(-1),51); assert.ok(!query.sql.includes("%_\\'")); assert.ok(!query.sql.includes('created_by_user_id" ='));
  }
  assert.ok(compile(revenueReadSql('trusted','quotes',{q:id(1),limit:25})).params.includes(id(1)));
});

test('actual Fastify routes authorize before reads, page beyond 100, preserve ties and exact absence semantics', async () => {
  const app = Fastify(); let reads = 0; const scopes: string[] = [];
  const records = Array.from({length:125},(_,n) => ({id:id(n+1),tenantId:'trusted',name:`Customer ${n+1}`,createdAt:new Date(),updatedAt:new Date(),deletedAt:null,cursorAt:at})).reverse();
  const repo: RevenueReadRepository = {
    async read(tenant, _kind, query, exact) {
      reads++; scopes.push(tenant);
      return records.filter(row => (!exact || row.id === exact) && (!query.cursor || row.id < query.cursor.id)).slice(0,exact?1:query.limit+1) as Awaited<ReturnType<RevenueReadRepository['read']>>;
    },
    async related(tenant,_kind,rows) { scopes.push(tenant); assert.ok(rows.length<=50); return {customers:[],jobs:[],invoicedQuoteIds:[]}; },
  };
  registerTradeFlowKitRevenueReadRoutes(app,repo,[async (request,reply)=>{ if(request.headers.authorization!=='member') return reply.code(401).send({error:'Unauthorized'}); (request as any).tenantContext={tenantId:'trusted'}; },async(request,reply)=>{ if(request.headers['x-module']!=='allowed') return reply.code(403).send({error:'Forbidden'}); }]);
  const headers={authorization:'member','x-module':'allowed'};
  try {
    assert.equal((await app.inject('/v1/modules/tradeflowkit/revenue/customers')).statusCode,401);
    assert.equal((await app.inject({url:'/v1/modules/tradeflowkit/revenue/customers',headers:{authorization:'member'}})).statusCode,403); assert.equal(reads,0);
    const seen:string[]=[]; let cursor:string|null=null;
    do { const response: LightMyRequestResponse = await app.inject({url:'/v1/modules/tradeflowkit/revenue/customers?limit=25'+(cursor?'&cursor='+cursor:''),headers}); assert.equal(response.statusCode,200); const body: { items: RevenueRow[]; nextCursor: string | null } = response.json(); seen.push(...body.items.map((row:RevenueRow)=>row.id)); assert.ok(body.items.every((row:object)=>!('cursorAt' in row))); cursor=body.nextCursor; } while(cursor);
    assert.equal(seen.length,125); assert.equal(new Set(seen).size,125); assert.equal(seen.at(-1),id(1));
    assert.equal((await app.inject({url:'/v1/modules/tradeflowkit/revenue/customers/'+id(1),headers})).json().item.id,id(1));
    const missing=[]; for(const n of [999,998,997]) missing.push((await app.inject({url:'/v1/modules/tradeflowkit/revenue/customers/'+id(n),headers})).json()); assert.deepEqual(missing[0],missing[1]); assert.deepEqual(missing[1],missing[2]);
    for(const suffix of ['customers?tenantId=foreign','customers?limit=51','unknown','customers/no','customers/'+id(1)+'?q=x','customers?q=x&q=y']) assert.equal((await app.inject({url:'/v1/modules/tradeflowkit/revenue/'+suffix,headers})).statusCode,400);
    assert.ok(scopes.every(scope=>scope==='trusted'));
  } finally { await app.close(); }
});

test('repository related SQL fetches only referenced IDs with tenant predicates and independent invoice existence', async () => {
  const calls: ReturnType<typeof compile>[]=[];
  const db={execute:async(query:Parameters<typeof compile>[0])=>{calls.push(compile(query));return {rows:[]};}};
  const repo=createRevenueReadRepository(db as any);
  const rows=[{id:id(10),customerId:id(20),jobId:id(30)}] as RevenueRow[];
  await repo.related('trusted','quotes',rows);
  assert.equal(calls.length,3);
  for(const call of calls) { assert.ok(call.params.includes('trusted')); assert.equal(call.params.at(-1),1); assert.match(call.sql,/tenant_id.* = \$/); assert.match(call.sql,/ in \(/); }
  for(const call of calls.slice(0,2)) assert.doesNotMatch(call.sql, /notes|address|portal_token_hash|description|assigned_to_user_id|site_id|created_at|updated_at/);
  assert.ok(calls[0].params.includes(id(20))); assert.ok(calls[1].params.includes(id(30))); assert.ok(calls[2].params.includes(id(10)));
  assert.ok(!calls[0].sql.includes('deleted_at" is null')); assert.match(calls[2].sql,/deleted_at.* is null/);
  calls.length=0; await repo.related('trusted','quotes',[]); assert.equal(calls.length,0);
});

test('injected-guard Fastify routes: all kinds reach older exact rows and ignore forged tenant headers', async () => {
  const app=Fastify(); const observed: string[]=[]; let reads=0;
  const repo: RevenueReadRepository={
    async read(tenant,kind,query,exact){
      reads++;observed.push(tenant);
      const rows=Array.from({length:125},(_,n)=>({id:id(n+1),tenantId:tenant,createdAt:new Date(),updatedAt:new Date(),deletedAt:null,cursorAt:at,
        ...(kind==='customers'?{name:`Customer ${n+1}`}:{customerId:id(900),number:n+1,...(kind==='jobs'?{title:`Job ${n+1}`}:{jobId:null,lineItems:[],totalCents:0})})})).reverse();
      return rows.filter(row=>(!exact||row.id===exact)&&(!query.cursor||row.id<query.cursor.id)).slice(0,exact?1:query.limit+1) as Awaited<ReturnType<RevenueReadRepository['read']>>;
    },
    async related(tenant){observed.push(tenant);return {customers:[],jobs:[],invoicedQuoteIds:[]};},
  };
  registerTradeFlowKitRevenueReadRoutes(app,repo,[async(request,reply)=>{
    if(request.headers.authorization!=='member') return reply.code(401).send({error:'Unauthorized'});
    (request as any).tenantContext={tenantId:'trusted'};
  }]);
  const headers={authorization:'member','x-tenant-id':'forged-foreign-tenant'};
  try{
    for(const kind of ['customers','jobs','quotes','invoices'] as const){
      const invalid=await app.inject({url:`/v1/modules/tradeflowkit/revenue/${kind}/not-an-id?tenantId=forged`});
      assert.equal(invalid.statusCode,401); assert.equal(invalid.headers['cache-control'],'no-store');
      const exact=await app.inject({url:`/v1/modules/tradeflowkit/revenue/${kind}/${id(1)}`,headers});
      assert.equal(exact.statusCode,200); assert.equal(exact.headers['cache-control'],'no-store');assert.equal(exact.json().item.id,id(1));
      const recent=await app.inject({url:`/v1/modules/tradeflowkit/revenue/${kind}?limit=50`,headers});
      assert.equal(recent.statusCode,200);assert.ok(!recent.json().items.some((row:RevenueRow)=>row.id===id(1)));
    }
    const bad=await app.inject({url:'/v1/modules/tradeflowkit/revenue/customers?limit=51',headers}); assert.equal(bad.statusCode,400); assert.equal(bad.headers['cache-control'],'no-store');
    const missing=await app.inject({url:'/v1/modules/tradeflowkit/revenue/invoices/'+id(999),headers}); assert.equal(missing.statusCode,404); assert.equal(missing.headers['cache-control'],'no-store');
    assert.equal(reads,9);assert.ok(observed.every(tenant=>tenant==='trusted'));
  }finally{await app.close();}
});

test('raw driver rows decode dates exactly like legacy select while preserving cursor microseconds and JSON', async () => {
  const rawDate='2026-11-09 12:00:00.123456';
  const iso='2026-11-09T12:00:00.123Z';
  const lineItems=[{description:'Service',quantity:1,unitPriceCents:100}];
  const raw={id:id(1),tenantId:'trusted',createdAt:rawDate,updatedAt:rawDate,deletedAt:null,cursorAt:at};
  const db={execute:async()=>({rows:[raw]})};
  const repo=createRevenueReadRepository(db as any);
  for(const kind of ['customers','jobs','quotes','invoices'] as const){
    Object.assign(raw,{dueDate:rawDate,expiresAt:rawDate,scheduledStart:rawDate,lineItems});
    const [row]=await repo.read('trusted',kind,{q:'',limit:25});
    assert.ok(row.createdAt instanceof Date);assert.equal(row.createdAt.toISOString(),iso);
    assert.equal(row.updatedAt.toISOString(),iso);assert.equal(row.deletedAt,null);assert.equal(row.cursorAt,at);
    const serialized=JSON.parse(JSON.stringify(row));assert.equal(serialized.createdAt,iso);
    if(kind==='invoices')assert.equal(serialized.dueDate,iso);
    if(kind==='quotes')assert.equal(serialized.expiresAt,iso);
    if(kind==='jobs')assert.equal(serialized.scheduledStart,iso);
    if(kind==='quotes'||kind==='invoices')assert.deepEqual(serialized.lineItems,lineItems);
  }
  const archived={...raw,name:'Historical customer',customerId:id(900),title:'Historical job',deletedAt:rawDate,notes:'Private notes',address:'Private address',portalTokenHash:'private-hash',internalNotes:'Private job notes',description:'Private description',assignedToUserId:id(999),siteId:id(998)};
  const relatedRepo=createRevenueReadRepository({execute:async()=>({rows:[archived]})} as any);
  const related=await relatedRepo.related('trusted','invoices',[{id:id(2),customerId:id(1),jobId:id(1)} as RevenueRow]);
  for(const row of [...related.customers,...related.jobs]){
    assert.equal(row.deletedAt?.toISOString(),iso);
  }
  assert.equal(JSON.parse(JSON.stringify(related)).customers[0].deletedAt,iso);
  assert.deepEqual(Object.keys(related.customers[0]).sort(),['deletedAt','id','name']);
  assert.deepEqual(Object.keys(related.jobs[0]).sort(),['customerId','deletedAt','id','title']);
});

test('Fastify serialization keeps archived relationships label-only and active main records complete', async () => {
  const app=Fastify();
  const rawDate='2026-11-09 12:00:00.123456';
  const privateFields={notes:'PRIVATE_NOTES',address:'PRIVATE_ADDRESS',portalTokenHash:'PRIVATE_PORTAL_HASH',internalNotes:'PRIVATE_INTERNAL_NOTES',description:'PRIVATE_DESCRIPTION',assignedToUserId:'PRIVATE_ASSIGNEE',workflowStageId:'PRIVATE_STAGE',siteId:'PRIVATE_SITE'};
  const main={id:id(10),tenantId:'trusted',customerId:id(20),jobId:id(30),createdAt:rawDate,updatedAt:rawDate,deletedAt:null,cursorAt:at,notes:'ACTIVE_MAIN_NOTES',lineItems:[{description:'Active service'}]};
  const db={execute:async(query:Parameters<typeof compile>[0])=>{
    const text=compile(query).sql;
    if(text.includes('"cursorAt"')) return {rows:[main]};
    if(text.includes('from "tradeflowkit_customers"')) return {rows:[{id:id(20),name:'Archived customer label',deletedAt:rawDate,...privateFields}]};
    if(text.includes('from "tradeflowkit_jobs"')) return {rows:[{id:id(30),customerId:id(20),title:'Archived job label',deletedAt:rawDate,...privateFields}]};
    return {rows:[]};
  }};
  registerTradeFlowKitRevenueReadRoutes(app,createRevenueReadRepository(db as any),[async(request)=>{(request as any).tenantContext={tenantId:'trusted'};}]);
  try{
    for(const kind of ['quotes','invoices']){
      const response=await app.inject(`/v1/modules/tradeflowkit/revenue/${kind}/${id(10)}`);
      assert.equal(response.statusCode,200,response.body);
      const body=response.json();
      assert.equal(body.item.notes,'ACTIVE_MAIN_NOTES');assert.deepEqual(body.item.lineItems,[{description:'Active service'}]);
      assert.equal(body.item.createdAt,'2026-11-09T12:00:00.123Z');assert.ok(!('cursorAt' in body.item));
      assert.deepEqual(body.related.customers,[{id:id(20),name:'Archived customer label',deletedAt:'2026-11-09T12:00:00.123Z'}]);
      assert.deepEqual(body.related.jobs,[{id:id(30),customerId:id(20),title:'Archived job label',deletedAt:'2026-11-09T12:00:00.123Z'}]);
      for(const sentinel of Object.values(privateFields)) assert.ok(!response.body.includes(sentinel));
      for(const key of Object.keys(privateFields)) for(const row of [...body.related.customers,...body.related.jobs]) assert.ok(!(key in row));
    }
  }finally{await app.close();}
});
