process.env.SESSION_SECRET ||= 'callcommand-guided-setup-test-secret';
process.env.NODE_ENV = 'test'; process.env.APP_ENV = 'test';
process.env.TWILIO_ACCOUNT_SID = `AC${'1'.repeat(32)}`;
process.env.TWILIO_AUTH_TOKEN = 'callcommand-guided-setup-test-token';
process.env.TWILIO_FROM_NUMBER = '+15550109999';
process.env.TWILIO_PUBLIC_BASE_URL = 'https://callcommand-ai.operatoros.net';
process.env.OPENAI_API_KEY = 'sk-callcommand-guided-setup-test';
process.env.OPENAI_PROJECT_ID = 'proj_CallCommandGuidedSetup';
process.env.OPENAI_WEBHOOK_SECRET = 'whsec_callcommand_guided_setup_test';
process.env.CALLCOMMAND_SIP_ROUTE_SECRET = 'callcommand-guided-setup-test-route-secret';
process.env.CALLCOMMAND_REALTIME_MODEL = 'gpt-realtime-2.1-mini';
process.env.STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY = 'price_cc_local_test';
process.env.STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY = 'price_cc_tollfree_test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUsers } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { __setStripeTestOverrides, classifyWebhookEvent } from '../src/lib/billing-service.js';
import { processCallCommandNumberWebhookEvent, requestCallCommandNumberBilling } from '../src/lib/callcommand-number-billing.js';
import { MockCallCommandNumberProvider } from '../src/lib/callcommand-number-provider.js';
import { __setCallCommandNumberProviderForTests, registerCallCommandCommercialRoutes } from '../src/routes/callcommand-commercial-routes.js';
import { cleanupUser, createTestUser, createTestModule, ensureSchemaReady } from './_setup.js';

type Row = Record<string, any>;
let owner: Awaited<ReturnType<typeof createTestUser>>;
let other: Awaited<ReturnType<typeof createTestUser>>;
let app: ReturnType<typeof Fastify>;
let assignment: Row;
let firstOrder = '';
let secondOrder = '';
let firstChannel = '';
let checkoutCount = 0;
const stripeUpdates: Row[] = [];
let paidQuantity = 1;
let priceMismatch = false;
let upgradePending = false;
const metadata = () => ({ type:'feature_addon',feature:'managed_phone_numbers',tenant_id:owner.currentTenantId,requested_billable_local_quantity:'999' });
const stripe = {
  prices: { retrieve: async (id: string) => ({ id, active:true,currency:'usd',unit_amount:priceMismatch ? 999 : id.includes('tollfree') ? 800 : 500,recurring:{interval:'month',interval_count:1,usage_type:'licensed'} }) },
  customers: { create: async () => ({ id:'cus_cc_setup_test' }) },
  checkout: { sessions: { create: async () => { checkoutCount++; return { id:'cs_cc_setup_test',url:'https://checkout.stripe.com/c/pay/cc_setup_test' }; } } },
  subscriptions: {
    update: async (_id: string, params: Row) => { stripeUpdates.push(params); if (params.payment_behavior === 'pending_if_incomplete') assert.deepEqual(Object.keys(params).sort(), ['expand','items','payment_behavior','proration_behavior']); return {}; },
    retrieve: async () => ({ id:'sub_cc_setup_test',status:'active',customer:'cus_cc_setup_test',metadata:metadata(),latest_invoice:{id:'in_cc_setup_test',status:upgradePending ? 'open' : 'paid'},pending_update:upgradePending ? {} : null,
      items:{data:[{id:'si_cc_local_test',price:{id:'price_cc_local_test'},quantity:paidQuantity}]} }),
  },
};
const base = '/v1/modules/callcommand-ai/product/commercial';
function headers(user = owner) { return { authorization:`Bearer ${signToken({userId:user.id,email:user.email,role:user.role,tokenVersion:user.tokenVersion,sessionType:'platform'})}`, 'x-tenant-id':user.currentTenantId }; }
async function post(path: string, payload: Row = {}, user = owner) { return app.inject({method:'POST',url:`${base}${path}`,headers:headers(user),payload}); }
async function getOrder() { return (await app.inject({method:'GET',url:`${base}/setup`,headers:headers()})).json().order; }
const selection = (phone: string, cents: number, key: string) => ({phone,profileId:assignment.profileId,flowId:assignment.flowId,monthlyAmountCents:cents,confirmMonthlyCharge:true,idempotencyKey:key});

before(async () => {
  await ensureSchemaReady(); owner = await createTestUser(); other = await createTestUser();
  const [existing] = await db.select().from(modules).where(eq(modules.slug,'callcommand-ai')).limit(1);
  const module = existing || await createTestModule('callcommand-ai');
  for (const user of [owner,other]) await db.insert(tenantModules).values({tenantId:user.currentTenantId,moduleId:module.id,status:'enabled',source:'admin',allowAllMembers:true});
  __setStripeTestOverrides({enabled:true,client:stripe});
  __setCallCommandNumberProviderForTests(new MockCallCommandNumberProvider(['+19105550601','+19105550602','+19105550603'].map(phoneNumber => ({
    provider:'twilio',phoneNumber,friendlyName:phoneNumber,isoCountry:'US',locality:'Fayetteville',region:'NC',postalCode:'28301',numberType:'local',addressRequirement:'none',
    capabilities:{voice:true,sms:false,mms:false,fax:false},cost:{pricingModel:'provider_usage_based',currency:null,monthlyAmount:null,usageAmount:null,quoteRequired:true},
  }))));
  app = Fastify(); await app.register(cookie); await registerCallCommandCommercialRoutes(app); await app.ready();
});
after(async () => {
  await app?.close(); __setStripeTestOverrides(null); __setCallCommandNumberProviderForTests(null);
  for (const user of [owner,other].filter(Boolean)) {
    for (const table of ['callcommand_setup_orders','callcommand_number_reconciliation_issues','callcommand_number_orders','callcommand_number_billing_entitlements','callcommand_channels',
      'callcommand_tenant_runtime_settings','callcommand_telephony_accounts','shared_secret_references','callcommand_flow_versions','callcommand_flows','callcommand_profiles','shared_activity_events','shared_idempotency_keys']) {
      await db.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id='${user.currentTenantId}'`));
    }
    await db.delete(tenantModules).where(eq(tenantModules.tenantId,user.currentTenantId)); await cleanupUser(user.id);
  }
});

test('onboarding rejects missing business information and browser authority fields', async () => {
  assert.equal((await post('/setup/receptionist',{})).statusCode,400);
  assert.equal((await post('/setup/receptionist',{tenantId:other.currentTenantId})).statusCode,400);
});
test('one save prepares a persistent business receptionist and actionable published workflow; retry reuses both', async () => {
  const payload = { businessName:'Synthetic Garage',businessDescription:'Repair shop. Open weekdays 9 to 5.' };
  const saved = await post('/setup/receptionist',payload); assert.equal(saved.statusCode,200,saved.body); assignment = saved.json();
  const retry = (await post('/setup/receptionist',payload)).json(); assert.equal(retry.profileId,assignment.profileId); assert.equal(retry.flowId,assignment.flowId);
  const flow = (await db.execute(sql`SELECT graph_json FROM callcommand_flow_versions WHERE tenant_id=${owner.currentTenantId} AND flow_id=${assignment.flowId}`)).rows[0] as Row;
  assert.equal(flow.graph_json.nodes[0].config.actionType,'task');
});
test('tenant boundary rejects a foreign receptionist and an unprivileged administrator operation', async () => {
  const foreign = await post('/setup/receptionist',{businessName:'Other',businessDescription:'Other business',profileId:assignment.profileId},other); assert.equal(foreign.statusCode,404);
  await db.update(tenantUsers).set({role:'member'}).where(eq(tenantUsers.userId,other.id));
  assert.equal((await post('/setup/receptionist',{businessName:'Other',businessDescription:'Other business'},other)).statusCode,403);
});
test('purchase selection rejects changed price, missing consent, and unconfigured AI before buying', async () => {
  assert.equal((await post('/setup/orders',selection('+19105550601',500,'setup-first-test'))).statusCode,409);
  assert.equal((await post('/setup/orders',{...selection('+19105550601',0,'setup-first-test'),confirmMonthlyCharge:false})).statusCode,409);
  const key = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  assert.equal((await post('/setup/orders',selection('+19105550601',0,'setup-first-test'))).statusCode,409); process.env.OPENAI_API_KEY=key;
});
test('included number selection survives reload, exact replay, and cross-tenant access attempts', async () => {
  const chosen=await post('/setup/orders',selection('+19105550601',0,'setup-first-test')); assert.equal(chosen.statusCode,201,chosen.body); firstOrder=chosen.json().orderId;
  assert.equal((await getOrder()).phone,'+19105550601');
  assert.equal((await post('/setup/orders',selection('+19105550601',0,'setup-first-test'))).json().orderId,firstOrder);
  assert.equal((await post('/setup/orders',selection('+19105550602',0,'setup-first-test'))).statusCode,409);
  assert.equal((await post(`/setup/orders/${firstOrder}/continue`,{},other)).statusCode,403);
});
test('included number acquires once and separates phone readiness from AI activation', async () => {
  const response = await post(`/setup/orders/${firstOrder}/continue`); assert.equal(response.statusCode,200,response.body); assert.equal(response.json().state,'ready'); firstChannel=response.json().channelId;
  assert.equal((await post(`/setup/orders/${firstOrder}/continue`)).json().channelId,firstChannel); assert.equal(checkoutCount,0);
  const runtime=(await db.execute(sql`SELECT realtime_enabled FROM callcommand_tenant_runtime_settings WHERE tenant_id=${owner.currentTenantId}`)).rows[0] as Row|undefined;
  assert.notEqual(runtime?.realtime_enabled,true);
});
test('exact line activation succeeds and released or unpaid lines cannot be activated', async () => {
  const activate=() => app.inject({method:'PATCH',url:`${base}/runtime-settings`,headers:headers(),payload:{realtimeEnabled:true,activationChannelId:firstChannel}});
  let response=await activate(); assert.equal(response.statusCode,200,response.body);
  await db.execute(sql`UPDATE callcommand_channels SET lifecycle_state='RELEASE_PENDING' WHERE tenant_id=${owner.currentTenantId} AND id=${firstChannel}`);
  assert.equal((await activate()).statusCode,409);
  assert.equal((await post(`/numbers/${firstChannel}/repair`)).statusCode,404);
  await db.execute(sql`UPDATE callcommand_channels SET lifecycle_state='ACTIVE',billing_status='suspended' WHERE tenant_id=${owner.currentTenantId} AND id=${firstChannel}`);
  assert.equal((await activate()).statusCode,409);
  await db.execute(sql`UPDATE callcommand_channels SET billing_status='included' WHERE tenant_id=${owner.currentTenantId} AND id=${firstChannel}`);
  await db.execute(sql`UPDATE callcommand_setup_orders SET status='attention' WHERE tenant_id=${owner.currentTenantId} AND id=${firstOrder}`);
  assert.equal((await activate()).statusCode,200);
  assert.equal((await getOrder()).status,'ready');
});
test('additional number waits for payment and retries do not duplicate checkout or provision capacity', async () => {
  const chosen=await post('/setup/orders',selection('+19105550602',500,'setup-second-test')); assert.equal(chosen.statusCode,201,chosen.body); secondOrder=chosen.json().orderId;
  const billing=await post(`/setup/orders/${secondOrder}/continue`); assert.equal(billing.statusCode,200,billing.body); assert.equal(billing.json().state,'awaiting_payment');
  await post(`/setup/orders/${secondOrder}/continue`); assert.equal(checkoutCount,1);
  const replay=await requestCallCommandNumberBilling({tenantId:owner.currentTenantId,userId:owner.id,billableLocalQuantity:1,billableTollFreeQuantity:0,idempotencyKey:'same-checkout-new-key'});
  assert.equal(replay.checkoutUrl,billing.json().checkoutUrl); assert.equal(checkoutCount,1);
  const count=(await db.execute(sql`SELECT COUNT(*)::int AS count FROM callcommand_channels WHERE tenant_id=${owner.currentTenantId}`)).rows[0] as Row; assert.equal(count.count,1);
});
test('current Stripe invoice metadata classifies correctly and paid quantities come from subscription items', async () => {
  const event={id:'evt_cc_paid',created:100,type:'invoice.paid',data:{object:{id:'in_cc_setup_test',customer:'cus_cc_setup_test',parent:{subscription_details:{metadata:metadata(),subscription:'sub_cc_setup_test'}}}}};
  assert.equal(classifyWebhookEvent(event).featureKey,'managed_phone_numbers');
  const result=await processCallCommandNumberWebhookEvent(event); assert.equal(result.rowsAffected,1);
  const row=(await db.execute(sql`SELECT licensed_billable_local_quantity FROM callcommand_number_billing_entitlements WHERE tenant_id=${owner.currentTenantId}`)).rows[0] as Row;
  assert.equal(row.licensed_billable_local_quantity,1);
});
test('late subscription observation does not undo payment and setup automatically resumes the chosen number', async () => {
  await processCallCommandNumberWebhookEvent({id:'evt_cc_observed',created:101,type:'customer.subscription.updated',data:{object:{id:'sub_cc_setup_test',customer:'cus_cc_setup_test',status:'active',metadata:metadata()}}});
  const response=await post(`/setup/orders/${secondOrder}/continue`); assert.equal(response.statusCode,200,response.body); assert.equal(response.json().state,'ready'); assert.notEqual(response.json().channelId,firstChannel);
  assert.equal((await getOrder()).phone,'+19105550602');
});
test('stale failure/deletion cannot change settled channel status and active numbers cannot be unbilled', async () => {
  for (const type of ['invoice.payment_failed','customer.subscription.deleted']) await processCallCommandNumberWebhookEvent({id:`evt_old_${type}`,created:50,type,data:{object:{id:'sub_cc_setup_test',subscription:'sub_cc_setup_test',metadata:metadata()}}});
  const rows=(await db.execute(sql`SELECT billing_status FROM callcommand_channels WHERE tenant_id=${owner.currentTenantId}`)).rows as Row[];
  assert.ok(rows.every(row=>['included','active'].includes(row.billing_status)));
  await assert.rejects(requestCallCommandNumberBilling({tenantId:owner.currentTenantId,userId:owner.id,billableLocalQuantity:0,billableTollFreeQuantity:0,idempotencyKey:'reduce-live-test'}),/Release/);
});
test('Stripe updates use supported pending fields, remain unlicensed until settlement, and replay exactly', async () => {
  const input={tenantId:owner.currentTenantId,userId:owner.id,billableLocalQuantity:2,billableTollFreeQuantity:0,idempotencyKey:'quantity-update-test'};
  const first=await requestCallCommandNumberBilling(input); const second=await requestCallCommandNumberBilling(input); assert.deepEqual(second,first); assert.equal(stripeUpdates.length,2);
  assert.equal((await db.execute(sql`SELECT licensed_billable_local_quantity FROM callcommand_number_billing_entitlements WHERE tenant_id=${owner.currentTenantId}`)).rows[0].licensed_billable_local_quantity,1);
});
test('mismatched Stripe catalog price fails before charging and an old invoice cannot settle a new request', async () => {
  priceMismatch=true;
  await assert.rejects(requestCallCommandNumberBilling({tenantId:owner.currentTenantId,userId:owner.id,billableLocalQuantity:3,billableTollFreeQuantity:0,idempotencyKey:'bad-price-test'}),/does not match/); priceMismatch=false;
  const result=await processCallCommandNumberWebhookEvent({id:'evt_cc_old_invoice',created:200,type:'invoice.paid',data:{object:{id:'in_previous',customer:'cus_cc_setup_test',subscription:'sub_cc_setup_test',metadata:metadata()}}}); assert.equal(result.rowsAffected,0);
});

test('a failed pending upgrade leaves already-paid numbers active', async () => {
  upgradePending=true;
  const result=await processCallCommandNumberWebhookEvent({id:'evt_cc_failed_upgrade',created:300,type:'invoice.payment_failed',data:{object:{id:'in_cc_setup_test',customer:'cus_cc_setup_test',subscription:'sub_cc_setup_test',metadata:metadata()}}});
  upgradePending=false; assert.equal(result.rowsAffected,0);
  const rows=(await db.execute(sql`SELECT billing_status FROM callcommand_channels WHERE tenant_id=${owner.currentTenantId}`)).rows as Row[];
  assert.ok(rows.every(row=>['included','active'].includes(row.billing_status)));
});

test('an unrelated subscription cannot suspend this tenant number subscription', async () => {
  const result=await processCallCommandNumberWebhookEvent({id:'evt_cc_wrong_subscription',created:301,type:'customer.subscription.deleted',data:{object:{id:'sub_unrelated_test',customer:'cus_cc_setup_test',metadata:metadata()}}});
  assert.equal(result.rowsAffected,0);
});
