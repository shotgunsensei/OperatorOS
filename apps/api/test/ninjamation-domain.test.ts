import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NinjamationValidationError,
  analyzeScript,
  parseGeneratedScript,
  parseGeneration,
  parseScriptCreate,
  parseScriptPatch,
  safeFileName,
} from '../src/lib/ninjamation.ts';

test('Ninjamation rejects client-supplied authority and validates script formats', () => {
  assert.throws(
    () => parseScriptCreate({
      name: 'Bad',
      language: 'powershell',
      content: 'Write-Output "ok"',
      tenantId: crypto.randomUUID(),
    }),
    (error: unknown) =>
      error instanceof NinjamationValidationError && error.field === 'tenantId',
  );
  assert.throws(
    () => parseScriptCreate({ name: 'Bad', language: 'javascript', content: 'ok' }),
    (error: unknown) =>
      error instanceof NinjamationValidationError && error.field === 'language',
  );
  const parsed = parseScriptCreate({
    name: 'Inventory report',
    language: 'powershell',
    category: 'Inventory',
    riskTier: 'low',
    content: 'Get-ComputerInfo',
  });
  assert.equal(parsed.language, 'powershell');
  assert.equal(parsed.category, 'Inventory');
  assert.equal(safeFileName('Inventory / report', parsed.language), 'Inventory-report.ps1');
});

test('Ninjamation updates require optimistic versions and actual editable content', () => {
  assert.equal(parseScriptPatch({ expectedVersion: 2, name: 'Revised' }).expectedVersion, 2);
  assert.throws(() => parseScriptPatch({ name: 'Missing version' }), NinjamationValidationError);
  assert.throws(() => parseScriptPatch({ expectedVersion: 1 }), NinjamationValidationError);
  assert.throws(
    () => parseScriptPatch({ expectedVersion: 1, status: 'approved' }),
    (error: unknown) =>
      error instanceof NinjamationValidationError && error.field === 'status',
  );
});

test('Ninjamation static analysis blocks high-confidence execution hazards without executing code', () => {
  const safe = analyzeScript('param([string]$Path)\nGet-Item -LiteralPath $Path');
  assert.equal(safe.criticalCount, 0);
  assert.match(safe.contentSha256, /^[0-9a-f]{64}$/);

  const unsafe = analyzeScript('powershell -EncodedCommand ZQB2AGkAbAA=\nInvoke-Expression $payload');
  assert.equal(unsafe.criticalCount, 2);
  assert.ok(unsafe.findings.some((finding) => finding.code === 'ENCODED_COMMAND'));
  assert.ok(unsafe.findings.some((finding) => finding.code === 'DYNAMIC_CODE_EXECUTION'));
});

test('Ninjamation AI input is bounded and provider output must be structured script JSON', () => {
  const request = parseGeneration({
    idempotencyKey: 'ninjamation-test-001',
    prompt: 'List a supplied directory and fail clearly when it is missing.',
    language: 'python',
  });
  assert.equal(request.language, 'python');
  assert.equal(
    parseGeneratedScript(JSON.stringify({
      name: 'Directory inventory',
      description: 'Lists a validated path',
      content: 'from pathlib import Path\nprint(Path.cwd())',
    })).name,
    'Directory inventory',
  );
  assert.throws(() => parseGeneratedScript('not-json'), NinjamationValidationError);
});
