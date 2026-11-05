import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpenAiRealtimeAcceptConfig } from '../src/lib/callcommand-number-provider.js';
import { OpenAiRealtimeSipAdapter } from '../src/lib/callcommand-realtime.js';

const env = {
  // Synthetic adapter configuration only. Fetch and sockets are injected by the test fixture.
  OPENAI_API_KEY: 'sk-SYNTHETIC-ONLY-CALLCOMMAND-COMPOSITION-NO-NETWORK',
  OPENAI_PROJECT_ID: 'proj_composition_fixture',
  OPENAI_WEBHOOK_SECRET: 'whsec_composition_synthetic_fixture',
  CALLCOMMAND_SIP_ROUTE_SECRET: 'composition-synthetic-fixture-at-least-32-bytes',
  CALLCOMMAND_REALTIME_MODEL: 'gpt-realtime-2.1-mini',
};
const parameters = () => ({type:'object',additionalProperties:false,properties:{summary:{type:'string'}},required:['summary']});

test('canonical realtime compiler output composes with actual adapter without losing closed nested schemas', async () => {
  const config = buildOpenAiRealtimeAcceptConfig({
    model:'gpt-realtime-2.1-mini',voice:'marin',serverCompiledInstructions:'Synthetic intake; no delivery.',
    allowlistedTools:[{type:'function',name:'save_summary',description:'Save a synthetic summary.',parameters:parameters()}],
  });
  assert.equal(Object.getPrototypeOf(config.tools[0].parameters),null);
  const before = JSON.stringify(config.tools);
  const requests: Array<{url:string;body:unknown}> = [];
  const adapter = new OpenAiRealtimeSipAdapter({env,fetch:async (url,init)=>{
    requests.push({url,body:JSON.parse(String(init.body))});return new Response(null,{status:200});
  }});
  const result = await adapter.accept('call_composition_fixture',{
    instructions:config.instructions,tools:config.tools,voice:config.audio.output.voice,maxOutputTokens:config.max_output_tokens,
  });
  assert.equal(result.ok,true);assert.equal(requests.length,1);
  assert.equal(requests[0].url,'https://api.openai.com/v1/realtime/calls/call_composition_fixture/accept');
  assert(requests[0].body && typeof requests[0].body==='object' && 'tools' in requests[0].body);
  assert.deepEqual(requests[0].body.tools,[{type:'function',name:'save_summary',description:'Save a synthetic summary.',parameters:parameters()}]);
  assert.equal(JSON.stringify(config.tools),before);
});

test('accept still rejects custom prototypes, banned keys, depth and size excess before synthetic provider action', async t => {
  let requests=0;
  const adapter = new OpenAiRealtimeSipAdapter({env,fetch:async ()=>{requests++;return new Response(null,{status:200});}});
  const polluted = Object.assign(Object.create({unexpected:'inherited'}),parameters());
  const nested = {...parameters(),properties:{summary:Object.create({type:'string'})}};
  const banned = Object.assign(Object.create(null),parameters(),{constructor:{prototype:{polluted:true}}});
  const protoKey = JSON.parse('{"type":"object","additionalProperties":false,"properties":{"__proto__":{"type":"string"}}}') as Record<string,unknown>;
  let deep: Record<string,unknown>={type:'string'};
  for(let index=0;index<12;index++) deep={child:deep};
  for(const [name,schema] of [
    ['custom root prototype',polluted],['custom nested prototype',nested],['null prototype with banned key',banned],
    ['nested proto key',protoKey],['depth limit',{...parameters(),properties:deep}],
    ['array size limit',{...parameters(),required:Array.from({length:129},()=> 'summary')}],
  ] as const) {
    await t.test(name,async ()=>{
      assert.throws(()=>adapter.accept('call_composition_fixture',{
        instructions:'Synthetic intake.',tools:[{type:'function',name:'save_summary',description:'Save summary.',parameters:schema}],
      }),/plain objects|key is invalid|structural limits|array is too large/);
      assert.equal(requests,0);
    });
  }
});
