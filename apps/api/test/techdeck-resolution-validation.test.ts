import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { machineEvidenceTemplate } from '../src/generated/techdeck-resolution-contract.js';
import { parseResolutionJson, validateResolutionExport, ResolutionInputError } from '../src/lib/techdeck-resolution-validation.js';
import { parseResolutionInput, prepareResolutionImport } from '../src/lib/techdeck-resolution-ingestion.js';
import { normalizeResolutionExport } from '../src/lib/techdeck-resolution-normalization.js';

const rawText = readFileSync(new URL('./fixtures/techdeck-resolution-cam-wal-v1.json', import.meta.url), 'utf8');
const fixture = JSON.parse(rawText);
const prepare = (data: unknown) => prepareResolutionImport({ rawText: JSON.stringify(data), humanReport: null, links: {} });

test('screened source remains exact while normalization preserves failure, warning, recovery and pending evidence', () => {
  const result = prepareResolutionImport({ rawText, humanReport: 'Synthetic closeout report.', links: {} });
  assert.equal(result.rawText, rawText);
  assert.equal(result.humanReport, 'Synthetic closeout report.');
  assert.equal(result.counts.commands ?? 0, 0, 'no command transcripts supplied');
  assert.equal(result.rows.filter(row => row.table === 'actions' && row.values.kind === 'failed').length, 1);
  assert.equal(result.rows.filter(row => row.table === 'validations' && row.values.kind === 'pending').length, 2);
  assert.ok(result.rows.some(row => row.table === 'warnings' && String(row.values.description).includes('was followed by')));
  assert.ok(result.rows.some(row => row.table === 'relationships' && row.values.relationship_type === 'RECOVERED_BY'));
  assert.ok(!result.rows.some(row => row.values.relationship_type === 'CAUSED_SIDE_EFFECT'));
  assert.ok(result.warnings.some(warning => warning.code === 'ACTION_REFERENCE_UNRESOLVED'));
  assert.equal(result.rows.filter(row => row.table === 'evidence_links').find(row => row.values.source_evidence_id === 'measurement-3')!.values.numeric_value, 59398270752);
});

test('null-heavy template omits placeholder facts and leaves source confidence unknown', () => {
  const result = prepare(machineEvidenceTemplate);
  for (const table of ['incident_assets', 'actions', 'commands', 'evidence_links', 'side_effects']) assert.equal(result.counts[table] ?? 0, 0, table);
  assert.equal(result.incident.root_cause_confidence, null);
});

test('decoded duplicate keys, malformed JSON, NUL, lone surrogates and unsafe numbers fail without echo', () => {
  for (const raw of ['{"a":1,"\\u0061":2}', '{"a":1,}', '{"x":"\\u0000"}', '{"x":"\\ud800"}', '{"x":1e309}', '{"x":9007199254740993}', '{"x":1e-400}', '{"x":1.0000000000000001}', '{"x":9007199254740991.1}', '{"__proto__":{}}', 'null trailing']) {
    assert.throws(() => parseResolutionJson(raw), error => error instanceof ResolutionInputError && !error.message.includes(raw));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(parseResolutionJson('{"a":"二😀","b":[true,0,null]}'))), { a: '二😀', b: [true, 0, null] });
  assert.deepEqual(JSON.parse(JSON.stringify(parseResolutionJson('[0.125,1e3,1.2e-3,0.30000000000000004,-0]'))), [0.125, 1000, 0.0012, 0.30000000000000004, 0]);
});

test('raw, depth, aggregate arrays, property count, nodes and UTF-8 text have hard limits', () => {
  for (const value of [' '.repeat(1_048_577), '['.repeat(22) + '0' + ']'.repeat(22), JSON.stringify({ a: Array(1001).fill(1), b: Array(1000).fill(1) }), JSON.stringify(Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`k${i}`, i]))), JSON.stringify({ a: '二'.repeat(34_000) })]) assert.throws(() => parseResolutionJson(value), error => error instanceof ResolutionInputError && error.statusCode === 413);
});

test('schema versions, wrong types and server-owned envelope fields fail closed', () => {
  for (const change of [(data: any) => { data.schema_version = '2.0'; }, (data: any) => { data.incident = null; }, (data: any) => { data.commands_scripts = [{ sequence: '1' }]; }]) {
    const copy = structuredClone(fixture); change(copy); assert.throws(() => prepare(copy), ResolutionInputError);
  }
  for (const key of ['tenantId', 'actorUserId', 'securityScreened', 'minimumRole', 'reviewStatus']) assert.throws(() => parseResolutionInput({ rawText, [key]: 'forged' }), ResolutionInputError);
});

test('secrets in nested extensions, commands, keys and human reports are rejected with safe paths', () => {
  const cases = [
    { extra: { password: 'synthetic-only-sensitive' } }, { extra: [{ pwd: 'synthetic-only-sensitive' }] }, { extra: { apiKey: 123456 } }, { extra: { token: { value: 'synthetic-only-sensitive' } } },
    { extra: { note: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz' } },
    { extra: { note: 'eyJabcdefgh.abcdefgh.abcdefgh' } },
    { extra: { note: 'log-eyJabcdefgh.abcdefgh.abcdefgh' } },
    { extra: { note: 'postgresql://test:synthetic-only-sensitive@example.invalid/db' } },
    // Construct the synthetic marker so the repository secret scanner does not
    // mistake this rejection fixture for a committed private-key header.
    { extra: { note: ['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' ') } },
    { extra: { note: 'password=synthetic-only-sensitive' } },
    { extra: { 'password=synthetic-only-sensitive': 'observation' } },
    { commands_scripts: [{ command_or_script: 'curl -H "Authorization: Bearer abcdefghijklmnopqrstuvwxyz" example.invalid' }] },
  ];
  for (const change of cases) assert.throws(() => prepare({ ...fixture, ...change }), error => {
    assert.ok(error instanceof ResolutionInputError);
    assert.equal(error.code, 'RESOLUTION_SECRETS_DETECTED');
    assert.ok(!JSON.stringify(error).includes('synthetic-only-sensitive'));
    assert.ok(!JSON.stringify(error).includes('abcdefghijklmnopqrstuvwxyz'));
    return true;
  });
  assert.throws(() => validateResolutionExport(rawText, 'Password: synthetic-only-sensitive'), ResolutionInputError);
  assert.doesNotThrow(() => prepare({ ...fixture, extra: { password: '[REDACTED]' } }));
});

test('credential screening stays bounded on maximum-length whitespace and token-like fields', () => {
  const script = `import { validateResolutionExport,parseResolutionJson } from './src/lib/techdeck-resolution-validation.ts'; import { machineEvidenceTemplate } from './src/generated/techdeck-resolution-contract.ts'; const source = structuredClone(machineEvidenceTemplate); for (const title of ['password'+' '.repeat(99990),'a'.repeat(100000),'a.'.repeat(50000),'foo://'+'a:'.repeat(49000),'eyJ-'.repeat(25000)]) { source.incident.title=title; validateResolutionExport(JSON.stringify(source)); } let rejected=false; try { parseResolutionJson('0.1'+'0'.repeat(100000)+'1'); } catch { rejected=true; } if (!rejected) throw Error('long numeric literal accepted');`;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined, 'screening must finish within a bounded subprocess deadline');
  assert.equal(result.status, 0, result.stderr);
});

test('unknown fields stay in fingerprinted raw source but never become facts or search projections', () => {
  const source = { ...fixture, extra: { title: 'EXTRA_ONLY_MARKER' }, environment: { ...fixture.environment, extra: 'EXTRA_ONLY_MARKER' }, affected_assets: [{ unknown: 'EXTRA_ONLY_MARKER' }] };
  const result = prepare(source);
  assert.ok(result.rawText.includes('EXTRA_ONLY_MARKER'));
  assert.ok(!JSON.stringify(result.rows).includes('EXTRA_ONLY_MARKER'));
  assert.ok(!JSON.stringify(result.incident).includes('EXTRA_ONLY_MARKER'));
  assert.equal(result.counts.incident_assets ?? 0, 0);
  assert.ok(result.warnings.some(warning => warning.code === 'UNKNOWN_FIELD_RETAINED'));
});

test('semantic fingerprints ignore object ordering and whitespace but bind array order, extensions and human report', () => {
  const source = validateResolutionExport(rawText);
  const reordered = Object.fromEntries(Object.entries(fixture).reverse());
  assert.equal(validateResolutionExport(JSON.stringify(reordered)).fingerprint, source.fingerprint);
  assert.notEqual(validateResolutionExport(JSON.stringify(reordered)).rawSha256, source.rawSha256);
  assert.notEqual(validateResolutionExport(JSON.stringify({ ...fixture, extension: 1 })).fingerprint, source.fingerprint);
  assert.notEqual(validateResolutionExport(rawText, 'Changed report').fingerprint, source.fingerprint);
  const changed = structuredClone(fixture); changed.evidence.reverse(); assert.notEqual(prepare(changed).fingerprint, source.fingerprint);
});

test('ambiguous dates retain source with warning, reverse chronology and oversized indexed fields are rejected', () => {
  const copy = structuredClone(fixture); copy.incident.opened_at = 'next Tuesday';
  assert.equal(prepare(copy).incident.opened_at, null);
  copy.incident.opened_at = '2026-02-30T12:00:00Z'; assert.equal(prepare(copy).incident.opened_at, null);
  for (const timestamp of ['0000-01-01T00:00:00Z', '0001-01-01T00:00:00+14:00', '9999-12-31T23:00:00-14:00']) {
    copy.incident.opened_at = timestamp; assert.equal(prepare(copy).incident.opened_at, null);
  }
  copy.incident.opened_at = '2026-09-26T12:00:00Z'; copy.incident.closed_at = '2026-09-25T12:00:00Z'; assert.throws(() => prepare(copy), ResolutionInputError);
  const long = structuredClone(fixture); long.classification.tags = ['x'.repeat(161)]; assert.throws(() => prepare(long), ResolutionInputError);
});

test('diagnostic commands and ambiguous action labels preserve attribution without invented causal edges', () => {
  const copy = structuredClone(fixture);
  copy.diagnostics[0].command = 'Get-Service camsvc';
  copy.failed_actions.push({ action: copy.successful_actions[0].action });
  const result = prepare(copy);
  assert.equal(result.counts.commands, 1);
  assert.equal(result.rows.find(row => row.table === 'side_effects')!.values.recovery_action_id, null);
  assert.ok(!result.rows.some(row => row.values.relationship_type === 'RECOVERED_BY'));
});

test('large titles are weighted once and aggregate normalized storage has a hard byte cap', () => {
  const copy = structuredClone(fixture); copy.incident.title = 'long title '.repeat(9000); copy.issue.symptoms = Array(1800).fill('synthetic observation');
  const result = prepare(copy);
  const projections = result.rows.filter(row => row.table === 'search_documents');
  assert.equal(projections.reduce((sum, row) => sum + Buffer.byteLength(String(row.values.title)), 0), Buffer.byteLength(copy.incident.title));
  assert.ok(Buffer.byteLength(JSON.stringify(result.rows)) < 8 * 1_048_576);
  const amplified = structuredClone(fixture); amplified.commands_scripts = Array.from({ length: 30 }, () => ({ command_or_script: 'x'.repeat(100000) }));
  assert.throws(() => normalizeResolutionExport(amplified), error => error instanceof ResolutionInputError && error.code === 'RESOLUTION_PROJECTION_LIMIT');
});

test('normalization of maximum multiline fields stays within a subprocess deadline', () => {
  const script = `import { prepareResolutionImport } from './src/lib/techdeck-resolution-ingestion.ts'; import { machineEvidenceTemplate } from './src/generated/techdeck-resolution-contract.ts'; const source = structuredClone(machineEvidenceTemplate); source.incident.title='x\\n'.repeat(50000); source.commands_scripts=[{command_or_script:'x\\n'.repeat(50000)}]; prepareResolutionImport({rawText:JSON.stringify(source),humanReport:null,links:{}});`;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined, 'multiline normalization must finish within a bounded subprocess deadline');
  assert.equal(result.status, 0, result.stderr);
});
