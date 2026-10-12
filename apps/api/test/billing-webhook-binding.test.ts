import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import Stripe from 'stripe';
import ts from 'typescript';
import {
  BILLING_WEBHOOK_SIGNING_ENV, BillingWebhookBindingError,
  captureBillingWebhookBinding,inspectBillingWebhookBinding,
} from '../src/lib/billing-webhook-binding.js';

const preflight=await import(pathToFileURL(fileURLToPath(new URL('../../../scripts/production-env-preflight.mjs',import.meta.url))).href);
const dedicated='whsec_SYNTHETIC_DEDICATED_ONLY';
const inherited='whsec_SYNTHETIC_INHERITED_ONLY';
for(const [label,value] of [
  ['absent',undefined],['empty',''],['whitespace',' '],['prefix only','whsec_'],
  ['wrong prefix','sk_test_SYNTHETIC'],['leading space',' '+dedicated],
  ['trailing newline',dedicated+'\n'],['embedded tab','whsec_a\tb'],
  ['quoted','"'+dedicated+'"'],['trailing quote',dedicated+"'"],
  ['control byte',dedicated+'\u0000'],['delete byte',dedicated+'\u007f'],
] as const)test('dedicated binding '+label+' fails closed despite valid inherited generic key',()=>{
  const env:Record<string,string|undefined>={STRIPE_WEBHOOK_SECRET:inherited};
  if(value!==undefined)env[BILLING_WEBHOOK_SIGNING_ENV]=value;
  const binding=captureBillingWebhookBinding(env);
  assert.equal(binding.status().configured,false);
  assert.deepEqual(binding.status(),preflight.inspectBillingWebhookBinding(env));
  assert.throws(()=>binding.signingSecret(),BillingWebhookBindingError);
  assert.throws(()=>binding.assertReady(),BillingWebhookBindingError);
  assert.doesNotMatch(JSON.stringify(binding.status()),/whsec_|SYNTHETIC|sk_test_/);
});
test('dedicated value is exact, opaque, immutable at capture and consistent with preflight',()=>{
  const env={[BILLING_WEBHOOK_SIGNING_ENV]:'whsec_opaque+/=_',STRIPE_WEBHOOK_SECRET:inherited};
  assert.deepEqual(inspectBillingWebhookBinding(env),{configured:true,errorCode:null});
  assert.deepEqual(inspectBillingWebhookBinding(env),preflight.inspectBillingWebhookBinding(env));
  const binding=captureBillingWebhookBinding(env);
  env[BILLING_WEBHOOK_SIGNING_ENV]='whsec_LATER_SYNTHETIC';
  assert.equal(binding.signingSecret(),'whsec_opaque+/=_');
  assert.equal(JSON.stringify(binding),'{}');
  assert.equal(BILLING_WEBHOOK_SIGNING_ENV,'OPERATOROS_BILLING_WEBHOOK_SIGNING_SECRET');
  assert.equal(preflight.BILLING_WEBHOOK_SIGNING_ENV,BILLING_WEBHOOK_SIGNING_ENV);
});

const billing=readFileSync(fileURLToPath(new URL('../src/lib/billing-service.ts',import.meta.url)),'utf8').replace(/\r\n/g,'\n');
const compile=(source:string)=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function extract(name:string,next:string){
  const start=billing.indexOf('export '+name);
  const end=billing.indexOf(next,start);
  assert.ok(start>0&&end>start);return billing.slice(start,end);
}
test('actual signing helper uses dedicated key, exact raw bytes and unchanged three SDK arguments',()=>{
  let providerCalls=0;
  const stripe=new Stripe('sk_test_offline_binding_only',{
    maxNetworkRetries:0,
    httpClient:{getClientName:()=> 'blocked-offline',makeRequest(){providerCalls++;throw new Error('NETWORK_PROHIBITED');},async makeRequestAsync(){providerCalls++;throw new Error('NETWORK_PROHIBITED');}} as unknown as Stripe.HttpClient,
  });
  const raw=Buffer.from(' {\r\n"id":"evt_synthetic_only","type":"checkout.session.expired","data":{"object":{"fixture":"é💡"}}\r\n}\r\n');
  const binding=captureBillingWebhookBinding({[BILLING_WEBHOOK_SIGNING_ENV]:dedicated,STRIPE_WEBHOOK_SECRET:inherited});
  const exports:Record<string,any>={};let argumentsSeen=0;
  runInNewContext(compile(extract('function verifyWebhookSignature(', '\nfunction stripeId(')),{
    exports,billingWebhookSigningSecret:binding.signingSecret,
    getStripe:()=>({webhooks:{constructEvent(...args:any[]){
      argumentsSeen=args.length;assert.equal(args[0],raw);assert.equal(args[2],dedicated);
      return stripe.webhooks.constructEvent(args[0],args[1],args[2]);
    }}}),
  });
  const sign=(secret:string)=>stripe.webhooks.generateTestHeaderString({payload:raw.toString('utf8'),secret});
  assert.equal(exports.verifyWebhookSignature(raw,sign(dedicated)).type,'checkout.session.expired');
  assert.throws(()=>exports.verifyWebhookSignature(raw,sign(inherited)),(error:any)=>error.type==='StripeSignatureVerificationError');
  const stale=stripe.webhooks.generateTestHeaderString({payload:raw.toString('utf8'),secret:dedicated,timestamp:Math.floor(Date.now()/1000)-301});
  assert.throws(()=>exports.verifyWebhookSignature(raw,stale),(error:any)=>error.type==='StripeSignatureVerificationError');
  assert.equal(argumentsSeen,3);
  assert.equal((stripe.webhooks as unknown as { DEFAULT_TOLERANCE:number }).DEFAULT_TOLERANCE,300);
  assert.equal(providerCalls,0);
});
test('actual adapter uses the captured dedicated readiness instead of a valid generic inherited secret',()=>{
  const source=readFileSync(fileURLToPath(new URL('../src/lib/shared-provider-adapters.ts',import.meta.url)),'utf8').replace(/\r\n/g,'\n');
  const start=source.indexOf('export function getPaymentProviderAdapter(');
  const end=source.indexOf('\nexport function getSharedAiProviderAdapter(',start);
  assert.ok(start>0&&end>start);
  for(const valid of [false,true]){
    const env:Record<string,string|undefined>={STRIPE_SECRET_KEY:'sk_test_synthetic_only',STRIPE_MODE:'test',STRIPE_WEBHOOK_SECRET:inherited};
    if(valid)env[BILLING_WEBHOOK_SIGNING_ENV]=dedicated;
    const binding=captureBillingWebhookBinding(env),exports:Record<string,any>={};
    runInNewContext(compile(source.slice(start,end)),{exports,process:{env},billingWebhookBindingStatus:binding.status,isOperatorOSDeterministicProviderTestEnvironment:()=>false});
    assert.equal(exports.getPaymentProviderAdapter().status.state,valid?'configured':'disabled');
    env[BILLING_WEBHOOK_SIGNING_ENV]=valid?'':dedicated;
    assert.equal(exports.getPaymentProviderAdapter().status.state,valid?'configured':'disabled');
  }
});
test('new Stack and credit checkout guards run before SDK access or intent persistence',async()=>{
  const missing=captureBillingWebhookBinding({STRIPE_WEBHOOK_SECRET:inherited});
  let stripeCalls=0,dbCalls=0;
  const exports:Record<string,any>={};
  const stack=extract('async function createStackCheckoutSession(', '\nexport async function changeStackFreeCompanion(');
  const credit=extract('async function createUsageCreditCheckoutSession(', '\nexport async function createPortalSession(');
  runInNewContext(compile(stack+'\n'+credit),{
    exports,isStripeEnabled:()=>true,assertBillingWebhookBindingReady:missing.assertReady,
    getStripe:()=>{stripeCalls++;throw new Error('SDK_MUST_NOT_RUN');},
    db:new Proxy({},{get(){dbCalls++;throw new Error('DB_MUST_NOT_RUN');}}),
  });
  await assert.rejects(exports.createStackCheckoutSession({}),BillingWebhookBindingError);
  await assert.rejects(exports.createUsageCreditCheckoutSession({}),BillingWebhookBindingError);
  assert.equal(stripeCalls,0);assert.equal(dbCalls,0);
});
test('legacy provider cancellation still calls Stripe when signing binding is unavailable',async()=>{
  let providerCalls=0,updated=false;
  const exports:Record<string,any>={};
  const chain:any={set(){updated=true;return chain;},where(){return Promise.resolve();}};
  runInNewContext(compile(extract('async function cancelSubscription(', '\nexport async function reactivateSubscription(')),{
    exports,tenantApplicationSubscriptions:{tenantId:'tenant'},subscriptions:{id:'id'},billingEvents:{},
    eq:()=>true,isStripeEnabled:()=>true,
    db:{select:()=>({from:()=>({where:()=>({limit:async()=>[]})})}),update:()=>chain,insert:()=>({values:async()=>{}})},
    findGrandfatheredLegacySubscription:async()=>({id:'synthetic',status:'active',stripeSubscriptionId:'sub_synthetic'}),
    getStripe:()=>({subscriptions:{update:async()=>{providerCalls++;}}}),
  });
  assert.equal((await exports.cancelSubscription('actor','tenant')).ok,true);
  assert.equal(providerCalls,1);assert.equal(updated,true);
  assert.doesNotMatch(billing.slice(billing.indexOf('export async function cancelSubscription('),billing.indexOf('export async function reactivateSubscription(')),/assertBillingWebhookBindingReady/);
});
test('runtime projection excludes dedicated signing key from nonbilling children without changing API environment',()=>{
  const runtime=readFileSync(fileURLToPath(new URL('../../../scripts/start-unified-runtime.mjs',import.meta.url)),'utf8').replace(/\r\n/g,'\n');
  const start=runtime.indexOf('  const nonBillingEnv = { ...runtimeEnv };');
  const end=runtime.indexOf('  validateDeploymentEnvironment(runtimeEnv);',start);
  assert.ok(start>0&&end>start);
  const original=Object.freeze({[BILLING_WEBHOOK_SIGNING_ENV]:dedicated,OTHER_SYNTHETIC_SETTING:'retained'});
  const context:Record<string,any>={runtimeEnv:original,BILLING_WEBHOOK_SIGNING_ENV,result:null};
  runInNewContext(runtime.slice(start,end)+'\nresult = nonBillingEnv;',context);
  assert.equal(Object.hasOwn(context.result,BILLING_WEBHOOK_SIGNING_ENV),false);
  assert.equal(context.result.OTHER_SYNTHETIC_SETTING,'retained');
  assert.equal(original[BILLING_WEBHOOK_SIGNING_ENV],dedicated);
  assert.match(runtime,/entrypoints\.databaseReleaseEntry,[\s\S]*?nonBillingEnv,/);
  assert.match(runtime,/\{ \.\.\.nonBillingEnv, PORT: String\(config\.nextPort\)/);
  assert.match(runtime,/entrypoints\.apiEntry,[\s\S]*?\.\.\.runtimeEnv,/);
});
