import { createHmac, timingSafeEqual } from 'node:crypto';
import OpenAI from 'openai';
import WebSocket from 'ws';

const OPENAI_API_ORIGIN = 'https://api.openai.com';
const OPENAI_REALTIME_WS_URL = 'wss://api.openai.com/v1/realtime';
const OPENAI_CALL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;
const INTERNAL_CALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TWILIO_CALL_SID = /^CA[0-9a-f]{32}$/i;
const ROUTE_TOKEN = /^[0-9a-f]{64}$/;
const TOOL_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const E164_TARGET = /^tel:\+[1-9][0-9]{7,14}$/;
const SIP_TARGET = /^sip:[A-Za-z0-9_.+~-]{1,64}@[A-Za-z0-9.-]{1,253};transport=tls$/i;
const SUPPORTED_MODELS = ['gpt-realtime-2.1-mini', 'gpt-realtime-2.1'] as const;
const SUPPORTED_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'] as const;
const MAX_WEBHOOK_BYTES = 1_048_576;
const MAX_EVENT_BYTES = 131_072;
const MAX_TOOL_ARGUMENT_BYTES = 16_384;
const MAX_TOOL_OUTPUT_BYTES = 24_576;
const MAX_TRANSCRIPT_CHARACTERS = 32_000;
const MAX_HANDLED_TOOL_CALLS = 512;
const DEFAULT_SOCKET_OPEN_TIMEOUT_MS = 8_000;
const MIN_SOCKET_OPEN_TIMEOUT_MS = 10;
const MAX_SOCKET_OPEN_TIMEOUT_MS = 30_000;

export type CallCommandRealtimeModel = (typeof SUPPORTED_MODELS)[number];
export type CallCommandRealtimeVoice = (typeof SUPPORTED_VOICES)[number];
export type CallCommandRealtimeAction = 'accept' | 'reject' | 'refer' | 'hangup';

export class CallCommandRealtimeError extends Error {
  constructor(
    message: string,
    public readonly code = 'CALLCOMMAND_REALTIME_FAILED',
    public readonly statusCode = 503,
    public readonly providerStatus?: number,
  ) {
    super(message);
    this.name = 'CallCommandRealtimeError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      ...(this.providerStatus === undefined ? {} : { providerStatus: this.providerStatus }),
    };
  }
}

export interface CallCommandRealtimeEnvironment {
  [key: string]: string | undefined;
  OPENAI_API_KEY?: string;
  OPENAI_PROJECT_ID?: string;
  OPENAI_WEBHOOK_SECRET?: string;
  CALLCOMMAND_SIP_ROUTE_SECRET?: string;
  CALLCOMMAND_REALTIME_MODEL?: string;
}

export interface CallCommandRealtimeReadiness {
  ready: boolean;
  model: CallCommandRealtimeModel | null;
  missing: string[];
  invalid: string[];
}

interface RealtimeConfig {
  apiKey: string;
  projectId: string;
  webhookSecret: string;
  routeSecret: string;
  model: CallCommandRealtimeModel;
}

function invalid(message: string, code = 'CALLCOMMAND_REALTIME_INPUT_INVALID', statusCode = 400): never {
  throw new CallCommandRealtimeError(message, code, statusCode);
}

function validSecret(value: string | undefined, prefix: string | null, minimum: number): boolean {
  if (!value || value.length < minimum || value.length > 512 || /[\u0000-\u001f\u007f\s]/.test(value)) return false;
  return prefix === null || value.startsWith(prefix);
}

export function inspectCallCommandRealtimeReadiness(
  env: CallCommandRealtimeEnvironment = process.env,
): CallCommandRealtimeReadiness {
  const missing: string[] = [];
  const invalidValues: string[] = [];
  const required = [
    'OPENAI_API_KEY',
    'OPENAI_PROJECT_ID',
    'OPENAI_WEBHOOK_SECRET',
    'CALLCOMMAND_SIP_ROUTE_SECRET',
    'CALLCOMMAND_REALTIME_MODEL',
  ] as const;
  for (const name of required) if (!env[name]?.trim()) missing.push(name);
  if (env.OPENAI_API_KEY && !validSecret(env.OPENAI_API_KEY, 'sk-', 20)) invalidValues.push('OPENAI_API_KEY');
  if (env.OPENAI_PROJECT_ID && !/^proj_[A-Za-z0-9_-]{8,128}$/.test(env.OPENAI_PROJECT_ID)) invalidValues.push('OPENAI_PROJECT_ID');
  if (env.OPENAI_WEBHOOK_SECRET && !validSecret(env.OPENAI_WEBHOOK_SECRET, 'whsec_', 20)) invalidValues.push('OPENAI_WEBHOOK_SECRET');
  if (env.CALLCOMMAND_SIP_ROUTE_SECRET && !validSecret(env.CALLCOMMAND_SIP_ROUTE_SECRET, null, 32)) invalidValues.push('CALLCOMMAND_SIP_ROUTE_SECRET');
  const model = SUPPORTED_MODELS.includes(env.CALLCOMMAND_REALTIME_MODEL as CallCommandRealtimeModel)
    ? env.CALLCOMMAND_REALTIME_MODEL as CallCommandRealtimeModel
    : null;
  if (env.CALLCOMMAND_REALTIME_MODEL && !model) invalidValues.push('CALLCOMMAND_REALTIME_MODEL');
  return { ready: missing.length === 0 && invalidValues.length === 0, model, missing, invalid: invalidValues };
}

function requireConfig(env: CallCommandRealtimeEnvironment): RealtimeConfig {
  const readiness = inspectCallCommandRealtimeReadiness(env);
  if (!readiness.ready || !readiness.model) {
    const fields = [...readiness.missing, ...readiness.invalid];
    throw new CallCommandRealtimeError(
      `OpenAI Realtime configuration is unavailable${fields.length ? ` (${fields.join(', ')})` : ''}`,
      'CALLCOMMAND_REALTIME_NOT_CONFIGURED',
      503,
    );
  }
  return {
    apiKey: env.OPENAI_API_KEY!,
    projectId: env.OPENAI_PROJECT_ID!,
    webhookSecret: env.OPENAI_WEBHOOK_SECRET!,
    routeSecret: env.CALLCOMMAND_SIP_ROUTE_SECRET!,
    model: readiness.model,
  };
}

function parseInternalCallId(value: string): string {
  if (!INTERNAL_CALL_ID.test(value)) invalid('Internal call ID is invalid', 'CALLCOMMAND_REALTIME_CALL_ID_INVALID');
  return value.toLowerCase();
}

function parseTwilioCallSid(value: string): string {
  if (!TWILIO_CALL_SID.test(value)) invalid('Provider call SID is invalid', 'CALLCOMMAND_REALTIME_PROVIDER_CALL_ID_INVALID');
  return value;
}

function parseOpenAiCallId(value: string): string {
  if (!OPENAI_CALL_ID.test(value)) invalid('OpenAI call ID is invalid', 'CALLCOMMAND_REALTIME_PROVIDER_CALL_ID_INVALID');
  return value;
}

function routeTokenMaterial(internalCallId: string, providerCallSid: string): string {
  return `operatoros:callcommand:sip-route:v1\n${internalCallId}\n${providerCallSid}`;
}

export function createCallCommandSipRouteToken(input: {
  internalCallId: string;
  providerCallSid: string;
  routeSecret: string;
}): string {
  const internalCallId = parseInternalCallId(input.internalCallId);
  const providerCallSid = parseTwilioCallSid(input.providerCallSid);
  if (!validSecret(input.routeSecret, null, 32)) invalid('SIP route secret is invalid', 'CALLCOMMAND_REALTIME_ROUTE_SECRET_INVALID');
  return createHmac('sha256', input.routeSecret).update(routeTokenMaterial(internalCallId, providerCallSid)).digest('hex');
}

export function verifyCallCommandSipRouteToken(input: {
  internalCallId: string;
  providerCallSid: string;
  routeToken: string;
  routeSecret: string;
}): boolean {
  try {
    if (!ROUTE_TOKEN.test(input.routeToken)) return false;
    const expected = Buffer.from(createCallCommandSipRouteToken(input), 'hex');
    const actual = Buffer.from(input.routeToken, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export interface OpenAiSipHeader {
  name: string;
  value: string;
}

export interface CallCommandSipRoutingHeaders {
  internalCallId: string;
  routeToken: string;
}

export function extractCallCommandSipRoutingHeaders(headers: readonly OpenAiSipHeader[]): CallCommandSipRoutingHeaders {
  if (!Array.isArray(headers) || headers.length > 128) invalid('OpenAI SIP headers are invalid', 'CALLCOMMAND_REALTIME_WEBHOOK_INVALID');
  const selected = new Map<string, string>();
  for (const header of headers) {
    if (!header || typeof header.name !== 'string' || typeof header.value !== 'string'
      || header.name.length > 256 || header.value.length > 4_096) {
      invalid('OpenAI SIP headers are invalid', 'CALLCOMMAND_REALTIME_WEBHOOK_INVALID');
    }
    const name = header.name.trim().toLowerCase();
    if (name !== 'x-callcommand-call-id' && name !== 'x-callcommand-route-token') continue;
    if (selected.has(name)) invalid('OpenAI SIP routing headers are ambiguous', 'CALLCOMMAND_REALTIME_ROUTE_HEADERS_INVALID');
    selected.set(name, header.value.trim());
  }
  const internalCallId = selected.get('x-callcommand-call-id') ?? '';
  const routeToken = selected.get('x-callcommand-route-token') ?? '';
  parseInternalCallId(internalCallId);
  if (!ROUTE_TOKEN.test(routeToken)) invalid('OpenAI SIP route token is invalid', 'CALLCOMMAND_REALTIME_ROUTE_HEADERS_INVALID');
  return { internalCallId: internalCallId.toLowerCase(), routeToken };
}

export interface OpenAiWebhookClient {
  webhooks: {
    unwrap(payload: string, headers: Record<string, string>, secret?: string): Promise<unknown>;
  };
}

export type OpenAiWebhookClientFactory = (input: {
  apiKey: string;
  projectId: string;
  webhookSecret: string;
}) => OpenAiWebhookClient;

function defaultWebhookClientFactory(input: {
  apiKey: string;
  projectId: string;
  webhookSecret: string;
}): OpenAiWebhookClient {
  return new OpenAI({ apiKey: input.apiKey, project: input.projectId, webhookSecret: input.webhookSecret });
}

export interface VerifiedOpenAiIncomingCall {
  eventId: string;
  createdAt: number;
  openAiCallId: string;
  internalCallId: string;
  routeToken: string;
}

function normalizeWebhookHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const entries = Object.entries(headers);
  if (entries.length > 128) invalid('Webhook headers exceed the supported limit', 'CALLCOMMAND_REALTIME_WEBHOOK_INVALID');
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [rawName, rawValue] of entries) {
    const name = rawName.toLowerCase();
    const value = Array.isArray(rawValue) ? rawValue.join(',') : rawValue;
    if (!/^[a-z0-9-]{1,128}$/.test(name) || typeof value !== 'string' || value.length > 8_192) {
      invalid('Webhook headers are invalid', 'CALLCOMMAND_REALTIME_WEBHOOK_INVALID');
    }
    result[name] = value;
  }
  return result;
}

function parseIncomingWebhookEvent(value: unknown): VerifiedOpenAiIncomingCall {
  if (!value || typeof value !== 'object') invalid('OpenAI webhook is invalid', 'CALLCOMMAND_REALTIME_WEBHOOK_INVALID');
  const event = value as Record<string, unknown>;
  if (event.type !== 'realtime.call.incoming') invalid('OpenAI webhook event type is unsupported', 'CALLCOMMAND_REALTIME_WEBHOOK_UNSUPPORTED');
  if (typeof event.id !== 'string' || !/^[A-Za-z0-9_-]{3,128}$/.test(event.id)) invalid('OpenAI webhook event ID is invalid', 'CALLCOMMAND_REALTIME_WEBHOOK_INVALID');
  if (!Number.isSafeInteger(event.created_at) || Number(event.created_at) < 1) invalid('OpenAI webhook timestamp is invalid', 'CALLCOMMAND_REALTIME_WEBHOOK_INVALID');
  if (!event.data || typeof event.data !== 'object') invalid('OpenAI webhook data is invalid', 'CALLCOMMAND_REALTIME_WEBHOOK_INVALID');
  const data = event.data as Record<string, unknown>;
  const openAiCallId = parseOpenAiCallId(String(data.call_id ?? ''));
  const routing = extractCallCommandSipRoutingHeaders(data.sip_headers as OpenAiSipHeader[]);
  return { eventId: event.id, createdAt: Number(event.created_at), openAiCallId, ...routing };
}

export type RealtimeFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface RealtimeSocket {
  readonly readyState: number;
  on(event: string, listener: (...args: any[]) => void): this;
  send(data: string, callback?: (error?: Error) => void): void;
  close(code?: number, reason?: string): void;
}

export type RealtimeSocketFactory = (url: string, options: {
  headers: Record<string, string>;
  handshakeTimeout: number;
  maxPayload: number;
  perMessageDeflate: false;
}) => RealtimeSocket;

function defaultSocketFactory(url: string, options: {
  headers: Record<string, string>;
  handshakeTimeout: number;
  maxPayload: number;
  perMessageDeflate: false;
}): RealtimeSocket {
  return new WebSocket(url, options);
}

export interface RealtimeFunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RealtimeAcceptInput {
  instructions: string;
  tools: readonly RealtimeFunctionTool[];
  voice?: CallCommandRealtimeVoice;
  maxOutputTokens?: number;
}

export interface SafeRealtimeActionResult {
  ok: true;
  action: CallCommandRealtimeAction;
  openAiCallId: string;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function cloneBoundedJson(value: unknown, state: { nodes: number }, depth = 0): JsonValue {
  state.nodes += 1;
  if (depth > 10 || state.nodes > 512) invalid('Realtime JSON exceeds structural limits');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid('Realtime JSON contains an invalid number');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 4_096 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) invalid('Realtime JSON contains invalid text');
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 128) invalid('Realtime JSON array is too large');
    return value.map(item => cloneBoundedJson(item, state, depth + 1));
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) invalid('Realtime JSON must use plain objects');
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 128) invalid('Realtime JSON object is too large');
  const result: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  for (const [key, child] of entries) {
    if (!key || key.length > 128 || ['__proto__', 'prototype', 'constructor'].includes(key)) invalid('Realtime JSON key is invalid');
    result[key] = cloneBoundedJson(child, state, depth + 1);
  }
  return result;
}

function sanitizeAcceptInput(input: RealtimeAcceptInput, model: CallCommandRealtimeModel): Record<string, unknown> {
  if (typeof input.instructions !== 'string' || input.instructions.trim().length < 1 || input.instructions.length > 12_000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.instructions)) {
    invalid('Realtime instructions are invalid');
  }
  if (!Array.isArray(input.tools) || input.tools.length > 16) invalid('Realtime tools exceed the supported limit');
  const seen = new Set<string>();
  const tools = input.tools.map(tool => {
    if (tool?.type !== 'function' || !TOOL_NAME.test(tool.name) || seen.has(tool.name)) invalid('Realtime tool is invalid');
    seen.add(tool.name);
    if (typeof tool.description !== 'string' || tool.description.length < 1 || tool.description.length > 512) invalid('Realtime tool description is invalid');
    const parameters = cloneBoundedJson(tool.parameters, { nodes: 0 });
    if (!parameters || Array.isArray(parameters) || typeof parameters !== 'object'
      || parameters.type !== 'object' || parameters.additionalProperties !== false) {
      invalid('Realtime tool parameters must be a closed object schema');
    }
    return { type: 'function', name: tool.name, description: tool.description, parameters };
  });
  const voice = input.voice ?? 'marin';
  if (!SUPPORTED_VOICES.includes(voice)) invalid('Realtime voice is invalid');
  const maxOutputTokens = input.maxOutputTokens ?? 1_024;
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 128 || maxOutputTokens > 4_096) invalid('Realtime output token limit is invalid');
  const body = {
    type: 'realtime',
    model,
    instructions: input.instructions.trim(),
    max_output_tokens: maxOutputTokens,
    tool_choice: 'auto',
    tools,
    audio: {
      input: { turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700 } },
      output: { voice },
    },
  };
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 65_536) invalid('Realtime accept configuration is too large');
  return body;
}

function canonicalReferTarget(value: string): string {
  if (typeof value !== 'string' || value.length > 320 || /[\s\u0000-\u001f\u007f]/.test(value)) invalid('Realtime transfer target is invalid');
  if (E164_TARGET.test(value)) return value;
  if (!SIP_TARGET.test(value)) invalid('Realtime transfer target is invalid');
  const [, user, host] = /^sip:([^@]+)@([^;]+);transport=tls$/i.exec(value)!;
  if (!host.includes('.') || host.split('.').some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) {
    invalid('Realtime transfer target is invalid');
  }
  return `sip:${user}@${host.toLowerCase()};transport=tls`;
}

function safeProviderError(action: CallCommandRealtimeAction, status?: number): CallCommandRealtimeError {
  return new CallCommandRealtimeError(
    `OpenAI Realtime ${action} request failed`,
    `CALLCOMMAND_REALTIME_${action.toUpperCase()}_FAILED`,
    status && status >= 400 && status < 500 ? 409 : 503,
    status,
  );
}

export interface CallCommandRealtimeUsageEvent {
  openAiCallId: string;
  source: 'response' | 'transcription';
  responseId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CallCommandRealtimeTranscriptEvent {
  openAiCallId: string;
  itemId: string;
  role: 'caller' | 'assistant';
  transcript: string;
}

export interface CallCommandRealtimeProviderErrorEvent {
  openAiCallId: string;
  code: string;
  providerCode?: string;
  providerType?: string;
  recoverable: boolean;
}

export interface RealtimeToolInvocation {
  openAiCallId: string;
  toolCallId: string;
  name: string;
  arguments: Record<string, JsonValue>;
}

export interface RealtimeSidebandCallbacks {
  executeTool(input: RealtimeToolInvocation): Promise<unknown>;
  onUsage?(event: CallCommandRealtimeUsageEvent): void | Promise<void>;
  onTranscript?(event: CallCommandRealtimeTranscriptEvent): void | Promise<void>;
  onError?(event: CallCommandRealtimeProviderErrorEvent): void | Promise<void>;
  onClosed?(event: { openAiCallId: string; code: number; clean: boolean }): void | Promise<void>;
  onCallbackError?(event: CallCommandRealtimeCallbackErrorEvent): void | Promise<void>;
}

export type CallCommandRealtimeCallbackName = 'onUsage' | 'onTranscript' | 'onError' | 'onClosed';

export interface CallCommandRealtimeCallbackErrorEvent {
  openAiCallId: string;
  callback: CallCommandRealtimeCallbackName;
  code: 'CALLCOMMAND_REALTIME_CALLBACK_FAILED';
}

function safeProviderIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(value) ? value : undefined;
}

function validateToolAllowlist(names: readonly string[]): void {
  if (!Array.isArray(names) || names.length > 16 || new Set(names).size !== names.length
    || names.some(name => !TOOL_NAME.test(name))) invalid('Sideband tool allowlist is invalid');
}

function safeCount(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function decodeSocketMessage(raw: unknown): string {
  let text: string;
  if (typeof raw === 'string') text = raw;
  else if (Buffer.isBuffer(raw)) text = raw.toString('utf8');
  else if (raw instanceof ArrayBuffer) text = Buffer.from(raw).toString('utf8');
  else if (Array.isArray(raw) && raw.every(Buffer.isBuffer)) text = Buffer.concat(raw).toString('utf8');
  else invalid('Realtime provider event is invalid', 'CALLCOMMAND_REALTIME_EVENT_INVALID');
  if (Buffer.byteLength(text!, 'utf8') > MAX_EVENT_BYTES) invalid('Realtime provider event is too large', 'CALLCOMMAND_REALTIME_EVENT_INVALID');
  return text!;
}

function serializeToolOutput(value: unknown): string {
  let normalized: JsonValue;
  try {
    normalized = cloneBoundedJson(value, { nodes: 0 });
  } catch {
    normalized = { ok: false, error: 'Tool output was invalid' };
  }
  const output = JSON.stringify(normalized);
  if (Buffer.byteLength(output, 'utf8') > MAX_TOOL_OUTPUT_BYTES) return JSON.stringify({ ok: false, error: 'Tool output exceeded the supported limit' });
  return output;
}

export class OpenAiRealtimeSidebandController {
  #socket: RealtimeSocket;
  #callbacks: RealtimeSidebandCallbacks;
  #allowedTools: Set<string>;
  #handledToolCalls = new Set<string>();
  #state: 'connecting' | 'open' | 'closed' = 'connecting';
  #openFailure: CallCommandRealtimeError | null = null;
  #openWaiters = new Set<{
    resolve: () => void;
    reject: (error: CallCommandRealtimeError) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  #warnedCallbackFailures = new Set<CallCommandRealtimeCallbackName>();

  constructor(
    public readonly openAiCallId: string,
    socket: RealtimeSocket,
    allowedToolNames: readonly string[],
    callbacks: RealtimeSidebandCallbacks,
  ) {
    this.#socket = socket;
    this.#callbacks = callbacks;
    validateToolAllowlist(allowedToolNames);
    this.#allowedTools = new Set(allowedToolNames);
    socket.on('open', () => {
      if (this.#state === 'closed' || this.#openFailure) return;
      this.#state = 'open';
      this.#settleOpenWaiters();
    });
    socket.on('message', (raw: unknown) => { void this.#handleMessage(raw); });
    socket.on('error', () => {
      if (this.#state === 'connecting') {
        this.#failOpenWaiters(new CallCommandRealtimeError(
          'OpenAI Realtime sideband connection failed to open',
          'CALLCOMMAND_REALTIME_SOCKET_OPEN_FAILED',
          503,
        ));
      }
      this.#reportError('CALLCOMMAND_REALTIME_SOCKET_ERROR', false);
    });
    socket.on('close', (code: number) => {
      if (this.#state === 'connecting') {
        this.#failOpenWaiters(new CallCommandRealtimeError(
          'OpenAI Realtime sideband connection closed before opening',
          'CALLCOMMAND_REALTIME_SOCKET_CLOSED',
          503,
        ));
      }
      this.#state = 'closed';
      this.#notify('onClosed', this.#callbacks.onClosed, {
        openAiCallId: this.openAiCallId,
        code: safeCount(code),
        clean: code === 1000,
      });
    });
  }

  get state(): 'connecting' | 'open' | 'closed' {
    return this.#state;
  }

  waitUntilOpen(timeoutMs = DEFAULT_SOCKET_OPEN_TIMEOUT_MS): Promise<void> {
    if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_SOCKET_OPEN_TIMEOUT_MS || timeoutMs > MAX_SOCKET_OPEN_TIMEOUT_MS) {
      return Promise.reject(new CallCommandRealtimeError(
        'Realtime sideband open timeout is invalid',
        'CALLCOMMAND_REALTIME_SOCKET_OPEN_TIMEOUT_INVALID',
        400,
      ));
    }
    if (this.#state === 'open') return Promise.resolve();
    if (this.#openFailure) return Promise.reject(this.#openFailure);
    if (this.#state === 'closed') {
      return Promise.reject(new CallCommandRealtimeError(
        'OpenAI Realtime sideband connection is closed',
        'CALLCOMMAND_REALTIME_SOCKET_CLOSED',
        503,
      ));
    }
    return new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.#openWaiters.delete(waiter);
          reject(new CallCommandRealtimeError(
            'OpenAI Realtime sideband connection timed out while opening',
            'CALLCOMMAND_REALTIME_SOCKET_OPEN_TIMEOUT',
            504,
          ));
        }, timeoutMs),
      };
      this.#openWaiters.add(waiter);
    });
  }

  close(): void {
    if (this.#state === 'closed') return;
    if (this.#state === 'connecting') {
      this.#failOpenWaiters(new CallCommandRealtimeError(
        'OpenAI Realtime sideband connection closed before opening',
        'CALLCOMMAND_REALTIME_SOCKET_CLOSED',
        503,
      ));
    }
    this.#state = 'closed';
    this.#socket.close(1000, 'completed');
  }

  #settleOpenWaiters(): void {
    for (const waiter of this.#openWaiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve();
    }
    this.#openWaiters.clear();
  }

  #failOpenWaiters(error: CallCommandRealtimeError): void {
    if (!this.#openFailure) this.#openFailure = error;
    for (const waiter of this.#openWaiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(this.#openFailure);
    }
    this.#openWaiters.clear();
  }

  #warnCallbackFailure(event: CallCommandRealtimeCallbackErrorEvent): void {
    if (this.#warnedCallbackFailures.has(event.callback)) return;
    this.#warnedCallbackFailures.add(event.callback);
    process.emitWarning(
      `OpenAI Realtime callback failed (${event.callback}, call ${event.openAiCallId})`,
      { code: event.code, type: 'CallCommandRealtimeCallbackWarning' },
    );
  }

  #reportCallbackFailure(callback: CallCommandRealtimeCallbackName): void {
    const event: CallCommandRealtimeCallbackErrorEvent = {
      openAiCallId: this.openAiCallId,
      callback,
      code: 'CALLCOMMAND_REALTIME_CALLBACK_FAILED',
    };
    const hook = this.#callbacks.onCallbackError;
    if (!hook) {
      this.#warnCallbackFailure(event);
      return;
    }
    try {
      void Promise.resolve(hook(event)).catch(() => this.#warnCallbackFailure(event));
    } catch {
      this.#warnCallbackFailure(event);
    }
  }

  #notify<T>(
    callbackName: CallCommandRealtimeCallbackName,
    callback: ((event: T) => void | Promise<void>) | undefined,
    event: T,
  ): void {
    if (!callback) return;
    try {
      void Promise.resolve(callback(event)).catch(() => this.#reportCallbackFailure(callbackName));
    } catch {
      this.#reportCallbackFailure(callbackName);
    }
  }

  #reportError(code: string, recoverable: boolean, provider?: Record<string, unknown>): void {
    this.#notify('onError', this.#callbacks.onError, {
      openAiCallId: this.openAiCallId,
      code,
      providerCode: safeProviderIdentifier(provider?.code),
      providerType: safeProviderIdentifier(provider?.type),
      recoverable,
    });
  }

  #send(value: Record<string, unknown>): void {
    if (this.#state === 'closed' || this.#socket.readyState !== 1) {
      this.#reportError('CALLCOMMAND_REALTIME_SOCKET_NOT_OPEN', true);
      return;
    }
    this.#socket.send(JSON.stringify(value), error => {
      if (error) this.#reportError('CALLCOMMAND_REALTIME_SOCKET_SEND_FAILED', true);
    });
  }

  async #handleToolCall(event: Record<string, unknown>): Promise<void> {
    const toolCallId = typeof event.call_id === 'string' ? event.call_id : '';
    const name = typeof event.name === 'string' ? event.name : '';
    const rawArguments = typeof event.arguments === 'string' ? event.arguments : '';
    if (!OPENAI_CALL_ID.test(toolCallId) || !TOOL_NAME.test(name) || Buffer.byteLength(rawArguments, 'utf8') > MAX_TOOL_ARGUMENT_BYTES) {
      this.#reportError('CALLCOMMAND_REALTIME_TOOL_EVENT_INVALID', false);
      return;
    }
    if (this.#handledToolCalls.has(toolCallId)) return;
    if (this.#handledToolCalls.size >= MAX_HANDLED_TOOL_CALLS) {
      this.#reportError('CALLCOMMAND_REALTIME_TOOL_LIMIT_EXCEEDED', false);
      return;
    }
    this.#handledToolCalls.add(toolCallId);
    let output: string;
    if (!this.#allowedTools.has(name)) {
      this.#reportError('CALLCOMMAND_REALTIME_TOOL_NOT_ALLOWED', false);
      output = JSON.stringify({ ok: false, error: 'Tool is not allowed' });
    } else {
      try {
        const parsed = JSON.parse(rawArguments) as unknown;
        const args = cloneBoundedJson(parsed, { nodes: 0 });
        if (!args || Array.isArray(args) || typeof args !== 'object') throw new Error('invalid');
        const result = await this.#callbacks.executeTool({
          openAiCallId: this.openAiCallId,
          toolCallId,
          name,
          arguments: args,
        });
        output = serializeToolOutput(result);
      } catch {
        this.#reportError('CALLCOMMAND_REALTIME_TOOL_EXECUTION_FAILED', false);
        output = JSON.stringify({ ok: false, error: 'Tool execution failed' });
      }
    }
    this.#send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: toolCallId, output },
    });
    this.#send({ type: 'response.create' });
  }

  async #handleMessage(raw: unknown): Promise<void> {
    try {
      const event = JSON.parse(decodeSocketMessage(raw)) as Record<string, unknown>;
      if (!event || typeof event.type !== 'string') throw new Error('invalid');
      if (event.type === 'response.function_call_arguments.done') {
        await this.#handleToolCall(event);
        return;
      }
      if (event.type === 'conversation.item.input_audio_transcription.completed') {
        const transcript = typeof event.transcript === 'string' ? event.transcript.slice(0, MAX_TRANSCRIPT_CHARACTERS) : '';
        const itemId = typeof event.item_id === 'string' ? event.item_id.slice(0, 128) : '';
        if (transcript && itemId) this.#notify('onTranscript', this.#callbacks.onTranscript, { openAiCallId: this.openAiCallId, itemId, role: 'caller', transcript });
        const usage = event.usage as Record<string, unknown> | undefined;
        if (usage) this.#notify('onUsage', this.#callbacks.onUsage, {
          openAiCallId: this.openAiCallId,
          source: 'transcription',
          inputTokens: safeCount(usage.input_tokens),
          outputTokens: safeCount(usage.output_tokens),
          totalTokens: safeCount(usage.total_tokens) || safeCount(usage.input_tokens) + safeCount(usage.output_tokens),
        });
        return;
      }
      if (event.type === 'response.output_audio_transcript.done' || event.type === 'response.output_text.done') {
        const transcriptValue = event.type === 'response.output_text.done' ? event.text : event.transcript;
        const transcript = typeof transcriptValue === 'string' ? transcriptValue.slice(0, MAX_TRANSCRIPT_CHARACTERS) : '';
        const itemId = typeof event.item_id === 'string' ? event.item_id.slice(0, 128) : '';
        if (transcript && itemId) this.#notify('onTranscript', this.#callbacks.onTranscript, { openAiCallId: this.openAiCallId, itemId, role: 'assistant', transcript });
        return;
      }
      if (event.type === 'response.done') {
        const response = event.response as Record<string, unknown> | undefined;
        const usage = response?.usage as Record<string, unknown> | undefined;
        if (usage) this.#notify('onUsage', this.#callbacks.onUsage, {
          openAiCallId: this.openAiCallId,
          source: 'response',
          responseId: typeof response?.id === 'string' ? response.id.slice(0, 128) : undefined,
          inputTokens: safeCount(usage.input_tokens),
          outputTokens: safeCount(usage.output_tokens),
          totalTokens: safeCount(usage.total_tokens),
        });
        return;
      }
      if (event.type === 'error') {
        this.#reportError('CALLCOMMAND_REALTIME_PROVIDER_ERROR', true, event.error as Record<string, unknown> | undefined);
      }
    } catch {
      this.#reportError('CALLCOMMAND_REALTIME_EVENT_INVALID', true);
    }
  }
}

export interface OpenAiRealtimeAdapterDependencies {
  env?: CallCommandRealtimeEnvironment;
  fetch?: RealtimeFetch;
  socketFactory?: RealtimeSocketFactory;
  webhookClientFactory?: OpenAiWebhookClientFactory;
  timeoutMs?: number;
}

export class OpenAiRealtimeSipAdapter {
  #config: RealtimeConfig;
  #fetch: RealtimeFetch;
  #socketFactory: RealtimeSocketFactory;
  #webhookClient: OpenAiWebhookClient;
  #timeoutMs: number;

  constructor(dependencies: OpenAiRealtimeAdapterDependencies = {}) {
    this.#config = requireConfig(dependencies.env ?? process.env);
    this.#fetch = dependencies.fetch ?? globalThis.fetch;
    this.#socketFactory = dependencies.socketFactory ?? defaultSocketFactory;
    const timeoutMs = dependencies.timeoutMs ?? 8_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) invalid('Realtime provider timeout is invalid');
    this.#timeoutMs = timeoutMs;
    try {
      this.#webhookClient = (dependencies.webhookClientFactory ?? defaultWebhookClientFactory)({
        apiKey: this.#config.apiKey,
        projectId: this.#config.projectId,
        webhookSecret: this.#config.webhookSecret,
      });
    } catch {
      throw new CallCommandRealtimeError(
        'OpenAI Realtime webhook verifier could not be initialized',
        'CALLCOMMAND_REALTIME_CLIENT_INIT_FAILED',
        503,
      );
    }
  }

  get readiness(): { ready: true; model: CallCommandRealtimeModel } {
    return { ready: true, model: this.#config.model };
  }

  createRouteToken(internalCallId: string, providerCallSid: string): string {
    return createCallCommandSipRouteToken({ internalCallId, providerCallSid, routeSecret: this.#config.routeSecret });
  }

  verifyRouteToken(internalCallId: string, providerCallSid: string, routeToken: string): boolean {
    return verifyCallCommandSipRouteToken({ internalCallId, providerCallSid, routeToken, routeSecret: this.#config.routeSecret });
  }

  async unwrapIncomingCall(input: {
    rawBody: string | Buffer;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<VerifiedOpenAiIncomingCall> {
    const rawBody = Buffer.isBuffer(input.rawBody) ? input.rawBody.toString('utf8') : input.rawBody;
    if (typeof rawBody !== 'string' || Buffer.byteLength(rawBody, 'utf8') < 2 || Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BYTES) {
      invalid('OpenAI webhook body is invalid', 'CALLCOMMAND_REALTIME_WEBHOOK_INVALID');
    }
    const headers = normalizeWebhookHeaders(input.headers);
    let event: unknown;
    try {
      event = await this.#webhookClient.webhooks.unwrap(rawBody, headers, this.#config.webhookSecret);
    } catch {
      throw new CallCommandRealtimeError('OpenAI webhook signature is invalid', 'CALLCOMMAND_REALTIME_WEBHOOK_SIGNATURE_INVALID', 401);
    }
    return parseIncomingWebhookEvent(event);
  }

  async #request(action: CallCommandRealtimeAction, openAiCallId: string, body?: Record<string, unknown>): Promise<SafeRealtimeActionResult> {
    const callId = parseOpenAiCallId(openAiCallId);
    const url = new URL(`/v1/realtime/calls/${encodeURIComponent(callId)}/${action}`, OPENAI_API_ORIGIN);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(url.toString(), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.#config.apiKey}`,
          'content-type': 'application/json',
          'openai-project': this.#config.projectId,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        try { await response.body?.cancel(); } catch { /* response details are intentionally discarded */ }
        throw safeProviderError(action, response.status);
      }
      return { ok: true, action, openAiCallId: callId };
    } catch (error) {
      if (error instanceof CallCommandRealtimeError) throw error;
      if (controller.signal.aborted) {
        throw new CallCommandRealtimeError(`OpenAI Realtime ${action} request timed out`, 'CALLCOMMAND_REALTIME_TIMEOUT', 504);
      }
      throw safeProviderError(action);
    } finally {
      clearTimeout(timeout);
    }
  }

  accept(openAiCallId: string, input: RealtimeAcceptInput): Promise<SafeRealtimeActionResult> {
    return this.#request('accept', openAiCallId, sanitizeAcceptInput(input, this.#config.model));
  }

  reject(openAiCallId: string, statusCode = 603): Promise<SafeRealtimeActionResult> {
    if (![480, 486, 603].includes(statusCode)) invalid('SIP rejection status is invalid');
    return this.#request('reject', openAiCallId, { status_code: statusCode });
  }

  refer(openAiCallId: string, targetUri: string): Promise<SafeRealtimeActionResult> {
    return this.#request('refer', openAiCallId, { target_uri: canonicalReferTarget(targetUri) });
  }

  hangup(openAiCallId: string): Promise<SafeRealtimeActionResult> {
    return this.#request('hangup', openAiCallId);
  }

  connectSideband(input: {
    openAiCallId: string;
    allowedToolNames: readonly string[];
    callbacks: RealtimeSidebandCallbacks;
  }): OpenAiRealtimeSidebandController {
    const callId = parseOpenAiCallId(input.openAiCallId);
    if (!input.callbacks || typeof input.callbacks.executeTool !== 'function') invalid('Sideband tool executor is required');
    validateToolAllowlist(input.allowedToolNames);
    const url = new URL(OPENAI_REALTIME_WS_URL);
    url.searchParams.set('call_id', callId);
    let socket: RealtimeSocket;
    try {
      socket = this.#socketFactory(url.toString(), {
        headers: {
          authorization: `Bearer ${this.#config.apiKey}`,
          'openai-project': this.#config.projectId,
        },
        handshakeTimeout: this.#timeoutMs,
        maxPayload: MAX_EVENT_BYTES,
        perMessageDeflate: false,
      });
    } catch {
      throw new CallCommandRealtimeError(
        'OpenAI Realtime sideband connection could not be initialized',
        'CALLCOMMAND_REALTIME_SOCKET_INIT_FAILED',
        503,
      );
    }
    return new OpenAiRealtimeSidebandController(callId, socket, input.allowedToolNames, input.callbacks);
  }
}
