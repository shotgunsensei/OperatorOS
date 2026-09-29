import { isOperatorOSTestEnvironment, isOperatorOSDeterministicProviderTestEnvironment } from './shared-service-safety.js';

export type EmbeddingIdentity = { provider: string; model: string; dimensions: number };
export interface EmbeddingProvider {
  identity: EmbeddingIdentity;
  state: 'configured' | 'test';
  embed(text: string): Promise<{ vector: number[]; inputTokens: number }>;
}
export class EmbeddingError extends Error {
  constructor(readonly code: string) { super(code); }
}
let testAdapter: EmbeddingProvider | null = null;
export function setEmbeddingProviderForTests(adapter: EmbeddingProvider | null) {
  if (!isOperatorOSDeterministicProviderTestEnvironment()) throw new EmbeddingError('EMBEDDING_TEST_OVERRIDE_FORBIDDEN');
  testAdapter = adapter;
}
export function validateEmbeddingVector(value: unknown, dimensions: number): number[] {
  if (!Array.isArray(value) || value.length !== dimensions || !value.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e10) || !value.some(n => n !== 0)) throw new EmbeddingError('EMBEDDING_RESPONSE_INVALID');
  return value;
}
/** Fixed provider endpoint; no caller-supplied URL, credentials, model or dimensions. */
export function createOpenAiEmbeddingProvider(identity: EmbeddingIdentity, apiKey: string, transport: typeof fetch = fetch): EmbeddingProvider {
  return { identity, state: 'configured', async embed(text) {
    // A Unicode codepoint uses at most four UTF-8 bytes; this bound is also below
    // the model's token ceiling even for adversarially tokenized input.
    if (!text.trim() || Buffer.byteLength(text) > 6000) throw new EmbeddingError('EMBEDDING_INPUT_INVALID');
    let response: Response;
    try {
      response = await transport('https://api.openai.com/v1/embeddings', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: identity.model, dimensions: identity.dimensions, input: text, encoding_format: 'float' }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch { throw new EmbeddingError('EMBEDDING_PROVIDER_UNAVAILABLE'); }
    if (!response.ok) throw new EmbeddingError(response.status === 429 ? 'EMBEDDING_PROVIDER_RATE_LIMIT' : 'EMBEDDING_PROVIDER_FAILED');
    // Never log or reflect provider response bodies, which may contain input.
    const raw = await response.text();
    if (raw.length > 200_000) throw new EmbeddingError('EMBEDDING_RESPONSE_INVALID');
    let value: { model?: string; data?: Array<{ index: number; embedding: unknown }>; usage?: { prompt_tokens: number } };
    try { value = JSON.parse(raw); } catch { throw new EmbeddingError('EMBEDDING_RESPONSE_INVALID'); }
    if (value.model !== identity.model || value.data?.length !== 1 || value.data[0].index !== 0 || !Number.isSafeInteger(value.usage?.prompt_tokens) || Number(value.usage?.prompt_tokens) <= 0) throw new EmbeddingError('EMBEDDING_RESPONSE_INVALID');
    return { vector: validateEmbeddingVector(value.data[0].embedding, identity.dimensions), inputTokens: value.usage!.prompt_tokens };
  } };
}
export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (isOperatorOSDeterministicProviderTestEnvironment()) return testAdapter;
  if (isOperatorOSTestEnvironment() || process.env.OPERATOROS_DETERMINISTIC_PROVIDER_MODE === '1') return null;
  const model = process.env.TECHDECK_EMBEDDING_MODEL;
  const dimensions = Number(process.env.TECHDECK_EMBEDDING_DIMENSIONS);
  if (process.env.TECHDECK_EMBEDDINGS_ENABLED !== '1' || !process.env.OPENAI_API_KEY || !['text-embedding-3-small', 'text-embedding-3-large'].includes(model ?? '') || !Number.isInteger(dimensions) || dimensions < 256 || dimensions > (model === 'text-embedding-3-large' ? 3072 : 1536)) return null;
  return createOpenAiEmbeddingProvider({ provider: 'openai', model: model!, dimensions }, process.env.OPENAI_API_KEY);
}
