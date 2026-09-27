import { safeResolutionPath, type ResolutionIssue } from './techdeck-resolution-validation.js';

export const RESOLUTION_REDACTOR_VERSION = 'screen-v1';
const sensitiveKey = /(?:password|passwd|pwd|passphrase|secret|token|api[_ -]?key|private[_ -]?key|connection[_ -]?string|recovery[_ -]?(?:key|code)|authorization|cookie|credential)/i;
const placeholder = /^(?:\[REDACTED\]|<REDACTED>|\*{3,}|REDACTED)$/i;
const patterns = [
  /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9_+/.=-]{8,}/i,
  /\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|oos_[A-Za-z0-9_-]{32,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/,
  /\b\d{6}(?:-\d{6}){7}\b/,
];
const assignmentKey = /\b(?:password|passwd|pwd|passphrase|secret|(?:access[_ -]?|refresh[_ -]?)?token|api[_ -]?key|connection[_ -]?string|recovery[_ -]?(?:key|code)|authorization|cookie)\b/gi;
function credentialedUrl(value: string): boolean {
  let start = 0;
  while ((start = value.indexOf('://', start)) !== -1) {
    let schemeStart = start;
    while (schemeStart > 0 && /[a-z0-9+.-]/i.test(value[schemeStart - 1])) schemeStart--;
    const schemeValid = schemeStart < start && /[a-z]/i.test(value[schemeStart]);
    let end = start + 3;
    while (end < value.length && !/[\s/?#]/.test(value[end])) {
      if (schemeValid && value[end] === '@' && end > start + 3) return true;
      end++;
    }
    start = Math.max(start + 3, end);
  }
  return false;
}
function jwtLike(value: string): boolean {
  let index = 0;
  while (index < value.length) {
    if (!/[A-Za-z0-9_.-]/.test(value[index])) { index++; continue; }
    const start = index;
    while (index < value.length && /[A-Za-z0-9_.-]/.test(value[index])) index++;
    const parts = value.slice(start, index).split('.');
    for (let part = 0; part + 2 < parts.length; part++) {
      if (parts[part + 1].length < 8 || parts[part + 2].length < 8) continue;
      const segment = parts[part];
      for (let offset = segment.indexOf('eyJ'); offset >= 0; offset = segment.indexOf('eyJ', offset + 3)) {
        if ((offset === 0 || segment[offset - 1] === '-') && segment.length - offset >= 11) return true;
      }
    }
  }
  return false;
}
function secretText(value: string): boolean {
  if (patterns.some(pattern => pattern.test(value)) || credentialedUrl(value) || jwtLike(value)) return true;
  // Scan each assignment once. Adjacent unbounded whitespace regex groups can
  // backtrack quadratically/cubically on an otherwise valid long log field.
  for (const match of value.matchAll(assignmentKey)) {
    let index = match.index! + match[0].length;
    if (value[index] === '"' || value[index] === "'") index++;
    const beforeSpace = index;
    while (index < value.length && /\s/.test(value[index])) index++;
    if (value[index] === '=' || value[index] === ':') index++;
    else if (index === beforeSpace) continue;
    while (index < value.length && /\s/.test(value[index])) index++;
    if (value[index] === '"' || value[index] === "'") index++;
    const start = index;
    while (index < value.length && !/[\s"';,}]/.test(value[index])) index++;
    const candidate = value.slice(start, index);
    if (candidate && !placeholder.test(candidate) && !/^(?:null|none|false|unknown|redacted)$/i.test(candidate)) return true;
  }
  return false;
}
/** Heuristic rejection, never a claim to identify every credential in arbitrary prose. */
export function screenResolutionSecrets(data: unknown, humanReport: string | null): ResolutionIssue[] {
  const found: ResolutionIssue[] = [];
  function add(path: string) { if (found.length < 30) found.push({ path: safeResolutionPath(path), code: 'SECRET_DETECTED', severity: 'error', expected: 'Redacted source evidence', preview: '[REDACTED]' }); }
  function walk(value: unknown, path: string, key = ''): void {
    if (secretText(key)) add(path);
    const sourceFlag = /^\/security\/credentials_(present|redacted)$/.test(path) && (value === null || typeof value === 'boolean');
    if (sensitiveKey.test(key) && !sourceFlag && value !== null && value !== '' && !(typeof value === 'string' && placeholder.test(value.trim()))) add(path);
    if (typeof value === 'string') {
      if (secretText(value)) add(path);
    } else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}/${index}`, key));
    else if (value && typeof value === 'object') for (const [name, child] of Object.entries(value)) walk(child, `${path}/${name}`, name);
  }
  walk(data, '');
  if (humanReport && secretText(humanReport)) add('/humanReport');
  return found;
}
