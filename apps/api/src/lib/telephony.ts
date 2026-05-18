/**
 * Task #75 — Twilio telephony adapter for the CallCommand AI shell.
 * Task #89 — credentials may now come from the Replit Twilio connector
 * (`connector:ccfg_twilio_...`) when running on Replit, falling back to
 * the legacy env-var configuration. The connector path lets a tenant
 * admin enable real test calls with a one-click OAuth handshake instead
 * of pasting four env vars by hand.
 *
 * This module is intentionally thin: it talks to Twilio over the REST API
 * via `fetch` so the project does not need to take a dependency on the
 * twilio SDK. It exposes:
 *
 *   1. `resolveTelephonyConfig()` — returns the active Twilio credentials
 *      plus the source (`connector` or `env`), or `null` when neither is
 *      configured. Result is cached for a short TTL because the connector
 *      proxy is a network call.
 *   2. `getTelephonyInfo()` — async status descriptor for the shell.
 *   3. `placeTwilioCall()` / `verifyTwilioSignature()` /
 *      `fetchTwilioTranscription()` — operational helpers.
 *   4. `summarizeTranscript()` — AI-generated one-line call summary.
 */

import { createHmac } from 'node:crypto';
import { getAiProvider } from './ai-provider.js';

const PERSONA_SCRIPTS: Record<string, string> = {
  receptionist:
    "You are a friendly receptionist for the customer. Greet the caller warmly, ask for their name and the reason for their call, capture the request, and let them know you will route it to the right team. Keep responses to one or two short sentences.",
  qualifier:
    "You are a B2B sales qualifier. Greet the caller, then ask three short discovery questions: company size, current solution, and timeline to evaluate. Confirm what you heard and offer to schedule a follow-up.",
  collector:
    "You are a polite accounts-receivable agent reminding the caller about an outstanding balance. Be empathetic, confirm their identity, restate the balance, and offer to schedule a payment or transfer them to a human agent.",
};

export type TelephonySource = 'connector' | 'env';

export interface TelephonyConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  publicBaseUrl: string;
  source: TelephonySource;
}

function readEnvConfig(): TelephonyConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const publicBaseUrl = process.env.TWILIO_PUBLIC_BASE_URL || process.env.APP_URL;
  if (!accountSid || !authToken || !fromNumber || !publicBaseUrl) return null;
  return { accountSid, authToken, fromNumber, publicBaseUrl, source: 'env' };
}

/**
 * Pull Twilio credentials from the Replit connector proxy. Returns null
 * when the proxy is unreachable, the connector is not wired up, or any
 * required field is missing — callers should fall back to env vars.
 *
 * The proxy is documented at https://connectors.replit.com — it serves
 * credentials for connectors the current Repl is bound to. We accept a
 * variety of Twilio field names because the connector schema has shifted
 * historically (e.g. `account_sid` vs `accountSid`, `phone_number` vs
 * `from_number`).
 */
async function readConnectorConfig(): Promise<TelephonyConfig | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const token = process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL;
  if (!hostname || !token) return null;
  const publicBaseUrl = process.env.TWILIO_PUBLIC_BASE_URL || process.env.APP_URL;
  if (!publicBaseUrl) return null;

  try {
    const res = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=twilio`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          X_REPLIT_TOKEN: token,
        },
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      items?: Array<{ settings?: Record<string, unknown> }>;
    };
    const settings = body.items?.[0]?.settings;
    if (!settings || typeof settings !== 'object') return null;

    const pick = (...keys: string[]): string | null => {
      for (const k of keys) {
        const v = (settings as Record<string, unknown>)[k];
        if (typeof v === 'string' && v.length > 0) return v;
      }
      return null;
    };

    const accountSid = pick('account_sid', 'accountSid', 'sid');
    const authToken = pick('auth_token', 'authToken', 'token', 'api_key', 'apiKey');
    const fromNumber = pick('phone_number', 'phoneNumber', 'from_number', 'fromNumber', 'from');
    if (!accountSid || !authToken || !fromNumber) return null;

    return { accountSid, authToken, fromNumber, publicBaseUrl, source: 'connector' };
  } catch {
    return null;
  }
}

// Short TTL cache to avoid hitting the connector proxy on every webhook /
// signature verification. 60s is long enough to bound the per-request
// latency cost but short enough that revoking the connector or rotating
// the auth token takes effect quickly.
const CACHE_TTL_MS = 60_000;
let cached: { at: number; value: TelephonyConfig | null } | null = null;

export async function resolveTelephonyConfig(): Promise<TelephonyConfig | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  // Prefer the connector when present — it represents an explicit admin
  // choice via the Replit integration UI and survives credential rotation.
  const fromConnector = await readConnectorConfig();
  const value = fromConnector ?? readEnvConfig();
  cached = { at: Date.now(), value };
  return value;
}

/** Drop the cached resolution. Useful in tests and after admin actions. */
export function clearTelephonyCache(): void {
  cached = null;
}

export async function isTelephonyConfigured(): Promise<boolean> {
  return (await resolveTelephonyConfig()) !== null;
}

export async function getTelephonyInfo(): Promise<{
  configured: boolean;
  provider: 'twilio';
  source: TelephonySource | null;
  connectorAvailable: boolean;
}> {
  const cfg = await resolveTelephonyConfig();
  return {
    configured: cfg !== null,
    provider: 'twilio',
    source: cfg?.source ?? null,
    // `connectorAvailable` tells the UI whether the one-click Replit
    // connector path is even reachable from this environment. Self-hosted
    // installs that lack the proxy fall back to "paste env vars" guidance.
    connectorAvailable: Boolean(
      process.env.REPLIT_CONNECTORS_HOSTNAME &&
        (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL),
    ),
  };
}

export interface PlaceCallInput {
  to: string;
  persona: string;
  callerName: string;
  callRowId: string;
}

export interface PlaceCallResult {
  sid: string;
  status: 'queued' | 'ringing' | 'completed' | 'failed';
}

function buildTwiml(persona: string, callerName: string): string {
  const script = PERSONA_SCRIPTS[persona] ?? PERSONA_SCRIPTS.receptionist;
  const safeName = callerName.replace(/[<>&"]/g, '');
  const intro = `Hello ${safeName}, this is the CallCommand A I agent calling for a quick test.`;
  const blurb = script.split('.')[0] + '.';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    `  <Say voice="Polly.Joanna">${intro}</Say>`,
    `  <Say voice="Polly.Joanna">${blurb}</Say>`,
    '  <Pause length="1"/>',
    '  <Say voice="Polly.Joanna">If you are hearing this message, the integration is wired up correctly. Goodbye.</Say>',
    '</Response>',
  ].join('\n');
}

export function mapTwilioStatus(twilioStatus: string): 'queued' | 'ringing' | 'completed' | 'failed' {
  switch (twilioStatus) {
    case 'queued':
    case 'initiated':
      return 'queued';
    case 'ringing':
    case 'in-progress':
      return 'ringing';
    case 'completed':
      return 'completed';
    case 'busy':
    case 'no-answer':
    case 'canceled':
    case 'failed':
      return 'failed';
    default:
      return 'queued';
  }
}

export async function placeTwilioCall(input: PlaceCallInput): Promise<PlaceCallResult> {
  const cfg = await resolveTelephonyConfig();
  if (!cfg) {
    throw new Error('TELEPHONY_NOT_CONFIGURED');
  }

  const statusCallback = new URL(
    `/v1/modules/callcommand-ai/webhooks/twilio/status?call_id=${encodeURIComponent(input.callRowId)}`,
    cfg.publicBaseUrl,
  ).toString();
  const recordingCallback = new URL(
    `/v1/modules/callcommand-ai/webhooks/twilio/recording?call_id=${encodeURIComponent(input.callRowId)}`,
    cfg.publicBaseUrl,
  ).toString();

  const form = new URLSearchParams();
  form.set('To', input.to);
  form.set('From', cfg.fromNumber);
  form.set('Twiml', buildTwiml(input.persona, input.callerName));
  form.set('StatusCallback', statusCallback);
  form.set('StatusCallbackMethod', 'POST');
  for (const ev of ['initiated', 'ringing', 'answered', 'completed']) {
    form.append('StatusCallbackEvent', ev);
  }
  form.set('Record', 'true');
  form.set('RecordingStatusCallback', recordingCallback);
  form.set('RecordingStatusCallbackMethod', 'POST');
  form.set('RecordingStatusCallbackEvent', 'completed');

  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Calls.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio API error ${res.status}: ${text.slice(0, 400)}`);
  }

  const body = (await res.json()) as { sid?: string; status?: string };
  if (!body.sid) throw new Error('Twilio response missing call sid');
  return { sid: body.sid, status: mapTwilioStatus(body.status ?? 'queued') };
}

/**
 * Verify the X-Twilio-Signature header per
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security.
 *
 * Async because credentials may come from the Replit connector proxy
 * (network call). The proxy result is cached, so the hot path is normally
 * an in-memory lookup.
 */
export async function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
): Promise<boolean> {
  if (!signature) return false;
  const cfg = await resolveTelephonyConfig();
  if (!cfg) return false;
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) data += k + params[k];
  const expected = createHmac('sha1', cfg.authToken).update(data, 'utf8').digest('base64');
  return expected === signature;
}

export async function fetchTwilioTranscription(recordingSid: string): Promise<string | null> {
  const cfg = await resolveTelephonyConfig();
  if (!cfg) return null;
  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Recordings/${recordingSid}/Transcriptions.json`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { transcriptions?: Array<{ transcription_text?: string }> };
  const first = body.transcriptions?.[0]?.transcription_text;
  return typeof first === 'string' && first.length > 0 ? first : null;
}

export async function summarizeTranscript(
  transcript: string,
  persona: string,
  callerName: string,
): Promise<string> {
  if (!transcript || transcript.trim().length === 0) {
    return `Call with ${callerName} completed but produced no transcript.`;
  }
  const provider = getAiProvider();
  const result = await provider.complete({
    systemPrompt:
      'You summarize a brief outbound test call between an AI agent and a caller. Reply with a single sentence (max 220 chars) describing what happened and any next step.',
    userPrompt: `Persona: ${persona}\nCaller: ${callerName}\nTranscript:\n${transcript.slice(0, 4000)}`,
    maxTokens: 160,
    temperature: 0.3,
  });
  const oneLine = result.text.replace(/\s+/g, ' ').trim();
  return oneLine.slice(0, 500);
}
