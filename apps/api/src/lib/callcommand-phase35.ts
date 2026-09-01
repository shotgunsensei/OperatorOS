import { createHash, randomBytes } from 'node:crypto';
import { getAiProvider, type AiProvider } from './ai-provider.js';

export const CALLCOMMAND_PHASE35_SOURCE_COMMIT = 'd49434e1d641d62cc141591c7208539a7afbf11e';
export const CALLCOMMAND_LIVE_BEHAVIORS = ['record_only', 'forward_only', 'voicemail_only', 'ai_receptionist', 'ai_screen_then_transfer', 'ai_after_hours_intake'] as const;
export const CALLCOMMAND_AFTER_HOURS = ['voicemail', 'forward', 'ai_intake', 'hangup'] as const;
export const CALLCOMMAND_PRODUCT_MODES = ['msp', 'sales', 'field_service', 'medical', 'general'] as const;
export const CALLCOMMAND_FLOW_NODE_TYPES = ['condition', 'action', 'ai_decision', 'route'] as const;
export const CALLCOMMAND_ACTION_TYPES = ['ticket', 'lead', 'task', 'webhook', 'slack', 'email', 'assignment', 'priority'] as const;
export const CALLCOMMAND_MAX_FLOW_STEPS = 50;

type Row = Record<string, any>;

export class CallCommandPhase35Error extends Error {
  constructor(message: string, public readonly code = 'CALLCOMMAND_REQUEST_INVALID', public readonly statusCode = 400) {
    super(message);
  }
}

export function cleanText(value: unknown, field: string, max = 2_000, optional = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw new CallCommandPhase35Error(`${field} is required`);
  }
  if (typeof value !== 'string') throw new CallCommandPhase35Error(`${field} must be text`);
  const result = value.trim();
  if (!result || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
    throw new CallCommandPhase35Error(`${field} must contain 1-${max} valid characters`);
  }
  return result;
}

export function safeJsonObject(value: unknown, field: string, maxBytes = 24_000): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CallCommandPhase35Error(`${field} must be an object`);
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxBytes) throw new CallCommandPhase35Error(`${field} is too large`);
  return value as Row;
}

export function xml(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export interface BusinessHours {
  always?: boolean;
  timezone?: string;
  weekly?: Record<string, Array<{ open: string; close: string }>>;
}

function minutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

export function isWithinBusinessHours(value: unknown, now = new Date(), fallbackTimezone = 'UTC'): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const hours = value as BusinessHours;
  if (hours.always === true) return true;
  const timezone = hours.timezone || fallbackTimezone;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
    const day = get('weekday').toLowerCase().slice(0, 3);
    const current = Number(get('hour')) * 60 + Number(get('minute'));
    const intervals = hours.weekly?.[day];
    if (!Array.isArray(intervals)) return false;
    return intervals.some(interval => {
      const open = minutes(interval.open);
      const close = minutes(interval.close);
      if (open === null || close === null) return false;
      return close > open ? current >= open && current < close : current >= open || current < close;
    });
  } catch {
    return false;
  }
}

export interface IntakeField {
  key: string;
  label: string;
  type?: 'text' | 'phone' | 'email' | 'choice';
  required?: boolean;
  prompt?: string;
  options?: string[];
}

export function normalizeIntakeSchema(value: unknown): IntakeField[] {
  if (!Array.isArray(value) || value.length > 20) throw new CallCommandPhase35Error('intakeSchema must contain at most 20 fields');
  const seen = new Set<string>();
  return value.map((item, index) => {
    const row = safeJsonObject(item, `intakeSchema[${index}]`, 2_000);
    const key = String(row.key ?? row.label ?? '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 60);
    if (!key || seen.has(key)) throw new CallCommandPhase35Error('Intake field keys must be unique');
    seen.add(key);
    const type = ['text', 'phone', 'email', 'choice'].includes(String(row.type)) ? row.type : 'text';
    const options = type === 'choice' && Array.isArray(row.options)
      ? row.options.map((option: unknown) => String(option).trim()).filter(Boolean).slice(0, 20)
      : undefined;
    return {
      key,
      label: cleanText(row.label ?? key.replaceAll('_', ' '), `intakeSchema[${index}].label`, 120)!,
      type,
      required: row.required !== false,
      prompt: cleanText(row.prompt, `intakeSchema[${index}].prompt`, 300, true) ?? undefined,
      options,
    } as IntakeField;
  });
}

export function nextIntakeQuestion(schema: IntakeField[], collected: Row): IntakeField | null {
  return schema.find(field => field.required !== false && (collected[field.key] === undefined || collected[field.key] === '')) ?? null;
}

export function parseIntakeAnswer(field: IntakeField, speech: string): string | null {
  const value = speech.trim().slice(0, 500);
  if (!value) return null;
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  if (field.type === 'phone') {
    const phone = value.replace(/[^\d+]/g, '');
    return /^\+?[1-9]\d{7,14}$/.test(phone) ? phone : null;
  }
  if (field.type === 'choice' && field.options?.length) {
    return field.options.find(option => option.toLowerCase() === value.toLowerCase()) ?? null;
  }
  return value;
}

export async function decideReceptionistTurn(input: {
  productMode: string;
  schema: IntakeField[];
  collected: Row;
  currentField: IntakeField | null;
  speech: string;
  transcript: string;
  provider?: AiProvider;
}): Promise<{ collected: Row; next: IntakeField | null; publicResponse: string; action: 'ask_next' | 'create_ticket' | 'create_lead' | 'create_task'; provenance: 'provider' | 'deterministic_fallback' }> {
  const deterministicCollected = { ...input.collected };
  if (input.currentField) {
    const answer = parseIntakeAnswer(input.currentField, input.speech);
    if (answer) deterministicCollected[input.currentField.key] = answer;
  }
  const deterministicNext = nextIntakeQuestion(input.schema, deterministicCollected);
  const deterministicAction = input.productMode === 'sales' ? 'create_lead' : ['field_service', 'medical'].includes(input.productMode) ? 'create_task' : 'create_ticket';
  const fallback = {
    collected: deterministicCollected,
    next: deterministicNext,
    publicResponse: deterministicNext ? (deterministicNext.prompt || `Please provide ${deterministicNext.label}.`) : 'Thank you. Your request has been captured and routed.',
    action: deterministicNext ? 'ask_next' as const : deterministicAction as 'create_ticket' | 'create_lead' | 'create_task',
    provenance: 'deterministic_fallback' as const,
  };
  const provider = input.provider ?? getAiProvider();
  if (provider.name === 'disabled' || provider.name === 'test') return fallback;
  try {
    const completion = await provider.complete({
      systemPrompt: [
        'OPERATOROS_CALLCOMMAND_RECEPTIONIST_V1',
        'Return only JSON: collectedDataUpdates object, nextQuestionKey string or null, publicResponse string, action ask_next|create_ticket|create_lead|create_task.',
        'Ground updates in the caller utterance. Never invent identity or provider action. Never provide medical, legal, financial, or automotive diagnostic advice. Medical mode is administrative routing only.',
      ].join('\n'),
      userPrompt: JSON.stringify({ productMode: input.productMode, schema: input.schema, collected: input.collected, currentField: input.currentField?.key ?? null, speech: input.speech, transcriptTail: input.transcript.slice(-4_000) }),
      responseFormat: 'json', temperature: 0.1, maxTokens: 700, timeoutMs: 12_000,
    });
    const row = safeJsonObject(JSON.parse(completion.text), 'receptionistDecision', 10_000);
    const updates = row.collectedDataUpdates && typeof row.collectedDataUpdates === 'object' && !Array.isArray(row.collectedDataUpdates) ? row.collectedDataUpdates : {};
    const collected = { ...deterministicCollected, ...updates };
    const next = nextIntakeQuestion(input.schema, collected);
    const action = next ? 'ask_next' : ['create_ticket', 'create_lead', 'create_task'].includes(String(row.action)) ? row.action : deterministicAction;
    return {
      collected,
      next,
      publicResponse: cleanText(row.publicResponse, 'publicResponse', 500, true) ?? (next ? next.prompt || `Please provide ${next.label}.` : 'Thank you. Your request has been captured and routed.'),
      action,
      provenance: 'provider',
    };
  } catch {
    return fallback;
  }
}

export interface FlowNode {
  key: string;
  type: (typeof CALLCOMMAND_FLOW_NODE_TYPES)[number];
  config: Row;
  next?: string | null;
  yes?: string | null;
  no?: string | null;
}

export interface FlowGraph { start: string; nodes: FlowNode[] }

export function validateFlowGraph(value: unknown): { graph: FlowGraph; valid: true; reachable: number } {
  const graph = safeJsonObject(value, 'graph', 120_000);
  if (!Array.isArray(graph.nodes) || graph.nodes.length < 1 || graph.nodes.length > 100) throw new CallCommandPhase35Error('graph.nodes must contain 1-100 nodes');
  const nodes = graph.nodes.map((item: unknown, index: number) => {
    const row = safeJsonObject(item, `graph.nodes[${index}]`, 8_000);
    const key = cleanText(row.key, `graph.nodes[${index}].key`, 80)!;
    const type = String(row.type) as FlowNode['type'];
    if (!CALLCOMMAND_FLOW_NODE_TYPES.includes(type)) throw new CallCommandPhase35Error(`Flow node ${key} has an invalid type`);
    return { key, type, config: safeJsonObject(row.config ?? {}, `${key}.config`, 6_000), next: row.next ? String(row.next) : null, yes: row.yes ? String(row.yes) : null, no: row.no ? String(row.no) : null };
  });
  const byKey = new Map(nodes.map(node => [node.key, node]));
  if (byKey.size !== nodes.length) throw new CallCommandPhase35Error('Flow node keys must be unique');
  const start = cleanText(graph.start, 'graph.start', 80)!;
  if (!byKey.has(start)) throw new CallCommandPhase35Error('Flow start node does not exist');
  for (const node of nodes) {
    for (const pointer of [node.next, node.yes, node.no]) if (pointer && !byKey.has(pointer)) throw new CallCommandPhase35Error(`Flow node ${node.key} points to missing node ${pointer}`);
  }
  const reachable = new Set<string>();
  const pending = [start];
  while (pending.length) {
    const key = pending.pop()!;
    if (reachable.has(key)) continue;
    reachable.add(key);
    const node = byKey.get(key)!;
    for (const pointer of [node.next, node.yes, node.no]) if (pointer) pending.push(pointer);
  }
  if (reachable.size !== nodes.length) throw new CallCommandPhase35Error('Flow contains unreachable nodes');
  return { graph: { start, nodes }, valid: true, reachable: reachable.size };
}

function conditionMatches(config: Row, context: Row): boolean {
  const field = String(config.field ?? 'intent');
  const operator = String(config.operator ?? 'equals');
  const actual = context[field];
  const expected = config.value;
  if (operator === 'contains') return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
  if (operator === 'in') return Array.isArray(expected) && expected.map(String).includes(String(actual));
  if (operator === 'exists') return actual !== null && actual !== undefined && actual !== '';
  return String(actual ?? '') === String(expected ?? '');
}

export function executeFlowGraph(graphValue: unknown, context: Row, aiDecision?: (node: FlowNode) => 'yes' | 'no'): { traces: Row[]; actions: Row[]; outcome: string } {
  const { graph } = validateFlowGraph(graphValue);
  const byKey = new Map(graph.nodes.map(node => [node.key, node]));
  const traces: Row[] = [];
  const actions: Row[] = [];
  let current: string | null = graph.start;
  let outcome = 'completed';
  for (let sequence = 1; current && sequence <= CALLCOMMAND_MAX_FLOW_STEPS; sequence += 1) {
    const node: FlowNode = byKey.get(current)!;
    let branch: 'yes' | 'no' | 'next' = 'next';
    if (node.type === 'condition') branch = conditionMatches(node.config, context) ? 'yes' : 'no';
    if (node.type === 'ai_decision') branch = aiDecision?.(node) ?? (conditionMatches(node.config.fallback ?? {}, context) ? 'yes' : 'no');
    if (node.type === 'action') {
      const actionType = String(node.config.actionType ?? '');
      if (!CALLCOMMAND_ACTION_TYPES.includes(actionType as any)) throw new CallCommandPhase35Error(`Unsupported flow action ${actionType}`);
      // Action configuration is part of the action itself.  Nesting it under
      // `config` made endpointId, templates, assignment, and enabled toggles
      // invisible to the dispatcher even though the flow validated.
      actions.push({ ...node.config, actionType, enabled: node.config.enabled !== false });
    }
    const next: string | null | undefined = branch === 'yes' ? node.yes : branch === 'no' ? node.no : node.next;
    traces.push({ sequence, nodeKey: node.key, nodeType: node.type, outcome: branch, safeInput: { intent: context.intent ?? null, priority: context.priority ?? null }, safeOutput: { next: next ?? null } });
    current = next ?? null;
    if (sequence === CALLCOMMAND_MAX_FLOW_STEPS && current) outcome = 'loop_guard';
  }
  return { traces, actions, outcome };
}

export interface CallAnalysis {
  summary: string;
  customerName: string | null;
  companyName: string | null;
  callerPhone: string | null;
  callType: 'sales' | 'support' | 'complaint' | 'inquiry' | 'follow-up' | 'other' | null;
  intent: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  keyPoints: string[];
  entities: Row;
  suggestedTags: string[];
  actionItems: Array<{ title: string; description: string | null; priority: 'low' | 'medium' | 'high' }>;
}

function limitedStrings(value: unknown, count: number, size: number): string[] {
  return Array.isArray(value) ? value.map(String).map(item => item.trim().slice(0, size)).filter(Boolean).slice(0, count) : [];
}

export function normalizeCallAnalysis(value: unknown): CallAnalysis {
  const row = safeJsonObject(value, 'analysis', 40_000);
  const priority = ['low', 'medium', 'high', 'urgent'].includes(String(row.priority)) ? row.priority : 'medium';
  const sentiment = ['positive', 'neutral', 'negative', 'mixed'].includes(String(row.sentiment)) ? row.sentiment : 'neutral';
  const callType = ['sales', 'support', 'complaint', 'inquiry', 'follow-up', 'other'].includes(String(row.callType)) ? row.callType : null;
  const actions = Array.isArray(row.actionItems) ? row.actionItems.slice(0, 6).map((item: unknown, index: number) => {
    const action = safeJsonObject(item, `actionItems[${index}]`, 2_000);
    return {
      title: cleanText(action.title, `actionItems[${index}].title`, 160)!,
      description: cleanText(action.description, `actionItems[${index}].description`, 500, true),
      priority: ['low', 'medium', 'high'].includes(String(action.priority)) ? action.priority : 'medium',
    };
  }) : [];
  return {
    summary: cleanText(row.summary, 'analysis.summary', 2_000)!,
    customerName: cleanText(row.customerName, 'analysis.customerName', 160, true),
    companyName: cleanText(row.companyName, 'analysis.companyName', 160, true),
    callerPhone: cleanText(row.callerPhone, 'analysis.callerPhone', 32, true),
    callType, intent: cleanText(row.intent, 'analysis.intent', 1_000, true), priority, sentiment,
    keyPoints: limitedStrings(row.keyPoints, 8, 240),
    entities: row.entities && typeof row.entities === 'object' && !Array.isArray(row.entities) ? row.entities : {},
    suggestedTags: limitedStrings(row.suggestedTags, 8, 60),
    actionItems: actions as CallAnalysis['actionItems'],
  };
}

export function deterministicAnalysis(transcript: string): CallAnalysis {
  const source = transcript.trim();
  if (source.length < 10) throw new CallCommandPhase35Error('Transcript is too short for analysis');
  const lower = source.toLowerCase();
  const urgent = /(outage|down|emergency|safety|cannot operate|revenue blocking)/.test(lower);
  const sales = /(quote|buy|pricing|demo|proposal)/.test(lower);
  const complaint = /(complaint|angry|unacceptable|refund)/.test(lower);
  const phone = /\+?[1-9][\d\s().-]{6,20}\d/.exec(source)?.[0]?.replace(/[^\d+]/g, '') ?? null;
  const sentences = source.split(/(?<=[.!?])\s+/).map(item => item.trim()).filter(Boolean);
  return {
    summary: sentences.slice(0, 3).join(' ').slice(0, 1_500), customerName: null, companyName: null, callerPhone: phone,
    callType: complaint ? 'complaint' : sales ? 'sales' : 'support',
    intent: sentences[0]?.slice(0, 500) ?? null,
    priority: urgent ? 'urgent' : complaint ? 'high' : 'medium',
    sentiment: complaint ? 'negative' : 'neutral',
    keyPoints: sentences.slice(0, 6).map(item => item.slice(0, 200)), entities: phone ? { phone } : {},
    suggestedTags: [urgent ? 'urgent' : 'standard', sales ? 'sales' : complaint ? 'complaint' : 'support'],
    actionItems: [{ title: sales ? 'Follow up with caller about the requested offer' : 'Review and resolve caller request', description: sentences[0]?.slice(0, 400) ?? null, priority: urgent ? 'high' : 'medium' }],
  };
}

export async function analyzeTranscript(transcript: string, mode: 'auto' | 'ai' | 'deterministic' = 'auto', provider: AiProvider = getAiProvider()) {
  const fallback = deterministicAnalysis(transcript);
  if (mode === 'deterministic' || (process.env.NODE_ENV === 'test' && provider.name === 'test')) {
    return { analysis: fallback, provider: 'deterministic', model: 'callcommand-analysis-v1', provenance: 'deterministic' as const, tokenCount: 0 };
  }
  try {
    const completion = await provider.complete({
      systemPrompt: 'OPERATOROS_CALLCOMMAND_ANALYSIS_V1\nReturn only strict JSON. Ground every field in the transcript. Never invent identity, provider actions, clinical advice, legal advice, secrets, payment card data, or government identifiers. Shape: summary,customerName,companyName,callerPhone,callType,intent,priority,sentiment,keyPoints,entities,suggestedTags,actionItems.',
      userPrompt: transcript.slice(0, 40_000), responseFormat: 'json', temperature: 0.1, maxTokens: 3_000, timeoutMs: 30_000,
    });
    return { analysis: normalizeCallAnalysis(JSON.parse(completion.text)), provider: completion.provider, model: completion.model, provenance: 'provider' as const, tokenCount: completion.tokenCount };
  } catch (error) {
    if (mode === 'ai') throw Object.assign(new Error('Call analysis provider is unavailable or returned invalid output'), { code: 'CALLCOMMAND_AI_UNAVAILABLE', cause: error });
    return { analysis: fallback, provider: 'deterministic', model: 'callcommand-analysis-v1', provenance: 'fallback' as const, tokenCount: 0, fallbackReason: error instanceof Error ? error.message.slice(0, 240) : 'provider unavailable' };
  }
}

export async function transcribeCallAudio(content: Buffer, fileName = 'recording.mp3'): Promise<{ transcript: string; provider: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('Audio transcription provider is unavailable'), { code: 'CALLCOMMAND_TRANSCRIPTION_UNAVAILABLE' });
  if (!content.length || content.length > 52_428_800) throw new CallCommandPhase35Error('Recording is outside the supported size limit');
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(content)], { type: 'audio/mpeg' }), fileName);
  form.append('model', process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe');
  form.append('response_format', 'json');
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw Object.assign(new Error(`Audio transcription provider returned HTTP ${response.status}`), { code: 'CALLCOMMAND_TRANSCRIPTION_PROVIDER_FAILED' });
  const result = await response.json() as { text?: string };
  const transcript = String(result.text ?? '').trim();
  if (transcript.length < 2) throw Object.assign(new Error('Audio transcription provider returned no transcript'), { code: 'CALLCOMMAND_TRANSCRIPTION_EMPTY' });
  return { transcript, provider: 'openai', model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe' };
}

export function buildIncomingTwiml(input: { greeting: string; consentRequired: boolean; consentAction: string; gatherAction: string; behavior: string; forwardPhone?: string | null; recordingCallback?: string | null }): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<Response>', `<Say voice="Polly.Joanna">${xml(input.greeting)}</Say>`];
  if (input.consentRequired) {
    const timeoutAction = `${input.consentAction}${input.consentAction.includes('?') ? '&' : '?'}timeout=1`;
    lines.push(
      `<Gather input="dtmf" numDigits="1" timeout="6" action="${xml(input.consentAction)}" method="POST"><Say voice="Polly.Joanna">Press 1 to consent to automated intake and, when enabled, recording. Press 2 to decline and end the call.</Say></Gather>`,
      `<Redirect method="POST">${xml(timeoutAction)}</Redirect>`,
    );
  } else if (input.behavior === 'forward_only' && input.forwardPhone) {
    lines.push(`<Dial>${xml(input.forwardPhone)}</Dial>`);
  } else if (input.behavior === 'voicemail_only') {
    lines.push(`<Say voice="Polly.Joanna">Please leave a message after the tone.</Say>`, `<Record maxLength="180" playBeep="true"${input.recordingCallback ? ` recordingStatusCallback="${xml(input.recordingCallback)}"` : ''}/>`);
  } else {
    lines.push(`<Gather input="speech" speechTimeout="auto" timeout="6" action="${xml(input.gatherAction)}" method="POST"><Say voice="Polly.Joanna">How may I help you today?</Say></Gather>`, '<Say voice="Polly.Joanna">We did not receive a response. Goodbye.</Say>');
  }
  lines.push('</Response>');
  return lines.join('');
}

export function buildAfterHoursTwiml(input: { behavior: string; greeting: string; forwardPhone?: string | null; gatherAction: string; recordingCallback?: string | null }): string {
  const start = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${xml(input.greeting)}</Say>`;
  if (input.behavior === 'forward' && input.forwardPhone) return `${start}<Dial>${xml(input.forwardPhone)}</Dial></Response>`;
  if (input.behavior === 'ai_intake') return `${start}<Gather input="speech" speechTimeout="auto" timeout="6" action="${xml(input.gatherAction)}" method="POST"><Say voice="Polly.Joanna">Please tell me how we can help.</Say></Gather><Hangup/></Response>`;
  if (input.behavior === 'hangup') return `${start}<Hangup/></Response>`;
  return `${start}<Say voice="Polly.Joanna">Please leave a message after the tone.</Say><Record maxLength="180" playBeep="true"${input.recordingCallback ? ` recordingStatusCallback="${xml(input.recordingCallback)}"` : ''}/></Response>`;
}

export function createIngestionToken(): { token: string; prefix: string; hash: string } {
  const token = `cci_${randomBytes(32).toString('base64url')}`;
  return { token, prefix: token.slice(0, 12), hash: createHash('sha256').update(token).digest('hex') };
}

export function hashValue(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }

function pdfEscape(value: string): string { return value.normalize('NFKD').replace(/[^\x20-\x7e]/g, '?').replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)'); }

export function buildCallPdf(call: Row, traces: Row[] = [], actions: Row[] = []): Buffer {
  const lines = [
    'CallCommand AI Call Intelligence Report', `Call: ${String(call.id ?? '')}`, `Created: ${String(call.created_at ?? call.createdAt ?? '')}`,
    `Status: ${String(call.status ?? '')}`, `Caller: ${String(call.phone_masked ?? call.phoneMasked ?? 'Protected')}`,
    `Intent: ${String(call.intent ?? 'Not determined')}`, `Priority: ${String(call.priority ?? 'medium')}`, `Sentiment: ${String(call.sentiment ?? 'neutral')}`,
    '', 'Summary', String(call.summary ?? 'No analysis available.'), '', 'Transcript', String(call.transcript ?? 'No transcript available.'),
    '', 'Flow trace', ...traces.slice(0, 40).map(trace => `${trace.sequence}. ${trace.node_key ?? trace.nodeKey} (${trace.node_type ?? trace.nodeType}) - ${trace.outcome}`),
    '', 'Automation actions', ...actions.slice(0, 40).map(action => `${action.action_type ?? action.actionType}: ${action.status}`),
  ].map(line => String(line).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 500));
  const body = ['BT', '/F1 9 Tf', '48 744 Td', '12 TL', ...lines.slice(0, 55).map(line => `(${pdfEscape(line)}) Tj T*`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(body, 'ascii')} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let document = '%PDF-1.4\n%CallCommand\n'; const offsets = [0];
  objects.forEach((value, index) => { offsets.push(Buffer.byteLength(document, 'ascii')); document += `${index + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = Buffer.byteLength(document, 'ascii');
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(document, 'ascii');
}
