process.env.SESSION_SECRET ||= 'operatoros-torqueshed-phase28-test-key';
process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUsers } from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app:any, ownerA:any, ownerB:any, member:any, moduleRow:any, moduleCreated=false;
let signToken:typeof import('../src/lib/auth.js').signToken;
function tenantFor(user:any){return user===ownerB?ownerB.currentTenantId:ownerA.currentTenantId;}
function headers(user:any,extra:Record<string,string>={}){return {authorization:`Bearer ${signToken({userId:user.id,email:user.email,role:user.role,tokenVersion:user.tokenVersion,sessionType:'platform'})}`,'x-tenant-id':tenantFor(user),...extra};}
async function inject(method:string,url:string,user?:any,payload?:unknown,extra:Record<string,string>={}){return app.inject({method,url,...(user?{headers:headers(user,extra)}:{}),...(payload===undefined?{}:{payload})});}

before(async()=>{
  await ensureSchemaReady();
  ({signToken}=await import('../src/lib/auth.js'));
  ownerA=await createTestUser(); ownerB=await createTestUser(); member=await createTestUser();
  [moduleRow]=await db.select().from(modules).where(eq(modules.slug,'torqueshed')).limit(1);
  if(!moduleRow){moduleRow=await createTestModule('torqueshed');moduleCreated=true;}
  await db.insert(tenantUsers).values({tenantId:ownerA.currentTenantId,userId:member.id,role:'member'});
  await db.insert(tenantModules).values([{tenantId:ownerA.currentTenantId,moduleId:moduleRow.id,status:'enabled',source:'admin',allowAllMembers:true},{tenantId:ownerB.currentTenantId,moduleId:moduleRow.id,status:'enabled',source:'admin',allowAllMembers:true}]);
  const Fastify=(await import('fastify')).default,cookie=(await import('@fastify/cookie')).default;
  const {registerTorqueShedRoutes}=await import('../src/routes/torqueshed-routes.js');
  const {registerTorqueShedSocialRoutes}=await import('../src/routes/torqueshed-social-routes.js');
  const {registerTorqueShedWebApiRoutes}=await import('../src/routes/torqueshed-web-api-routes.js');
  app=Fastify();await app.register(cookie);await registerTorqueShedRoutes(app);await registerTorqueShedSocialRoutes(app);await registerTorqueShedWebApiRoutes(app);await app.ready();
});

after(async()=>{
  if(app)await app.close();
  for(const user of [ownerA,ownerB]){if(!user)continue;const t=String(user.currentTenantId).replaceAll("'","''");for(const table of ['shared_attachment_blobs','shared_jobs','shared_exports','shared_activity_events','shared_notifications','shared_outbox_messages','shared_attachments','torqueshed_live_bay_messages','torqueshed_live_bay_members','torqueshed_live_bay_rate_windows','torqueshed_live_bays','torqueshed_share_links','torqueshed_build_journal_entries','torqueshed_build_parts','torqueshed_user_settings','torqueshed_diagnostic_entries','torqueshed_diagnostic_trouble_codes','torqueshed_diagnostic_sessions','torqueshed_build_tasks','torqueshed_build_stages','torqueshed_builds','torqueshed_vehicles']){try{await db.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id='${t}'`));}catch{}}}
  if(moduleRow&&ownerA&&ownerB)await db.delete(tenantModules).where(and(eq(tenantModules.moduleId,moduleRow.id),inArray(tenantModules.tenantId,[ownerA.currentTenantId,ownerB.currentTenantId])));
  for(const user of [member,ownerA,ownerB])if(user)await cleanupUser(user.id);
  if(moduleRow&&moduleCreated)await cleanupModule(moduleRow.id);
});

test('Phase 28 persists journal, parts, diagnostic report, safe sharing, search, settings and exports',async()=>{
  const vehicleResponse=await inject('POST','/v1/modules/torqueshed/vehicles',ownerA,{nickname:'Blackbird',year:1970,make:'Dodge',model:'Challenger',currentMileage:62000,vin:'JH4KA4650MC012345',visibility:'public_build'});
  assert.equal(vehicleResponse.statusCode,201,vehicleResponse.body);const vehicle=vehicleResponse.json();
  const buildResponse=await inject('POST','/v1/modules/torqueshed/builds',ownerA,{vehicleId:vehicle.id,title:'Blackbird Restomod',description:'Street build',status:'active',visibility:'public_build',budgetMinor:2500000});
  assert.equal(buildResponse.statusCode,201,buildResponse.body);const build=buildResponse.json();
  const journal=await inject('POST',`/v1/modules/torqueshed/builds/${build.id}/journal`,ownerA,{entryType:'milestone',title:'First fire',body:'Engine fired after harness checkout.',mileage:62012,costMinor:48000,laborMinutes:180,visibility:'public'});
  assert.equal(journal.statusCode,201,journal.body);assert.equal(journal.json().entry.entryType,'milestone');
  const part=await inject('POST',`/v1/modules/torqueshed/builds/${build.id}/parts`,ownerA,{name:'Coilover kit',manufacturer:'Garage Labs',partNumber:'GL-C70',category:'Suspension',status:'installed',quantity:1,unitCostMinor:189900});
  assert.equal(part.statusCode,201,part.body);
  const workspace=await inject('GET',`/v1/modules/torqueshed/builds/${build.id}/workspace`,member);
  assert.equal(workspace.statusCode,200,workspace.body);assert.equal(workspace.json().journal.length,1);assert.equal(workspace.json().parts.length,1);
  const diagnosticResponse=await inject('POST','/v1/modules/torqueshed/diagnostics',ownerA,{vehicleId:vehicle.id,title:'Intermittent crank',customerConcern:'Starter clicks after heat soak',symptoms:'Single click',visibility:'tenant'});
  assert.equal(diagnosticResponse.statusCode,201,diagnosticResponse.body);const diagnostic=diagnosticResponse.json();
  assert.equal((await inject('POST',`/v1/modules/torqueshed/diagnostics/${diagnostic.id}/trouble-codes`,ownerA,{code:'P0615',description:'Starter relay circuit'})).statusCode,201);
  assert.equal((await inject('POST',`/v1/modules/torqueshed/diagnostics/${diagnostic.id}/entries`,ownerA,{kind:'measurement',title:'Starter voltage drop',valueNumeric:1.8,unit:'V',outcome:'Above limit'}, {'Idempotency-Key':'phase28-reading-1'})).statusCode,201);
  const report=await inject('GET',`/v1/modules/torqueshed/diagnostics/${diagnostic.id}/report`,member);
  assert.equal(report.statusCode,200,report.body);assert.equal(report.json().report.troubleCodes[0].code,'P0615');assert.equal(report.json().report.privacy.vinMasked,'***012345');assert.doesNotMatch(report.body,/JH4KA4650MC012345/);
  const linkResponse=await inject('POST','/v1/modules/torqueshed/share-links',ownerA,{resourceType:'diagnostic_report',resourceId:diagnostic.id,allowDownload:false});
  assert.equal(linkResponse.statusCode,201,linkResponse.body);const token=linkResponse.json().shareLink.token;
  const publicReport=await inject('GET',`/v1/public/torqueshed/share/${token}`);
  assert.equal(publicReport.statusCode,200,publicReport.body);assert.doesNotMatch(publicReport.body,/vin|tenantId|ownerUserId/i);
  const settings=await inject('PUT','/v1/modules/torqueshed/settings',member,{units:'metric',reducedMotion:true,defaultGarageVisibility:'private',profileDiscoverable:false,communityNotifications:true,marketplaceNotifications:false,garageNotifications:true});
  assert.equal(settings.statusCode,200,settings.body);assert.equal(settings.json().settings.units,'metric');
  const search=await inject('GET','/v1/modules/torqueshed/search?q=Blackbird',member);assert.equal(search.statusCode,200,search.body);assert.ok(search.json().results.some((row:any)=>row.resultType==='vehicle'));assert.ok(search.json().results.some((row:any)=>row.resultType==='build'));
  const activity=await inject('GET','/v1/modules/torqueshed/activity',member);assert.equal(activity.statusCode,200,activity.body);assert.ok(activity.json().events.some((row:any)=>row.eventType==='journal_milestone'));
  const exportResponse=await inject('POST','/v1/modules/torqueshed/exports',ownerA,{format:'json'},{'Idempotency-Key':'phase28-export-1'});assert.equal(exportResponse.statusCode,202,exportResponse.body);assert.equal(exportResponse.json().export.export_type,'torqueshed-product-history');
  const foreign=await inject('GET',`/v1/modules/torqueshed/builds/${build.id}/workspace`,ownerB);assert.equal(foreign.statusCode,404,foreign.body);
});

test('Phase 28 live bay reconnect is sequenced, idempotent, member-authorized and tenant-isolated',async()=>{
  const vehicleResponse=await inject('POST','/v1/modules/torqueshed/vehicles',ownerA,{year:2004,make:'Subaru',model:'WRX',visibility:'tenant'});const vehicle=vehicleResponse.json();
  const create=await inject('POST','/v1/modules/torqueshed/live-bays',ownerA,{vehicleId:vehicle.id,title:'Boost leak bay',visibility:'private'});assert.equal(create.statusCode,201,create.body);const bay=create.json().bay;
  const denied=await inject('POST',`/v1/modules/torqueshed/live-bays/${bay.id}/messages`,member,{clientMessageId:'denied-1',body:'Should not post'});assert.equal(denied.statusCode,404,denied.body);
  const memberResponse=await inject('POST',`/v1/modules/torqueshed/live-bays/${bay.id}/members`,ownerA,{userId:member.id,role:'collaborator'});assert.equal(memberResponse.statusCode,201,memberResponse.body);
  const first=await inject('POST',`/v1/modules/torqueshed/live-bays/${bay.id}/messages`,member,{clientMessageId:'member-reading-1',body:'Smoke test shows leak at intercooler coupler.'});assert.equal(first.statusCode,201,first.body);assert.equal(first.json().message.sequence,1);
  const replay=await inject('POST',`/v1/modules/torqueshed/live-bays/${bay.id}/messages`,member,{clientMessageId:'member-reading-1',body:'Smoke test shows leak at intercooler coupler.'});assert.equal(replay.statusCode,200,replay.body);assert.equal(replay.json().duplicate,true);assert.equal(replay.json().message.sequence,1);
  const reconnect=await inject('GET',`/v1/modules/torqueshed/live-bays/${bay.id}?after=0`,ownerA);assert.equal(reconnect.statusCode,200,reconnect.body);assert.equal(reconnect.json().cursor,1);assert.equal(reconnect.json().messages.length,1);
  const caughtUp=await inject('GET',`/v1/modules/torqueshed/live-bays/${bay.id}?after=1`,ownerA);assert.equal(caughtUp.statusCode,200,caughtUp.body);assert.equal(caughtUp.json().messages.length,0);
  const foreign=await inject('GET',`/v1/modules/torqueshed/live-bays/${bay.id}?after=0`,ownerB);assert.equal(foreign.statusCode,404,foreign.body);
  assert.equal((await inject('POST',`/v1/modules/torqueshed/live-bays/${bay.id}/close`,ownerA,{})).statusCode,200);
  const closed=await inject('POST',`/v1/modules/torqueshed/live-bays/${bay.id}/messages`,member,{clientMessageId:'closed-1',body:'Cannot add this'});assert.equal(closed.statusCode,409,closed.body);
});
