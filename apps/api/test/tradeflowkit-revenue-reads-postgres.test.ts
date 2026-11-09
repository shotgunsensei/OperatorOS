process.env.SESSION_SECRET ||= 'operatoros-revenue-read-regression-v1';
// Prepared regression: run only against the fixture-guarded disposable PostgreSQL database.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { tradeflowkitCustomers, tradeflowkitJobs, tradeflowkitQuotes, tradeflowkitInvoices, tenantUsers, tenantModules, tenantUserModuleAccess } from '../src/schema.js';
import { createRevenueReadRepository, parseRevenueQuery, revenueCursor } from '../src/lib/tradeflowkit-revenue-reads.js';
import { ensureSchemaReady, createTestUser, cleanupUser, createTestModule, cleanupModule } from './_setup.js';
let owner: Awaited<ReturnType<typeof createTestUser>>;
let foreign: Awaited<ReturnType<typeof createTestUser>>;
before(async()=>{await ensureSchemaReady(); owner=await createTestUser();foreign=await createTestUser();});
after(async()=>{
  for(const user of [owner,foreign]) if(user) {
    for(const table of [tradeflowkitInvoices,tradeflowkitQuotes,tradeflowkitJobs,tradeflowkitCustomers]) await db.delete(table).where(eq(table.tenantId,user.currentTenantId!));
    await cleanupUser(user.id);
  }
});
test('PostgreSQL: 125 tied rows, precise cursor, edits, search, historical labels and foreign/archive isolation',async()=>{
  const tenant=owner.currentTenantId!; const repo=createRevenueReadRepository(db);
  const rows=Array.from({length:125},(_,n)=>({id:randomUUID(),tenantId:tenant,name:n===0?'Literal %_\\ customer':`Historical ${n}`,createdAt:sql`'2026-11-09T12:00:00.123456'::timestamp`}));
  await db.insert(tradeflowkitCustomers).values(rows);
  const [archived]=await db.insert(tradeflowkitCustomers).values({tenantId:tenant,name:'Archived historical label',deletedAt:new Date()}).returning();
  const [foreignRow]=await db.insert(tradeflowkitCustomers).values({tenantId:foreign.currentTenantId!,name:'Foreign'}).returning();
  const seen:string[]=[]; let cursor:string|undefined;
  do {
    const query=parseRevenueQuery('customers',{limit:'25',...(cursor?{cursor}:{})});
    const found=await repo.read(tenant,'customers',query); const page=found.slice(0,25);
    assert.ok(page.every(row=>row.cursorAt==='2026-11-09T12:00:00.123456'));
    assert.ok(page.every(row=>row.createdAt instanceof Date && row.createdAt.toISOString()==='2026-11-09T12:00:00.123Z'));
    seen.push(...page.map(row=>row.id)); const last=page.at(-1)!;
    cursor=found.length>25?revenueCursor('customers',query,last.cursorAt,last.id):undefined;
    await db.update(tradeflowkitCustomers).set({updatedAt:new Date(),notes:'Edited between pages'}).where(eq(tradeflowkitCustomers.id,rows[0].id));
  }while(cursor);
  assert.equal(seen.length,125);assert.equal(new Set(seen).size,125);
  for(const id of [archived.id,foreignRow.id,randomUUID()]) assert.deepEqual(await repo.read(tenant,'customers',{q:'',limit:25},id),[]);
  assert.equal((await repo.read(tenant,'customers',{q:'%_\\',limit:25})).length,1);
  assert.equal((await repo.read(tenant,'customers',{q:rows[0].id,limit:25}))[0].id,rows[0].id);
  const [job]=await db.insert(tradeflowkitJobs).values({tenantId:tenant,customerId:archived.id,title:'Older job',deletedAt:new Date()}).returning();
  const [quote]=await db.insert(tradeflowkitQuotes).values({tenantId:tenant,customerId:archived.id,jobId:job.id,lineItems:[],subtotalCents:0,totalCents:0}).returning();
  await db.insert(tradeflowkitInvoices).values({tenantId:tenant,customerId:archived.id,sourceQuoteId:quote.id,lineItems:[],subtotalCents:0,totalCents:0,createdAt:new Date('2001-01-01')});
  const related=await repo.related(tenant,'quotes',[quote]);
  assert.deepEqual(related.customers.map(row=>row.id),[archived.id]);assert.ok(related.customers[0].deletedAt instanceof Date);
  assert.deepEqual(Object.keys(related.customers[0]).sort(),['deletedAt','id','name']);
  assert.deepEqual(Object.keys(related.jobs[0]).sort(),['customerId','deletedAt','id','title']);
  assert.deepEqual(related.jobs.map(row=>row.id),[job.id]);assert.deepEqual(related.invoicedQuoteIds,[quote.id]);
  assert.deepEqual(await repo.related(foreign.currentTenantId!,'quotes',[quote]),{customers:[],jobs:[],invoicedQuoteIds:[]});
  assert.equal((await repo.read(tenant,'quotes',{q:'Archived historical label',limit:25}))[0].id,quote.id);
});

test('PostgreSQL real middleware: tenant-shared viewer reads, outsider denial and revoked module access', async () => {
  // This test uses real authentication and entitlement middleware, unlike the
  // separately executed DB-free route test whose guards/repository are injected.
  const viewer = await createTestUser();
  const moduleRow = await createTestModule('tradeflowkit');
  const tenant = owner.currentTenantId!;
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { signToken } = await import('../src/lib/auth.js');
  const { requireTenantMember, requireTenantModuleAccess } = await import('../src/lib/tenant-auth.js');
  const { registerTradeFlowKitRevenueReadRoutes } = await import('../src/routes/tradeflowkit-revenue-read-routes.js');
  const app = Fastify();
  const headers = (user: typeof owner, tenantId: string) => ({
    authorization: `Bearer ${signToken({ userId:user.id,email:user.email,role:user.role,tokenVersion:user.tokenVersion,sessionType:'platform' })}`,
    'x-tenant-id': tenantId,
  });
  try {
    await db.insert(tenantUsers).values({tenantId:tenant,userId:viewer.id,role:'viewer'});
    await db.insert(tenantModules).values([
      {tenantId:tenant,moduleId:moduleRow.id,status:'enabled',source:'admin',allowAllMembers:false},
      {tenantId:foreign.currentTenantId!,moduleId:moduleRow.id,status:'enabled',source:'admin',allowAllMembers:true},
    ]);
    await db.insert(tenantUserModuleAccess).values({tenantId:tenant,userId:viewer.id,moduleId:moduleRow.id,accessLevel:'viewer'});
    await app.register(cookie);
    registerTradeFlowKitRevenueReadRoutes(app,createRevenueReadRepository(db),[requireTenantMember,requireTenantModuleAccess('tradeflowkit')]);
    const [record] = await db.insert(tradeflowkitCustomers).values({tenantId:tenant,createdByUserId:owner.id,name:'Owned by someone else'}).returning();
    const [archived] = await db.insert(tradeflowkitCustomers).values({tenantId:tenant,createdByUserId:owner.id,name:'Archived middleware record',deletedAt:new Date()}).returning();
    const [otherTenant] = await db.insert(tradeflowkitCustomers).values({tenantId:foreign.currentTenantId!,createdByUserId:foreign.id,name:'Foreign middleware record'}).returning();
    const url='/v1/modules/tradeflowkit/revenue/customers/'+record.id;
    assert.equal((await app.inject({url:'/v1/modules/tradeflowkit/revenue/invalid?limit=bad'})).statusCode,401);
    for(const user of [owner,viewer]) {
      const result=await app.inject({url,headers:headers(user,tenant)});
      assert.equal(result.statusCode,200,result.body); assert.equal(result.json().item.id,record.id);
      const list=await app.inject({url:'/v1/modules/tradeflowkit/revenue/customers?q='+record.id,headers:headers(user,tenant)});
      assert.equal(list.statusCode,200,list.body);assert.equal(list.json().items[0].id,record.id);
    }
    const outsider=await app.inject({url,headers:headers(foreign,tenant)}); assert.equal(outsider.statusCode,404,outsider.body);
    const wrongTenant=await app.inject({url,headers:headers(viewer,foreign.currentTenantId!)}); assert.equal(wrongTenant.statusCode,404,wrongTenant.body);
    const failures=[];
    for(const id of [archived.id,otherTenant.id,randomUUID()]) {
      const result=await app.inject({url:'/v1/modules/tradeflowkit/revenue/customers/'+id,headers:headers(viewer,tenant)});
      assert.equal(result.statusCode,404,result.body);failures.push(result.json());
    }
    assert.deepEqual(failures[0],failures[1]);assert.deepEqual(failures[1],failures[2]);
    await db.update(tenantUserModuleAccess).set({accessLevel:'none'}).where(and(eq(tenantUserModuleAccess.tenantId,tenant),eq(tenantUserModuleAccess.userId,viewer.id),eq(tenantUserModuleAccess.moduleId,moduleRow.id)));
    const revoked=await app.inject({url,headers:headers(viewer,tenant)});assert.equal(revoked.statusCode,403,revoked.body);
  } finally {
    await app.close();
    await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.moduleId,moduleRow.id));
    await db.delete(tenantModules).where(eq(tenantModules.moduleId,moduleRow.id));
    await cleanupUser(viewer.id);await cleanupModule(moduleRow.id);
  }
});
