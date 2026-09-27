import { ResolutionInputError } from './techdeck-resolution-validation.js';
import { screenResolutionSecrets } from './techdeck-resolution-redaction.js';

export type ResolutionIdentifier = { kind: string; value: string };
/** Context is required for numeric identifiers; a bare number is never an event ID. */
export function extractResolutionIdentifiers(text: string): ResolutionIdentifier[] {
  const found = new Map<string, ResolutionIdentifier>();
  const add = (kind: string, value: string) => {
    if (found.size >= 100 || Buffer.byteLength(value) > 2000) return;
    const trimmed = value.trim(); let end = trimmed.length;
    while (end && '.,;'.includes(trimmed[end - 1])) end--;
    const normalized = trimmed.slice(0, end).toLowerCase();
    if (normalized) found.set(`${kind}:${normalized}`, { kind, value: normalized });
  };
  for (const match of text.matchAll(/\b0x[0-9a-f]{4,16}\b/gi)) add('error_code', match[0]);
  // Bounded, disjoint separators avoid overlapping whitespace backtracking.
  for (const match of text.matchAll(/\bevent(?:\s{1,32}id)?\s{0,32}(?:[:=#]\s{0,32})?(\d{1,10})\b/gi)) add('event_id', match[1]);
  for (const match of text.matchAll(/\bport\s{0,32}(?:[:=#]\s{0,32})?(\d{1,5})\b/gi)) if (Number(match[1]) <= 65535) add('port', match[1]);
  for (const match of text.matchAll(/\b(?:service|hostname|host|os\s{1,32}build|build)\s{0,32}[:=]\s{0,32}["']?([\w.-]{1,200})/gi)) {
    add(/^service/i.test(match[0]) ? 'service' : /build/i.test(match[0]) ? 'os_build' : 'hostname', match[1]);
  }
  for (const match of text.matchAll(/(?:[A-Za-z]:\\|\\\\)[^\r\n"<>|]{1,1500}/g)) {
    add('file_path', match[0]); const basename = match[0].split(/[\\/]/).pop(); if (basename) add('basename', basename);
  }
  // Consume each token once, then inspect only bounded candidates.
  for (const match of text.matchAll(/[^\s"<>|]+/g)) {
    if (match[0].length <= 2000 && /^\/[\w.-]+(?:\/[\w.-]+)+$/.test(match[0])) {
      add('file_path', match[0]); add('basename', match[0].slice(match[0].lastIndexOf('/') + 1));
    }
  }
  for (const match of text.matchAll(/[\w.-]+/g)) {
    if (match[0].length <= 2000 && /\.(?:exe|dll|log|db|sqlite|wal|sys|ps1|conf)$/i.test(match[0])) add('basename', match[0]);
  }
  // A single literal also matches a stored, typed identifier without inventing its type.
  if (/^[\w.-]{2,200}$/.test(text.trim()) && !/^\d+$/.test(text.trim())) add('literal', text.trim());
  return [...found.values()];
}

export function resolutionSearchText(value: unknown, large: boolean): string {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > (large ? 100_000 : 200) || value.includes('\0')) throw new ResolutionInputError('RESOLUTION_QUERY_INVALID', 400);
  const issues = screenResolutionSecrets(value, null);
  if (issues.length) throw new ResolutionInputError('RESOLUTION_REDACTION_REQUIRED', 422, issues);
  return value.trim();
}
