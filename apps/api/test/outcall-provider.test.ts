import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  confirmOutCallPhoneVerification,
  outCallProviderState,
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
};

async function withLiveEnv(run: () => Promise<void>) {
  const before = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(LIVE_ENV)) {
    before.set(key, process.env[key]);
    process.env[key] = value;
  }
  const originalFetch = globalThis.fetch;
  try {
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
    assert.deepEqual(outCallProviderState(), { name: 'twilio', configured: true, ready: true, reason: null });
    delete process.env.OUTCALL_LIVE_PROVIDER;
    const gated = outCallProviderState();
    assert.equal(gated.name, 'twilio');
    assert.equal(gated.configured, true);
    assert.equal(gated.ready, false);
  });
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

    await startOutCallPhoneVerification('+15551234567');
    assert.equal(await confirmOutCallPhoneVerification('+15551234567', '123456'), true);
    assert.equal(requests.length, 2);
    assert.match(requests[0].url, /verify\.twilio\.com\/v2\/Services\/VA/);
    assert.match(requests[0].body, /To=%2B15551234567&Channel=sms/);
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
      requestId: '11111111-1111-1111-1111-111111111111',
      destination: '+15551234567',
      message: 'Please stay on the line while I share an update.',
      voice: 'alice',
      language: 'en-US',
    });
    assert.match(placed.sid, /^CA/);
    assert.equal(form.get('To'), '+15551234567');
    assert.equal(form.get('From'), LIVE_ENV.TWILIO_PHONE_NUMBER);
    assert.equal(form.get('Record'), 'false');
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
