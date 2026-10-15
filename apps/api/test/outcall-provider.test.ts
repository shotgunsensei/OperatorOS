import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test,{before,after} from 'node:test';
import {createOutCallResourceFixture,SYNTHETIC_OUTCALL_POLICY} from './outcall-resource-fixture.js';
import {
  confirmOutCallPhoneVerification,
  outCallProviderState,
  outCallReadyState,
  assertOutCallDestinationAllowed,
  placeOutCallVoice,
  startOutCallPhoneVerification,
  verifyOutCallTwilioSignature,
} from '../src/lib/outcall-provider.js';

const LIVE_ENV = {
  APP_ENV: 'production',
  NODE_ENV: 'production',
  OUTCALL_LIVE_PROVIDER: 'enabled',
  OUTCALL_PUBLIC_URL: 'https://outcall.operatoros.net',
  TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
  TWILIO_AUTH_TOKEN: 'outcall-primary-auth-token-for-signatures',
  TWILIO_API_KEY_SID: `SK${'b'.repeat(32)}`,
  TWILIO_API_KEY_SECRET: 'outcall-api-key-secret-for-rest-requests',
  TWILIO_VERIFY_SERVICE_SID: `VA${'c'.repeat(32)}`,
  TWILIO_PHONE_NUMBER: '+15555550101',
  TWILIO_ALLOWED_COUNTRIES: 'US,CA',
  OUTCALL_RESOURCE_POLICY_JSON:JSON.stringify(SYNTHETIC_OUTCALL_POLICY),
};
let fixture:Awaited<ReturnType<typeof createOutCallResourceFixture>>;
before(async()=>{fixture=await createOutCallResourceFixture();});
after(async()=>{await fixture?.cleanup();});

async function withLiveEnv(run: () => Promise<void>) {
  const before = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(LIVE_ENV)) {
    before.set(key, process.env[key]);
    process.env[key] = value;
  }
  before.set('OPERATOROS_DETERMINISTIC_PROVIDER_MODE', process.env.OPERATOROS_DETERMINISTIC_PROVIDER_MODE);
  delete process.env.OPERATOROS_DETERMINISTIC_PROVIDER_MODE;
  const originalFetch = globalThis.fetch;
  try {
    await fixture.approve();
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('OutCall live provider requires complete configuration and an explicit activation gate', async () => {
  await withLiveEnv(async () => {
    assert.deepEqual(await outCallReadyState(), { name: 'twilio', configured: true, ready: true, reason: null });
    delete process.env.OUTCALL_LIVE_PROVIDER;
    const gated = outCallProviderState();
    assert.equal(gated.name, 'twilio');
    assert.equal(gated.configured, true);
    assert.equal(gated.ready, false);
  });
});

test('OutCall test adapter requires both test environment signals', () => {
  const keys = ['APP_ENV', 'NODE_ENV', 'OUTCALL_TEST_ADAPTER'] as const;
  const before = keys.map(key => process.env[key]);
  try {
    process.env.OUTCALL_TEST_ADAPTER = 'enabled';
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'production';
    assert.equal(outCallProviderState().ready, false);
    process.env.NODE_ENV = 'test';
    assert.equal(outCallProviderState().name, 'test');
    process.env.APP_ENV = 'production';
    assert.equal(outCallProviderState().ready, false);
  } finally {
    keys.forEach((key, index) => {
      if (before[index] === undefined) delete process.env[key];
      else process.env[key] = before[index];
    });
  }
});

test('OutCall uses Twilio Verify without retaining or returning OTP values', async () => {
  await withLiveEnv(async () => {
    const requests: Array<{ url: string; body: string; authorization: string }> = [];
    globalThis.fetch = (async (input, init) => {
      requests.push({
        url: String(input),
        body: String(init?.body ?? ''),
        authorization: String((init?.headers as Record<string, string>)?.Authorization ?? ''),
      });
      const approved = String(input).endsWith('/VerificationCheck');
      return new Response(JSON.stringify(approved
        ? { status: 'approved', valid: true }
        : { status: 'pending' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    await startOutCallPhoneVerification('+12025550101',fixture.context());
    assert.equal(await confirmOutCallPhoneVerification('+12025550101', '123456',fixture.context()), true);
    assert.equal(requests.length, 2);
    assert.match(requests[0].url, /verify\.twilio\.com\/v2\/Services\/VA/);
    assert.match(requests[0].body, /To=%2B12025550101&Channel=sms/);
    assert.match(requests[1].body, /Code=123456/);
    assert.equal(requests[0].authorization, `Basic ${Buffer.from(`${LIVE_ENV.TWILIO_API_KEY_SID}:${LIVE_ENV.TWILIO_API_KEY_SECRET}`).toString('base64')}`);
  });
});

test('OutCall voice placement is verified-self shaped, recording-off, and callback-bound', async () => {
  await withLiveEnv(async () => {
    let form = new URLSearchParams();
    globalThis.fetch = (async (_input, init) => {
      form = new URLSearchParams(String(init?.body ?? ''));
      return new Response(JSON.stringify({ sid: `CA${'d'.repeat(32)}`, status: 'queued' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const placed = await placeOutCallVoice({
      ...await fixture.voice(),
      message: 'Please stay on the line while I share an update.',
      voice: 'alice',
      language: 'en-US',
    });
    assert.match(placed.sid, /^CA/);
    assert.equal(form.get('To'), '+12025550101');
    assert.equal(form.get('From'), LIVE_ENV.TWILIO_PHONE_NUMBER);
    assert.equal(form.get('Record'), 'false');
    assert.equal(form.get('TimeLimit'),'120');
    assert.match(form.get('StatusCallback') ?? '', /^https:\/\/outcall\.operatoros\.net\/api\/modules\/outcall\/webhooks\/twilio\/voice\/status\?request_id=/);
    assert.match(form.get('Twiml') ?? '', /input="dtmf"/);
    assert.doesNotMatch(form.toString(), /Record=true|RecordingStatusCallback/);
  });
});

test('OutCall verifies Twilio callbacks against the exact canonical URL', async () => {
  await withLiveEnv(async () => {
    const path = '/api/modules/outcall/webhooks/twilio/voice/status?request_id=request-1';
    const params = { CallSid: `CA${'e'.repeat(32)}`, CallStatus: 'completed' };
    let data = `https://outcall.operatoros.net${path}`;
    for (const key of Object.keys(params).sort()) data += key + params[key as keyof typeof params];
    const signature = createHmac('sha1', LIVE_ENV.TWILIO_AUTH_TOKEN).update(data).digest('base64');
    assert.equal(verifyOutCallTwilioSignature(path, params, signature), true);
    assert.equal(
      verifyOutCallTwilioSignature(path.replace('/api/', '/v1/'), params, signature),
      true,
    );
    assert.equal(verifyOutCallTwilioSignature(`${path}&tampered=1`, params, signature), false);
    assert.equal(verifyOutCallTwilioSignature(path, params, 'forged'), false);
  });
});

test('OutCall bounds voice requests and preserves uncertain responses without retrying', async () => {
  await withLiveEnv(async () => {
    for (const outcome of ['lost-response', 'malformed-response', 'provider-error']) {
      const payload=await fixture.voice();
      let count = 0;
      globalThis.fetch = (async (_url, init) => {
        count++;
        assert.ok(init?.signal, 'provider request needs a bounded deadline');
        if (outcome === 'lost-response') throw new Error('synthetic response lost after acceptance');
        if (outcome === 'malformed-response') return new Response('invalid-json', { status: 200 });
        return new Response('{}', { status: 500 });
      }) as typeof fetch;
      await assert.rejects(() => placeOutCallVoice(payload), (error: any) => error.code === 'OUTCALL_PROVIDER_OUTCOME_UNKNOWN' && error.retryable === false);
      assert.equal(count, 1, outcome);
    }
  });
});

test('OutCall validates exact configured countries before Verify, checking or voice requests',async()=>{
  await withLiveEnv(async()=>{
    process.env.TWILIO_ALLOWED_COUNTRIES='US';
    assert.doesNotThrow(()=>assertOutCallDestinationAllowed('+12025550101'));
    let submissions=0;globalThis.fetch=(async()=>{submissions++;throw new Error('must not submit');}) as typeof fetch;
    for(const phone of ['+14165550101','+12425550101','+18765550101','+17875550101','+18005550101','+15551234567','+442079460000']) {
      await assert.rejects(()=>startOutCallPhoneVerification(phone,fixture.context()),(error:any)=>error.code==='OUTCALL_COUNTRY_NOT_ALLOWED');
      await assert.rejects(()=>confirmOutCallPhoneVerification(phone,'123456',fixture.context()),(error:any)=>error.code==='OUTCALL_COUNTRY_NOT_ALLOWED');
      await assert.rejects(()=>placeOutCallVoice({requestId:crypto.randomUUID(),destination:phone,message:'Neutral',voice:'alice',language:'en-US',tenantId:fixture.user.currentTenantId,userId:fixture.user.id,reservationId:crypto.randomUUID()}),(error:any)=>error.code==='OUTCALL_COUNTRY_NOT_ALLOWED');
    }
    assert.equal(submissions,0);
    process.env.TWILIO_ALLOWED_COUNTRIES='CA';
    assert.doesNotThrow(()=>assertOutCallDestinationAllowed('+14165550101'));
    assert.throws(()=>assertOutCallDestinationAllowed('+12025550101'));
    process.env.TWILIO_ALLOWED_COUNTRIES='US,CA,JM';
    assert.equal(outCallProviderState().configured,false,'unsupported expansion must fail closed');
  });
});

test('OutCall readiness requires matching durable approval, not configured limits',async()=>{
  await withLiveEnv(async()=>{
    delete process.env.OUTCALL_RESOURCE_POLICY_JSON;
    assert.equal((await outCallReadyState()).ready,false);
    process.env.OUTCALL_RESOURCE_POLICY_JSON=JSON.stringify({...SYNTHETIC_OUTCALL_POLICY,dailyMicros:123456});
    assert.equal((await outCallReadyState()).ready,false);
    process.env.OUTCALL_RESOURCE_POLICY_JSON=JSON.stringify(SYNTHETIC_OUTCALL_POLICY);
    assert.equal((await outCallReadyState()).ready,true);
    process.env.TWILIO_ALLOWED_COUNTRIES='CA';
    assert.equal((await outCallReadyState()).ready,false,'country/rate scope changes require a new approval');
  });
});
