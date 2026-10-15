import assert from 'node:assert/strict';
import test from 'node:test';
import { parseResponsesUsage, priceUsageMicros, reservationMicros, resolveBudgetedAiConfig,
  type AiPricing } from '../src/lib/ai-cost-control.js';
import { OpenAiResponsesProvider } from '../src/lib/openai-responses-provider.js';
import { validateTechdeckGuidance } from '../src/lib/techdeck-ai-guidance.js';

// Synthetic tariff, not model availability or a production pricing assertion.
const pricing: AiPricing = { model: 'synthetic-model', currency: 'USD', effectiveDate: '2026-10-07',
  inputMicrosPerMillion: 2_000_000, cachedInputMicrosPerMillion: 200_000,
  cacheWriteMicrosPerMillion: 2_500_000, outputMicrosPerMillion: 10_000_000 };

test('cost uses measured ordinary/cache-read/cache-write/output counts once, rounded up', () => {
  const usage = parseResponsesUsage({ input_tokens: 1000, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 },
    output_tokens: 100, output_tokens_details: { reasoning_tokens: 80 } })!;
  assert.equal(priceUsageMicros(usage, pricing), 2790);
  assert.equal(priceUsageMicros({ inputTokens: 1, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0 },
    { ...pricing, inputMicrosPerMillion: 1 }), 1);
  assert.equal(reservationMicros(pricing), 52_000);
});

test('missing, negative, partial, unsafe and overlapping usage remains unknown', () => {
  for (const usage of [undefined, {}, { input_tokens: 0, output_tokens: 0 },
    { input_tokens: -1, output_tokens: 0, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
    { input_tokens: 1, output_tokens: 2, input_tokens_details: { cached_tokens: 1, cache_write_tokens: 1 } },
    { input_tokens: Number.MAX_SAFE_INTEGER + 1, output_tokens: 0, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } }]) {
    assert.equal(parseResponsesUsage(usage), undefined);
  }
});

test('new spend defaults closed; explicit dated model-bound tariffs and credentials are required', () => {
  assert.throws(() => resolveBudgetedAiConfig({}), { code: 'AI_SPEND_DISABLED' });
  const env = { OPERATOROS_AI_SPEND_ENABLED: '1', OPERATOROS_BUDGETED_AI_PROVIDER: 'openai-responses',
    OPENAI_API_KEY: 'synthetic-offline-only', OPERATOROS_BUDGETED_AI_MODEL: pricing.model,
    OPERATOROS_BUDGETED_AI_PRICING_JSON: JSON.stringify(pricing) };
  assert.equal(resolveBudgetedAiConfig(env, new Date('2026-10-07')).model, pricing.model);
  assert.throws(() => resolveBudgetedAiConfig({ ...env, APP_ENV: 'production', NODE_ENV: 'production',
    CI: 'true', OPERATOROS_DETERMINISTIC_PROVIDER_MODE: '1', PARITY_DATABASE_IS_DISPOSABLE: '1',
    DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:5432/operatoros_test' },
  new Date('2026-10-07')), { code: 'AI_SPEND_DISABLED' });
  for (const change of [{ effectiveDate: '2026-08-01' }, { effectiveDate: '2026-11-01' }, { model: 'different-model' },
    { cacheWriteMicrosPerMillion: 1 }, { outputMicrosPerMillion: 0 }, { effectiveDate: '2026-02-30' }]) {
    assert.throws(() => resolveBudgetedAiConfig({ ...env, OPERATOROS_BUDGETED_AI_PRICING_JSON: JSON.stringify({ ...pricing, ...change }) },
      new Date('2026-10-07')), { code: 'AI_PRICING_INVALID' });
  }
});

test('Responses uses stateless structured text, approved standard tier, no tools or temperature', async () => {
  const original = globalThis.fetch;
  const calls: Array<Record<string, any>> = [];
  try {
    globalThis.fetch = (async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      calls.push(JSON.parse(String(options?.body)));
      return Response.json({ model: 'synthetic-model', service_tier: 'default', status: 'completed',
        output: [{ type: 'reasoning' }, { type: 'message', role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text: 'Synthetic guidance' }] }],
        usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 10, cache_write_tokens: 30 } } });
    }) as typeof fetch;
    const result = await new OpenAiResponsesProvider('synthetic-key', 'synthetic-model').complete({
      systemPrompt: 'Synthetic policy', userPrompt: 'Synthetic query', maxTokens: 1200,
      jsonSchema: { name: 'synthetic_schema', schema: { type: 'object' } } });
    assert.equal(result.text, 'Synthetic guidance'); assert.equal(result.tokenCount, 120);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].store, false); assert.equal(calls[0].service_tier, 'default');
    assert.equal(calls[0].max_output_tokens, 1200); assert.equal(calls[0].text.format.strict, true);
    assert.equal(calls[0].tools, undefined); assert.equal(calls[0].temperature, undefined);
    assert.equal(result.usage?.cacheWriteTokens, 30);
  } finally { globalThis.fetch = original; }
});

test('refusal/incomplete responses retain measured usage; HTTP failure never retries or exposes payload', async () => {
  const original = globalThis.fetch;
  try {
    const provider = new OpenAiResponsesProvider('synthetic-key', 'synthetic-model');
    for (const payload of [
      { status: 'incomplete', output: [] },
      { status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'private detail' }] }] },
      { status: 'completed', output: [{ type: 'function_call', name: 'unsafe_action' }] },
    ]) {
      globalThis.fetch = (async () => Response.json({ model: 'synthetic-model', service_tier: 'default',
        usage: { input_tokens: 10, output_tokens: 1, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } }, ...payload })) as typeof fetch;
      await assert.rejects(provider.complete({ systemPrompt: '', userPrompt: 'test' }), (error: any) => {
        assert.equal(error.usage.inputTokens, 10); assert.doesNotMatch(error.message, /private detail/); return true;
      });
    }
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response('private error payload', { status: 429 }); }) as typeof fetch;
    await assert.rejects(provider.complete({ systemPrompt: '', userPrompt: 'test' }), { code: 'OPENAI_HTTP_429' });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('guidance refuses malformed output, execution claims, omitted review and unapproved fields', () => {
  const value = { summary: 'Review the recorded service state.', checks: ['Compare the recorded event times.'],
    reviewRequired: true, executionPerformed: false };
  assert.deepEqual(validateTechdeckGuidance(JSON.stringify(value)), value);
  for (const change of [{ executionPerformed: true }, { reviewRequired: false }, { checks: [] }, { tools: ['run-command'] }, { summary: '' }]) {
    assert.throws(() => validateTechdeckGuidance(JSON.stringify({ ...value, ...change })), { code: 'AI_GUIDANCE_INVALID' });
  }
  assert.throws(() => validateTechdeckGuidance('not json'), { code: 'AI_GUIDANCE_INVALID' });
});
