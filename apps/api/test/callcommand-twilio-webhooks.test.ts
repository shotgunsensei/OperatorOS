/**
 * Task #90 — End-to-end coverage for the Twilio webhook path that drives a
 * CallCommand AI row through `queued → ringing → completed` and lands a
 * transcript + AI-generated summary on the row after the recording
 * callback. Also asserts that forged signatures are rejected with 403.
 *
 * The route in `module-shell-routes.ts` verifies `X-Twilio-Signature` by
 * recomputing `HMAC-SHA1(url + sortedFormFields)` with the Twilio auth
 * token, so we set the telephony env vars before importing anything that
 * reads them and reuse the same algorithm to forge a valid signature on
 * the test side.
 *
 * `finalizeTranscript` is fire-and-forget with multi-second backoffs, so
 * the test monkey-patches `setTimeout` to fire on the next tick for the
 * duration of the recording-webhook assertions. Without this the suite
 * would block ~10s waiting for the first transcript poll.
 */

// IMPORTANT: telephony.ts reads these env vars on each call, but
// `verifyTwilioSignature` fails closed when they are missing. Setting
// them before route registration matches what production looks like.
process.env.TWILIO_ACCOUNT_SID = 'ACtest_account_sid';
process.env.TWILIO_AUTH_TOKEN = 'test-auth-token-deadbeef';
process.env.TWILIO_FROM_NUMBER = '+15555550100';
process.env.TWILIO_PUBLIC_BASE_URL = 'http://localhost:3001';
// Force the mock AI provider so `summarizeTranscript()` is deterministic
// even on dev machines that have OPENAI_API_KEY set. Without this, the
// summary assertions would depend on a live OpenAI response.
delete process.env.OPENAI_API_KEY;

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  modules, moduleCallLogs, tenants, tenantUsers, tenantModules,
} from '../src/schema.js';
import {
  ensureSchemaReady, createTestUser, cleanupUser, uniqueId,
} from './_setup.js';

const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const BASE_URL = process.env.TWILIO_PUBLIC_BASE_URL!;

let app: any;
let user: any;
let tenant: any;
let moduleRow: any;
let callRow: any;
const PROVIDER_SID = 'CA' + 'a'.repeat(30);

function signTwilio(url: string, params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  let data = url;
  for (const k of keys) data += k + params[k];
  return createHmac('sha1', TWILIO_TOKEN).update(data, 'utf8').digest('base64');
}

before(async () => {
  await ensureSchemaReady();
  // The module-shell tables (in particular `module_call_logs.provider*`
  // columns) ship with their own DDL helper that boot calls separately
  // from the SaaS/tenant DDL bundled in `ensureSchemaReady()`.
  const { ensureModuleShellTables } = await import('../src/lib/saas-db-init.js');
  await ensureModuleShellTables();
  user = await createTestUser();

  // Tenant + membership that the caller belongs to.
  const slug = uniqueId('cc-webhook');
  [tenant] = await db.insert(tenants).values({
    name: 'CallCommand Test', slug, type: 'company', status: 'active',
    ownerUserId: user.id,
  }).returning();
  await db.insert(tenantUsers).values({
    tenantId: tenant.id, userId: user.id, role: 'owner', status: 'active',
  });

  // Reuse the seeded callcommand-ai module row (seedModules() will have
  // inserted it on boot); fall back to inserting a minimal stand-in if
  // the suite is running against a fresh DB where seeding hasn't fired
  // for some reason.
  const existing = await db.select().from(modules).where(eq(modules.slug, 'callcommand-ai')).limit(1);
  if (existing.length > 0) {
    moduleRow = existing[0];
  } else {
    [moduleRow] = await db.insert(modules).values({
      slug: 'callcommand-ai', name: 'CallCommand AI', description: 'fixture',
      baseUrl: 'https://example.test', status: 'live', planMin: 'starter', ord: 0,
    }).returning();
  }

  // Enable the module for this tenant with allowAllMembers so the caller
  // passes `requireTenantModuleAccess('callcommand-ai')`.
  await db.insert(tenantModules).values({
    tenantId: tenant.id, moduleId: moduleRow.id, status: 'enabled', allowAllMembers: true,
  });

  // Seed the queued call row the webhooks will mutate. Note the
  // providerSid + matching tenantId so `findCallRow(sid, …)` resolves it.
  [callRow] = await db.insert(moduleCallLogs).values({
    tenantId: tenant.id, userId: user.id,
    phone: '+15555550199', callerName: 'Test Caller', persona: 'receptionist',
    status: 'queued', provider: 'twilio', providerSid: PROVIDER_SID,
  }).returning();

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerModuleShellRoutes } = await import('../src/routes/module-shell-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerModuleShellRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  try { await db.delete(moduleCallLogs).where(eq(moduleCallLogs.tenantId, tenant.id)); } catch {}
  try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, tenant.id)); } catch {}
  try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenant.id)); } catch {}
  try { await db.delete(tenants).where(eq(tenants.id, tenant.id)); } catch {}
  if (user) await cleanupUser(user.id);
});

async function reloadCall() {
  const [row] = await db.select().from(moduleCallLogs)
    .where(eq(moduleCallLogs.id, callRow.id)).limit(1);
  return row;
}

test('signed status webhook transitions queued → ringing → completed', async () => {
  // ringing
  {
    const url = `${BASE_URL}/v1/modules/callcommand-ai/webhooks/twilio/status`;
    const body = { CallSid: PROVIDER_SID, CallStatus: 'ringing' };
    const r = await app.inject({
      method: 'POST',
      url: '/v1/modules/callcommand-ai/webhooks/twilio/status',
      headers: { 'x-twilio-signature': signTwilio(url, body), 'content-type': 'application/json' },
      payload: body,
    });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), { ok: true });
    assert.equal((await reloadCall()).status, 'ringing');
  }

  // in-progress (still maps to 'ringing' in our model) → completed
  {
    const url = `${BASE_URL}/v1/modules/callcommand-ai/webhooks/twilio/status`;
    const body = { CallSid: PROVIDER_SID, CallStatus: 'completed' };
    const r = await app.inject({
      method: 'POST',
      url: '/v1/modules/callcommand-ai/webhooks/twilio/status',
      headers: { 'x-twilio-signature': signTwilio(url, body), 'content-type': 'application/json' },
      payload: body,
    });
    assert.equal(r.statusCode, 200);
    assert.equal((await reloadCall()).status, 'completed');
  }
});

test('forged signatures on status webhook are rejected with 403', async () => {
  const body = { CallSid: PROVIDER_SID, CallStatus: 'completed' };
  const r = await app.inject({
    method: 'POST',
    url: '/v1/modules/callcommand-ai/webhooks/twilio/status',
    headers: { 'x-twilio-signature': 'definitely-not-a-real-signature', 'content-type': 'application/json' },
    payload: body,
  });
  assert.equal(r.statusCode, 403);
  assert.match(JSON.stringify(r.json()), /Invalid signature/);
});

test('recording webhook persists recording url + transcript + AI summary', async () => {
  // The recording webhook fires `finalizeTranscript` as a background task
  // that sleeps on `setTimeout` between Twilio transcription polls.
  // Speed those sleeps up so the test doesn't block ~10s on first poll.
  const realSetTimeout = global.setTimeout;
  const realFetch = global.fetch;
  (global as any).setTimeout = (fn: any, _ms?: number, ...rest: any[]) =>
    realSetTimeout(fn, 0, ...rest);

  const RECORDING_SID = 'REbeefbeefbeefbeefbeefbeefbeefbeef';
  const RECORDING_URL = 'https://api.twilio.com/2010-04-01/Recordings/' + RECORDING_SID;
  const TRANSCRIPT = 'Hello this is Test Caller calling about my appointment. Please call me back at five five five oh one nine nine.';

  // Stub global fetch so `fetchTwilioTranscription` returns immediately
  // instead of actually hitting Twilio.
  let twilioCalls = 0;
  (global as any).fetch = async (input: any, init?: any) => {
    const u = typeof input === 'string' ? input : (input?.url ?? '');
    if (u.includes(`/Recordings/${RECORDING_SID}/Transcriptions.json`)) {
      twilioCalls++;
      return new Response(
        JSON.stringify({ transcriptions: [{ transcription_text: TRANSCRIPT }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return realFetch(input, init);
  };

  try {
    const url = `${BASE_URL}/v1/modules/callcommand-ai/webhooks/twilio/recording`;
    const body = {
      CallSid: PROVIDER_SID,
      RecordingSid: RECORDING_SID,
      RecordingUrl: RECORDING_URL,
    };
    const r = await app.inject({
      method: 'POST',
      url: '/v1/modules/callcommand-ai/webhooks/twilio/recording',
      headers: { 'x-twilio-signature': signTwilio(url, body), 'content-type': 'application/json' },
      payload: body,
    });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), { ok: true });

    // recordingUrl is persisted synchronously by the handler.
    let row = await reloadCall();
    assert.equal(row.recordingUrl, RECORDING_URL, 'recording url should be saved immediately');

    // Wait for the fire-and-forget finalisation to land transcript + summary.
    // We zeroed out the setTimeout delays, so the chain resolves in a handful
    // of microtasks; poll briefly to absorb any scheduler jitter.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      row = await reloadCall();
      if (row.transcript && row.summary) break;
      await new Promise((res) => realSetTimeout(res, 25));
    }
    assert.equal(row.transcript, TRANSCRIPT, 'transcript should be persisted after Twilio fetch');
    assert.ok(row.summary && row.summary.length > 0, 'AI summary should be persisted');
    // The mock AI provider returns deterministic text; ensure we did NOT
    // fall back to the "Twilio did not return a transcript" canned blurb.
    assert.doesNotMatch(row.summary!, /did not return a transcript/i);
    // Summary must come from the AI provider, NOT be a copy of the raw
    // transcript — that's the difference between the happy path and the
    // "AI summary failed; storing raw transcript only" fallback branch.
    assert.notEqual(row.summary, TRANSCRIPT, 'summary should be AI-generated, not a copy of the transcript');
    assert.ok(twilioCalls >= 1, 'fetchTwilioTranscription should have been hit at least once');
  } finally {
    (global as any).setTimeout = realSetTimeout;
    (global as any).fetch = realFetch;
  }
});

test('forged signatures on recording webhook are rejected with 403', async () => {
  const body = {
    CallSid: PROVIDER_SID,
    RecordingSid: 'REbadbadbadbadbadbadbadbadbadbadbad',
    RecordingUrl: 'https://example.test/r.mp3',
  };
  const r = await app.inject({
    method: 'POST',
    url: '/v1/modules/callcommand-ai/webhooks/twilio/recording',
    headers: { 'x-twilio-signature': 'nope', 'content-type': 'application/json' },
    payload: body,
  });
  assert.equal(r.statusCode, 403);
  assert.match(JSON.stringify(r.json()), /Invalid signature/);
});

