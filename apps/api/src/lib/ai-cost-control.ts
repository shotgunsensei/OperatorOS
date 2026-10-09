import { isOperatorOSProductionArtifactTestEnvironment } from './shared-service-safety.js';

export interface AiMeasuredUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
}

export interface AiPricing {
  currency: 'USD';
  model: string;
  effectiveDate: string;
  inputMicrosPerMillion: number;
  cachedInputMicrosPerMillion: number;
  cacheWriteMicrosPerMillion: number;
  outputMicrosPerMillion: number;
}

export class AiBudgetError extends Error {
  constructor(readonly code: string, readonly statusCode = 503) {
    super(code === 'AI_BUDGET_EXCEEDED'
      ? 'AI guidance has reached its approved budget. Contact your administrator.'
      : code === 'AI_REQUEST_PENDING'
        ? 'This guidance request is pending reconciliation. Do not submit it again.'
        : code === 'AI_REQUEST_FAILED'
          ? 'This request did not produce usable guidance. Contact support or revise the request after review.'
        : 'AI guidance is unavailable until its approved configuration and budget are ready.');
  }
}

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

export function parseResponsesUsage(value: unknown): AiMeasuredUsage | undefined {
  if (!value || typeof value !== 'object') return;
  const usage = value as Record<string, any>;
  const details = usage.input_tokens_details;
  if (!details || !integer(usage.input_tokens) || !integer(usage.output_tokens)
    || !integer(details.cached_tokens) || !integer(details.cache_write_tokens)
    || details.cached_tokens + details.cache_write_tokens > usage.input_tokens) return;
  return { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
    cachedInputTokens: details.cached_tokens, cacheWriteTokens: details.cache_write_tokens };
}

export function priceUsageMicros(usage: AiMeasuredUsage, pricing: AiPricing): number {
  const ordinary = usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens;
  if (![ordinary, usage.inputTokens, usage.outputTokens, usage.cachedInputTokens, usage.cacheWriteTokens,
    pricing.inputMicrosPerMillion, pricing.cachedInputMicrosPerMillion, pricing.cacheWriteMicrosPerMillion,
    pricing.outputMicrosPerMillion].every(integer)) throw new AiBudgetError('AI_USAGE_INVALID');
  const numerator = BigInt(ordinary) * BigInt(pricing.inputMicrosPerMillion)
    + BigInt(usage.cachedInputTokens) * BigInt(pricing.cachedInputMicrosPerMillion)
    + BigInt(usage.cacheWriteTokens) * BigInt(pricing.cacheWriteMicrosPerMillion)
    + BigInt(usage.outputTokens) * BigInt(pricing.outputMicrosPerMillion);
  const result = Number((numerator + 999_999n) / 1_000_000n);
  if (!Number.isSafeInteger(result)) throw new AiBudgetError('AI_USAGE_INVALID');
  return result;
}

export const GUIDANCE_MAX_INPUT_TOKENS = 16_000;
export const GUIDANCE_MAX_OUTPUT_TOKENS = 1_200;

export function reservationMicros(pricing: AiPricing): number {
  // Reserve all input at the most expensive input category, including cache writes.
  return priceUsageMicros({ inputTokens: GUIDANCE_MAX_INPUT_TOKENS,
    outputTokens: GUIDANCE_MAX_OUTPUT_TOKENS, cachedInputTokens: 0, cacheWriteTokens: 0 }, {
    ...pricing, inputMicrosPerMillion: Math.max(pricing.inputMicrosPerMillion,
      pricing.cachedInputMicrosPerMillion, pricing.cacheWriteMicrosPerMillion),
  });
}

export function resolveBudgetedAiConfig(env: NodeJS.ProcessEnv = process.env, now = new Date()): {
  provider: 'openai-responses'; model: string; apiKey: string; pricing: AiPricing;
} {
  if (isOperatorOSProductionArtifactTestEnvironment(env)
    || env.OPERATOROS_AI_SPEND_ENABLED !== '1'
    || env.OPERATOROS_BUDGETED_AI_PROVIDER !== 'openai-responses'
    || !env.OPENAI_API_KEY?.trim() || !env.OPERATOROS_BUDGETED_AI_MODEL?.trim()) {
    throw new AiBudgetError('AI_SPEND_DISABLED');
  }
  let value: AiPricing;
  try { value = JSON.parse(env.OPERATOROS_BUDGETED_AI_PRICING_JSON ?? ''); }
  catch { throw new AiBudgetError('AI_PRICING_INVALID'); }
  const date = value && typeof value.effectiveDate === 'string' ? Date.parse(value.effectiveDate) : NaN;
  if (!value || value.currency !== 'USD' || value.model !== env.OPERATOROS_BUDGETED_AI_MODEL.trim()
    || Object.keys(value).sort().join(',') !== 'cacheWriteMicrosPerMillion,cachedInputMicrosPerMillion,currency,effectiveDate,inputMicrosPerMillion,model,outputMicrosPerMillion'
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.effectiveDate)
    || !Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== value.effectiveDate
    || date > now.getTime() || now.getTime() - date > 30 * 86_400_000
    || ![value.inputMicrosPerMillion, value.cachedInputMicrosPerMillion,
      value.cacheWriteMicrosPerMillion, value.outputMicrosPerMillion].every(v => integer(v) && v <= 1_000_000_000_000)
    || value.inputMicrosPerMillion <= 0 || value.outputMicrosPerMillion <= 0
    || value.cacheWriteMicrosPerMillion < value.inputMicrosPerMillion) throw new AiBudgetError('AI_PRICING_INVALID');
  return { provider: 'openai-responses', model: value.model,
    apiKey: env.OPENAI_API_KEY.trim(), pricing: value };
}
