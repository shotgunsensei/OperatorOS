import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LAUNCHKIT_ARTIFACT_KINDS,
  LAUNCHKIT_TEMPLATES,
  LaunchKitValidationError,
  calculateLaunchReadiness,
  parseArtifactPatch,
  parseGeneratedArtifacts,
  parseLaunchCreate,
  parseLaunchPatch,
  parseTaskPatch,
} from '../src/lib/ninja-launch-kit.ts';

test('Ninja Launch Kit preserves the 20 source templates without importing child plan authority', () => {
  assert.equal(LAUNCHKIT_TEMPLATES.length, 20);
  assert.ok(LAUNCHKIT_TEMPLATES.some((template) => template.slug === 'auto-repair-shop'));
  assert.ok(LAUNCHKIT_TEMPLATES.some((template) => template.slug === 'cybersecurity-service'));
  assert.equal(new Set(LAUNCHKIT_TEMPLATES.map((template) => template.slug)).size, 20);
  assert.equal(LAUNCHKIT_ARTIFACT_KINDS.length, 8);
});

test('Ninja Launch Kit rejects client authority and validates launch money, channels, colors, and dates', () => {
  assert.throws(
    () => parseLaunchCreate({ title: 'Bad', productType: 'service', tenantId: crypto.randomUUID() }),
    (error: unknown) => error instanceof LaunchKitValidationError && error.field === 'tenantId',
  );
  assert.throws(
    () => parseLaunchCreate({ title: 'Bad', productType: 'service', priceMinor: -1 }),
    (error: unknown) => error instanceof LaunchKitValidationError && error.field === 'priceMinor',
  );
  assert.throws(
    () => parseLaunchCreate({ title: 'Bad', productType: 'service', primaryColor: 'orange' }),
    (error: unknown) => error instanceof LaunchKitValidationError && error.field === 'primaryColor',
  );
  const parsed = parseLaunchCreate({
    title: 'Operator launch',
    productType: 'service',
    templateSlug: 'it-support-msp',
    priceMinor: 12500,
    currency: 'usd',
    channels: ['Email', 'Email', 'LinkedIn'],
    primaryColor: '#f97316',
    targetDate: '2026-08-30',
  });
  assert.deepEqual(parsed.channels, ['Email', 'LinkedIn']);
  assert.equal(parsed.currency, 'USD');
});

test('Ninja Launch Kit lifecycle edits require optimistic versions and valid states', () => {
  assert.equal(parseLaunchPatch({ status: 'active', expectedVersion: 2 }).status, 'active');
  assert.equal(parseTaskPatch({ status: 'complete', expectedVersion: 1 }).status, 'complete');
  assert.equal(parseArtifactPatch({ status: 'review', expectedVersion: 1 }).status, 'review');
  assert.throws(() => parseLaunchPatch({ status: 'live', expectedVersion: 1 }), LaunchKitValidationError);
  assert.throws(() => parseTaskPatch({ status: 'done', expectedVersion: 1 }), LaunchKitValidationError);
  assert.throws(() => parseArtifactPatch({ status: 'approved' }), LaunchKitValidationError);
});

test('Ninja Launch Kit AI output requires every source-aligned artifact and remains parseable review content', () => {
  const artifacts = LAUNCHKIT_ARTIFACT_KINDS.map((kind) => ({
    kind,
    title: `${kind} output`,
    body: `Reviewable ${kind} content`,
  }));
  const parsed = parseGeneratedArtifacts(JSON.stringify({ artifacts }));
  assert.equal(parsed.length, LAUNCHKIT_ARTIFACT_KINDS.length);
  assert.throws(
    () => parseGeneratedArtifacts(JSON.stringify({ artifacts: artifacts.slice(1) })),
    (error: unknown) => error instanceof LaunchKitValidationError && /missing landing/.test(error.message),
  );
});

test('Ninja Launch Kit readiness is evidence-derived and cannot be inflated by a supplied score', () => {
  const launch = {
    audience: 'MSP owners',
    pain_point: 'Scattered launch work',
    positioning: 'One launch command center',
    offer: 'Operator launch package',
    price_minor: 9900,
    channels: ['Email'],
    target_date: '2026-08-30',
    score: 100,
  };
  const result = calculateLaunchReadiness({
    launch,
    tasks: [{ id: 'task-1', title: 'Approve assets', status: 'pending', required: true }],
    artifacts: [{ id: 'artifact-1', title: 'Landing page', status: 'draft', required: true }],
  });
  assert.equal(result.total, 9);
  assert.equal(result.complete, 7);
  assert.equal(result.score, 77);
  assert.equal(result.rules.some((rule) => rule.id === 'task:task-1' && !rule.complete), true);
});
