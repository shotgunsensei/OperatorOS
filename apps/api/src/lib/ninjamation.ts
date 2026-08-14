import { createHash } from 'node:crypto';

export class NinjamationValidationError extends Error {
  readonly code = 'NINJAMATION_INPUT_INVALID';
  readonly statusCode = 400;

  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'NinjamationValidationError';
  }
}

export const NINJAMATION_LANGUAGES = ['powershell', 'python', 'batch', 'bash'] as const;
export type NinjamationLanguage = (typeof NINJAMATION_LANGUAGES)[number];
export const NINJAMATION_SOURCE_COMMIT = 'cca75338d04ed35b89f28d614eb51559735aa32f';
export const NINJAMATION_CATALOG_COMMIT = 'ca0e55fd086f6751a43964927166bfa69db012b6';

export const NINJAMATION_EXTENSIONS: Record<NinjamationLanguage, string> = {
  powershell: 'ps1',
  python: 'py',
  batch: 'bat',
  bash: 'sh',
};

export type StaticFinding = {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  line: number | null;
};

type StaticAnalysis = {
  analyzerVersion: 1;
  contentSha256: string;
  findingCount: number;
  criticalCount: number;
  warningCount: number;
  findings: StaticFinding[];
};

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new NinjamationValidationError('Request body must be an object');
  }
  const value = input as Record<string, unknown>;
  for (const field of [
    'tenantId',
    'userId',
    'moduleId',
    'createdByUserId',
    'reviewedByUserId',
    'approvedByUserId',
    'downloadCount',
    'contentSha256',
    'staticAnalysis',
    'status',
    'source',
  ]) {
    if (field in value) {
      throw new NinjamationValidationError(
        `${field} is server-authoritative and must not be supplied`,
        field,
      );
    }
  }
  return value;
}

function text(
  value: unknown,
  field: string,
  max: number,
  required = false,
): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new NinjamationValidationError(`${field} is required`, field);
    return null;
  }
  if (typeof value !== 'string') {
    throw new NinjamationValidationError(`${field} must be text`, field);
  }
  const result = value.trim();
  if ((!result && required) || result.length > max) {
    throw new NinjamationValidationError(
      `${field} must be between ${required ? 1 : 0} and ${max} characters`,
      field,
    );
  }
  return result || null;
}

function expectedVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new NinjamationValidationError(
      'expectedVersion must be a positive integer',
      'expectedVersion',
    );
  }
  return Number(value);
}

function language(value: unknown): NinjamationLanguage {
  const result = text(value, 'language', 20, true)!.toLowerCase();
  if (!NINJAMATION_LANGUAGES.includes(result as NinjamationLanguage)) {
    throw new NinjamationValidationError(
      `language must be one of ${NINJAMATION_LANGUAGES.join(', ')}`,
      'language',
    );
  }
  return result as NinjamationLanguage;
}

function riskTier(value: unknown): 'low' | 'medium' | 'high' {
  const result = text(value, 'riskTier', 10) ?? 'medium';
  if (!['low', 'medium', 'high'].includes(result)) {
    throw new NinjamationValidationError('riskTier must be low, medium, or high', 'riskTier');
  }
  return result as 'low' | 'medium' | 'high';
}

function content(value: unknown): string {
  if (typeof value !== 'string') {
    throw new NinjamationValidationError('content must be text', 'content');
  }
  const normalized = value.replaceAll('\r\n', '\n').trim();
  if (normalized.length < 1 || normalized.length > 100_000) {
    throw new NinjamationValidationError(
      'content must be between 1 and 100000 characters',
      'content',
    );
  }
  if (normalized.includes('\0')) {
    throw new NinjamationValidationError('content contains an invalid null byte', 'content');
  }
  return normalized;
}

export function parseScriptCreate(input: unknown) {
  const value = object(input);
  return {
    name: text(value.name, 'name', 180, true)!,
    description: text(value.description, 'description', 4_000),
    language: language(value.language),
    category: text(value.category, 'category', 80) ?? 'General',
    riskTier: riskTier(value.riskTier),
    content: content(value.content),
  };
}

export function parseScriptPatch(input: unknown) {
  const value = object(input);
  const result: {
    expectedVersion: number;
    name?: string;
    description?: string | null;
    language?: NinjamationLanguage;
    category?: string;
    riskTier?: 'low' | 'medium' | 'high';
    content?: string;
  } = {
    expectedVersion: expectedVersion(value.expectedVersion),
  };
  if ('name' in value) result.name = text(value.name, 'name', 180, true)!;
  if ('description' in value) {
    result.description = text(value.description, 'description', 4_000);
  }
  if ('language' in value) result.language = language(value.language);
  if ('category' in value) result.category = text(value.category, 'category', 80, true)!;
  if ('riskTier' in value) result.riskTier = riskTier(value.riskTier);
  if ('content' in value) result.content = content(value.content);
  if (Object.keys(result).length === 1) {
    throw new NinjamationValidationError('At least one editable field is required');
  }
  return result;
}

export function parseLifecycle(input: unknown) {
  const value = object(input);
  return {
    expectedVersion: expectedVersion(value.expectedVersion),
    note: text(value.note, 'note', 2_000),
  };
}

export function parseGeneration(input: unknown) {
  const value = object(input);
  const idempotencyKey = text(value.idempotencyKey, 'idempotencyKey', 120, true)!;
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) {
    throw new NinjamationValidationError(
      'idempotencyKey contains unsupported characters',
      'idempotencyKey',
    );
  }
  return {
    idempotencyKey,
    prompt: text(value.prompt, 'prompt', 2_000, true)!,
    name: text(value.name, 'name', 180),
    description: text(value.description, 'description', 4_000),
    category: text(value.category, 'category', 80) ?? 'AI generated',
    language: language(value.language),
    riskTier: riskTier(value.riskTier),
  };
}

function lineFor(contentValue: string, matchIndex: number): number {
  return contentValue.slice(0, matchIndex).split('\n').length;
}

export function analyzeScript(contentValue: string): StaticAnalysis {
  const rules: Array<{
    code: string;
    severity: StaticFinding['severity'];
    message: string;
    pattern: RegExp;
  }> = [
    {
      code: 'DYNAMIC_CODE_EXECUTION',
      severity: 'critical',
      message: 'Dynamic code execution requires redesign or manual removal.',
      pattern: /\b(?:Invoke-Expression|iex)\b|\beval\s*\(/i,
    },
    {
      code: 'ENCODED_COMMAND',
      severity: 'critical',
      message: 'Encoded command execution is not allowed in approved scripts.',
      pattern: /-(?:enc|encodedcommand)\b/i,
    },
    {
      code: 'REMOTE_PIPE_EXECUTION',
      severity: 'critical',
      message: 'Downloading remote content directly into a shell is not allowed.',
      pattern: /(?:curl|wget|iwr|Invoke-WebRequest)[^\n|]*\|\s*(?:sh|bash|pwsh|powershell)/i,
    },
    {
      code: 'DESTRUCTIVE_ROOT_OPERATION',
      severity: 'critical',
      message: 'A destructive root or volume operation was detected.',
      pattern: /\brm\s+-rf\s+\/(?:\s|$)|\bformat(?:\.com)?\s+[A-Za-z]:/i,
    },
    {
      code: 'PERSISTENCE_CHANGE',
      severity: 'warning',
      message: 'The script appears to change startup or persistence configuration.',
      pattern: /\\CurrentVersion\\Run\b|\bschtasks\b.*\/create|\bNew-ScheduledTask\b/i,
    },
    {
      code: 'SECURITY_CONTROL_CHANGE',
      severity: 'warning',
      message: 'The script appears to modify a security control.',
      pattern: /\bSet-MpPreference\b|\bnetsh\b.*firewall|\bDisableRealtimeMonitoring\b/i,
    },
    {
      code: 'NETWORK_DOWNLOAD',
      severity: 'warning',
      message: 'The script downloads remote content; pin and verify its integrity before approval.',
      pattern: /\b(?:Invoke-WebRequest|Start-BitsTransfer|curl|wget)\b/i,
    },
    {
      code: 'PROCESS_LAUNCH',
      severity: 'info',
      message: 'The script launches another process.',
      pattern: /\b(?:Start-Process|subprocess\.|Process\.Start|cmd(?:\.exe)?\s+\/c)\b/i,
    },
  ];
  const findings: StaticFinding[] = [];
  for (const rule of rules) {
    const match = rule.pattern.exec(contentValue);
    if (match) {
      findings.push({
        code: rule.code,
        severity: rule.severity,
        message: rule.message,
        line: lineFor(contentValue, match.index),
      });
    }
  }
  return {
    analyzerVersion: 1,
    contentSha256: sha256(contentValue),
    findingCount: findings.length,
    criticalCount: findings.filter((finding) => finding.severity === 'critical').length,
    warningCount: findings.filter((finding) => finding.severity === 'warning').length,
    findings,
  };
}

export function parseGeneratedScript(raw: string): {
  name: string;
  description: string | null;
  content: string;
} {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new NinjamationValidationError('AI provider returned invalid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NinjamationValidationError('AI provider returned an invalid script object');
  }
  const record = value as Record<string, unknown>;
  return {
    name: text(record.name, 'name', 180, true)!,
    description: text(record.description, 'description', 4_000),
    content: content(record.content),
  };
}

export function safeFileName(name: string, languageValue: NinjamationLanguage): string {
  const stem = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'ninjamation-script';
  return `${stem}.${NINJAMATION_EXTENSIONS[languageValue]}`;
}
