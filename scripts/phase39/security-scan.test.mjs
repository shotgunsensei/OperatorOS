import assert from 'node:assert/strict';
import test from 'node:test';
import { isCompleteDependencyAudit, passesDependencyPolicy, scanText } from './security-scan.mjs';

test('dependency scan fails closed for empty, malformed, or incomplete audit responses', () => {
  for (const report of [null, {}, { parseError: true }, { advisories: {} }, { metadata: { dependencies: 12, vulnerabilities: { high: 0 } }, advisories: {} }]) {
    assert.equal(isCompleteDependencyAudit(report), false);
  }
  assert.equal(isCompleteDependencyAudit({ metadata: { dependencies: 12, vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical: 0 } }, advisories: {} }), true);
});

test('secret scan detects production credentials without printing the credential', () => {
  const value = `sk_live_${'a'.repeat(24)}`;
  const findings = scanText('config/runtime.env', `STRIPE_SECRET_KEY=${value}`);
  assert.deepEqual(findings.map(finding => finding.rule), ['stripe-live-secret']);
  assert.doesNotMatch(JSON.stringify(findings), new RegExp(value));
});

test('secret scan ignores clearly marked non-secret test placeholders', () => {
  assert.deepEqual(scanText('test/fixture.ts', "const value = 'sk_live_test_placeholder_value_123456789';"), []);
});

test('SAST scan detects dynamic evaluation only on active runtime source', () => {
  assert.equal(scanText('apps/api/src/unsafe.ts', 'eval(input)', true)[0]?.rule, 'dynamic-eval');
  assert.deepEqual(scanText('docs/example.md', 'eval(input)', false), []);
});


test('dependency policy rejects raw high counts even when an advisory is filtered', () => {
  const clean = { metadata: { dependencies: 12, vulnerabilities: { info: 0, low: 0, moderate: 2, high: 0, critical: 0 } }, advisories: {} };
  assert.equal(passesDependencyPolicy(clean, 0, true), true);
  for (const severity of ['high', 'critical']) {
    const affected = structuredClone(clean);
    affected.metadata.vulnerabilities[severity] = 1;
    assert.equal(passesDependencyPolicy(affected, 0, true), false);
  }
  assert.equal(passesDependencyPolicy(clean, 1, true), false);
  assert.equal(passesDependencyPolicy(clean, 0, false), false);
  assert.equal(passesDependencyPolicy({ ...clean, advisories: { unresolved: {} } }, 0, true), false);
  assert.equal(passesDependencyPolicy({}, 0, true), false);
});
