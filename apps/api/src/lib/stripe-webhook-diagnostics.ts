export const STRIPE_WEBHOOK_FAILURE_STAGES = [
  'signature_verification', 'credit_classification', 'credit_receipt',
  'credit_dispatch_record', 'event_classification', 'event_claim',
  'event_processing', 'event_status_update', 'unknown',
] as const;
export type StripeWebhookFailureStage = typeof STRIPE_WEBHOOK_FAILURE_STAGES[number];

export const STRIPE_WEBHOOK_ERROR_CATEGORIES = [
  'signature', 'database', 'provider_authentication', 'provider_request',
  'transport', 'billing_validation', 'unknown',
] as const;
type StripeWebhookErrorCategory = typeof STRIPE_WEBHOOK_ERROR_CATEGORIES[number];

// Inspect only own data properties. Never read/serialize messages, stacks,
// SQL, provider response bodies, identifiers or accessors on an exception.
function ownData(value: object, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function category(error: unknown): StripeWebhookErrorCategory {
  const seen = new Set<object>();
  let current = error;
  for (let depth = 0; depth < 4 && current !== null && typeof current === 'object'; depth++) {
    if (seen.has(current)) break;
    seen.add(current);
    const type = ownData(current, 'type');
    const name = ownData(current, 'name');
    const code = ownData(current, 'code');
    if (type === 'StripeSignatureVerificationError' || name === 'StripeSignatureVerificationError') return 'signature';
    if (type === 'StripeAuthenticationError' || type === 'StripePermissionError') return 'provider_authentication';
    if (type === 'StripeConnectionError' || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(code as string)) return 'transport';
    if (['StripeInvalidRequestError', 'StripeAPIError', 'StripeRateLimitError', 'StripeIdempotencyError'].includes(type as string)) return 'provider_request';
    if (typeof code === 'string' && /^(08|23|28|40|42|53|54|55|57|58|XX)[A-Z0-9]{3}$/.test(code)) return 'database';
    if (typeof code === 'string' && /^TORQUE_(PAYMENT|TOKEN|CREDIT)_[A-Z_]+$/.test(code)) return 'billing_validation';
    current = ownData(current, 'cause');
  }
  return 'unknown';
}

export function stripeWebhookFailureDiagnostic(stage: StripeWebhookFailureStage, error: unknown) {
  return {
    code: 'WEBHOOK_REJECTED' as const,
    stage: STRIPE_WEBHOOK_FAILURE_STAGES.includes(stage) ? stage : 'unknown' as const,
    category: category(error),
  };
}
