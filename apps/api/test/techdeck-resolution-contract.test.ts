import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as storageSchema from '../src/techdeck-resolution-schema.js';
import { resolutionStorageTables, resolutionStorageConstraints, resolutionStorageIndexes } from '../src/generated/techdeck-resolution-storage.js';
import { machineEvidenceExportSchema, type MachineEvidenceExport } from '../../../packages/sdk/src/techdeck-resolution.js';
import { machineEvidenceTemplate, ticketCompletionPrompt, ticketCompletionPromptSha256, ticketCompletionShortcut } from '../src/generated/techdeck-resolution-contract.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/techdeck-resolution-cam-wal-v1.json', import.meta.url), 'utf8')) as MachineEvidenceExport;

async function validate(payload: unknown) {
  const app = Fastify({ ajv: { customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false, allowUnionTypes: true } } });
  app.post('/contract-only', { schema: { body: structuredClone(machineEvidenceExportSchema) } }, async request => request.body);
  try { return await app.inject({ method: 'POST', url: '/contract-only', payload }); }
  finally { await app.close(); }
}

test('canonical prompt, shortcut, JSON contract and generated storage are packaged without drift', () => {
  for (const script of ['generate-resolution-contract.mjs', 'generate-resolution-storage.mjs']) {
    const result = spawnSync(process.execPath, [resolve(root, 'scripts/techdeck', script)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(ticketCompletionPrompt, readFileSync(resolve(root, 'docs/prompts/MSP_RESOLUTION_CLOSEOUT_PROMPT.md'), 'utf8').replace(/\r\n/g, '\n'));
  assert.equal(ticketCompletionPromptSha256, createHash('sha256').update(ticketCompletionPrompt).digest('hex'));
  assert.ok(ticketCompletionShortcut.includes('Run Ticket Completion Prompt'));
  assert.deepEqual(Object.keys(machineEvidenceTemplate), Object.keys(machineEvidenceExportSchema.properties));
  assert.equal((ticketCompletionPrompt.match(/^\d+\. /gm) ?? []).length, 17);
});

test('Drizzle exposes every release table, named constraint and index without dropping tenant keys', () => {
  const actual = Object.values(storageSchema).map(table => getTableConfig(table));
  for (const required of resolutionStorageTables) {
    const config = actual.find(table => table.name === required.name)!;
    assert.ok(config, required.name);
    assert.deepEqual(config.columns.map(column => column.name), Object.keys(required.columns));
    const constraints = [...config.checks.map(c => c.name), ...config.uniqueConstraints.map(c => c.name), ...config.foreignKeys.map(c => c.getName())];
    assert.deepEqual(constraints.sort(), resolutionStorageConstraints.filter(c => c.table === required.name).map(c => c.name).sort());
    assert.deepEqual(config.indexes.map(i => i.config.name).sort(), resolutionStorageIndexes.filter(i => i.table === required.name).map(i => i.name).sort());
  }
});

test('formal schema accepts the exact null-heavy canonical template and synthetic CAM evidence', async () => {
  assert.equal((await validate(machineEvidenceTemplate)).statusCode, 200);
  const response = await validate(fixture);
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), fixture, 'validation must not coerce or strip source evidence');
  assert.equal(fixture.commands_scripts.length, 0, 'the source provides no exact commands to fabricate');
  assert.ok(fixture.knowledge.warnings?.[0].includes('was followed by'));
  assert.ok(fixture.validation.pending?.length);
});

test('version, required envelope, scalar types, confidence and bounded arrays fail closed', async () => {
  for (const mutate of [
    (f: any) => { f.schema_version = '2.0'; },
    (f: any) => { delete f.incident; },
    (f: any) => { f.classification.automation_candidate = 'true'; },
    (f: any) => { f.root_cause.confidence = 'CERTAIN'; },
    (f: any) => { f.commands_scripts = [{ sequence: -1 }]; },
    (f: any) => { f.issue.symptoms = Array(2001).fill('symptom'); },
    (f: any) => { f.incident.title = 'x'.repeat(100001); },
    (f: any) => { f.automation_opportunity.estimated_time_savings_minutes = -1; },
  ]) {
    const copy = structuredClone(fixture); mutate(copy);
    assert.equal((await validate(copy)).statusCode, 400);
  }
});

test('optional unknowns and forward extensions survive schema validation for later screening', async () => {
  const copy: any = structuredClone(fixture);
  delete copy.incident.opened_at;
  copy.extension = { sourceLabel: 'untrusted extension' };
  copy.commands_scripts = [{ command_or_script: 'Write-Output "first"\nWrite-Output "二"', destructive: null }];
  const result = await validate(copy);
  assert.equal(result.statusCode, 200, result.body);
  assert.deepEqual(result.json(), copy);
  // This is structure validation only; a passing schema is never secret-screening approval.
});
