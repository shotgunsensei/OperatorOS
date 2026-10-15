import type { AiCompletionRequest, AiCompletionResponse, AiProvider } from './ai-provider.js';
import { parseResponsesUsage, type AiMeasuredUsage } from './ai-cost-control.js';

export class AiResponsesError extends Error {
  constructor(readonly code: string, readonly usage?: AiMeasuredUsage) {
    super('OpenAI guidance could not be confirmed');
  }
}

/** Stateless text-only adapter. No stored conversation, tools, fallback, or automatic retry. */
export class OpenAiResponsesProvider implements AiProvider {
  readonly name = 'openai-responses';
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const started = Date.now();
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, instructions: request.systemPrompt,
        input: request.userPrompt, store: false, service_tier: 'default',
        max_output_tokens: request.maxTokens ?? 1200,
        ...(request.jsonSchema ? { text: { format: { type: 'json_schema',
          name: request.jsonSchema.name, strict: true, schema: request.jsonSchema.schema } } }
          : request.responseFormat === 'json' ? { text: { format: { type: 'json_object' } } } : {}),
      }),
      signal: AbortSignal.timeout(Math.max(1000, Math.min(30_000, request.timeoutMs ?? 15_000))),
    });
    if (!response.ok) throw new AiResponsesError(`OPENAI_HTTP_${response.status}`);
    const data = await response.json() as Record<string, any>;
    if (data.model !== this.model || data.service_tier !== 'default') {
      // Different model/tier cannot be reconciled against the approved tariff.
      throw new AiResponsesError('OPENAI_PRICING_SCOPE_UNKNOWN');
    }
    const usage = parseResponsesUsage(data.usage);
    if (data.status !== 'completed' || !Array.isArray(data.output)) {
      throw new AiResponsesError('OPENAI_RESPONSE_INCOMPLETE', usage);
    }
    const parts: string[] = [];
    for (const item of data.output) {
      if (item.type === 'reasoning') continue;
      if (item.type !== 'message' || item.role !== 'assistant' || item.status !== 'completed'
        || !Array.isArray(item.content)) throw new AiResponsesError('OPENAI_RESPONSE_INVALID', usage);
      for (const content of item.content) {
        if (content.type !== 'output_text' || typeof content.text !== 'string') {
          throw new AiResponsesError('OPENAI_RESPONSE_REFUSED', usage);
        }
        parts.push(content.text);
      }
    }
    const text = parts.join('\n');
    if (!text.trim() || text.length > 12_000) throw new AiResponsesError('OPENAI_RESPONSE_INVALID', usage);
    return { text, usage, tokenCount: usage ? usage.inputTokens + usage.outputTokens : 0,
      provider: this.name, model: this.model, version: 'responses-v1', durationMs: Date.now() - started };
  }
}
