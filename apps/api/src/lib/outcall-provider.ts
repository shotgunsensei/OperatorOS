import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizeE164 } from './callcommand.js';
import { isOperatorOSProductionArtifactTestEnvironment } from './shared-service-safety.js';

export type OutCallProviderName = 'test' | 'twilio' | 'disabled';

export interface OutCallProviderState {
  name: OutCallProviderName;
  configured: boolean;
  ready: boolean;
  reason: string | null;
}

interface OutCallTwilioConfig {
  accountSid: string;
  restUsername: string;
  restSecret: string;
  signingToken: string;
  verifyServiceSid: string;
  fromNumber: string;
  publicUrl: string;
  allowedCountries: Set<string>;
}

export class OutCallProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

function enabled(value: string | undefined): boolean {
  return ['1', 'true', 'enabled'].includes(String(value ?? '').toLowerCase());
}

function testAdapterEnabled(): boolean {
  return process.env.APP_ENV === 'test'
    && process.env.OUTCALL_TEST_ADAPTER === 'enabled';
}

function readTwilioConfig(): OutCallTwilioConfig | null {
  if (isOperatorOSProductionArtifactTestEnvironment()) return null;
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? '';
  const signingToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? '';
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim() ?? '';
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim() ?? '';
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim() ?? '';
  const fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim() ?? '';
  const publicUrl = process.env.OUTCALL_PUBLIC_URL?.trim().replace(/\/$/, '') ?? '';
  const allowedCountries = new Set(
    String(process.env.TWILIO_ALLOWED_COUNTRIES ?? '')
      .split(',')
      .map(value => value.trim().toUpperCase())
      .filter(value => /^[A-Z]{2}$/.test(value)),
  );
  const restUsername = apiKeySid || accountSid;
  const restSecret = apiKeySid ? apiKeySecret : signingToken;

  if (!/^AC[a-zA-Z0-9]{8,}$/.test(accountSid)
    || !signingToken
    || (apiKeySid && (!/^SK[a-zA-Z0-9]{8,}$/.test(apiKeySid) || !apiKeySecret))
    || !/^VA[a-zA-Z0-9]{8,}$/.test(verifyServiceSid)
    || !/^\+[1-9]\d{7,14}$/.test(fromNumber)
    || publicUrl !== 'https://outcall.operatoros.net'
    || allowedCountries.size === 0
    || !restUsername
    || !restSecret) {
    return null;
  }

  return {
    accountSid,
    restUsername,
    restSecret,
    signingToken,
    verifyServiceSid,
    fromNumber,
    publicUrl,
    allowedCountries,
  };
}

function requireTwilioConfig(): OutCallTwilioConfig {
  const config = readTwilioConfig();
  if (!config || !enabled(process.env.OUTCALL_LIVE_PROVIDER)) {
    throw new OutCallProviderError(
      'OutCall live calling is not enabled',
      'OUTCALL_PROVIDER_NOT_READY',
    );
  }
  return config;
}

export function outCallProviderState(): OutCallProviderState {
  if (testAdapterEnabled()) {
    return { name: 'test', configured: true, ready: true, reason: null };
  }
  const configured = readTwilioConfig() !== null;
  const active = configured && enabled(process.env.OUTCALL_LIVE_PROVIDER);
  if (active) {
    return { name: 'twilio', configured: true, ready: true, reason: null };
  }
  return {
    name: configured ? 'twilio' : 'disabled',
    configured,
    ready: false,
    reason: configured
      ? 'Live calling is configured but awaiting controlled activation.'
      : 'Live phone verification and calling are not configured.',
  };
}

function authHeader(config: OutCallTwilioConfig): string {
  return `Basic ${Buffer.from(`${config.restUsername}:${config.restSecret}`).toString('base64')}`;
}

async function twilioFormRequest<T>(url: string, form: URLSearchParams): Promise<T> {
  const config = requireTwilioConfig();
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader(config),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
  } catch {
    throw new OutCallProviderError('The phone provider could not be reached', 'OUTCALL_PROVIDER_UNAVAILABLE', true);
  }
  if (!response.ok) {
    throw new OutCallProviderError(
      'The phone provider rejected the request',
      `OUTCALL_PROVIDER_HTTP_${response.status}`,
      response.status === 429 || response.status >= 500,
    );
  }
  return await response.json() as T;
}

export function assertOutCallDestinationAllowed(phone: string): void {
  const config = requireTwilioConfig();
  // The initial controlled launch is intentionally North-America-only. A
  // reviewed numbering library and Twilio geo-permission acceptance are
  // required before widening this boundary.
  if (!phone.startsWith('+1') || (!config.allowedCountries.has('US') && !config.allowedCountries.has('CA'))) {
    throw new OutCallProviderError(
      'This destination is outside the approved launch countries',
      'OUTCALL_COUNTRY_NOT_ALLOWED',
    );
  }
}

export async function startOutCallPhoneVerification(phone: string): Promise<void> {
  assertOutCallDestinationAllowed(phone);
  const config = requireTwilioConfig();
  const form = new URLSearchParams({ To: phone, Channel: 'sms' });
  const result = await twilioFormRequest<{ status?: string }>(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(config.verifyServiceSid)}/Verifications`,
    form,
  );
  if (result.status !== 'pending') {
    throw new OutCallProviderError('Phone verification could not be started', 'OUTCALL_VERIFY_START_FAILED');
  }
}

export async function confirmOutCallPhoneVerification(phone: string, code: string): Promise<boolean> {
  assertOutCallDestinationAllowed(phone);
  const config = requireTwilioConfig();
  const form = new URLSearchParams({ To: phone, Code: code });
  const result = await twilioFormRequest<{ status?: string; valid?: boolean }>(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(config.verifyServiceSid)}/VerificationCheck`,
    form,
  );
  return result.status === 'approved' && result.valid !== false;
}

function xml(value: string): string {
  return value.replace(/[<>&'"]/g, character => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character] as string);
}

export async function placeOutCallVoice(input: {
  requestId: string;
  destination: string;
  message: string;
  voice: string;
  language: string;
}): Promise<{ sid: string; status: string }> {
  assertOutCallDestinationAllowed(input.destination);
  const config = requireTwilioConfig();
  const statusCallback = new URL(
    `/api/modules/outcall/webhooks/twilio/voice/status?request_id=${encodeURIComponent(input.requestId)}`,
    config.publicUrl,
  ).toString();
  const gatherCallback = new URL(
    `/api/modules/outcall/webhooks/twilio/voice/gather?request_id=${encodeURIComponent(input.requestId)}`,
    config.publicUrl,
  ).toString();
  const twiml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    `<Say voice="${xml(input.voice)}" language="${xml(input.language)}">${xml(input.message)}</Say>`,
    `<Gather input="dtmf" numDigits="1" timeout="6" method="POST" action="${xml(gatherCallback)}">`,
    `<Say voice="${xml(input.voice)}" language="${xml(input.language)}">Press 1 to confirm you received this call.</Say>`,
    '</Gather>',
    '<Hangup/>',
    '</Response>',
  ].join('');
  const form = new URLSearchParams({
    To: input.destination,
    From: config.fromNumber,
    Twiml: twiml,
    StatusCallback: statusCallback,
    StatusCallbackMethod: 'POST',
    Record: 'false',
  });
  for (const event of ['initiated', 'ringing', 'answered', 'completed']) {
    form.append('StatusCallbackEvent', event);
  }
  const result = await twilioFormRequest<{ sid?: string; status?: string }>(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Calls.json`,
    form,
  );
  if (!result.sid || !/^CA[a-zA-Z0-9]{8,}$/.test(result.sid)) {
    throw new OutCallProviderError('The phone provider returned an invalid call identifier', 'OUTCALL_PROVIDER_RESPONSE_INVALID');
  }
  return { sid: result.sid, status: result.status ?? 'queued' };
}

export function canonicalOutCallWebhookUrl(rawUrl: string): string {
  const config = readTwilioConfig();
  if (!config) return '';
  const url = new URL(rawUrl, config.publicUrl);
  // The public /api/* route is rewritten to /v1/* on the private API. Twilio
  // signs the public URL, so restore it before calculating the digest.
  if (url.pathname.startsWith('/v1/modules/outcall/webhooks/')) {
    url.pathname = url.pathname.replace('/v1/modules/outcall/webhooks/', '/api/modules/outcall/webhooks/');
  }
  return url.toString();
}

export function verifyOutCallTwilioSignature(
  rawUrl: string,
  params: Record<string, string>,
  signature: string | undefined,
): boolean {
  const config = readTwilioConfig();
  if (!config || !signature) return false;
  let data = canonicalOutCallWebhookUrl(rawUrl);
  for (const key of Object.keys(params).sort()) data += key + params[key];
  const expected = createHmac('sha1', config.signingToken).update(data, 'utf8').digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function normalizeOutCallProviderPhone(value: unknown): string {
  return normalizeE164(value, 'phone');
}

export function isOutCallInboundNumber(value: string): boolean {
  const config = readTwilioConfig();
  return config !== null && value === config.fromNumber;
}
