import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCallStateTransition,
  calculateLuhnCheckDigit,
  classifyMspIntake,
  evaluateMspPolicy,
  isValidSupportLinkId,
  issueSupportLinkId,
  parseComponentResult,
  redactMspText,
  supportLinkLookupHmac,
  trustedLineLookupHmac,
  validateActionManifest,
} from '../src/lib/callcommand-msp.js';

process.env.APP_ENV = 'test';
process.env.NODE_ENV = 'test';

test('SupportLink IDs are ten-digit Luhn values and use deterministic keyed indexes', () => {
  assert.equal(calculateLuhnCheckDigit('799273987'), '5');
  for (let index = 0; index < 100; index += 1) {
    const value = issueSupportLinkId();
    assert.match(value, /^\d{10}$/);
    assert.equal(isValidSupportLinkId(value), true);
    assert.equal(isValidSupportLinkId(`${value.slice(0, 9)}${(Number(value[9]) + 1) % 10}`), false);
    assert.equal(supportLinkLookupHmac(value), supportLinkLookupHmac(value));
    assert.match(supportLinkLookupHmac(value), /^[0-9a-f]{64}$/);
  }
  const line = trustedLineLookupHmac('+1 (555) 555-0100');
  assert.equal(line.normalized, '+15555550100');
  assert.equal(line.last4, '0100');
  assert.match(line.hmac, /^[0-9a-f]{64}$/);
});

test('MSP intake classification is deterministic, redacts dangerous values, and escalates security language', () => {
  const printer = classifyMspIntake('My password is hunter2 and the office printer spooler is stuck.');
  assert.equal(printer.intent, 'PASSWORD_RESET');
  assert.doesNotMatch(printer.summary, /hunter2/);
  assert.match(printer.summary, /\[REDACTED\]/);
  const incident = classifyMspIntake('We may have ransomware and compromised credentials on several computers.');
  assert.equal(incident.intent, 'SECURITY_INCIDENT');
  assert.equal(incident.urgencyHint, 'urgent');
  assert.equal(incident.requiresHumanReview, true);
  assert.match(redactMspText('SSN 123-45-6789 and card 4111 1111 1111 1111'), /\[REDACTED_SSN\].*\[REDACTED_NUMBER\]/);
});

test('call state transitions reject bypasses into privileged execution', () => {
  assert.doesNotThrow(() => assertCallStateTransition('RECEIVED', 'PROVIDER_VERIFIED'));
  assert.doesNotThrow(() => assertCallStateTransition('SUPPORT_ID_REQUESTED', 'CONTACT_ASSOCIATED'));
  assert.throws(() => assertCallStateTransition('RECEIVED', 'ACTION_RUNNING'), /Invalid call transition/);
  assert.throws(() => assertCallStateTransition('CONTACT_ASSOCIATED', 'SUCCEEDED'), /Invalid call transition/);
  assert.throws(() => assertCallStateTransition('COMPLETED', 'RECEIVED'), /Invalid call transition/);
});

test('strict policy denies cross-tenant and prohibited accounts before assurance can allow an action', () => {
  const baseline = {
    assuranceLevel: 'A4' as const,
    originatingLine: { matched: true, active: true, cooldownComplete: true },
    contact: { active: true, supportEligible: true, failedAttempts: 0 },
    action: { key: 'identity.password-reset.v1', riskClass: 'R2_DISRUPTIVE_WORKSTATION' as const, requiresConfirmation: true },
    target: { type: 'DIRECTORY_ACCOUNT' as const, organizationMatch: true, class: 'STANDARD' },
    environment: { incidentMode: false, afterHours: false, integrationHealthy: true, automationMode: 'STANDARD' },
    approvals: { managerCount: 0, technicianCount: 1 },
  };
  assert.equal(evaluateMspPolicy({ ...baseline, target: { ...baseline.target, organizationMatch: false } }).decision, 'DENY');
  assert.equal(evaluateMspPolicy({ ...baseline, originatingLine: { matched: false, active: false } }).decision, 'MANUAL_ONLY');
  assert.equal(evaluateMspPolicy({ ...baseline, target: { ...baseline.target, class: 'BREAK_GLASS' } }).decision, 'MANUAL_ONLY');
  assert.equal(evaluateMspPolicy({ ...baseline, environment: { ...baseline.environment, incidentMode: true } }).decision, 'MANUAL_ONLY');
  assert.equal(evaluateMspPolicy({ ...baseline, assuranceLevel: 'A1' }).decision, 'CHALLENGE');
  assert.equal(evaluateMspPolicy(baseline).decision, 'ALLOW');
});

test('action catalog manifests reject arbitrary commands and caller-owned component parameters', () => {
  const base = {
    actionKey: 'workstation.health.collect.v1', displayName: 'Collect workstation health', provider: 'DATTO_RMM',
    componentUid: 'component-accepted-by-admin', componentVersion: '1.0.0', sourceCommit: 'a'.repeat(40),
    riskClass: 'R0_READ_ONLY', allowedDeviceClasses: ['desktop', 'laptop'], allowedOperatingSystems: ['windows'],
    minimumAssurance: 'A2', requiresCallerConfirmation: true, requiresTechnicianApproval: false,
    mustBeOnline: true, allowOfflineQueue: false, expiresAfterSeconds: 300, maximumRuntimeSeconds: 120,
    parameterSchema: { ExecutionId: { type: 'string' }, NotAfterUtc: { type: 'string' } }, resultSchema: 'callcommand.component-result.v1',
  };
  assert.equal(validateActionManifest(base).actionKey, base.actionKey);
  assert.throws(() => validateActionManifest({ ...base, actionKey: 'arbitrary.command.v1' }), /approved versioned key/);
  assert.throws(() => validateActionManifest({ ...base, parameterSchema: { Hostname: { type: 'string' } } }), /system-owned component parameters/);
  assert.throws(() => validateActionManifest({ ...base, provider: 'DATTO_RMM', componentUid: '' }), /componentUid|component UID/);
});

test('component result parsing preserves unknown results instead of inventing provider success', () => {
  const parsed = parseComponentResult({ schema: 'callcommand.component-result.v1', success: true, executionId: 'exec-1', componentVersion: '1.0.0', code: 'OK', summary: 'Health collected', data: {} }, 'exec-1');
  assert.equal(parsed.success, true);
  assert.equal(parsed.code, 'OK');
  assert.throws(() => parseComponentResult('command completed successfully', 'exec-1'), /Component result is invalid/);
  assert.throws(() => parseComponentResult({ schema: 'callcommand.component-result.v1', success: true, executionId: 'wrong' }, 'exec-1'), /binding is invalid/);
});
