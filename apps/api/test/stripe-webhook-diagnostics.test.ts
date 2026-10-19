import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import Fastify from 'fastify';
import Stripe from 'stripe';
import ts from 'typescript';
import {
  stripeWebhookFailureDiagnostic,
  STRIPE_WEBHOOK_FAILURE_STAGES,
  STRIPE_WEBHOOK_ERROR_CATEGORIES,
  type StripeWebhookFailureStage,
} from '../src/lib/stripe-webhook-diagnostics.js';

const privateFixture = 'PRIVATE_DIAGNOSTIC_FIXTURE';
test('wrapped database errors expose only bounded diagnostic fields', () => {
  const cause = Object.assign(new Error(privateFixture), { code: '42P01', sql: privateFixture, customerId: privateFixture });
  const wrapper = new Error(privateFixture, { cause });
  const diagnostic = stripeWebhookFailureDiagnostic('event_claim', wrapper);
  assert.deepEqual(diagnostic, { code: 'WEBHOOK_REJECTED', stage: 'event_claim', category: 'database' });
  assert.deepEqual(Object.keys(diagnostic), ['code', 'stage', 'category']);
  assert.doesNotMatch(JSON.stringify(diagnostic), new RegExp(privateFixture+'|42P01|sql|customerId|stack|message'));
});

test('accessors, cyclic/deep causes and arbitrary fields cannot enter diagnostics', () => {
  let getterCalls = 0;
  const accessor = Object.defineProperties({}, Object.fromEntries(['code','name','type','cause','message','stack'].map(key => [key, {
    get() { getterCalls++; throw new Error(privateFixture); },
  }])));
  assert.equal(stripeWebhookFailureDiagnostic('event_claim', accessor).category, 'unknown');
  assert.equal(getterCalls, 0);
  const cyclic: { cause?: unknown; message: string } = { message: privateFixture }; cyclic.cause = cyclic;
  assert.equal(stripeWebhookFailureDiagnostic('event_claim', cyclic).category, 'unknown');
  let deep: unknown = { code: '42P01' };
  for (let i=0;i<5;i++) deep = { cause: deep };
  assert.equal(stripeWebhookFailureDiagnostic('event_claim', deep).category, 'unknown');
  const diagnostic = stripeWebhookFailureDiagnostic(privateFixture as StripeWebhookFailureStage, { code: privateFixture, type: privateFixture, message: privateFixture });
  assert.deepEqual(diagnostic, { code: 'WEBHOOK_REJECTED', stage: 'unknown', category: 'unknown' });
  assert.doesNotMatch(JSON.stringify(diagnostic), new RegExp(privateFixture));
});

test('provider and transport errors map to bounded categories without original codes', () => {
  for (const [error, expected] of [
    [{ type: 'StripeAuthenticationError', raw: privateFixture }, 'provider_authentication'],
    [{ type: 'StripePermissionError' }, 'provider_authentication'],
    [{ type: 'StripeInvalidRequestError' }, 'provider_request'],
    [{ code: 'ETIMEDOUT', host: privateFixture }, 'transport'],
    [{ code: 'TORQUE_PAYMENT_EVENT_INVALID' }, 'billing_validation'],
    [privateFixture, 'unknown'],
  ] as const) {
    const result = stripeWebhookFailureDiagnostic('credit_classification', error);
    assert.equal(result.category, expected);
    assert.ok(STRIPE_WEBHOOK_FAILURE_STAGES.includes(result.stage));
    assert.ok(STRIPE_WEBHOOK_ERROR_CATEGORIES.includes(result.category));
    assert.doesNotMatch(JSON.stringify(result), new RegExp(privateFixture+'|ETIMEDOUT|TORQUE_PAYMENT_EVENT_INVALID'));
  }
});

const index = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8').replace(/\r\n/g,'\n');
const routes = readFileSync(fileURLToPath(new URL('../src/routes/billing-routes.ts', import.meta.url)), 'utf8').replace(/\r\n/g,'\n');
const service = readFileSync(new URL('../src/lib/billing-service.ts', import.meta.url), 'utf8');
const serviceTree = ts.createSourceFile('billing-service.ts', service, ts.ScriptTarget.Latest, true);
const observation = serviceTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'billingObservationResult');
assert.ok(observation, 'actual billing observation helper must exist');
const parserStart = index.indexOf("app.addContentTypeParser('application/json'");
const routeStart = routes.indexOf("app.post('/v1/billing/webhook'");
assert.ok(parserStart>0 && routeStart>0);
const parser = index.slice(parserStart,index.indexOf('\n});',parserStart)+5);
const handler = routes.slice(routeStart,routes.indexOf('\n  });\n}',routeStart)+7);
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

test('real handler differentiates failure stages and preserves responses and idempotency', async () => {
  let httpCalls = 0;
  const stripe = new Stripe('sk_test_synthetic_diagnostic_placeholder_only', {
    maxNetworkRetries: 0,
    httpClient: { getClientName: () => 'blocked-offline', makeRequest() { httpCalls++; throw new Error('Networking prohibited'); }, async makeRequestAsync() { httpCalls++; throw new Error('Networking prohibited'); } } as unknown as Stripe.HttpClient,
  });
  const secret = 'whsec_synthetic_diagnostic_only';
  const payload = ' {\n"id":"evt_synthetic_diagnostic","type":"checkout.session.completed","data":{"object":{"fixture":"Unicode ✓"}}\n}\n';
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  let configured = true, torque = false, fault: string | null = null, duplicate: string | null = null, handled = true;
  let failure: unknown = new Error(privateFixture);
  const calls: string[] = [], errors: unknown[][] = [];
  class TokenError extends Error { code = 'TORQUE_PAYMENT_EVENT_INVALID'; statusCode = 422; }
  const step = (name: string) => { calls.push(name); if (fault===name) throw failure; };
  const app = Fastify({ logger: false });
  runInNewContext(compile(parser), { app, Buffer });
  // Bind the real pure helper without importing billing-service's DB/env setup.
  runInNewContext(compile(observation.getText(serviceTree) + '\n' + handler), {
    app, Buffer, stripeWebhookFailureDiagnostic, exports: {},
    console: { log() {}, error(...args: unknown[]) { errors.push(args); } },
    getPaymentProviderAdapter: () => ({ status: { state: configured?'configured':'disabled' }, verifyWebhook: async (raw: Buffer, sig: string) => { step('verify'); return stripe.webhooks.constructEvent(raw,sig,secret); } }),
    isTorqueTokenStripeEvent: async () => { step('credit_classification'); return torque; },
    receiveVerifiedTorqueTokenStripeEvent: async () => { step('credit_receipt'); return { status:'processed', receipt:{ id:'synthetic',tenant_id:'synthetic',safe_payload_json:{} },duplicate:false }; },
    recordTorqueStripeEventDispatch: async () => { step('credit_dispatch_record'); },
    classifyWebhookEvent: () => { step('event_classification'); return { isAddon:false,isFeatureAddon:false,matchedAt:'none' }; },
    claimStripeEvent: async () => { step('event_claim'); return duplicate?{ isDuplicate:true,duplicateState:duplicate,claimedRowId:null }:{ isDuplicate:false,claimedRowId:'synthetic' }; },
    processWebhookEvent: async () => { step('process'); return { handled,action:'synthetic' }; },
    markStripeEventFailed: async () => { step('mark_failed'); },
    markStripeEventProcessed: async () => { step('mark_processed'); },
    OperatorOsTokenBillingError: TokenError,
  });
  const reset = () => { configured=true;torque=false;fault=duplicate=null;handled=true;calls.length=errors.length=0;failure=new Error(privateFixture); };
  const request = (body=payload,sig: string | null=signature) => app.inject({ method:'POST',url:'/v1/billing/webhook',headers:{'content-type':'application/json',...(sig?{'stripe-signature':sig}:{})},payload:body });
  const requestType = (type: string) => {
    const body = JSON.stringify({ ...JSON.parse(payload), type });
    return request(body, stripe.webhooks.generateTestHeaderString({ payload: body, secret }));
  };
  const rejected = { error:'Webhook verification or processing failed',code:'WEBHOOK_REJECTED' };
  try {
    reset();let response=await request(payload,'INVALID_PRIVATE_SIGNATURE_FIXTURE');
    assert.equal(response.statusCode,400);assert.deepEqual(response.json(),rejected);assert.deepEqual(calls,['verify']);
    assert.deepEqual(errors[0]?.[1],{code:'WEBHOOK_REJECTED',stage:'signature_verification',category:'signature'});
    assert.doesNotMatch(JSON.stringify(errors),/INVALID_PRIVATE_SIGNATURE_FIXTURE|evt_synthetic_diagnostic|Unicode|whsec_|sk_test_/);

    for (const stage of ['credit_classification','event_classification','event_claim'] as const) {
      reset();fault=stage;failure=stage==='event_claim'?new Error(privateFixture,{cause:{code:'42P01',message:privateFixture,query:privateFixture}}):new Error(privateFixture);
      response=await request();assert.equal(response.statusCode,400);assert.deepEqual(response.json(),rejected);
      assert.deepEqual(errors[0]?.[1],{code:'WEBHOOK_REJECTED',stage,category:stage==='event_claim'?'database':'unknown'});
      assert.doesNotMatch(JSON.stringify(errors),new RegExp(privateFixture+'|42P01|query|evt_synthetic'));
      assert.equal(calls.includes('process'),false);
    }
    reset();torque=true;fault='credit_receipt';failure=new TokenError(privateFixture);
    response=await request();assert.equal(response.statusCode,422);assert.equal(response.json().code,'TORQUE_PAYMENT_EVENT_INVALID');
    assert.deepEqual(errors[0]?.[1],{code:'WEBHOOK_REJECTED',stage:'credit_receipt',category:'billing_validation'});

    reset();torque=true;fault='credit_dispatch_record';
    response=await request();assert.equal(response.statusCode,400);assert.deepEqual(response.json(),rejected);
    assert.equal((errors[0]?.[1] as {stage:string}).stage,'credit_dispatch_record');

    reset();fault='mark_processed';failure={code:'42501',message:privateFixture};
    response=await request();assert.equal(response.statusCode,400);assert.deepEqual(response.json(),rejected);
    assert.deepEqual(errors[0]?.[1],{code:'WEBHOOK_REJECTED',stage:'event_status_update',category:'database'});

    reset();fault='process';response=await requestType('invoice.created');
    assert.equal(response.statusCode,200);assert.equal(response.json().action,'invoice_created_observed');
    assert.deepEqual(calls,['verify','credit_classification','event_classification','event_claim','mark_processed']);assert.equal(errors.length,0);
    reset();fault='mark_processed';failure={code:'42501',message:privateFixture};
    response=await requestType('invoice.created');assert.equal(response.statusCode,400);assert.deepEqual(response.json(),rejected);
    assert.deepEqual(errors[0]?.[1],{code:'WEBHOOK_REJECTED',stage:'event_status_update',category:'database'});
    assert.equal(calls.includes('process'),false);assert.doesNotMatch(JSON.stringify(errors),new RegExp(privateFixture+'|42501|evt_synthetic|whsec_|sk_test_'));

    reset();configured=false;response=await request();assert.equal(response.statusCode,503);assert.equal(response.json().code,'STRIPE_NOT_CONFIGURED');assert.deepEqual([...calls],[]);
    reset();response=await request(payload,null);assert.equal(response.statusCode,400);assert.deepEqual(response.json(),{error:'Missing stripe-signature header'});assert.deepEqual([...calls],[]);
    reset();response=await request(JSON.stringify(JSON.parse(payload)));assert.equal(response.statusCode,400);assert.deepEqual(calls,['verify']);
    for (const [state,status,code] of [['in_flight',503,'WEBHOOK_PROCESSING_IN_PROGRESS'],['payload_mismatch',400,'STRIPE_EVENT_ID_PAYLOAD_MISMATCH'],['processed',200,null]] as const) {
      reset();duplicate=state;response=await request();assert.equal(response.statusCode,status);
      if(code)assert.equal(response.json().code,code);else assert.equal(response.json().action,'duplicate_ignored');
      assert.equal(calls.includes('process'),false);assert.equal(errors.length,0);
    }
    reset();fault='process';response=await request();assert.equal(response.statusCode,503);assert.equal(response.json().code,'WEBHOOK_PROCESSING_RETRY_REQUIRED');assert.equal(calls.filter(c=>c==='mark_failed').length,1);
    reset();handled=false;response=await request();assert.equal(response.statusCode,503);assert.equal(response.json().code,'WEBHOOK_PROCESSING_RETRY_REQUIRED');
    reset();response=await request();assert.equal(response.statusCode,200);assert.deepEqual(calls,['verify','credit_classification','event_classification','event_claim','process','mark_processed']);assert.equal(errors.length,0);
    assert.equal(httpCalls,0);
  } finally { await app.close(); }
});
