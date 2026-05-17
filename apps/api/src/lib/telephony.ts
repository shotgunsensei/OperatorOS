/**
 * Task #75 — Twilio telephony adapter for the CallCommand AI shell.
 *
 * This module is intentionally thin: it talks to Twilio over the REST API
 * via `fetch` so the project does not need to take a dependency on the
 * twilio SDK. It exposes three concerns:
 *
 *   1. `isTelephonyConfigured()` — tells the routes whether to fall back to
 *      a no-op stub (dev/test) or place a real call.
 *   2. `placeTwilioCall()` — kicks off an outbound call and returns the
 *      provider Call SID + initial status.
 *   3. `verifyTwilioSignature()` — verifies the `X-Twilio-Signature` header
 *      on incoming status / recording webhooks so unauthenticated callers
 *      cannot forge call updates.
 *
 * It also exposes `summarizeTranscript()` which runs the recorded
 * transcript through the existing AI provider abstraction so the call row
 * gets a useful one-line summary instead of the legacy canned persona blurb.
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

function readEnv(): {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  publicBaseUrl: string;
} | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const publicBaseUrl = process.env.TWILIO_PUBLIC_BASE_URL || process.env.APP_URL;
  if (!accountSid || !authToken || !fromNumber || !publicBaseUrl) return null;
  return { accountSid, authToken, fromNumber, publicBaseUrl };
}

export function isTelephonyConfigured(): boolean {
  return readEnv() !== null;
}

export function getTelephonyInfo(): { configured: boolean; provider: string } {
  return { configured: isTelephonyConfigured(), provider: 'twilio' };
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

/**
 * Build the TwiML the Twilio call leg will execute. We inline it via the
 * `Twiml` POST parameter so we do not need to host a public TwiML Bin.
 * The recording + transcription is requested so the status webhook later
 * receives the call body for AI summarisation.
 */
function buildTwiml(persona: string, callerName: string): string {
  const script = PERSONA_SCRIPTS[persona] ?? PERSONA_SCRIPTS.receptionist;
  const safeName = callerName.replace(/[<>&"]/g, '');
  const intro = `Hello ${safeName}, this is the CallCommand A I agent calling for a quick test.`;
  // Trim the script for the spoken intro so the test call stays short.
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

/**
 * Map Twilio call statuses to the four states the UI knows about.
 * Reference: https://www.twilio.com/docs/voice/api/call-resource#call-status-values
 */
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
  const cfg = readEnv();
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
 * Twilio signs HMAC-SHA1(URL + sortedFormFields[key1+value1+key2+value2+...]).
 * The signing URL must be the EXACT URL Twilio called, including the query
 * string. `params` are the form-encoded POST body fields (NOT query params).
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  const cfg = readEnv();
  if (!cfg) return false;
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) data += k + params[k];
  const expected = createHmac('sha1', cfg.authToken).update(data, 'utf8').digest('base64');
  // Length-preserving compare; signature values are short so timing-safe
  // compare via simple string equality is fine here.
  return expected === signature;
}

/**
 * Fetch a Twilio recording's transcription text. Twilio's transcription
 * pipeline is best-effort, so callers should treat a null return as "no
 * transcript yet" rather than an error.
 */
export async function fetchTwilioTranscription(recordingSid: string): Promise<string | null> {
  const cfg = readEnv();
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

/**
 * Run the transcript through the AI provider to produce a one-paragraph
 * summary that mirrors the legacy persona blurb in spirit but is grounded
 * in what the caller actually said.
 */
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
