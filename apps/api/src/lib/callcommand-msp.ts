import { createHash, createHmac, randomInt } from 'node:crypto';
import { normalizeE164 } from './callcommand.js';
import { isOperatorOSTestEnvironment } from './shared-service-safety.js';

export const CALLCOMMAND_MSP_CONTRACT = 'callcommand-msp-intake-v1';

export const SUPPORT_LINK_STATUSES = [
  'PENDING_ISSUANCE', 'ACTIVE', 'TEMPORARILY_LOCKED', 'SUSPENDED',
  'REVOKED', 'REPLACED', 'EXPIRED',
] as const;

export const CALL_ASSURANCE_LEVELS = ['A0', 'A1', 'A2', 'A3', 'A4'] as const;
export const POLICY_DECISIONS = ['ALLOW', 'CHALLENGE', 'REQUIRE_APPROVAL', 'MANUAL_ONLY', 'DENY'] as const;
export const ACCOUNT_CLASSES = ['STANDARD', 'PRIVILEGED', 'SERVICE', 'SHARED', 'BREAK_GLASS', 'UNKNOWN', 'TERMINATED'] as const;
export const ACTION_RISK_CLASSES = [
  'R0_READ_ONLY', 'R1_REVERSIBLE_WORKSTATION', 'R2_DISRUPTIVE_WORKSTATION',
  'R3_INFRASTRUCTURE_SECURITY', 'R4_DESTRUCTIVE_PRIVILEGE',
] as const;
export const INTAKE_INTENTS = [
  'NEW_TICKET', 'EXISTING_TICKET', 'PASSWORD_RESET', 'ACCOUNT_UNLOCK',
  'PRINTER_ISSUE', 'NETWORK_ISSUE', 'APPLICATION_ISSUE', 'MAPPED_DRIVE_ISSUE',
  'WORKSTATION_REBOOT', 'APPROVED_RMM_ACTION', 'SECURITY_INCIDENT',
  'OUTAGE_REPORT', 'HUMAN_SUPPORT', 'UNKNOWN',
] as const;

export const CALL_STATES = [
  'RECEIVED', 'PROVIDER_VERIFIED', 'TENANT_RESOLVED', 'ORIGINATING_LINE_EVALUATED',
  'UNRECOGNIZED_LINE', 'CALLBACK_REQUESTED', 'ORGANIZATION_MATCHED',
  'SUPPORT_ID_REQUESTED', 'SUPPORT_ID_INVALID', 'CONTACT_ASSOCIATED',
  'INTENT_CAPTURED', 'LOCAL_CASE_CREATED', 'BMS_TICKET_QUEUED',
  'POLICY_EVALUATED', 'MANUAL_REVIEW', 'CHALLENGE_REQUIRED', 'CHALLENGE_FAILED',
  'VERIFIED', 'ALLOWED', 'TARGET_RESOLVED', 'USER_CONFIRMED', 'ACTION_AUTHORIZED',
  'ACTION_QUEUED', 'ACTION_RUNNING', 'SUCCEEDED', 'EXPIRED', 'UNKNOWN_RESULT',
  'TICKET_SYNCHRONIZED', 'CUSTOMER_CONFIRMATION', 'RESOLVED', 'PENDING',
  'COMPLETED', 'ABANDONED', 'TRANSFERRED', 'DENIED', 'LOCKED', 'FAILED',
] as const;

export type SupportLinkStatus = (typeof SUPPORT_LINK_STATUSES)[number];
export type AssuranceLevel = (typeof CALL_ASSURANCE_LEVELS)[number];
export type PolicyDecision = (typeof POLICY_DECISIONS)[number];
export type AccountClass = (typeof ACCOUNT_CLASSES)[number];
export type ActionRiskClass = (typeof ACTION_RISK_CLASSES)[number];
export type IntakeIntent = (typeof INTAKE_INTENTS)[number];
export type CallState = (typeof CALL_STATES)[number];

const TEST_INDEX_KEY = 'operatoros-callcommand-msp-test-index-key-v1';

export class CallCommandMspError extends Error {
  constructor(
    message: string,
    public readonly code = 'CALLCOMMAND_MSP_REQUEST_INVALID',
    public readonly statusCode = 400,
    public readonly field?: string,
  ) {
    super(message);
  }
}

function associationIndexKey(): string {
  const value = process.env.CALLCOMMAND_ASSOCIATION_INDEX_KEY?.trim();
  if (value && Buffer.byteLength(value, 'utf8') >= 32) return value;
  if (isOperatorOSTestEnvironment()) return TEST_INDEX_KEY;
  throw new CallCommandMspError(
    'CallCommand association indexing is unavailable',
    'CALLCOMMAND_ASSOCIATION_INDEX_UNAVAILABLE',
    503,
  );
}

export function calculateLuhnCheckDigit(body: string): string {
  if (!/^\d{9}$/.test(body)) {
    throw new CallCommandMspError('SupportLink body must contain nine digits', 'SUPPORT_LINK_FORMAT_INVALID', 400, 'supportLinkId');
  }
  const candidate = `${body}0`;
  let sum = 0;
  let doubleDigit = true;
  for (let index = candidate.length - 2; index >= 0; index -= 1) {
    let digit = Number(candidate[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return String((10 - (sum % 10)) % 10);
}

export function isValidSupportLinkId(value: string): boolean {
  return /^\d{10}$/.test(value) && calculateLuhnCheckDigit(value.slice(0, 9)) === value[9];
}

export function normalizeSupportLinkId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new CallCommandMspError('SupportLink ID is invalid', 'SUPPORT_LINK_INVALID', 400, 'supportLinkId');
  }
  const normalized = value.replace(/\D/g, '');
  if (!isValidSupportLinkId(normalized)) {
    throw new CallCommandMspError('SupportLink ID is invalid', 'SUPPORT_LINK_INVALID', 400, 'supportLinkId');
  }
  return normalized;
}

export function issueSupportLinkId(): string {
  let body = '';
  for (let index = 0; index < 9; index += 1) body += String(randomInt(0, 10));
  return `${body}${calculateLuhnCheckDigit(body)}`;
}

export function supportLinkLookupHmac(normalizedDigits: string): string {
  return createHmac('sha256', associationIndexKey())
    .update(`callcommand-support-link-v1:${normalizedDigits}`)
    .digest('hex');
}

export function trustedLineLookupHmac(value: unknown): { normalized: string; hmac: string; last4: string } {
  const normalized = normalizeE164(value, 'phone');
  return {
    normalized,
    hmac: createHmac('sha256', associationIndexKey())
      .update(`callcommand-originating-line-v1:${normalized}`)
      .digest('hex'),
    last4: normalized.slice(-4),
  };
}

export function safeCorrelationToken(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = 'CC-';
  for (let index = 0; index < 6; index += 1) result += alphabet[randomInt(0, alphabet.length)];
  return result;
}

export function redactMspText(value: unknown, max = 4_000): string {
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_NUMBER]')
    .replace(/\b(password|passcode|otp|one[- ]?time code)\s*(?:is|:|=)?\s*\S+/gi, '$1 [REDACTED]')
    .slice(0, max);
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export function hashAuditEvent(previousHash: string | null, event: Record<string, unknown>): string {
  return createHash('sha256').update(`${previousHash ?? 'GENESIS'}:${canonicalJson(event)}`).digest('hex');
}

const TRANSITIONS: Record<CallState, readonly CallState[]> = {
  RECEIVED: ['PROVIDER_VERIFIED', 'FAILED'],
  PROVIDER_VERIFIED: ['TENANT_RESOLVED', 'FAILED'],
  TENANT_RESOLVED: ['ORIGINATING_LINE_EVALUATED', 'FAILED'],
  ORIGINATING_LINE_EVALUATED: ['UNRECOGNIZED_LINE', 'ORGANIZATION_MATCHED', 'FAILED'],
  UNRECOGNIZED_LINE: ['CALLBACK_REQUESTED', 'TRANSFERRED', 'ABANDONED', 'COMPLETED'],
  CALLBACK_REQUESTED: ['LOCAL_CASE_CREATED', 'TRANSFERRED', 'COMPLETED'],
  ORGANIZATION_MATCHED: ['SUPPORT_ID_REQUESTED', 'FAILED'],
  SUPPORT_ID_REQUESTED: ['SUPPORT_ID_INVALID', 'CONTACT_ASSOCIATED', 'LOCKED', 'TRANSFERRED'],
  SUPPORT_ID_INVALID: ['SUPPORT_ID_REQUESTED', 'LOCKED', 'TRANSFERRED'],
  CONTACT_ASSOCIATED: ['INTENT_CAPTURED', 'TRANSFERRED', 'ABANDONED'],
  INTENT_CAPTURED: ['LOCAL_CASE_CREATED', 'FAILED'],
  LOCAL_CASE_CREATED: ['BMS_TICKET_QUEUED', 'POLICY_EVALUATED', 'TRANSFERRED', 'COMPLETED'],
  BMS_TICKET_QUEUED: ['POLICY_EVALUATED', 'TICKET_SYNCHRONIZED', 'TRANSFERRED', 'COMPLETED'],
  POLICY_EVALUATED: ['DENIED', 'MANUAL_REVIEW', 'CHALLENGE_REQUIRED', 'ALLOWED'],
  MANUAL_REVIEW: ['TRANSFERRED', 'DENIED', 'COMPLETED'],
  CHALLENGE_REQUIRED: ['CHALLENGE_FAILED', 'VERIFIED', 'TRANSFERRED'],
  CHALLENGE_FAILED: ['CHALLENGE_REQUIRED', 'LOCKED', 'TRANSFERRED'],
  VERIFIED: ['POLICY_EVALUATED', 'ALLOWED', 'TRANSFERRED'],
  ALLOWED: ['TARGET_RESOLVED', 'ACTION_AUTHORIZED', 'COMPLETED'],
  TARGET_RESOLVED: ['USER_CONFIRMED', 'DENIED', 'TRANSFERRED'],
  USER_CONFIRMED: ['ACTION_AUTHORIZED', 'DENIED', 'TRANSFERRED'],
  ACTION_AUTHORIZED: ['ACTION_QUEUED', 'EXPIRED', 'FAILED'],
  ACTION_QUEUED: ['ACTION_RUNNING', 'EXPIRED', 'FAILED'],
  ACTION_RUNNING: ['SUCCEEDED', 'FAILED', 'EXPIRED', 'UNKNOWN_RESULT'],
  SUCCEEDED: ['TICKET_SYNCHRONIZED', 'CUSTOMER_CONFIRMATION', 'COMPLETED'],
  EXPIRED: ['TICKET_SYNCHRONIZED', 'TRANSFERRED', 'COMPLETED'],
  UNKNOWN_RESULT: ['TICKET_SYNCHRONIZED', 'TRANSFERRED'],
  TICKET_SYNCHRONIZED: ['CUSTOMER_CONFIRMATION', 'TRANSFERRED', 'COMPLETED'],
  CUSTOMER_CONFIRMATION: ['RESOLVED', 'PENDING', 'TRANSFERRED'],
  RESOLVED: ['COMPLETED'],
  PENDING: ['TRANSFERRED', 'COMPLETED'],
  COMPLETED: [], ABANDONED: [], TRANSFERRED: [], DENIED: [], LOCKED: [], FAILED: [],
};

export function assertCallStateTransition(from: string, to: string): asserts to is CallState {
  if (!CALL_STATES.includes(from as CallState) || !CALL_STATES.includes(to as CallState) || !TRANSITIONS[from as CallState].includes(to as CallState)) {
    throw new CallCommandMspError(`Invalid call transition ${from} -> ${to}`, 'CALLCOMMAND_STATE_TRANSITION_INVALID', 409);
  }
}

export interface IntakeSuggestion {
  intent: IntakeIntent;
  confidence: number;
  summary: string;
  deviceHint: null;
  requestedActionHint: string | null;
  urgencyHint: 'normal' | 'high' | 'urgent';
  securityIndicators: string[];
  requiresHumanReview: boolean;
}

export function classifyMspIntake(value: unknown): IntakeSuggestion {
  const summary = redactMspText(value, 1_000);
  if (summary.length < 5) throw new CallCommandMspError('A useful issue description is required', 'INTAKE_DESCRIPTION_REQUIRED', 422, 'description');
  const source = summary.toLowerCase();
  const security = /ransomware|compromis(?:e|ed)|phish|breach|stolen credential|hacked/.test(source);
  const rules: Array<[RegExp, IntakeIntent, string | null]> = [
    [/ransomware|compromis(?:e|ed)|phish|breach|hacked/, 'SECURITY_INCIDENT', null],
    [/password|reset.*login|forgot.*login/, 'PASSWORD_RESET', 'identity.password-reset.v1'],
    [/unlock|locked out/, 'ACCOUNT_UNLOCK', 'identity.account-unlock.v1'],
    [/printer|print queue|spooler/, 'PRINTER_ISSUE', 'printer.spooler.repair.v2'],
    [/mapped drive|network drive|share path/, 'MAPPED_DRIVE_ISSUE', 'mapped-drive.diagnose.v1'],
    [/reboot|restart (?:my )?(?:pc|computer|workstation)/, 'WORKSTATION_REBOOT', 'workstation.reboot-confirmed.v1'],
    [/internet|network|dns|wi-?fi|connectivity/, 'NETWORK_ISSUE', 'workstation.health.collect.v1'],
    [/outage|everyone|whole office|all users/, 'OUTAGE_REPORT', null],
    [/existing ticket|ticket number|following up/, 'EXISTING_TICKET', null],
    [/technician|human|representative|agent/, 'HUMAN_SUPPORT', null],
    [/application|program|software|app\b/, 'APPLICATION_ISSUE', 'workstation.health.collect.v1'],
  ];
  const matched = rules.find(([pattern]) => pattern.test(source));
  const intent = matched?.[1] ?? 'NEW_TICKET';
  return {
    intent,
    confidence: matched ? 0.92 : 0.72,
    summary,
    deviceHint: null,
    requestedActionHint: matched?.[2] ?? null,
    urgencyHint: security ? 'urgent' : /urgent|cannot work|down/.test(source) ? 'high' : 'normal',
    securityIndicators: security ? ['SECURITY_RELATED_LANGUAGE'] : [],
    requiresHumanReview: security || !matched,
  };
}

export interface PolicyInput {
  assuranceLevel: AssuranceLevel;
  originatingLine: { matched: boolean; active: boolean; trustMode?: string | null; cooldownComplete?: boolean };
  contact: { active: boolean; supportEligible: boolean; verificationMethodAgeHours?: number | null; failedAttempts: number };
  action: { key: string; riskClass: ActionRiskClass; requiresConfirmation: boolean };
  target: {
    type: 'DEVICE' | 'DIRECTORY_ACCOUNT' | 'TICKET';
    organizationMatch: boolean;
    class: string;
    online?: boolean | null;
    affinity?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | null;
    privileged?: boolean;
  };
  environment: { incidentMode: boolean; afterHours: boolean; integrationHealthy: boolean; automationMode?: string };
  approvals: { managerCount: number; technicianCount: number };
}

export interface PolicyResult {
  decision: PolicyDecision;
  requiredAssurance: AssuranceLevel;
  allowedChallengeMethods: string[];
  expiresInSeconds: number;
  requiresConfirmation: boolean;
  reasonCodes: string[];
  policyVersion: string;
}

const ASSURANCE_RANK: Record<AssuranceLevel, number> = { A0: 0, A1: 1, A2: 2, A3: 3, A4: 4 };

export function evaluateMspPolicy(input: PolicyInput): PolicyResult {
  const reasons: string[] = [];
  const output = (decision: PolicyDecision, requiredAssurance: AssuranceLevel): PolicyResult => ({
    decision,
    requiredAssurance,
    allowedChallengeMethods: decision === 'CHALLENGE' ? ['PASSKEY', 'TOTP', 'PUSH', 'SMS'] : [],
    expiresInSeconds: input.action.riskClass === 'R0_READ_ONLY' ? 600 : 300,
    requiresConfirmation: input.action.requiresConfirmation,
    reasonCodes: reasons,
    policyVersion: 'callcommand-msp-strict-1.0.0',
  });

  if (!input.originatingLine.matched || !input.originatingLine.active) {
    reasons.push('ORIGINATING_LINE_NOT_TRUSTED');
    return output('MANUAL_ONLY', 'A0');
  }
  reasons.push('TRUSTED_ORGANIZATION_LINE');
  if (input.originatingLine.cooldownComplete === false) {
    reasons.push('ORIGINATING_LINE_COOLDOWN');
    return output('MANUAL_ONLY', 'A2');
  }
  if (!input.contact.active || !input.contact.supportEligible) {
    reasons.push('CONTACT_NOT_ELIGIBLE');
    return output('DENY', 'A1');
  }
  if (!input.target.organizationMatch) {
    reasons.push('CROSS_TENANT_TARGET_BLOCKED');
    return output('DENY', 'A4');
  }
  if (input.environment.incidentMode || input.environment.automationMode === 'MANUAL_ONLY') {
    reasons.push('INCIDENT_OR_MANUAL_MODE');
    return output(input.action.key === 'ticket.create' ? 'ALLOW' : 'MANUAL_ONLY', 'A3');
  }
  if (input.action.riskClass === 'R4_DESTRUCTIVE_PRIVILEGE') {
    reasons.push('DESTRUCTIVE_ACTION_PROHIBITED');
    return output('DENY', 'A4');
  }
  if (input.target.privileged || ['PRIVILEGED', 'SERVICE', 'SHARED', 'BREAK_GLASS', 'UNKNOWN', 'TERMINATED'].includes(input.target.class)) {
    reasons.push('PRIVILEGED_OR_UNKNOWN_ACCOUNT');
    return output('MANUAL_ONLY', 'A4');
  }
  if (input.target.type === 'DEVICE' && input.target.class.toLowerCase() === 'server') {
    reasons.push('CALLER_SERVER_ACTION_BLOCKED');
    return output('MANUAL_ONLY', 'A3');
  }
  if (!input.environment.integrationHealthy && input.action.key !== 'ticket.create') {
    reasons.push('INTEGRATION_UNHEALTHY');
    return output('MANUAL_ONLY', 'A2');
  }
  if (input.target.type === 'DEVICE') {
    if (input.target.affinity !== 'HIGH') {
      reasons.push('DEVICE_AFFINITY_INSUFFICIENT');
      return output('MANUAL_ONLY', 'A2');
    }
    if (input.target.online === false && input.action.riskClass !== 'R0_READ_ONLY') {
      reasons.push('OFFLINE_DISRUPTIVE_ACTION_BLOCKED');
      return output('DENY', 'A2');
    }
  }
  const required: AssuranceLevel = input.action.key === 'ticket.create' ? 'A1'
    : input.action.riskClass === 'R3_INFRASTRUCTURE_SECURITY' ? 'A3' : 'A2';
  if (ASSURANCE_RANK[input.assuranceLevel] < ASSURANCE_RANK[required]) {
    reasons.push('ASSURANCE_CHALLENGE_REQUIRED');
    return output('CHALLENGE', required);
  }
  if (input.action.riskClass === 'R3_INFRASTRUCTURE_SECURITY' || (input.action.riskClass === 'R2_DISRUPTIVE_WORKSTATION' && input.approvals.technicianCount < 1)) {
    reasons.push('TECHNICIAN_APPROVAL_REQUIRED');
    return output('REQUIRE_APPROVAL', required);
  }
  reasons.push('POLICY_ALLOW');
  return output('ALLOW', required);
}

export interface ActionManifestInput {
  actionKey: string;
  displayName: string;
  provider: 'DATTO_RMM' | 'MICROSOFT_GRAPH' | 'AD_BROKER' | 'BMS';
  componentUid?: string | null;
  componentVersion: string;
  sourceCommit: string;
  riskClass: ActionRiskClass;
  allowedDeviceClasses: string[];
  allowedOperatingSystems: string[];
  minimumAssurance: AssuranceLevel;
  requiresCallerConfirmation: boolean;
  requiresTechnicianApproval: boolean;
  mustBeOnline: boolean;
  allowOfflineQueue: boolean;
  expiresAfterSeconds: number;
  maximumRuntimeSeconds: number;
  parameterSchema: Record<string, unknown>;
  resultSchema: string;
}

export function validateActionManifest(value: unknown): ActionManifestInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CallCommandMspError('Action manifest must be an object');
  const body = value as Record<string, unknown>;
  const requiredText = (field: string, max: number) => {
    const result = typeof body[field] === 'string' ? String(body[field]).trim() : '';
    if (!result || result.length > max) throw new CallCommandMspError(`${field} is invalid`, 'ACTION_MANIFEST_INVALID', 400, field);
    return result;
  };
  const provider = requiredText('provider', 40) as ActionManifestInput['provider'];
  const riskClass = requiredText('riskClass', 60) as ActionRiskClass;
  const minimumAssurance = requiredText('minimumAssurance', 2) as AssuranceLevel;
  if (!['DATTO_RMM', 'MICROSOFT_GRAPH', 'AD_BROKER', 'BMS'].includes(provider)) throw new CallCommandMspError('provider is invalid', 'ACTION_MANIFEST_INVALID', 400, 'provider');
  if (!ACTION_RISK_CLASSES.includes(riskClass)) throw new CallCommandMspError('riskClass is invalid', 'ACTION_MANIFEST_INVALID', 400, 'riskClass');
  if (!CALL_ASSURANCE_LEVELS.includes(minimumAssurance)) throw new CallCommandMspError('minimumAssurance is invalid', 'ACTION_MANIFEST_INVALID', 400, 'minimumAssurance');
  const actionKey = requiredText('actionKey', 120);
  if (!/^[a-z][a-z0-9.-]+\.v\d+$/.test(actionKey) || /arbitrary|disable\.(?:edr|antivirus|firewall)|bitlocker|wipe|local-admin/i.test(actionKey)) {
    throw new CallCommandMspError('actionKey is not an approved versioned key', 'ACTION_KEY_PROHIBITED', 400, 'actionKey');
  }
  const componentUid = body.componentUid == null ? null : requiredText('componentUid', 160);
  if (provider === 'DATTO_RMM' && !componentUid) throw new CallCommandMspError('Datto manifests require a configured component UID', 'ACTION_COMPONENT_REQUIRED', 400, 'componentUid');
  const expiresAfterSeconds = Number(body.expiresAfterSeconds);
  const maximumRuntimeSeconds = Number(body.maximumRuntimeSeconds);
  if (!Number.isInteger(expiresAfterSeconds) || expiresAfterSeconds < 60 || expiresAfterSeconds > 3600) throw new CallCommandMspError('expiresAfterSeconds must be 60-3600', 'ACTION_MANIFEST_INVALID');
  if (!Number.isInteger(maximumRuntimeSeconds) || maximumRuntimeSeconds < 10 || maximumRuntimeSeconds > 1800) throw new CallCommandMspError('maximumRuntimeSeconds must be 10-1800', 'ACTION_MANIFEST_INVALID');
  const list = (field: string) => Array.isArray(body[field]) ? (body[field] as unknown[]).map(item => String(item).trim()).filter(Boolean).slice(0, 20) : [];
  const parameterSchema = body.parameterSchema && typeof body.parameterSchema === 'object' && !Array.isArray(body.parameterSchema) ? body.parameterSchema as Record<string, unknown> : {};
  const allowedParameters = new Set(['ExecutionId', 'NotAfterUtc']);
  if (Object.keys(parameterSchema).some(key => !allowedParameters.has(key))) throw new CallCommandMspError('Only system-owned component parameters are allowed', 'ACTION_PARAMETER_PROHIBITED');
  return {
    actionKey,
    displayName: requiredText('displayName', 160),
    provider,
    componentUid,
    componentVersion: requiredText('componentVersion', 40),
    sourceCommit: requiredText('sourceCommit', 64),
    riskClass,
    allowedDeviceClasses: list('allowedDeviceClasses'),
    allowedOperatingSystems: list('allowedOperatingSystems'),
    minimumAssurance,
    requiresCallerConfirmation: body.requiresCallerConfirmation === true,
    requiresTechnicianApproval: body.requiresTechnicianApproval === true,
    mustBeOnline: body.mustBeOnline !== false,
    allowOfflineQueue: body.allowOfflineQueue === true,
    expiresAfterSeconds,
    maximumRuntimeSeconds,
    parameterSchema,
    resultSchema: requiredText('resultSchema', 120),
  };
}

export function parseComponentResult(value: unknown, executionId: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CallCommandMspError('Component result is invalid', 'COMPONENT_RESULT_INVALID');
  const body = value as Record<string, unknown>;
  if (body.schema !== 'callcommand.component-result.v1' || body.executionId !== executionId) throw new CallCommandMspError('Component result binding is invalid', 'COMPONENT_RESULT_BINDING_INVALID');
  const serialized = canonicalJson(body);
  if (/password|token|secret|credential|bitlocker/i.test(serialized)) throw new CallCommandMspError('Component result contains prohibited fields', 'COMPONENT_RESULT_SECRET_REJECTED');
  return {
    schema: body.schema,
    executionId,
    componentVersion: String(body.componentVersion ?? '').slice(0, 40),
    success: body.success === true,
    code: String(body.code ?? 'UNKNOWN').replace(/[^A-Z0-9_]/gi, '').slice(0, 80),
    summary: redactMspText(body.summary, 500),
    startedUtc: body.startedUtc ?? null,
    endedUtc: body.endedUtc ?? null,
    data: body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {},
  };
}
