import { before,after,afterEach,test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { eq,sql } from 'drizzle-orm';
import Fastify,{ type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { db,closeDatabasePool } from '../src/db.js';
import { modules,tenantUsers,tenantModules,tenantUserModuleAccess } from '../src/schema.js';
import { createTestUser,cleanupUser,ensureSchemaReady } from './_setup.js';
import { assertDisposableDatabaseEnvironment } from '../../../scripts/parity/lib/database.mjs';
import { setEmbeddingProviderForTests,getEmbeddingProvider,createOpenAiEmbeddingProvider,validateEmbeddingVector,EmbeddingError,type EmbeddingProvider } from '../src/lib/embedding-provider.js';
import { resolutionVectorCapability,verifyResolutionSemanticTables,ensureResolutionSemanticTables } from '../src/lib/techdeck-resolution-semantic-db.js';
import { saveSemanticSettings,semanticStatus,previewSemanticIndex,queueSemanticIndex,semanticIndexStatus,screenEmbeddingText } from '../src/lib/techdeck-resolution-embeddings.js';
import { importResolutionExport,type ResolutionContext } from '../src/lib/techdeck-resolution-ingestion.js';
import { searchResolutionIncidents,updateResolutionIncident } from '../src/lib/techdeck-resolution-workspace.js';
import { processSharedJob } from '../src/lib/shared-background-jobs.js';
import { registerTechDeckResolutionRoutes } from '../src/routes/techdeck-resolution-routes.js';

const raw=readFileSync(new URL('./fixtures/techdeck-resolution-cam-wal-v1.json',import.meta.url),'utf8');
type Actor=Awaited<ReturnType<typeof createTestUser>>;
let owner:Actor,foreign:Actor,member:Actor,moduleId:string,app:FastifyInstance;
let calls=0,mode:'ok'|'fail'|'change'|'revoke'='ok',targetId='';
let signToken:typeof import('../src/lib/auth.js').signToken;
const vectorMode=process.env.TECHDECK_VECTOR_TEST==='1';
function context(actor=owner,role:ResolutionContext['role']='owner'):ResolutionContext { return { tenantId:actor.currentTenantId!,actorUserId:actor.id,moduleId,role }; }
const adapter:EmbeddingProvider={ state:'test',identity:{ provider:'synthetic-test',model:'judged-fixture-v1',dimensions:3 },async embed(text) {
  calls++;
  if(mode==='fail') throw new EmbeddingError('EMBEDDING_PROVIDER_UNAVAILABLE');
  if(mode==='change') { await db.execute(sql`UPDATE techdeck_resolution_incidents SET version=version+1 WHERE tenant_id=${owner.currentTenantId} AND id=${targetId}`); mode='ok'; }
  if(mode==='revoke') { await db.execute(sql`UPDATE tenant_users SET role='member' WHERE tenant_id=${owner.currentTenantId} AND user_id=${owner.id}`);mode='ok'; }
  // Labeled fixture vectors validate retrieval/ranking mechanics, not live model quality.
  return { vector:text.includes('printer-only')?[0,1,0]:[1,0,0],inputTokens:10 };
} };
async function imported(title:string,actor=owner) {
  const data=JSON.parse(raw);data.incident.title=`${title} ${randomUUID()}`;
  return importResolutionExport(context(actor),{ rawText:JSON.stringify(data),humanReport:null,links:{} },randomUUID());
}
async function enable(limit=1000) {
  const status=await semanticStatus(context());
  return saveSemanticSettings(context(),{ enabled:true,dailyRequestLimit:limit,expectedVersion:status.version,egressReviewed:true });
}
async function queue(id:string,version=1) {
  const preview=await previewSemanticIndex(context(),id,{ expectedVersion:version });
  return queueSemanticIndex(context(),id,{ expectedVersion:version,previewSha256:preview.previewSha256,privacyReviewed:true });
}
async function drain(id:string,limit=300) {
  const jobs=await db.execute(sql`UPDATE shared_jobs SET status='processing',lease_owner='semantic-test',lease_expires_at=NOW()+INTERVAL '30 seconds'
    WHERE id IN(SELECT j.id FROM shared_jobs j JOIN techdeck_resolution_embeddings e ON e.tenant_id=j.tenant_id AND e.id=j.payload_json->>'embeddingId' AND e.generation=j.payload_json->>'generation' WHERE j.tenant_id=${owner.currentTenantId} AND e.incident_id=${id} AND j.status IN ('pending','retry') ORDER BY j.created_at,j.id LIMIT ${limit}) RETURNING *`);
  for(const row of jobs.rows) await processSharedJob(row);
}
before(async()=>{
  assertDisposableDatabaseEnvironment(process.env);assert.equal(process.env.APP_ENV,'test');
  // Capability probe precedes disposable-only extension DDL. Production startup
  // and supported release apply never install an extension.
  const capability=await resolutionVectorCapability();
  if(vectorMode) { assert.equal(capability.available,true);assert.equal(capability.superuser,true);await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public`); }
  await ensureSchemaReady();
  [owner,foreign,member]=await Promise.all([createTestUser(),createTestUser(),createTestUser()]);
  moduleId=(await db.select().from(modules).where(eq(modules.slug,'techdeck')))[0].id;
  for(const actor of [owner,foreign]) await db.insert(tenantModules).values({tenantId:actor.currentTenantId!,moduleId,status:'enabled',source:'admin',allowAllMembers:true});
  await db.insert(tenantUsers).values({tenantId:owner.currentTenantId!,userId:member.id,role:'member'});
  await db.insert(tenantUserModuleAccess).values({tenantId:owner.currentTenantId!,userId:member.id,moduleId,accessLevel:'user'});
  ({signToken}=await import('../src/lib/auth.js'));app=Fastify();await app.register(cookie);await registerTechDeckResolutionRoutes(app);await app.ready();
});
afterEach(async()=>{
  mode='ok';calls=0;setEmbeddingProviderForTests(null);
  await db.execute(sql`UPDATE tenant_users SET role='owner' WHERE tenant_id=${owner.currentTenantId} AND user_id=${owner.id}`);
  await db.execute(sql`DELETE FROM shared_jobs WHERE tenant_id=${owner.currentTenantId} AND handler_key='techdeck.resolution.embed.v1'`);
  await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id=${owner.currentTenantId} AND operation LIKE 'resolution.embedding.%'`);
  await db.execute(sql`DELETE FROM techdeck_resolution_incidents WHERE tenant_id IN (${owner.currentTenantId},${foreign.currentTenantId})`);
  await db.execute(sql`DELETE FROM techdeck_resolution_semantic_settings WHERE tenant_id IN (${owner.currentTenantId},${foreign.currentTenantId})`);
});
after(async()=>{if(app)await app.close();for(const actor of [member,foreign,owner])if(actor)await cleanupUser(actor.id);await closeDatabasePool();});

test('portable release applies twice, verifies constraints and reports extension capability truthfully',async()=>{
  await ensureResolutionSemanticTables();await verifyResolutionSemanticTables();
  assert.equal((await resolutionVectorCapability()).installed,vectorMode);
  const state=await semanticStatus(context());assert.equal(state.state,'provider_disabled');assert.equal(getEmbeddingProvider(),null);
});
test('provider input and response contract rejects invalid vectors and never reflects HTTP body',async()=>{
  for(const v of [[1,NaN,0],[0,0,0],[1,0],[],[Infinity,1,1]])assert.throws(()=>validateEmbeddingVector(v,3));
  let payload:any;
  const transport=(async(url:unknown,init:any)=>{assert.equal(url,'https://api.openai.com/v1/embeddings');payload=JSON.parse(init.body);return new Response(JSON.stringify({model:'text-embedding-3-small',data:[{index:0,embedding:[1,0,0]}],usage:{prompt_tokens:8}}));}) as typeof fetch;
  const provider=createOpenAiEmbeddingProvider({provider:'openai',model:'text-embedding-3-small',dimensions:3},'test-only-value',transport);
  assert.deepEqual((await provider.embed('Synthetic text')).vector,[1,0,0]);assert.equal(payload.dimensions,3);assert.equal(payload.encoding_format,'float');
  await assert.rejects(()=>provider.embed('x'.repeat(6001)),{code:'EMBEDDING_INPUT_INVALID'});
  const failing=createOpenAiEmbeddingProvider(provider.identity,'test-only-value',(async()=>new Response('sensitive response',{status:429})) as typeof fetch);
  await assert.rejects(()=>failing.embed('Synthetic text'),error=>error instanceof EmbeddingError&&error.code==='EMBEDDING_PROVIDER_RATE_LIMIT'&&!error.message.includes('sensitive'));
});
test('egress screening rejects secrets and masks labels, URLs, profiles, email and addresses',()=>{
  assert.throws(()=>screenEmbeddingText('password=syntheticValue'),{code:'RESOLUTION_REDACTION_REQUIRED'});
  const safe=screenEmbeddingText('Client Alpha user@example.invalid https://example.invalid/private C:\\Users\\Person\\file.txt 192.168.5.1',['Client Alpha']);
  for(const value of ['Client Alpha','user@example.invalid','example.invalid','Person','192.168.5.1'])assert.ok(!safe.includes(value));
});
test('default and missing-vector requests preserve exact search without provider traffic',async()=>{
  await imported('Fallback');
  const initial=await searchResolutionIncidents(context(),{q:'0x800f0915',semantic:'1'});assert.ok(initial.items.length);assert.equal(initial.embeddings,'provider_disabled');assert.equal(calls,0);
  if(!vectorMode) {setEmbeddingProviderForTests(adapter);assert.equal((await semanticStatus(context())).state,'vector_unavailable');await assert.rejects(()=>enable(),{code:'RESOLUTION_SEMANTIC_UNAVAILABLE'});const fallback=await searchResolutionIncidents(context(),{q:'0x800f0915',semantic:'1'});assert.ok(fallback.items.length);assert.equal(fallback.embeddings,'vector_unavailable');assert.equal(calls,0);}
});
test('native semantic settings require membership, write access, admin role and explicit review',async()=>{
  const headers=(actor:Actor,tenant=owner.currentTenantId!)=>({authorization:`Bearer ${signToken({userId:actor.id,email:actor.email,role:actor.role,tokenVersion:actor.tokenVersion,sessionType:'platform'})}`,'x-tenant-id':tenant});
  const base='/v1/modules/techdeck/resolution-intelligence/semantic';
  const input={enabled:true,dailyRequestLimit:50,expectedVersion:0,egressReviewed:true};
  assert.equal((await app.inject({method:'PUT',url:base,headers:headers(member),payload:input})).statusCode,403);
  assert.equal((await app.inject({method:'GET',url:base,headers:headers(foreign)})).statusCode,404);
  assert.equal((await app.inject({method:'PUT',url:base,headers:headers(owner),payload:{...input,egressReviewed:false}})).statusCode,400);
  assert.equal((await app.inject({method:'PUT',url:base,headers:headers(owner),payload:{...input,tenantId:foreign.currentTenantId}})).statusCode,400);
});
test('preview is local and complete, foreign preview fails, exact hash and revision are required',async()=>{
  setEmbeddingProviderForTests(adapter);const item=await imported('Preview'),other=await imported('Foreign',foreign);
  const p=await previewSemanticIndex(context(),item.incidentId!,{expectedVersion:1});assert.ok(p.chunks.length);assert.equal(p.requestCount,p.chunks.length);assert.equal(calls,0);assert.ok(!JSON.stringify(p).includes('SYNTHETIC-ENDPOINT-01'));
  await assert.rejects(()=>previewSemanticIndex(context(),other.incidentId!,{expectedVersion:1}),{code:'RESOLUTION_NOT_FOUND'});
  await assert.rejects(()=>previewSemanticIndex(context(),item.incidentId!,{expectedVersion:2}),{code:'RESOLUTION_VERSION_CONFLICT'});
  if(vectorMode){await enable();await assert.rejects(()=>queueSemanticIndex(context(),item.incidentId!,{expectedVersion:1,privacyReviewed:true,previewSha256:'0'.repeat(64)}),{code:'RESOLUTION_PREVIEW_CHANGED'});}
});
// Both environments execute explicit assertions; vector acceptance is a separate
// required CI job, not an optional/skipped test in the plain PostgreSQL suite.
if(vectorMode) {
  test('reviewed indexing is asynchronous, idempotent, source-bound and persists real pgvector-searchable arrays',async()=>{
    setEmbeddingProviderForTests(adapter);await enable();const item=await imported('Index');
    const first=await queue(item.incidentId!);assert.ok(first.queued>0);assert.equal(calls,0);assert.equal((await queue(item.incidentId!)).queued,0);
    await drain(item.incidentId!);assert.equal(calls,first.queued);assert.equal((await queue(item.incidentId!)).queued,0);
    const status=await semanticIndexStatus(context(),item.incidentId!);assert.equal(status.items[0].status,'ready');assert.equal(status.items[0].count,first.queued);
    const result=await searchResolutionIncidents(context(),{q:'Unseen symptom paraphrase',semantic:'1'});assert.equal(result.embeddings,'available');assert.equal(result.items[0].id,item.incidentId);assert.equal(result.items[0].semantic_score,1);assert.equal(result.groups.knownFixes.length,0);assert.ok(Number(result.items[0].warning_count)>0);
    const ledger=await db.execute(sql`SELECT count(*)::int AS n FROM shared_usage_events WHERE tenant_id=${owner.currentTenantId} AND operation='resolution.embedding.attempt'`);assert.equal(ledger.rows[0].n,calls);
    const e=(await db.execute(sql`SELECT * FROM techdeck_resolution_embeddings WHERE tenant_id=${owner.currentTenantId} LIMIT 1`)).rows[0];
    await assert.rejects(()=>db.execute(sql`UPDATE techdeck_resolution_embeddings SET embedding=ARRAY[]::real[] WHERE id=${e.id}`));
    await assert.rejects(()=>db.execute(sql`UPDATE techdeck_resolution_embeddings SET tenant_id=${foreign.currentTenantId} WHERE id=${e.id}`));
  });
  test('judged ranking keeps exact error first over semantically identical candidates and preserves warning groups',async()=>{
    setEmbeddingProviderForTests(adapter);await enable();const exact=await imported('Judged exact'),other=await imported('Judged unrelated');
    await db.execute(sql`UPDATE techdeck_resolution_identifiers SET normalized_value='unrelated',original_value='unrelated' WHERE tenant_id=${owner.currentTenantId} AND incident_id=${other.incidentId} AND kind='error_code'`);
    for(const i of [exact,other]){await queue(i.incidentId!);await drain(i.incidentId!);}
    const result=await searchResolutionIncidents(context(),{q:'0x800f0915',semantic:'1'});assert.equal(result.items[0].id,exact.incidentId);assert.ok(result.groups.warnings.includes(exact.incidentId));assert.equal(result.ranking,'hybrid_v2_exact_first');
  });
  test('tenant and role restrictions exclude vectors before ranking; no candidate means no query egress',async()=>{
    setEmbeddingProviderForTests(adapter);await enable();const item=await imported('Private');await updateResolutionIncident(context(),item.incidentId!,{expectedVersion:1,minimumRole:'owner'});await queue(item.incidentId!,2);await drain(item.incidentId!);const before=calls;
    const memberContext={...context(),actorUserId:member.id,role:'member' as const};
    const result=await searchResolutionIncidents(memberContext,{q:'Novel wording',semantic:'1'});assert.equal(result.items.length,0);assert.equal(result.embeddings,'not_indexed');assert.equal(calls,before);
    assert.equal((await searchResolutionIncidents(context(foreign),{q:'Novel wording',semantic:'1'})).items.length,0);assert.equal(calls,before);
  });
  test('source changes before or during jobs withhold stale vectors',async()=>{
    setEmbeddingProviderForTests(adapter);await enable();const item=await imported('Stale before');await queue(item.incidentId!);await updateResolutionIncident(context(),item.incidentId!,{expectedVersion:1,reviewStatus:'reviewed'});await drain(item.incidentId!);assert.equal(calls,0);
    await queue(item.incidentId!,2);mode='change';targetId=item.incidentId!;await drain(item.incidentId!);assert.equal(calls,1);
    const ready=await db.execute(sql`SELECT count(*)::int AS n FROM techdeck_resolution_embeddings WHERE tenant_id=${owner.currentTenantId} AND status='ready'`);assert.equal(ready.rows[0].n,0);
  });
  test('role revocation during provider call prevents committing vectors and later egress',async()=>{
    setEmbeddingProviderForTests(adapter);await enable();const item=await imported('Revoke');await queue(item.incidentId!);mode='revoke';await drain(item.incidentId!);assert.equal(calls,1);
    const ready=await db.execute(sql`SELECT count(*)::int AS n FROM techdeck_resolution_embeddings WHERE tenant_id=${owner.currentTenantId} AND status='ready'`);assert.equal(ready.rows[0].n,0);
  });
  test('provider failures are visible, retry three times, retain incident and never break exact search',async()=>{
    setEmbeddingProviderForTests(adapter);await enable();const item=await imported('Failure');await queue(item.incidentId!);mode='fail';for(let n=0;n<3;n++)await drain(item.incidentId!,1);
    const jobs=await db.execute(sql`SELECT status,attempt_count FROM shared_jobs WHERE tenant_id=${owner.currentTenantId} AND status='dead_letter'`);assert.equal(jobs.rows.length,1);assert.equal(jobs.rows[0].attempt_count,3);
    assert.ok((await semanticIndexStatus(context(),item.incidentId!)).items.some(row=>row.status==='failed'));
    assert.ok((await searchResolutionIncidents(context(),{q:'0x800f0915'})).items.length);assert.ok((await queue(item.incidentId!)).queued>=1);
  });
  test('daily cap is atomic, failed attempts consume it and queries degrade without egress',async()=>{
    setEmbeddingProviderForTests(adapter);await enable(1);const item=await imported('Limit');await queue(item.incidentId!);
    const jobs=await db.execute(sql`UPDATE shared_jobs SET status='processing',lease_owner='semantic-test' WHERE tenant_id=${owner.currentTenantId} RETURNING *`);
    await Promise.all(jobs.rows.map(row=>processSharedJob(row)));assert.equal(calls,1);
    const result=await searchResolutionIncidents(context(),{q:'0x800f0915',semantic:'1'});assert.equal(result.embeddings,'daily_limit');assert.ok(result.items.length);assert.equal(calls,1);
  });
  test('model changes and organization disable exclude previously indexed vectors',async()=>{
    setEmbeddingProviderForTests(adapter);await enable();const item=await imported('Config');await queue(item.incidentId!);await drain(item.incidentId!);const previous=calls;
    setEmbeddingProviderForTests({...adapter,identity:{...adapter.identity,model:'changed-model'}});assert.equal((await searchResolutionIncidents(context(),{q:'Novel wording',semantic:'1'})).embeddings,'not_indexed');assert.equal(calls,previous);
    const state=await semanticStatus(context());await saveSemanticSettings(context(),{enabled:false,dailyRequestLimit:100,expectedVersion:state.version});assert.equal((await searchResolutionIncidents(context(),{q:'0x800f0915',semantic:'1'})).embeddings,'organization_disabled');assert.equal(calls,previous);
  });
  test('source errors and query provider failure preserve literal matches and never leak raw input into jobs',async()=>{
    setEmbeddingProviderForTests(adapter);await enable();const item=await imported('Provider query');await queue(item.incidentId!);await drain(item.incidentId!);mode='fail';
    const result=await searchResolutionIncidents(context(),{q:'0x800f0915',semantic:'1'});assert.equal(result.embeddings,'provider_unavailable');assert.ok(result.items.length);
    const payloads=await db.execute(sql`SELECT payload_json FROM shared_jobs WHERE tenant_id=${owner.currentTenantId}`);
    for(const row of payloads.rows)assert.deepEqual(Object.keys(row.payload_json as object).sort(),['embeddingId','generation']);
  });
  test('bounded exact vector search measures 2000 chunks and declines larger corpora without provider traffic',async(t)=>{
    setEmbeddingProviderForTests(adapter);await enable();const item=await imported('Bounded benchmark');await queue(item.incidentId!);await drain(item.incidentId!);
    const original=(await db.execute(sql`SELECT count(*)::int AS n FROM techdeck_resolution_embeddings WHERE tenant_id=${owner.currentTenantId}`)).rows[0].n as number;
    await db.execute(sql`INSERT INTO techdeck_resolution_embeddings(tenant_id,incident_id,revision,source_version,document_id,chunk_offset,source_hash,input_hash,redactor_version,provider,model,dimensions,settings_version,generation,status,embedding)
      SELECT e.tenant_id,e.incident_id,e.revision,e.source_version,e.document_id,100000+s.n,e.source_hash,e.input_hash,e.redactor_version,e.provider,e.model,e.dimensions,e.settings_version,gen_random_uuid(),'ready',e.embedding
      FROM (SELECT * FROM techdeck_resolution_embeddings WHERE tenant_id=${owner.currentTenantId} LIMIT 1) e CROSS JOIN generate_series(1,${2000-original}) s(n)`);
    const started=performance.now();const accepted=await searchResolutionIncidents(context(),{q:'Unseen synonym',semantic:'1'});const elapsed=performance.now()-started;
    assert.equal(accepted.embeddings,'available');assert.equal(accepted.items[0].id,item.incidentId);
    const plan=await db.execute(sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT max(1-(embedding::public.vector <=> '[1,0,0]'::public.vector)) FROM techdeck_resolution_embeddings WHERE tenant_id=${owner.currentTenantId} AND incident_id=${item.incidentId} AND status='ready'`);
    const report=(plan.rows[0]['QUERY PLAN'] as Array<Record<string,unknown>>)[0];
    t.diagnostic(JSON.stringify({fixtureChunks:2000,hybridElapsedMs:Math.round(elapsed),vectorExecutionMs:report['Execution Time'],provider:'synthetic-only',dimensions:3}));
    await db.execute(sql`INSERT INTO techdeck_resolution_embeddings(tenant_id,incident_id,revision,source_version,document_id,chunk_offset,source_hash,input_hash,redactor_version,provider,model,dimensions,settings_version,generation,status,embedding)
      SELECT tenant_id,incident_id,revision,source_version,document_id,999999,source_hash,input_hash,redactor_version,provider,model,dimensions,settings_version,gen_random_uuid(),'ready',embedding FROM techdeck_resolution_embeddings WHERE tenant_id=${owner.currentTenantId} LIMIT 1`);
    const before=calls;const fallback=await searchResolutionIncidents(context(),{q:'0x800f0915',semantic:'1'});assert.equal(fallback.embeddings,'narrow_filters');assert.ok(fallback.items.length);assert.equal(calls,before);
  });
  test('query access revoked while awaiting provider is denied instead of returning stale authorized results',async()=>{
    setEmbeddingProviderForTests(adapter);await enable();const item=await imported('Query access');await queue(item.incidentId!);await drain(item.incidentId!);mode='revoke';
    await assert.rejects(()=>searchResolutionIncidents(context(),{q:'0x800f0915',semantic:'1'}),{code:'RESOLUTION_ACCESS_DENIED'});
  });
  test('stale query actor is rejected before external use',async()=>{
    setEmbeddingProviderForTests(adapter);await enable();const item=await imported('Before query');await queue(item.incidentId!);await drain(item.incidentId!);const before=calls;
    await db.execute(sql`UPDATE tenant_users SET role='member' WHERE tenant_id=${owner.currentTenantId} AND user_id=${owner.id}`);
    await assert.rejects(()=>searchResolutionIncidents(context(),{q:'0x800f0915',semantic:'1'}),{code:'RESOLUTION_ACCESS_DENIED'});assert.equal(calls,before);
  });
}
