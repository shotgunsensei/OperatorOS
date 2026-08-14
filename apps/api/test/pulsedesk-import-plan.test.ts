import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPulseDeskImport } from '../src/lib/pulsedesk-import.js';

async function fixture(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(new URL('./fixtures/pulsedesk-export-v1.json', import.meta.url), 'utf8'));
}

test('PulseDesk import dry run is repeatable, reconciles references, aggregates shared targets, and excludes authority', async () => {
  const input = await fixture();
  const first = planPulseDeskImport(input);
  const second = planPulseDeskImport(JSON.parse(JSON.stringify(input)));
  assert.deepEqual(second, first);
  assert.match(first.sourceFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(first.mode, 'dry-run');
  assert.equal(first.readyToApply, true);
  assert.equal(first.errors.length, 0);
  assert.equal(first.reconciliation.referencesMissing, 0);
  assert.equal(first.reconciliation.referencesChecked, first.reconciliation.referencesResolved);
  assert.equal(first.plannedTargetCounts.directory_organizations, 2);
  assert.equal(first.plannedTargetCounts.pulsedesk_requests, 1);
  assert.equal(first.excludedAuthority.users, 1);
  assert.equal(first.excludedAuthority.sessions, 1);
  assert.equal(first.excludedProviderOrSensitive.credentials, 1);
  assert.equal(first.mappings.length, Object.values(first.sourceCounts).reduce((total, count) => total + count, 0)
    - Object.values(first.excludedAuthority).reduce((total, count) => total + count, 0)
    - Object.values(first.excludedProviderOrSensitive).reduce((total, count) => total + count, 0));
});

test('PulseDesk import dry run reports missing mappings and prohibited fields without echoing rejected data', async () => {
  const input = await fixture();
  const marker = 'never-echo-import-value';
  (input.tickets as Array<Record<string, unknown>>)[0].patientName = marker;
  (input.assets as Array<Record<string, unknown>>)[0].siteId = 'missing-site';
  const plan = planPulseDeskImport(input);
  assert.equal(plan.readyToApply, false);
  assert.equal(plan.reconciliation.referencesMissing, 1);
  assert.equal(plan.reconciliation.prohibitedFieldsRejected, 1);
  assert.equal(plan.privacyFindings[0]?.code, 'PULSEDESK_PHI_FIELD_PROHIBITED');
  assert.equal(plan.privacyFindings[0]?.sourceId, 'ticket-1');
  assert.doesNotMatch(JSON.stringify(plan), new RegExp(marker));
});
