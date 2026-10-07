process.env.APP_ENV = 'test'; process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'operatoros-ai-browser-synthetic-session-secret';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '../../web/node_modules/@playwright/test/index.mjs';
import { sql } from 'drizzle-orm';
import { db, closeDatabasePool } from '../src/db.js';
import { createTestUser, createTestModule, ensureSchemaReady } from './_setup.js';
import { tenantModules } from '../src/schema.js';
import { ensureSharedAiBudgetTables } from '../src/lib/shared-ai-budget-db-init.js';
import { assertDisposableDatabaseEnvironment } from '../../../scripts/parity/lib/database.mjs';

assertDisposableDatabaseEnvironment(process.env);
let app: any; let browser: any; let origin: string; let actor: any; let moduleId: string;
let providerCalls = 0;
let providerGate: Promise<void> | undefined;
let providerEntered: (() => void) | undefined;
let responseMode: 'valid' | 'invalid' | 'unknown' = 'valid';
const originalFetch = globalThis.fetch;
const names = ['OPERATOROS_AI_SPEND_ENABLED','OPERATOROS_BUDGETED_AI_PROVIDER','OPENAI_API_KEY','OPERATOROS_BUDGETED_AI_MODEL','OPERATOROS_BUDGETED_AI_PRICING_JSON'];
const previous = new Map(names.map(name => [name, process.env[name]]));
const root = resolve(import.meta.dirname, '../../..');

before(async () => {
  await ensureSchemaReady(); await ensureSharedAiBudgetTables();
  actor = await createTestUser(); moduleId = (await createTestModule('techdeck')).id;
  await db.insert(tenantModules).values({ tenantId: actor.currentTenantId, moduleId, status: 'enabled', source: 'admin', allowAllMembers: true });
  await db.execute(sql`INSERT INTO shared_ai_budget_policies (tenant_id,module_id,enabled,per_call_micros,daily_micros,monthly_micros)
    VALUES (${actor.currentTenantId},${moduleId},true,52000,1000000,1000000)`);
  const pricing = { model: 'synthetic-model', currency: 'USD', effectiveDate: new Date().toISOString().slice(0,10),
    inputMicrosPerMillion: 2000000, cachedInputMicrosPerMillion: 200000, cacheWriteMicrosPerMillion: 2500000, outputMicrosPerMillion: 10000000 };
  Object.assign(process.env, { OPERATOROS_AI_SPEND_ENABLED:'1',OPERATOROS_BUDGETED_AI_PROVIDER:'openai-responses',
    OPENAI_API_KEY:'synthetic-offline-browser',OPERATOROS_BUDGETED_AI_MODEL:pricing.model,OPERATOROS_BUDGETED_AI_PRICING_JSON:JSON.stringify(pricing) });
  globalThis.fetch = (async url => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); providerCalls++;
    if (providerGate) { providerEntered?.(); await providerGate; }
    return Response.json({ model:pricing.model,service_tier:'default',status:'completed',
      output:[{ type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:responseMode === 'invalid' ? 'unvalidated synthetic output' : JSON.stringify({
        summary:'Review the synthetic service evidence.',checks:['Compare the recorded timestamps before planning a change.'],reviewRequired:true,executionPerformed:false })}] }],
      ...(responseMode === 'unknown' ? {} : { usage:{input_tokens:100,output_tokens:30,input_tokens_details:{cached_tokens:0,cache_write_tokens:0}} }) });
  }) as typeof fetch;
  const { signToken } = await import('../src/lib/auth.js');
  const token = signToken({ userId:actor.id,email:actor.email,role:actor.role,tokenVersion:actor.tokenVersion,sessionType:'platform' });
  // Bundle the actual console. Only surrounding workspace/auth transport is fixture supplied.
  // Its form calls the actual Fastify route and PostgreSQL budget service.
  const bundle = await build({ write:false,bundle:true,format:'iife',platform:'browser',jsx:'automatic',
    stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Console from './apps/web/src/components/module-shells/TechDeckLiteralConsole.tsx';const root=createRoot(document.getElementById('root'));const mount=tenantKey=>root.render(<Console tenantKey={tenantKey} canWrite={true} canManage={false} area='compliance'/>);window.__switchTenant=()=>mount('another-synthetic-tenant');mount('synthetic');`,resolveDir:root,loader:'tsx'},
    define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'synthetic-workspace-transport',setup(builder){
      builder.onResolve({filter:/^@\/lib\/auth$/},()=>({path:'synthetic-auth',namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`export const moduleShellApi={techdeck:{getLiteralWorkspace:async()=>({exports:[]}),literalAction:async(path,input,options)=>{const r=await fetch('/v1/modules/techdeck/'+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':${JSON.stringify('Bearer '+token)},'X-Tenant-Id':${JSON.stringify(actor.currentTenantId)},'Idempotency-Key':options.idempotencyKey},body:JSON.stringify(input)});const data=await r.json();if(!r.ok)throw data;return data;}}};`}));
    }}] });
  const Fastify = (await import('fastify')).default; app = Fastify();
  await app.register((await import('@fastify/cookie')).default);
  await (await import('../src/routes/techdeck-literal-routes.js')).registerTechDeckLiteralRoutes(app);
  app.get('/_fixture',async (_: any,reply: any)=>reply.type('text/html').send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#102027;color:white"><main id="root"></main><script src="/_fixture.js"></script></body></html>'));
  app.get('/_fixture.js',async (_: any,reply: any)=>reply.type('text/javascript').send(bundle.outputFiles[0].text));
  origin = await app.listen({host:'127.0.0.1',port:0});
  browser = await chromium.launch({headless:true});
  mkdirSync(resolve(root,'build/ai'),{recursive:true});
});
after(async()=>{
  if(browser)await browser.close();if(app)await app.close();globalThis.fetch=originalFetch;
  for(const [name,value]of previous){if(value===undefined)delete process.env[name];else process.env[name]=value;}
  await closeDatabasePool();
});

for(const [name,viewport]of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]as const){
  test(`actual TechDeck console renders reviewed guidance, replays safely and shows disabled recovery (${name})`,async()=>{
    const page=await browser.newPage({viewport});
    const errors:string[]=[];page.on('pageerror',(error:any)=>errors.push(error.message));
    await page.goto(origin+'/_fixture');
    await page.getByRole('textbox',{name:'IT operations guidance request'}).fill('Synthetic service issue '+name);
    const beforeCalls=providerCalls;
    await page.getByRole('button',{name:'Generate reviewed guidance'}).click();
    await page.getByRole('region',{name:'IT operations guidance'}).waitFor();
    assert.match(await page.getByRole('region',{name:'IT operations guidance'}).innerText(),/Review the synthetic service evidence/);
    assert.match(await page.getByRole('region',{name:'IT operations guidance'}).innerText(),/No commands were run/);
    assert.equal(providerCalls,beforeCalls+1);
    await page.getByRole('button',{name:'Generate reviewed guidance'}).click();
    await page.getByRole('region',{name:'IT operations guidance'}).waitFor();
    assert.equal(providerCalls,beforeCalls+1);
    await page.screenshot({path:resolve(root,'build/ai',`guidance-${name}.png`),fullPage:true});
    process.env.OPERATOROS_AI_SPEND_ENABLED='0';
    await page.getByRole('textbox',{name:'IT operations guidance request'}).fill('Another synthetic issue '+name);
    await page.getByRole('button',{name:'Generate reviewed guidance'}).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(),/unavailable/);
    assert.match(await page.getByRole('alert').innerText(),/Reference:/);
    assert.equal(await page.getByRole('region',{name:'IT operations guidance'}).count(),0);
    assert.equal(providerCalls,beforeCalls+1);process.env.OPERATOROS_AI_SPEND_ENABLED='1';
    assert.deepEqual(errors,[]);await page.close();
  });
}

test('an answer completing after a tenant switch stays out of the new tenant view', async () => {
  const page = await browser.newPage();
  let releaseProvider!: () => void;
  providerGate = new Promise(resolve => { releaseProvider = resolve; });
  const entered = new Promise<void>(resolve => { providerEntered = resolve; });
  try {
    await page.goto(origin + '/_fixture');
    await page.getByRole('textbox', { name: 'IT operations guidance request' }).fill('Synthetic delayed issue');
    const response = page.waitForResponse(r => r.url().endsWith('/itops/query'));
    await page.getByRole('button', { name: 'Generate reviewed guidance' }).click();
    await entered;
    assert.equal(await page.getByRole('button',{name:'Generating guidance…'}).isDisabled(),true);
    await page.evaluate(() => (window as any).__switchTenant());
    releaseProvider();
    await response;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByRole('region', { name: 'IT operations guidance' }).count(), 0);
    assert.equal(await page.getByText('Guidance is ready for your review. No commands were run.').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Generate reviewed guidance' }).isDisabled(), false);
  } finally {
    releaseProvider(); providerGate = undefined; providerEntered = undefined; await page.close();
  }
});

for (const mode of ['invalid', 'unknown'] as const) {
  test(`visible ${mode} guidance error and same-key retry do not add a provider call`, async () => {
    responseMode = mode;
    const page = await browser.newPage();
    try {
      await page.goto(origin + '/_fixture');
      await page.getByRole('textbox',{name:'IT operations guidance request'}).fill('Synthetic '+mode+' issue');
      const initialCalls = providerCalls;
      await page.getByRole('button',{name:'Generate reviewed guidance'}).click();
      await page.getByRole('alert').waitFor();
      assert.match(await page.getByRole('alert').innerText(),/Reference:/);
      assert.doesNotMatch(await page.getByRole('alert').innerText(),/unvalidated synthetic output/);
      assert.equal(await page.getByRole('region',{name:'IT operations guidance'}).count(),0);
      await page.getByRole('button',{name:'Generate reviewed guidance'}).click();
      await page.getByRole('alert').waitFor();
      await expect(page.getByRole('alert')).toContainText(mode === 'unknown' ? /pending reconciliation/ : /did not produce usable guidance/);
      assert.equal(providerCalls,initialCalls+1);
      await page.screenshot({path:resolve(root,'build/ai',`guidance-error-${mode}.png`),fullPage:true});
    } finally { responseMode = 'valid'; await page.close(); }
  });
}
