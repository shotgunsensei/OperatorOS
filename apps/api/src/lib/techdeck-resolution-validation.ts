import { createHash } from 'node:crypto';
import { Ajv } from 'ajv';
import { machineEvidenceExportSchema, type MachineEvidenceExport } from '../../../../packages/sdk/src/techdeck-resolution.js';
import { screenResolutionSecrets } from './techdeck-resolution-redaction.js';

export const RESOLUTION_LIMITS = Object.freeze({ bytes: 1_048_576, depth: 20, arrayEntries: 2_000, nodes: 12_000, textBytes: 100_000 });
export type ResolutionIssue = { path: string; code: string; severity: 'error' | 'warning'; expected: string; preview?: '[REDACTED]' };
export class ResolutionInputError extends Error {
  constructor(public code: string, public statusCode = 422, public issues: ResolutionIssue[] = []) { super(code); }
}
export const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const validator = new Ajv({ strict: true, allowUnionTypes: true, coerceTypes: false, removeAdditional: false, useDefaults: false, allErrors: false }).compile<MachineEvidenceExport>(machineEvidenceExportSchema);
const knownKeys = new Set<string>();
function collectKeys(schema: any): void {
  for (const [key, child] of Object.entries(schema.properties ?? {})) { knownKeys.add(key); collectKeys(child); }
  if (schema.items) collectKeys(schema.items);
}
collectKeys(machineEvidenceExportSchema);
/** Error paths cannot reflect arbitrary extension property names (which may themselves contain credentials). */
export function safeResolutionPath(path: string): string {
  return path.split('/').map(part => knownKeys.has(part) || /^\d+$/.test(part) || part === '' || part === 'humanReport' ? part : '[extension]').join('/').slice(0, 1024);
}
export function issue(path: string, code: string, expected: string, severity: 'error' | 'warning' = 'error'): ResolutionIssue {
  return { path: safeResolutionPath(path), code, expected, severity };
}
function validUnicode(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const value = text.charCodeAt(i);
    if (value === 0) return false;
    if (value >= 0xd800 && value <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (value >= 0xdc00 && value <= 0xdfff) return false;
  }
  return true;
}

function decimalIdentity(lexeme: string): string {
  const negative = lexeme.startsWith('-');
  const [mantissa, exponentText = '0'] = lexeme.replace(/^-/, '').toLowerCase().split('e');
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent)) throw new ResolutionInputError('RESOLUTION_NUMBER_UNSAFE', 400);
  const [whole, fraction = ''] = mantissa.split('.');
  const combined = `${whole}${fraction}`;
  let first = 0;
  while (combined[first] === '0') first++;
  const significant = combined.slice(first);
  if (!significant) return '0';
  let end = significant.length;
  while (significant[end - 1] === '0') end--;
  const digits = significant.slice(0, end);
  return `${negative ? '-' : ''}${digits}e${exponent - fraction.length + significant.length - digits.length}`;
}

/** A bounded JSON reader detects duplicate *decoded* keys before JSON.parse can erase them. */
export function parseResolutionJson(text: string, envelope = false): unknown {
  if (Buffer.byteLength(text, 'utf8') > (envelope ? 4 * RESOLUTION_LIMITS.bytes : RESOLUTION_LIMITS.bytes)) throw new ResolutionInputError('RESOLUTION_TOO_LARGE', 413);
  if (!validUnicode(text)) throw new ResolutionInputError('RESOLUTION_UNICODE_INVALID', 400);
  let offset = 0, entries = 0, nodes = 0;
  const fail = (code = 'RESOLUTION_JSON_INVALID'): never => { throw new ResolutionInputError(code, 400); };
  const whitespace = () => { while (/[\x20\t\r\n]/.test(text[offset] ?? '') && offset < text.length) offset++; };
  function string(): string {
    const start = offset++;
    while (offset < text.length) {
      const char = text[offset++];
      if (char === '\\') { offset++; continue; }
      if (char === '"') {
        let value: string;
        try { value = JSON.parse(text.slice(start, offset)); } catch { return fail(); }
        if (!validUnicode(value)) return fail('RESOLUTION_UNICODE_INVALID');
        if (Buffer.byteLength(value, 'utf8') > (envelope ? RESOLUTION_LIMITS.bytes : RESOLUTION_LIMITS.textBytes)) throw new ResolutionInputError('RESOLUTION_TEXT_TOO_LARGE', 413);
        return value;
      }
    }
    return fail();
  }
  function value(depth: number): unknown {
    whitespace();
    if (depth > RESOLUTION_LIMITS.depth || ++nodes > RESOLUTION_LIMITS.nodes) throw new ResolutionInputError('RESOLUTION_COMPLEXITY_LIMIT', 413);
    const char = text[offset];
    if (char === '"') return string();
    if (char === '{') {
      offset++; whitespace();
      const result: Record<string, unknown> = Object.create(null);
      const keys = new Set<string>();
      if (text[offset] === '}') { offset++; return result; }
      while (offset < text.length) {
        whitespace(); if (text[offset] !== '"') return fail();
        const key = string();
        if (keys.has(key)) return fail('RESOLUTION_DUPLICATE_KEY');
        if (['__proto__', 'prototype', 'constructor'].includes(key)) return fail('RESOLUTION_UNSAFE_KEY');
        if (keys.size >= 500 || Buffer.byteLength(key) > 256) throw new ResolutionInputError('RESOLUTION_COMPLEXITY_LIMIT', 413);
        keys.add(key); whitespace(); if (text[offset++] !== ':') return fail();
        result[key] = value(depth + 1); whitespace();
        const delimiter = text[offset++]; if (delimiter === '}') return result;
        if (delimiter !== ',') return fail();
      }
      return fail();
    }
    if (char === '[') {
      offset++; whitespace(); const result: unknown[] = [];
      if (text[offset] === ']') { offset++; return result; }
      while (offset < text.length) {
        if (++entries > RESOLUTION_LIMITS.arrayEntries) throw new ResolutionInputError('RESOLUTION_ARRAY_LIMIT', 413);
        result.push(value(depth + 1)); whitespace();
        const delimiter = text[offset++]; if (delimiter === ']') return result;
        if (delimiter !== ',') return fail();
      }
      return fail();
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(offset));
    if (!match) return fail();
    if (match[0].length > 128) return fail('RESOLUTION_NUMBER_UNSAFE');
    offset += match[0].length;
    const parsed = JSON.parse(match[0]);
    if (typeof parsed === 'number') {
      if (!Number.isFinite(parsed) || Math.abs(parsed) > Number.MAX_SAFE_INTEGER || (Number.isInteger(parsed) && !Number.isSafeInteger(parsed))) return fail('RESOLUTION_NUMBER_UNSAFE');
      // Compare decimal identities before discarding the lexeme. Underflow or
      // rounding must not silently alter measurements or duplicate fingerprints.
      if (decimalIdentity(match[0]) !== decimalIdentity(String(parsed))) return fail('RESOLUTION_NUMBER_PRECISION');
    }
    return parsed;
  }
  const parsed = value(0); whitespace(); if (offset !== text.length) return fail();
  return parsed;
}

export function canonicalResolutionJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalResolutionJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalResolutionJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function validateResolutionExport(rawText: string, humanReport: string | null = null) {
  const data = parseResolutionJson(rawText);
  if (humanReport !== null && (Buffer.byteLength(humanReport) > RESOLUTION_LIMITS.bytes || !validUnicode(humanReport))) throw new ResolutionInputError('RESOLUTION_REPORT_INVALID', 422);
  const secrets = screenResolutionSecrets(data, humanReport);
  if (secrets.length) throw new ResolutionInputError('RESOLUTION_SECRETS_DETECTED', 422, secrets);
  if (!validator(data)) throw new ResolutionInputError('RESOLUTION_SCHEMA_INVALID', 422,
    (validator.errors ?? []).slice(0, 30).map(error => issue(error.instancePath, 'SCHEMA_INVALID', `Export schema 1.0: ${error.keyword}`)));
  const warnings: ResolutionIssue[] = [];
  function inspect(value: any, schema: any, path: string): void {
    if (Array.isArray(value)) { value.forEach((item, index) => inspect(item, schema.items, `${path}/${index}`)); return; }
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties ?? {}, key)) {
        if (warnings.length < 100) warnings.push(issue(path, 'UNKNOWN_FIELD_RETAINED', 'Extension retained only in screened source', 'warning'));
      } else inspect(value[key], schema.properties[key], `${path}/${key}`);
    }
    for (const key of Object.keys(schema.properties ?? {})) if (!Object.hasOwn(value, key) && warnings.length < 100) warnings.push(issue(`${path}/${key}`, 'OPTIONAL_FIELD_UNKNOWN', 'Missing value remains unknown', 'warning'));
  }
  inspect(data, machineEvidenceExportSchema, '');
  if (data.security.credentials_present === true && data.security.credentials_redacted !== true) throw new ResolutionInputError('RESOLUTION_SOURCE_REQUIRES_REDACTION', 422, [issue('/security', 'REDACTION_REQUIRED', 'Redact credentials before importing')]);
  function project(value: any, schema: any): any {
    if (Array.isArray(value)) return value.map(item => project(item, schema.items));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(schema.properties ?? {}).filter(key => Object.hasOwn(value, key)).map(key => [key, project(value[key], schema.properties[key])]));
  }
  return { data, normalizedData: project(data, machineEvidenceExportSchema) as MachineEvidenceExport, rawText, humanReport, warnings, rawSha256: sha256(rawText), fingerprint: sha256(canonicalResolutionJson({ machine: data, humanReport })) };
}
