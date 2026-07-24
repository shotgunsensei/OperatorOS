import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BrandForgeValidationError,
  parseBrandInput,
  parseCalendarInput,
  parseCampaignInput,
  parseGenerationInput,
  parseMetricInput,
  parseWorkspaceSettings,
} from '../src/lib/brandforgeos.ts';

test('BrandForgeOS validators reject browser authority, unknown fields, and invalid lifecycle data', () => {
  assert.throws(
    () => parseBrandInput({ name: 'Brand', tenantId: 'browser-tenant' }, 'create'),
    (error: unknown) => error instanceof BrandForgeValidationError && error.field === 'tenantId',
  );
  assert.throws(
    () => parseCampaignInput({ name: 'Campaign', startAt: '2026-08-02', endAt: '2026-08-01' }, 'create'),
    /endAt must not precede startAt/,
  );
  assert.throws(
    () => parseCalendarInput({ expectedVersion: 1, scheduledAt: null }, 'patch'),
    /scheduledAt cannot be cleared/,
  );
  assert.throws(
    () => parseMetricInput({ campaignId: '26b96620-2ba0-4cd1-9ee8-6ae6ee326b37', metricDate: '2026-07-23', impressions: 5, clicks: 6 }),
    /clicks cannot exceed impressions/,
  );
});

test('BrandForgeOS generation and settings contracts are bounded and explicit', () => {
  const generation = parseGenerationInput({
    type: 'copy',
    idempotencyKey: 'copy-request-0001',
    prompt: 'Write a concise launch message for a real operator workflow.',
    tone: 'direct',
  });
  assert.equal(generation.type, 'copy');
  assert.equal(generation.idempotencyKey, 'copy-request-0001');
  assert.throws(
    () => parseGenerationInput({ type: 'image', idempotencyKey: 'image-request-0001', prompt: 'Generate unsupported output.' }),
    /type must be copy, strategy, or campaign_ideas/,
  );
  assert.throws(
    () => parseGenerationInput({ type: 'copy', idempotencyKey: 'short', prompt: 'Long enough prompt text.' }),
    /idempotencyKey is invalid/,
  );

  const settings = parseWorkspaceSettings({
    expectedVersion: 0,
    completed: true,
    industry: 'Managed services',
    goals: ['Qualified pipeline'],
    channels: ['Email'],
  }, 'patch');
  assert.equal(settings.expectedVersion, 0);
  assert.equal(settings.profile.industry, 'Managed services');
  assert.deepEqual(settings.profile.goals, ['Qualified pipeline']);
});

test('BrandForgeOS create and patch parsers preserve required and optimistic-concurrency fields', () => {
  const campaign = parseCampaignInput({
    name: 'Operator launch',
    channels: ['Email', 'LinkedIn'],
    budgetCents: 25_000,
  }, 'create');
  assert.equal(campaign.name, 'Operator launch');
  assert.equal(campaign.status, 'draft');
  assert.deepEqual(campaign.channels, ['Email', 'LinkedIn']);

  const patch = parseBrandInput({
    expectedVersion: 2,
    primaryColor: '#EF4444',
  }, 'patch');
  assert.equal(patch.expectedVersion, 2);
  assert.equal(patch.primaryColor, '#EF4444');
  assert.throws(() => parseBrandInput({ expectedVersion: 1 }, 'patch'), /At least one field/);
});
