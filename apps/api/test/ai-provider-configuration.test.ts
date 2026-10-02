import assert from 'node:assert/strict';
import test from 'node:test';
import { getAiProvider, getProviderInfo } from '../src/lib/ai-provider.js';

test('shared AI provider honors model changes and rotated credentials without a restart', async () => {
  const names = ['NODE_ENV', 'APP_ENV', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPERATOROS_DETERMINISTIC_PROVIDER_MODE'];
  const previous = new Map(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const calls: Array<{ model: string; authorization: string | null }> = [];
  try {
    process.env.NODE_ENV = 'development';
    process.env.APP_ENV = 'development';
    delete process.env.OPERATOROS_DETERMINISTIC_PROVIDER_MODE;
    process.env.OPENAI_API_KEY = 'synthetic-provider-configuration-a';
    process.env.OPENAI_MODEL = 'gpt-4.1-mini';
    globalThis.fetch = (async (_url, options) => {
      const body = JSON.parse(String(options?.body)) as { model: string };
      calls.push({ model: body.model, authorization: new Headers(options?.headers).get('authorization') });
      return Response.json({ choices: [{ message: { content: 'Synthetic answer' } }], usage: { total_tokens: 12 } });
    }) as typeof fetch;
    const request = { systemPrompt: 'Synthetic test', userPrompt: 'Synthetic input' };
    const first = getAiProvider();
    assert.equal((await first.complete(request)).model, 'gpt-4.1-mini');
    assert.equal(getAiProvider(), first);
    process.env.OPENAI_API_KEY = 'synthetic-provider-configuration-b';
    const rotated = getAiProvider();
    assert.notEqual(rotated, first);
    await rotated.complete(request);
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
    assert.equal((await getAiProvider().complete(request)).model, 'gpt-4o-mini');
    assert.deepEqual(calls, [
      { model: 'gpt-4.1-mini', authorization: 'Bearer synthetic-provider-configuration-a' },
      { model: 'gpt-4.1-mini', authorization: 'Bearer synthetic-provider-configuration-b' },
      { model: 'gpt-4o-mini', authorization: 'Bearer synthetic-provider-configuration-b' },
    ]);
    process.env.OPENAI_API_KEY = '   ';
    assert.equal(getAiProvider().name, 'disabled');
    assert.deepEqual(getProviderInfo(), { name: 'disabled', configured: false });
    process.env.NODE_ENV = 'test';
    process.env.APP_ENV = 'test';
    process.env.OPENAI_API_KEY = 'synthetic-provider-configuration-c';
    assert.equal(getAiProvider().name, 'test');
    assert.deepEqual(getProviderInfo(), { name: 'test', configured: false });
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
