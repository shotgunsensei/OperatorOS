import contract from '../../../../config/production-environment.contract.json' with { type: 'json' };

export const BILLING_WEBHOOK_SIGNING_ENV = contract.billingWebhookSigning.envKey;
const signingPattern = new RegExp(contract.billingWebhookSigning.pattern);
type BindingStatus = Readonly<{
  configured: boolean;
  errorCode: 'BILLING_WEBHOOK_BINDING_MISSING' | 'BILLING_WEBHOOK_BINDING_INVALID' | null;
}>;

/** Metadata only. Never return, normalize, log or hash an input value. */
export function inspectBillingWebhookBinding(env: Record<string, string | undefined>): BindingStatus {
  const value = env[BILLING_WEBHOOK_SIGNING_ENV];
  if (value === undefined) return Object.freeze({ configured: false, errorCode: 'BILLING_WEBHOOK_BINDING_MISSING' });
  if (typeof value !== 'string' || !signingPattern.test(value)) {
    return Object.freeze({ configured: false, errorCode: 'BILLING_WEBHOOK_BINDING_INVALID' });
  }
  return Object.freeze({ configured: true, errorCode: null });
}

export class BillingWebhookBindingError extends Error {
  readonly code = 'BILLING_WEBHOOK_BINDING_NOT_READY';
  readonly statusCode = 503;
  constructor() {
    super('Billing checkout is temporarily unavailable because webhook verification is not configured. Contact support.');
    this.name = 'BillingWebhookBindingError';
  }
}

/** One server-only snapshot shared by SDK verification and provider readiness. */
export function captureBillingWebhookBinding(env: Record<string, string | undefined>) {
  const value = env[BILLING_WEBHOOK_SIGNING_ENV];
  const status = inspectBillingWebhookBinding({ [BILLING_WEBHOOK_SIGNING_ENV]: value });
  return Object.freeze({
    status: () => status,
    assertReady() { if (!status.configured) throw new BillingWebhookBindingError(); },
    async assertReadyOrSubscriptionReduction(
      subscriptionId: string,
      requested: ReadonlyArray<{ itemId: string | null; quantity: number }>,
      retrieve: () => Promise<unknown>,
    ): Promise<void> {
      if (status.configured || requested.every(item => item.quantity === 0)) return;
      if (!subscriptionId || requested.some(item => item.quantity > 0 && !item.itemId)) {
        throw new BillingWebhookBindingError();
      }
      // A previous provider update may outlive local rollback or settlement.
      // Only an existing, unambiguous provider quantity can authorize reduction.
      try {
        const subscription = await retrieve() as {
          id?: unknown; pending_update?: unknown;
          items?: { has_more?: unknown; data?: Array<{ id?: unknown; quantity?: unknown }> };
        } | null;
        if (!subscription || subscription.id !== subscriptionId
          || subscription.pending_update != null || subscription.items?.has_more !== false
          || !Array.isArray(subscription.items.data)) throw new BillingWebhookBindingError();
        for (const item of requested) {
          if (item.quantity === 0 && !item.itemId) continue;
          const matches = subscription.items.data.filter(existing => existing.id === item.itemId);
          const quantity = matches[0]?.quantity;
          if (matches.length !== 1 || typeof quantity !== 'number'
            || !Number.isSafeInteger(quantity) || quantity < item.quantity) {
            throw new BillingWebhookBindingError();
          }
        }
      } catch {
        // Suppress provider errors; they may contain account/request details.
        throw new BillingWebhookBindingError();
      }
    },
    signingSecret(): string {
      if (!status.configured || typeof value !== 'string') throw new BillingWebhookBindingError();
      return value;
    },
  });
}

// The inherited generic STRIPE_WEBHOOK_SECRET is deliberately never consulted.
// This env-key selection does not attest Account/workspace/deployment provenance.
const captured = captureBillingWebhookBinding(process.env);
export const billingWebhookBindingStatus = captured.status;
export const assertBillingWebhookBindingReady = captured.assertReady;
export const billingWebhookSigningSecret = captured.signingSecret;

export const assertBillingWebhookBindingOrSubscriptionReduction = captured.assertReadyOrSubscriptionReduction;
