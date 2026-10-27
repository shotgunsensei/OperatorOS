import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import Fastify from 'fastify';
import { databasePool } from '../../src/db.js';
import { OpenAiRealtimeSipAdapter, type RealtimeSocket, type RealtimeSidebandCallbacks } from '../../src/lib/callcommand-realtime.js';
import { reconcileCallCommandTerminalUsage } from '../../src/lib/callcommand-capacity.js';
import { __setCallCommandRealtimeAdapterFactoryForTests, registerCallCommandRealtimeRoutes, runCallCommandRealtimeRecoveryBatch } from '../../src/routes/callcommand-realtime-routes.js';
import { startCallCommandRealtimeRecovery, stopCallCommandRealtimeRecovery, getCallCommandRealtimeRecoveryStatus } from '../../src/lib/callcommand-realtime-recovery.js';
import { hasCallCommandRealtimeSideband } from '../../src/lib/callcommand-realtime-session-registry.js';

const marker=process.env.CALLCOMMAND_RESTART_WORKER_MARKER;
assert(process.send && marker && /^[a-f0-9]{32}$/.test(marker) && process.env.APP_ENV==='test' && process.env.NODE_ENV==='test');
const actions:string[]=[],sentTypes:string[]=[];
const captured=new Map<string,RealtimeSidebandCallbacks[]>();
const socketInstances:SyntheticSocket[]=[];
let sockets=0,failOpen=false,holdHangup=false,acceptFailure=false,holdOpen=false;
let releaseOpen:(()=>void)|undefined;
let releaseHangup:(()=>void)|undefined;
const actualNow=Date.now;
class SyntheticSocket extends EventEmitter implements RealtimeSocket {
  readyState=0;
  constructor(){super();socketInstances.push(this);sockets++;setImmediate(()=>{
    if(holdOpen){releaseOpen=()=>{this.readyState=1;this.emit('open');};process.send?.({type:'observer',name:'open_waiting'});return;}
    if(failOpen){this.emit('error',new Error('Synthetic open failure'));this.close(1006);}
    else{this.readyState=1;this.emit('open');}
  });}
  send(data:string,callback?:(error?:Error)=>void){const parsed=JSON.parse(data) as {type?:unknown};if(typeof parsed.type==='string')sentTypes.push(parsed.type);callback?.();}
  close(code=1000){if(this.readyState===3)return;this.readyState=3;this.emit('close',code);}
}
const adapter=new OpenAiRealtimeSipAdapter({env:process.env,fetch:async input=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://api.openai.com');
  assert.match(url.pathname,/^\/v1\/realtime\/calls\/[A-Za-z0-9_-]+\/(accept|reject|refer|hangup)$/);
  const action=url.pathname.split('/').at(-1)!;actions.push(action);
  if(action==='accept' && acceptFailure)throw new Error('Synthetic unknown accept outcome');
  if(action==='hangup' && holdHangup){
    process.send?.({type:'observer',name:'hangup_waiting'});
    await new Promise<void>(resolve=>{releaseHangup=resolve;});
  }
  return new Response(null,{status:200});
},socketFactory:()=>new SyntheticSocket()});
__setCallCommandRealtimeAdapterFactoryForTests(()=>({
  readiness:adapter.readiness,verifyRouteToken:adapter.verifyRouteToken.bind(adapter),unwrapIncomingCall:adapter.unwrapIncomingCall.bind(adapter),
  accept:adapter.accept.bind(adapter),reject:adapter.reject.bind(adapter),refer:adapter.refer.bind(adapter),hangup:adapter.hangup.bind(adapter),
  connectSideband:input=>{const list=captured.get(input.openAiCallId)??[];list.push(input.callbacks);captured.set(input.openAiCallId,list);return adapter.connectSideband(input);},
}));
const app=Fastify({logger:false});app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json',{parseAs:'buffer'},(request,body,done)=>{
  const raw=Buffer.isBuffer(body)?body:Buffer.from(body);(request as typeof request & {rawBody:Buffer}).rawBody=raw;
  try{done(null,JSON.parse(raw.toString('utf8')));}catch{done(new Error('Invalid fixture JSON'));}
});
await registerCallCommandRealtimeRoutes(app);await app.ready();
const stats=()=>({actions:[...actions],sockets,greetings:sentTypes.filter(type=>type==='response.create').length,sentTypes:[...sentTypes]});
type Command={type:string;id:string;callId?:string;openAiCallId?:string;rawBody?:string;headers?:Record<string,string>;kind?:string;failOpen?:boolean;holdHangup?:boolean;acceptFailure?:boolean;holdOpen?:boolean;clockSkewSeconds?:number;tenantId?:string;eventId?:string;startedAt?:string};
function parse(value:unknown):Command{
  assert(value && typeof value==='object' && 'type'in value && typeof value.type==='string' && 'id'in value && typeof value.id==='string');
  assert(['inject','start','cycle','status','invoke','emitTool','closeAndLateCallback','configure','release','reconcile','stop'].includes(value.type));
  return value as Command;
}
const reply=(input:Command,body:Record<string,unknown>,statusCode=200)=>process.send?.({type:'result',id:input.id,statusCode,body,stats:stats(),registryActive:hasCallCommandRealtimeSideband(input.callId??'')});
let sequence=Promise.resolve();
process.on('message',value=>{
  const input=parse(value);
  // Releasing an owned synthetic network gate must not wait behind the held
  // command; this is IPC test control, never an HTTP or production endpoint.
  if(input.type==='release'){releaseHangup?.();releaseHangup=undefined;releaseOpen?.();releaseOpen=undefined;reply(input,{released:true});return;}
  sequence=sequence.then(async()=>{
    if(input.type==='stop'){await stopCallCommandRealtimeRecovery();await app.close();await databasePool.end();reply(input,{stopped:true});process.disconnect();return;}
    if(input.type==='configure'){failOpen=input.failOpen===true;holdHangup=input.holdHangup===true;acceptFailure=input.acceptFailure===true;holdOpen=input.holdOpen===true;
      assert(input.clockSkewSeconds===undefined || input.clockSkewSeconds===60);
      Date.now=()=>actualNow()+(input.clockSkewSeconds??0)*1000;
      reply(input,{configured:true});return;}
    if(input.type==='start'){startCallCommandRealtimeRecovery();reply(input,{started:true});return;}
    if(input.type==='cycle'){reply(input,await runCallCommandRealtimeRecoveryBatch());return;}
    if(input.type==='status'){reply(input,{recovery:getCallCommandRealtimeRecoveryStatus()});return;}
    if(input.type==='emitTool'){
      assert.equal(socketInstances.length,1);
      socketInstances[0].emit('message',JSON.stringify({type:'response.function_call_arguments.done',call_id:'synthetic_end_tool',name:'end_call',
        arguments:JSON.stringify({reason:'Synthetic completion',summary:'Synthetic call summary.'})}));
      reply(input,{emitted:true});return;
    }
    if(input.type==='closeAndLateCallback'){
      assert(input.openAiCallId);const callback=captured.get(input.openAiCallId)?.[0];assert(callback);
      assert.equal(socketInstances.length,1);socketInstances[0].close(1006);
      setImmediate(()=>{void callback.onCallbackError?.({openAiCallId:input.openAiCallId!,callback:'onClosed',code:'CALLCOMMAND_REALTIME_CALLBACK_FAILED'});});
      reply(input,{emitted:true});return;
    }
    if(input.type==='inject'){
      assert(typeof input.rawBody==='string' && input.headers && typeof input.callId==='string');
      const r=await app.inject({method:'POST',url:'/v1/modules/callcommand-ai/openai/realtime/incoming',headers:{'content-type':'application/json',...input.headers},payload:input.rawBody});
      reply(input,r.json<Record<string,unknown>>(),r.statusCode);return;
    }
    if(input.type==='reconcile'){
      assert(input.tenantId && input.callId && input.eventId && input.startedAt);
      const r=await reconcileCallCommandTerminalUsage({tenantId:input.tenantId,callId:input.callId,terminalEventId:input.eventId,providerOutcome:'completed',providerSequence:1,
        usage:{startedAt:input.startedAt,answeredAt:input.startedAt,endedAt:new Date().toISOString(),providerCostMinor:0,aiInputTokens:0,aiOutputTokens:0,aiInputMinorPerMillion:0,aiOutputMinorPerMillion:0}});
      reply(input,{duplicate:r.duplicate});return;
    }
    assert(input.type==='invoke' && input.openAiCallId && input.kind);
    const callback=captured.get(input.openAiCallId)?.[0];assert(callback);
    try{
      let result:unknown;
      const openAiCallId=input.openAiCallId;
      if(input.kind==='usage')await callback.onUsage?.({openAiCallId,source:'response',responseId:'synthetic_delayed_usage',inputTokens:1000,outputTokens:1000,totalTokens:2000});
      else if(input.kind==='transcript')await callback.onTranscript?.({openAiCallId,itemId:'synthetic_delayed_transcript',role:'caller',transcript:'Synthetic delayed transcript.'});
      else if(input.kind==='error')await callback.onError?.({openAiCallId,code:'SYNTHETIC_DELAYED_ERROR',recoverable:false});
      else if(input.kind==='closed')await callback.onClosed?.({openAiCallId,code:1006,clean:false});
      else if(input.kind==='tool')result=await callback.executeTool({openAiCallId,toolCallId:'synthetic_end_tool',name:'end_call',arguments:{reason:'Synthetic completion',summary:'Synthetic call summary.'}});
      else assert.fail('Unsupported synthetic callback');
      reply(input,{ok:true,result:result??null});
    }catch(error){reply(input,{errorCode:error && typeof error==='object' && 'code'in error?String(error.code):'SYNTHETIC_CALLBACK_FAILURE'},409);}
  }).catch(error=>{process.send?.({type:'failure',code:error && typeof error==='object' && 'code'in error?String(error.code):'RECOVERY_WORKER_FAILURE'});process.exitCode=1;});
});
process.send?.({type:'ready',pid:process.pid,marker});
