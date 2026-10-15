import assert from 'node:assert/strict';
import test from 'node:test';
import { getAiProvider, getProviderInfo } from '../src/lib/ai-provider.js';
import { getSharedAiProviderAdapter } from '../src/lib/shared-provider-adapters.js';

test('new Responses configuration does not change legacy completion selection, request or response contracts', async () => {
  const names = ['APP_ENV', 'NODE_ENV', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPERATOROS_AI_SPEND_ENABLED',
    'OPERATOROS_BUDGETED_AI_PROVIDER', 'OPERATOROS_BUDGETED_AI_MODEL'];
  const previous = new Map(names.map(name => [name, process.env[name]]));
  const original = globalThis.fetch;
  let calls = 0;
  try {
    Object.assign(process.env, { APP_ENV: 'development', NODE_ENV: 'development',
      OPENAI_API_KEY: 'synthetic-legacy-compatibility-only', OPENAI_MODEL: 'synthetic-legacy-model',
      OPERATOROS_AI_SPEND_ENABLED: '1', OPERATOROS_BUDGETED_AI_PROVIDER: 'openai-responses',
      OPERATOROS_BUDGETED_AI_MODEL: 'synthetic-responses-model' });
    globalThis.fetch = (async (url, options) => {
      calls++; assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      assert.deepEqual(JSON.parse(String(options?.body)), {
        model: 'synthetic-legacy-model', messages: [{ role: 'system', content: 'Synthetic system' },
          { role: 'user', content: 'Synthetic query' }], max_tokens: 17, temperature: 0.1,
        response_format: { type: 'json_object' },
      });
      return Response.json({ choices: [{ message: { content: '{"result":"synthetic"}' } }], usage: { total_tokens: 9 } });
    }) as typeof fetch;
    assert.equal(getAiProvider().name, 'openai');
    const adapter = getSharedAiProviderAdapter();
    assert.deepEqual(adapter.status, { kind: 'ai', name: 'openai', state: 'configured' });
    const result = await adapter.complete({ systemPrompt: 'Synthetic system', userPrompt: 'Synthetic query',
      maxTokens: 17, temperature: 0.1, responseFormat: 'json' });
    assert.equal(result.text, '{"result":"synthetic"}'); assert.equal(result.tokenCount, 9);
    assert.equal(result.provider, 'openai'); assert.equal(result.model, 'synthetic-legacy-model');
    assert.equal(result.version, 'chat-completions-v1'); assert.equal(result.usage, undefined);
    delete process.env.OPENAI_API_KEY;
    assert.deepEqual(getProviderInfo(), { name: 'disabled', configured: false });
    await assert.rejects(getAiProvider().complete({ systemPrompt: '', userPrompt: '' }), { code: 'AI_PROVIDER_DISABLED' });
    process.env.APP_ENV = 'test'; process.env.NODE_ENV = 'test';
    assert.deepEqual(getSharedAiProviderAdapter().status, { kind: 'ai', name: 'test', state: 'test' });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
    for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
