import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CallCommandValidationError,
  maskPhone,
  normalizeE164,
  parseChannel,
  parseConsent,
  phoneFingerprint,
  safeProviderError,
} from '../src/lib/callcommand.js';
import { planCallCommandImport } from '../src/lib/callcommand-import.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 11E validates E.164, purpose, expiry, masking, and stable phone fingerprints', () => {
  assert.equal(normalizeE164('+1 (555) 123-4567'), '+15551234567');
  assert.equal(maskPhone('+15551234567'), '+15••••4567');
  assert.equal(phoneFingerprint('+15551234567'), phoneFingerprint('+15551234567'));
  assert.notEqual(phoneFingerprint('+15551234567'), phoneFingerprint('+15551234568'));
  assert.throws(() => normalizeE164('555-1234'), CallCommandValidationError);
  assert.throws(() => parseConsent({
    phone: '+15551234567', purpose: 'marketing', source: 'manual', evidence: 'none',
  }), /purpose is not supported/);
  assert.equal(
    safeProviderError(new Error('Provider rejected +15551234567 with Bearer private-token')),
    'PROVIDER_REQUEST_FAILED',
  );
  assert.equal(safeProviderError({ code: 'TWILIO_21211' }), 'TWILIO_21211');
  assert.throws(() => parseChannel({
    name: 'Unsafe recording line',
    phone: '+15551234567',
    timezone: 'UTC',
    consentScript: 'Consent text',
    recordingEnabled: true,
  }), /jurisdiction-specific consent policy/);
});

test('Phase 11E dry-run import pins provenance and excludes child authority and provider secrets', () => {
  const plan = planCallCommandImport({
    sourceCommit: 'd49434e1d641d62cc141591c7208539a7afbf11e',
    export: { channels: [{}], receptionistProfiles: [{}, {}], callRecords: [{}] },
  });
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.counts.channels, 1);
  assert.equal(plan.counts.receptionistProfiles, 2);
  assert.match(plan.exportSha256, /^[0-9a-f]{64}$/);
  assert.ok(plan.excluded.includes('recording URLs'));
  assert.ok(plan.excluded.includes('demo AI responses'));
  assert.throws(() => planCallCommandImport({ sourceCommit: 'wrong', export: {} }), /pinned source/);
});

test('Phase 11E schema and routes enforce tenant composite keys, consent, suppression, and fail-closed providers', () => {
  const ddl = read('apps/api/src/lib/callcommand-db-init.ts');
  const routes = read('apps/api/src/routes/callcommand-routes.ts');
  for (const table of [
    'callcommand_channels', 'callcommand_profiles', 'callcommand_transfer_targets',
    'callcommand_consents', 'callcommand_suppressions', 'callcommand_calls',
    'callcommand_events', 'callcommand_followups',
  ]) assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(ddl, /FOREIGN KEY \(tenant_id,channel_id\)/);
  assert.match(ddl, /FOREIGN KEY \(tenant_id,consent_id\)/);
  assert.match(ddl, /uq_callcommand_channel_phone_global/);
  assert.match(ddl, /uq_callcommand_suppression_active/);
  assert.match(routes, /requireTenantModuleAccess\('callcommand-ai'\)/);
  assert.match(routes, /requireTenantModuleWriteAccess/);
  assert.match(routes, /CALLCOMMAND_CONSENT_REQUIRED/);
  assert.match(routes, /CALLCOMMAND_SUPPRESSED/);
  assert.match(routes, /CALLCOMMAND_PROVIDER_DISABLED/);
  assert.match(routes, /APP_ENV === 'test'/);
  assert.match(routes, /receiveVerifiedWebhook/);
  assert.match(routes, /provider='twilio' AND id=/);
  assert.match(routes, /callcommand\.twilio\.incoming\.v1/);
  assert.match(routes, /input="dtmf"/);
  assert.match(routes, /call\.disposition\.updated/);
  assert.match(routes, /recording_status='disabled'/);
  assert.doesNotMatch(routes, /RecordingUrl|recording_url|transcript|provider payload/i);
  assert.doesNotMatch(routes, /request\.body.*tenantId/);
});

test('Phase 35 shell supersedes the Phase 11E boundary with persisted live-call controls and honest provider state', () => {
  const shell = read('apps/web/src/components/module-shells/CallCommandWorkspace.tsx');
  assert.match(shell, /moduleShellApi\.callcommand\.productWorkspace/);
  assert.match(shell, /Channels and phone lines/);
  assert.match(shell, /Receptionist profiles/);
  assert.match(shell, /Versioned call flows/);
  assert.match(shell, /Live switchboard/);
  assert.match(shell, /Rules and action dispatch/);
  assert.match(shell, /Twilio setup needed/);
  assert.match(shell, /remain unavailable until an administrator connects Twilio/);
  assert.doesNotMatch(shell, /simulated with a stub|recordingUrl|openExternal\(.*recording/i);
});
