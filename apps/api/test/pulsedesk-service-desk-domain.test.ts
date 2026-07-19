import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoProhibitedPhi,
  assertPulseDeskTicketTransition,
  calculatePulseDeskSlaTargets,
  pulseDeskHumanId,
  pulseDeskSlaProjection,
  pulseDeskText,
  requireNoPhiAcknowledgement,
  PulseDeskServiceDeskError,
} from '../src/lib/pulsedesk-service-desk.js';

function domainError(run: () => unknown): PulseDeskServiceDeskError {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof PulseDeskServiceDeskError);
    return error;
  }
  assert.fail('Expected PulseDeskServiceDeskError');
}

test('PulseDesk rejects patient, clinical, credential, HTML, and unacknowledged payloads without echoing values', () => {
  const marker = 'never-echo-this-value';
  const patientField = domainError(() => assertNoProhibitedPhi({ patientName: marker }));
  assert.equal(patientField.code, 'PULSEDESK_PHI_FIELD_PROHIBITED');
  assert.equal(patientField.field, 'body.patientName');
  assert.doesNotMatch(patientField.message, new RegExp(marker));

  const clinicalText = domainError(() => assertNoProhibitedPhi(`MRN: ${marker}`, 'description'));
  assert.equal(clinicalText.code, 'PULSEDESK_PHI_PROHIBITED');
  assert.equal(clinicalText.field, 'description');
  assert.doesNotMatch(clinicalText.message, new RegExp(marker));

  const secret = domainError(() => assertNoProhibitedPhi({ apiKey: marker }));
  assert.equal(secret.code, 'PULSEDESK_SECRET_FIELD_PROHIBITED');
  assert.doesNotMatch(secret.message, new RegExp(marker));

  const html = domainError(() => pulseDeskText('<strong>unsafe</strong>', 'body', 200, { required: true }));
  assert.equal(html.code, 'PULSEDESK_HTML_PROHIBITED');
  assert.equal(domainError(() => requireNoPhiAcknowledgement({})).code, 'PULSEDESK_PHI_ACKNOWLEDGEMENT_REQUIRED');
  assert.doesNotThrow(() => requireNoPhiAcknowledgement({ phiAcknowledged: true }));
});

test('PulseDesk lifecycle allows resolve, close, and reopen while rejecting invalid jumps', () => {
  assert.doesNotThrow(() => assertPulseDeskTicketTransition('in_progress', 'resolved'));
  assert.doesNotThrow(() => assertPulseDeskTicketTransition('resolved', 'closed'));
  assert.doesNotThrow(() => assertPulseDeskTicketTransition('closed', 'triage'));
  const invalid = domainError(() => assertPulseDeskTicketTransition('new', 'closed'));
  assert.equal(invalid.code, 'PULSEDESK_STATUS_TRANSITION_INVALID');
  assert.equal(invalid.statusCode, 409);
});

test('PulseDesk IDs and SLA projections are deterministic at due, at-risk, overdue, and met states', () => {
  assert.equal(pulseDeskHumanId(42), 'PD-000042');
  const createdAt = new Date('2026-07-18T12:00:00.000Z');
  const targets = calculatePulseDeskSlaTargets(createdAt, 60, 240);
  assert.equal(targets.responseDueAt.toISOString(), '2026-07-18T13:00:00.000Z');
  assert.equal(targets.resolutionDueAt.toISOString(), '2026-07-18T16:00:00.000Z');

  assert.equal(pulseDeskSlaProjection({ createdAt, status: 'new', ...targets, now: new Date('2026-07-18T12:30:00.000Z') }).state, 'due');
  assert.equal(pulseDeskSlaProjection({ createdAt, status: 'new', ...targets, now: new Date('2026-07-18T12:50:00.000Z') }).state, 'at_risk');
  assert.equal(pulseDeskSlaProjection({ createdAt, status: 'new', ...targets, now: new Date('2026-07-18T13:01:00.000Z') }).state, 'overdue');
  assert.equal(pulseDeskSlaProjection({ createdAt, status: 'resolved', ...targets, firstRespondedAt: new Date('2026-07-18T12:20:00.000Z'), resolvedAt: new Date('2026-07-18T14:00:00.000Z'), now: new Date('2026-07-18T15:00:00.000Z') }).state, 'met');
});
