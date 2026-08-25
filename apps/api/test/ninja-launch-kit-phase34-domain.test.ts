import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NINJA_LAUNCH_SOURCE_CATALOG,
  catalogForPlan,
  exportProductKit,
  generateDeterministicKit,
  generateVisualPromos,
  isCompleteContent,
  mayUseTemplate,
  type NinjaLaunchInput,
} from '../src/lib/ninja-launch-kit-phase34.js';

function inputFor(template: (typeof NINJA_LAUNCH_SOURCE_CATALOG.templates)[number]): NinjaLaunchInput {
  return { ...template.prefill, brandProfileId: null };
}

test('all 20 compiler-derived source templates produce every nonempty launch artifact', () => {
  assert.equal(NINJA_LAUNCH_SOURCE_CATALOG.templates.length, 20);
  for (const template of NINJA_LAUNCH_SOURCE_CATALOG.templates) {
    const input = inputFor(template);
    const first = generateDeterministicKit(input);
    const second = generateDeterministicKit(input);
    assert.deepEqual(first, second, `${template.slug} generation must be deterministic`);
    assert.equal(isCompleteContent(first), true, `${template.slug} must contain the complete output schema`);
    assert.ok(first.heroHeadline.trim());
    assert.ok(first.googleAds.length);
    assert.ok(first.emailSequence.length);
    assert.ok(first.smsPromos.length);
    assert.ok(first.socialPosts.length);
    assert.ok(first.faq.length);
    assert.ok(first.ctaButtons.length);
    assert.ok(first.qrFlyerCopy.trim());
    assert.ok(first.launchChecklist.length);
  }
});

test('visual promo and template gates expose no locked content', () => {
  const template = NINJA_LAUNCH_SOURCE_CATALOG.templates[0];
  const input = inputFor(template);
  const content = generateDeterministicKit(input);
  const free = generateVisualPromos(input, content, 'free');
  const pro = generateVisualPromos(input, content, 'pro');
  const agency = generateVisualPromos(input, content, 'agency');
  assert.equal(free.length, 9);
  assert.equal(free.filter((brief) => !brief.locked).length, 1);
  assert.equal(free.filter((brief) => brief.locked).every((brief) => brief.brief === ''), true);
  assert.equal(pro.every((brief) => !brief.locked && brief.brief.length > 50), true);
  assert.equal(agency.every((brief) => brief.brief.includes('White-label delivery')), true);
  assert.equal(catalogForPlan('free').filter((item) => item.locked).every((item) => item.prefill === undefined), true);
  assert.equal(mayUseTemplate('free', 'pro'), false);
  assert.equal(mayUseTemplate('agency', 'pro'), true);
});

test('each entitled export format produces complete valid bytes and correct watermark behavior', () => {
  const template = NINJA_LAUNCH_SOURCE_CATALOG.templates[0];
  const input = inputFor(template);
  const content = generateDeterministicKit(input);
  const visuals = generateVisualPromos(input, content, 'agency');
  for (const format of ['txt', 'markdown', 'json'] as const) {
    const result = exportProductKit({ title: template.name, input, content, visuals, plan: 'agency', format });
    assert.ok(result.content.length > 500);
    assert.equal(result.sha256.length, 64);
    if (format === 'json') assert.equal(JSON.parse(result.content).visualPromos.length, 9);
  }
  const free = exportProductKit({ title: template.name, input, content, visuals: generateVisualPromos(input, content, 'free'), plan: 'free', format: 'txt' });
  assert.match(free.content, /Generated with Deploy Ops/);
  assert.doesNotMatch(exportProductKit({ title: template.name, input, content, visuals, plan: 'agency', format: 'txt' }).content, /Generated with Deploy Ops/);
});

test('shared AI output is schema-validated and provider failure records deterministic fallback', async () => {
  process.env.SESSION_SECRET ||= 'operatoros-ninja-launch-kit-phase34-domain-test-v1';
  const { resolveNinjaLaunchContent } = await import('../src/routes/ninja-launch-kit-phase34-routes.js');
  const input = inputFor(NINJA_LAUNCH_SOURCE_CATALOG.templates[0]);
  const validProvider = {
    name: 'contract-test',
    async complete(request: { userPrompt: string }) {
      const deterministic = JSON.parse(request.userPrompt).deterministic;
      return { text: JSON.stringify(deterministic), tokenCount: 50, durationMs: 1, provider: 'contract-test', model: 'schema-v1', version: '1' };
    },
  };
  const refined = await resolveNinjaLaunchContent(input, 'pro', 'ai', validProvider);
  assert.equal(refined.generatorMode, 'ai');
  assert.equal(refined.provider, 'contract-test');
  assert.equal(isCompleteContent(refined.content), true);

  const unavailableProvider = {
    name: 'unavailable-test',
    async complete(): Promise<never> { throw new Error('provider unavailable'); },
  };
  const fallback = await resolveNinjaLaunchContent(input, 'pro', 'auto', unavailableProvider);
  assert.equal(fallback.generatorMode, 'fallback');
  assert.equal(fallback.provider, 'deterministic');
  assert.equal(fallback.fallbackReason, 'provider unavailable');
  assert.equal(isCompleteContent(fallback.content), true);
});
