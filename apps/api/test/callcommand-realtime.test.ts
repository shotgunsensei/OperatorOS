import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import {
  CallCommandRealtimeError,
  createCallCommandSipRouteToken,
  extractCallCommandSipRoutingHeaders,
  inspectCallCommandRealtimeReadiness,
  OpenAiRealtimeSipAdapter,
  verifyCallCommandSipRouteToken,
  type CallCommandRealtimeEnvironment,
  type RealtimeSocket,
  type RealtimeSocketFactory,
} from '../src/lib/callcommand-realtime.js';

const INTERNAL_CALL_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_INTERNAL_CALL_ID = '22222222-2222-4222-8222-222222222222';
const TWILIO_CALL_SID = `CA${'a'.repeat(32)}`;
const OTHER_TWILIO_CALL_SID = `CA${'b'.repeat(32)}`;
const OPENAI_CALL_ID = 'rtc_u1_9c6574da8b8a41a18da9308f4ad974ce';
const API_KEY = 'sk-proj-callcommand-realtime-secret-123456789';
const PROJECT_ID = 'proj_callcommand12345678';
const WEBHOOK_SECRET = 'whsec_callcommand_webhook_secret_123456';
const ROUTE_SECRET = 'callcommand-route-secret-value-at-least-32-bytes';

const ENV: CallCommandRealtimeEnvironment = {
  OPENAI_API_KEY: API_KEY,
  OPENAI_PROJECT_ID: PROJECT_ID,
  OPENAI_WEBHOOK_SECRET: WEBHOOK_SECRET,
  CALLCOMMAND_SIP_ROUTE_SECRET: ROUTE_SECRET,
  CALLCOMMAND_REALTIME_MODEL: 'gpt-realtime-2.1-mini',
};

function closedSchema() {
  return { type: 'object', additionalProperties: false, properties: { targetId: { type: 'string' } } };
}

async function flush(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
}

class FakeSocket extends EventEmitter implements RealtimeSocket {
  readyState = 0;
  sent: string[] = [];
  closeCalls: Array<{ code?: number; reason?: string }> = [];

  send(data: string, callback?: (error?: Error) => void): void {
    this.sent.push(data);
    callback?.();
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    this.readyState = 3;
    this.emit('close', code ?? 1000);
  }

  open(): void {
    this.readyState = 1;
    this.emit('open');
  }
}

test('readiness is strict, model-allowlisted, and returned adapter state is secret-free', () => {
  assert.deepEqual(inspectCallCommandRealtimeReadiness({}), {
    ready: false,
    model: null,
    missing: [
      'OPENAI_API_KEY',
      'OPENAI_PROJECT_ID',
      'OPENAI_WEBHOOK_SECRET',
      'CALLCOMMAND_SIP_ROUTE_SECRET',
      'CALLCOMMAND_REALTIME_MODEL',
    ],
    invalid: [],
  });
  const invalid = inspectCallCommandRealtimeReadiness({ ...ENV, CALLCOMMAND_REALTIME_MODEL: 'gpt-4o-realtime-preview' });
  assert.equal(invalid.ready, false);
  assert.deepEqual(invalid.invalid, ['CALLCOMMAND_REALTIME_MODEL']);

  const adapter = new OpenAiRealtimeSipAdapter({
    env: ENV,
    fetch: async () => new Response(null, { status: 200 }),
    webhookClientFactory: () => ({ webhooks: { unwrap: async () => ({}) } }),
    socketFactory: () => new FakeSocket(),
  });
  assert.deepEqual(adapter.readiness, { ready: true, model: 'gpt-realtime-2.1-mini' });
  assert.equal(JSON.stringify(adapter), '{}');
  assert.doesNotMatch(JSON.stringify(adapter.readiness), /sk-|whsec_|route-secret/);

  assert.throws(
    () => new OpenAiRealtimeSipAdapter({ env: { ...ENV, OPENAI_PROJECT_ID: 'https://evil.invalid' } }),
    (error: unknown) => error instanceof CallCommandRealtimeError
      && error.code === 'CALLCOMMAND_REALTIME_NOT_CONFIGURED'
      && !JSON.stringify(error).includes(API_KEY),
  );
  assert.throws(
    () => new OpenAiRealtimeSipAdapter({
      env: ENV,
      webhookClientFactory: () => { throw new Error(`leak ${WEBHOOK_SECRET}`); },
    }),
    (error: unknown) => error instanceof CallCommandRealtimeError
      && error.code === 'CALLCOMMAND_REALTIME_CLIENT_INIT_FAILED'
      && !JSON.stringify(error).includes(WEBHOOK_SECRET),
  );
});

test('route HMAC is bound to both the internal call and Twilio call SID', () => {
  const routeToken = createCallCommandSipRouteToken({
    internalCallId: INTERNAL_CALL_ID,
    providerCallSid: TWILIO_CALL_SID,
    routeSecret: ROUTE_SECRET,
  });
  assert.match(routeToken, /^[0-9a-f]{64}$/);
  assert.equal(verifyCallCommandSipRouteToken({
    internalCallId: INTERNAL_CALL_ID,
    providerCallSid: TWILIO_CALL_SID,
    routeToken,
    routeSecret: ROUTE_SECRET,
  }), true);
  assert.equal(verifyCallCommandSipRouteToken({
    internalCallId: OTHER_INTERNAL_CALL_ID,
    providerCallSid: TWILIO_CALL_SID,
    routeToken,
    routeSecret: ROUTE_SECRET,
  }), false);
  assert.equal(verifyCallCommandSipRouteToken({
    internalCallId: INTERNAL_CALL_ID,
    providerCallSid: OTHER_TWILIO_CALL_SID,
    routeToken,
    routeSecret: ROUTE_SECRET,
  }), false);
  assert.equal(verifyCallCommandSipRouteToken({
    internalCallId: INTERNAL_CALL_ID,
    providerCallSid: TWILIO_CALL_SID,
    routeToken: '../../../etc/passwd',
    routeSecret: ROUTE_SECRET,
  }), false);
  assert.throws(() => createCallCommandSipRouteToken({
    internalCallId: '../tenant',
    providerCallSid: TWILIO_CALL_SID,
    routeSecret: ROUTE_SECRET,
  }), /Internal call ID is invalid/);
});

test('routing headers are extracted case-insensitively and reject missing or duplicate values', () => {
  const routeToken = 'f'.repeat(64);
  assert.deepEqual(extractCallCommandSipRoutingHeaders([
    { name: 'From', value: 'sip:caller@example.invalid' },
    { name: 'X-CallCommand-Call-ID', value: INTERNAL_CALL_ID.toUpperCase() },
    { name: 'x-CALLCOMMAND-route-TOKEN', value: routeToken },
  ]), { internalCallId: INTERNAL_CALL_ID, routeToken });
  assert.throws(() => extractCallCommandSipRoutingHeaders([
    { name: 'x-callcommand-call-id', value: INTERNAL_CALL_ID },
  ]), /route token is invalid/i);
  assert.throws(() => extractCallCommandSipRoutingHeaders([
    { name: 'x-callcommand-call-id', value: INTERNAL_CALL_ID },
    { name: 'X-CALLCOMMAND-CALL-ID', value: OTHER_INTERNAL_CALL_ID },
    { name: 'x-callcommand-route-token', value: routeToken },
  ]), /ambiguous/);
});

test('official SDK webhook unwrap receives the exact raw body before signed SIP headers are trusted', async () => {
  const routeToken = createCallCommandSipRouteToken({
    internalCallId: INTERNAL_CALL_ID,
    providerCallSid: TWILIO_CALL_SID,
    routeSecret: ROUTE_SECRET,
  });
  const rawBody = '{"exact":"raw body\\nbytes"}';
  const factoryInputs: unknown[] = [];
  const unwrapInputs: unknown[] = [];
  const adapter = new OpenAiRealtimeSipAdapter({
    env: ENV,
    fetch: async () => new Response(null, { status: 200 }),
    socketFactory: () => new FakeSocket(),
    webhookClientFactory: input => {
      factoryInputs.push(input);
      return {
        webhooks: {
          async unwrap(payload, headers, secret) {
            unwrapInputs.push({ payload, headers, secret });
            return {
              object: 'event',
              id: 'evt_callcommand_123',
              type: 'realtime.call.incoming',
              created_at: 1_788_000_000,
              data: {
                call_id: OPENAI_CALL_ID,
                sip_headers: [
                  { name: 'X-CallCommand-Call-ID', value: INTERNAL_CALL_ID },
                  { name: 'X-CallCommand-Route-Token', value: routeToken },
                ],
              },
            };
          },
        },
      };
    },
  });
  const result = await adapter.unwrapIncomingCall({
    rawBody,
    headers: { 'Webhook-ID': 'wh_123', 'WEBHOOK-SIGNATURE': 'v1,signed', 'webhook-timestamp': '1788000000' },
  });
  assert.deepEqual(factoryInputs, [{ apiKey: API_KEY, projectId: PROJECT_ID, webhookSecret: WEBHOOK_SECRET }]);
  assert.deepEqual(JSON.parse(JSON.stringify(unwrapInputs)), [{
    payload: rawBody,
    headers: { 'webhook-id': 'wh_123', 'webhook-signature': 'v1,signed', 'webhook-timestamp': '1788000000' },
    secret: WEBHOOK_SECRET,
  }]);
  assert.deepEqual(result, {
    eventId: 'evt_callcommand_123',
    createdAt: 1_788_000_000,
    openAiCallId: OPENAI_CALL_ID,
    internalCallId: INTERNAL_CALL_ID,
    routeToken,
  });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(`${API_KEY}|${WEBHOOK_SECRET}|${ROUTE_SECRET}`));

  const rejected = new OpenAiRealtimeSipAdapter({
    env: ENV,
    webhookClientFactory: () => ({ webhooks: { unwrap: async () => { throw new Error(`leak ${API_KEY}`); } } }),
  });
  await assert.rejects(
    rejected.unwrapIncomingCall({ rawBody, headers: { 'webhook-signature': 'bad' } }),
    (error: unknown) => error instanceof CallCommandRealtimeError
      && error.code === 'CALLCOMMAND_REALTIME_WEBHOOK_SIGNATURE_INVALID'
      && !JSON.stringify(error).includes(API_KEY),
  );
});

test('REST controls use only fixed OpenAI endpoints, bounded payloads, and safe results/errors', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const adapter = new OpenAiRealtimeSipAdapter({
    env: ENV,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return new Response(null, { status: 200 });
    },
    webhookClientFactory: () => ({ webhooks: { unwrap: async () => ({}) } }),
    socketFactory: () => new FakeSocket(),
    timeoutMs: 2_000,
  });
  const accept = await adapter.accept(OPENAI_CALL_ID, {
    instructions: 'OPERATOROS_CALLCOMMAND_REALTIME_V1\nHelp the caller safely.',
    voice: 'marin',
    maxOutputTokens: 512,
    tools: [{ type: 'function', name: 'transfer_call', description: 'Transfer to a verified target.', parameters: closedSchema() }],
  });
  const reject = await adapter.reject(OPENAI_CALL_ID, 486);
  const refer = await adapter.refer(OPENAI_CALL_ID, 'tel:+14155550123');
  const hangup = await adapter.hangup(OPENAI_CALL_ID);
  assert.deepEqual([accept.action, reject.action, refer.action, hangup.action], ['accept', 'reject', 'refer', 'hangup']);
  assert.deepEqual(requests.map(request => request.url), [
    `https://api.openai.com/v1/realtime/calls/${OPENAI_CALL_ID}/accept`,
    `https://api.openai.com/v1/realtime/calls/${OPENAI_CALL_ID}/reject`,
    `https://api.openai.com/v1/realtime/calls/${OPENAI_CALL_ID}/refer`,
    `https://api.openai.com/v1/realtime/calls/${OPENAI_CALL_ID}/hangup`,
  ]);
  assert.ok(requests.every(request => !request.url.includes(API_KEY) && !request.url.includes(PROJECT_ID)));
  assert.ok(requests.every(request => request.init.redirect === 'error'));
  assert.equal((requests[0].init.headers as Record<string, string>).authorization, `Bearer ${API_KEY}`);
  assert.equal((requests[0].init.headers as Record<string, string>)['openai-project'], PROJECT_ID);
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), {
    type: 'realtime',
    model: 'gpt-realtime-2.1-mini',
    instructions: 'OPERATOROS_CALLCOMMAND_REALTIME_V1\nHelp the caller safely.',
    max_output_tokens: 512,
    tool_choice: 'auto',
    tools: [{ type: 'function', name: 'transfer_call', description: 'Transfer to a verified target.', parameters: closedSchema() }],
    audio: {
      input: { turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700 } },
      output: { voice: 'marin' },
    },
  });
  assert.deepEqual(JSON.parse(String(requests[1].init.body)), { status_code: 486 });
  assert.deepEqual(JSON.parse(String(requests[2].init.body)), { target_uri: 'tel:+14155550123' });
  assert.equal(requests[3].init.body, undefined);
  assert.doesNotMatch(JSON.stringify([accept, reject, refer, hangup]), new RegExp(`${API_KEY}|${WEBHOOK_SECRET}|${ROUTE_SECRET}`));

  await assert.rejects(adapter.hangup('https://evil.invalid/steal'), /call ID is invalid/i);
  assert.throws(() => adapter.refer(OPENAI_CALL_ID, 'sip:attacker@evil.invalid?token=secret'), /transfer target is invalid/i);
  assert.throws(() => adapter.refer(OPENAI_CALL_ID, 'sip:agent@example.com'), /transfer target is invalid/i);
  assert.throws(() => adapter.reject(OPENAI_CALL_ID, 200), /rejection status is invalid/i);

  const failed = new OpenAiRealtimeSipAdapter({
    env: ENV,
    fetch: async () => new Response(`provider leaked ${API_KEY}`, { status: 500 }),
    webhookClientFactory: () => ({ webhooks: { unwrap: async () => ({}) } }),
  });
  await assert.rejects(
    failed.hangup(OPENAI_CALL_ID),
    (error: unknown) => error instanceof CallCommandRealtimeError
      && error.providerStatus === 500
      && !JSON.stringify(error).includes(API_KEY),
  );
});

test('each sideband socket is isolated and completed function calls execute exactly once', async () => {
  const sockets: FakeSocket[] = [];
  const socketRequests: Array<{ url: string; options: Parameters<RealtimeSocketFactory>[1] }> = [];
  const socketFactory: RealtimeSocketFactory = (url, options) => {
    socketRequests.push({ url, options });
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  };
  const toolCalls: unknown[] = [];
  const errors: unknown[] = [];
  const adapter = new OpenAiRealtimeSipAdapter({
    env: ENV,
    socketFactory,
    webhookClientFactory: () => ({ webhooks: { unwrap: async () => ({}) } }),
  });
  const controller = adapter.connectSideband({
    openAiCallId: OPENAI_CALL_ID,
    allowedToolNames: ['transfer_call'],
    callbacks: {
      async executeTool(input) {
        toolCalls.push(input);
        return { ok: true, transferred: true };
      },
      onError: event => { errors.push(event); },
    },
  });
  assert.equal(controller.state, 'connecting');
  assert.equal(JSON.stringify(controller), JSON.stringify({ openAiCallId: OPENAI_CALL_ID }));
  assert.deepEqual(socketRequests, [{
    url: `wss://api.openai.com/v1/realtime?call_id=${OPENAI_CALL_ID}`,
    options: {
      headers: { authorization: `Bearer ${API_KEY}`, 'openai-project': PROJECT_ID },
      handshakeTimeout: 8_000,
      maxPayload: 131_072,
      perMessageDeflate: false,
    },
  }]);
  assert.doesNotMatch(socketRequests[0].url, new RegExp(`${API_KEY}|${WEBHOOK_SECRET}|${ROUTE_SECRET}`));
  assert.throws(() => adapter.connectSideband({
    openAiCallId: OPENAI_CALL_ID,
    allowedToolNames: ['transfer_call', 'transfer_call'],
    callbacks: { executeTool: async () => ({ ok: true }) },
  }), /allowlist is invalid/i);
  assert.equal(sockets.length, 1, 'invalid allowlists must be rejected before a provider socket is opened');

  sockets[0].open();
  const completed = JSON.stringify({
    type: 'response.function_call_arguments.done',
    event_id: 'event_tool_1',
    response_id: 'resp_1',
    item_id: 'item_1',
    output_index: 0,
    call_id: 'call_tool_1',
    name: 'transfer_call',
    arguments: '{"targetId":"target_1"}',
  });
  sockets[0].emit('message', Buffer.from(completed));
  sockets[0].emit('message', Buffer.from(completed));
  await flush();
  assert.equal(toolCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(toolCalls[0])), {
    openAiCallId: OPENAI_CALL_ID,
    toolCallId: 'call_tool_1',
    name: 'transfer_call',
    arguments: { targetId: 'target_1' },
  });
  assert.deepEqual(sockets[0].sent.map(value => JSON.parse(value)), [
    {
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: 'call_tool_1', output: '{"ok":true,"transferred":true}' },
    },
    { type: 'response.create' },
  ]);
  assert.deepEqual(errors, []);

  const second = adapter.connectSideband({
    openAiCallId: 'rtc_u1_secondcall123456789',
    allowedToolNames: [],
    callbacks: { executeTool: async () => ({ ok: true }) },
  });
  assert.notEqual(sockets[0], sockets[1]);
  second.close();
  assert.equal(sockets[0].closeCalls.length, 0);
  controller.close();
  assert.deepEqual(sockets[0].closeCalls, [{ code: 1000, reason: 'completed' }]);
});

test('sideband waitUntilOpen resolves only after the provider socket opens', async () => {
  const socket = new FakeSocket();
  const adapter = new OpenAiRealtimeSipAdapter({
    env: ENV,
    socketFactory: () => socket,
    webhookClientFactory: () => ({ webhooks: { unwrap: async () => ({}) } }),
  });
  const controller = adapter.connectSideband({
    openAiCallId: OPENAI_CALL_ID,
    allowedToolNames: [],
    callbacks: { executeTool: async () => ({ ok: true }) },
  });
  let settled = false;
  const opened = controller.waitUntilOpen(500).then(() => { settled = true; });
  await flush();
  assert.equal(settled, false);
  socket.open();
  await opened;
  assert.equal(controller.state, 'open');
  await controller.waitUntilOpen(500);
  controller.close();
});

test('sideband waitUntilOpen rejects safely on timeout, socket error, and pre-open close', async () => {
  const sockets: FakeSocket[] = [];
  const adapter = new OpenAiRealtimeSipAdapter({
    env: ENV,
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    webhookClientFactory: () => ({ webhooks: { unwrap: async () => ({}) } }),
  });
  const timedOut = adapter.connectSideband({
    openAiCallId: OPENAI_CALL_ID,
    allowedToolNames: [],
    callbacks: { executeTool: async () => ({ ok: true }) },
  });
  await assert.rejects(
    timedOut.waitUntilOpen(10),
    (error: unknown) => error instanceof CallCommandRealtimeError
      && error.code === 'CALLCOMMAND_REALTIME_SOCKET_OPEN_TIMEOUT'
      && !JSON.stringify(error).includes(API_KEY),
  );
  timedOut.close();

  const errored = adapter.connectSideband({
    openAiCallId: 'rtc_u1_error123456789',
    allowedToolNames: [],
    callbacks: { executeTool: async () => ({ ok: true }) },
  });
  const errorWait = errored.waitUntilOpen(500);
  sockets[1].emit('error', new Error(`provider leaked ${API_KEY}`));
  await assert.rejects(
    errorWait,
    (error: unknown) => error instanceof CallCommandRealtimeError
      && error.code === 'CALLCOMMAND_REALTIME_SOCKET_OPEN_FAILED'
      && !JSON.stringify(error).includes(API_KEY),
  );
  errored.close();

  const closed = adapter.connectSideband({
    openAiCallId: 'rtc_u1_closed123456789',
    allowedToolNames: [],
    callbacks: { executeTool: async () => ({ ok: true }) },
  });
  const closeWait = closed.waitUntilOpen(500);
  sockets[2].close(1006, `provider leaked ${API_KEY}`);
  await assert.rejects(
    closeWait,
    (error: unknown) => error instanceof CallCommandRealtimeError
      && error.code === 'CALLCOMMAND_REALTIME_SOCKET_CLOSED'
      && !JSON.stringify(error).includes(API_KEY),
  );
  await assert.rejects(closed.waitUntilOpen(500), /closed before opening/i);
  await assert.rejects(closed.waitUntilOpen(31_000), /timeout is invalid/i);
});

test('sideband reports secret-safe async callback failures through the explicit hook', async () => {
  const socket = new FakeSocket();
  const callbackErrors: unknown[] = [];
  const adapter = new OpenAiRealtimeSipAdapter({
    env: ENV,
    socketFactory: () => socket,
    webhookClientFactory: () => ({ webhooks: { unwrap: async () => ({}) } }),
  });
  adapter.connectSideband({
    openAiCallId: OPENAI_CALL_ID,
    allowedToolNames: [],
    callbacks: {
      executeTool: async () => ({ ok: true }),
      onTranscript: async () => { throw new Error(`transcript leaked ${WEBHOOK_SECRET}`); },
      onUsage: async () => { throw new Error(`usage leaked ${API_KEY}`); },
      onCallbackError: async event => { callbackErrors.push(event); },
    },
  });
  socket.open();
  socket.emit('message', JSON.stringify({
    type: 'response.output_audio_transcript.done',
    item_id: 'assistant_item',
    transcript: 'Safe transcript.',
  }));
  socket.emit('message', JSON.stringify({
    type: 'response.done',
    response: { id: 'resp_usage', usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } },
  }));
  await flush();
  assert.deepEqual(callbackErrors, [
    {
      openAiCallId: OPENAI_CALL_ID,
      callback: 'onTranscript',
      code: 'CALLCOMMAND_REALTIME_CALLBACK_FAILED',
    },
    {
      openAiCallId: OPENAI_CALL_ID,
      callback: 'onUsage',
      code: 'CALLCOMMAND_REALTIME_CALLBACK_FAILED',
    },
  ]);
  assert.doesNotMatch(JSON.stringify(callbackErrors), new RegExp(`${API_KEY}|${WEBHOOK_SECRET}|${ROUTE_SECRET}`));
});

test('sideband reports bounded transcripts, token usage, and provider errors through callbacks', async () => {
  const socket = new FakeSocket();
  const transcripts: unknown[] = [];
  const usages: unknown[] = [];
  const errors: unknown[] = [];
  const adapter = new OpenAiRealtimeSipAdapter({
    env: ENV,
    socketFactory: () => socket,
    webhookClientFactory: () => ({ webhooks: { unwrap: async () => ({}) } }),
  });
  adapter.connectSideband({
    openAiCallId: OPENAI_CALL_ID,
    allowedToolNames: [],
    callbacks: {
      executeTool: async () => ({ ok: true }),
      onTranscript: event => { transcripts.push(event); },
      onUsage: event => { usages.push(event); },
      onError: event => { errors.push(event); },
    },
  });
  socket.open();
  socket.emit('message', JSON.stringify({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'caller_item',
    transcript: 'I need support.',
    usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 },
  }));
  socket.emit('message', JSON.stringify({
    type: 'response.output_audio_transcript.done',
    item_id: 'assistant_item',
    transcript: 'I can help.',
  }));
  socket.emit('message', JSON.stringify({
    type: 'response.done',
    response: { id: 'resp_usage', usage: { input_tokens: 11, output_tokens: 13, total_tokens: 24 } },
  }));
  socket.emit('message', JSON.stringify({
    type: 'error',
    error: { type: 'invalid_request_error', code: 'invalid_event', message: `provider echoed ${API_KEY}` },
  }));
  socket.emit('message', '{not json');
  await flush();
  assert.deepEqual(transcripts, [
    { openAiCallId: OPENAI_CALL_ID, itemId: 'caller_item', role: 'caller', transcript: 'I need support.' },
    { openAiCallId: OPENAI_CALL_ID, itemId: 'assistant_item', role: 'assistant', transcript: 'I can help.' },
  ]);
  assert.deepEqual(usages, [
    { openAiCallId: OPENAI_CALL_ID, source: 'transcription', inputTokens: 3, outputTokens: 4, totalTokens: 7 },
    { openAiCallId: OPENAI_CALL_ID, source: 'response', responseId: 'resp_usage', inputTokens: 11, outputTokens: 13, totalTokens: 24 },
  ]);
  assert.deepEqual(errors, [
    {
      openAiCallId: OPENAI_CALL_ID,
      code: 'CALLCOMMAND_REALTIME_PROVIDER_ERROR',
      providerCode: 'invalid_event',
      providerType: 'invalid_request_error',
      recoverable: true,
    },
    {
      openAiCallId: OPENAI_CALL_ID,
      code: 'CALLCOMMAND_REALTIME_EVENT_INVALID',
      providerCode: undefined,
      providerType: undefined,
      recoverable: true,
    },
  ]);
  assert.doesNotMatch(JSON.stringify(errors), new RegExp(`${API_KEY}|${WEBHOOK_SECRET}|${ROUTE_SECRET}`));
});

test('sideband construction failures are converted to safe errors', () => {
  const adapter = new OpenAiRealtimeSipAdapter({
    env: ENV,
    socketFactory: () => { throw new Error(`provider leaked ${API_KEY}`); },
    webhookClientFactory: () => ({ webhooks: { unwrap: async () => ({}) } }),
  });
  assert.throws(
    () => adapter.connectSideband({
      openAiCallId: OPENAI_CALL_ID,
      allowedToolNames: [],
      callbacks: { executeTool: async () => ({ ok: true }) },
    }),
    (error: unknown) => error instanceof CallCommandRealtimeError
      && error.code === 'CALLCOMMAND_REALTIME_SOCKET_INIT_FAILED'
      && !JSON.stringify(error).includes(API_KEY),
  );
});
