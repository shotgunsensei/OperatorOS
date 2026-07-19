export type TradeFlowKitPaymentProviderStatus =
  | { kind: 'test'; configured: true; reason: null }
  | { kind: 'disabled'; configured: false; reason: string };

export interface TradeFlowKitPaymentSession {
  provider: 'test';
  providerReference: string;
  checkoutUrl: string;
}
export interface TradeFlowKitPaymentProvider {
  readonly status: TradeFlowKitPaymentProviderStatus;
  createSession(input: {
    tenantId: string;
    invoiceId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<TradeFlowKitPaymentSession>;
}

class TestTradeFlowKitPaymentProvider implements TradeFlowKitPaymentProvider {
  readonly status = { kind: 'test', configured: true, reason: null } as const;

  async createSession(input: {
    tenantId: string;
    invoiceId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<TradeFlowKitPaymentSession> {
    const reference = Buffer.from(`${input.tenantId}:${input.invoiceId}:${input.idempotencyKey}`)
      .toString('base64url').slice(0, 80);
    return {
      provider: 'test',
      providerReference: `tfk_test_${reference}`,
      checkoutUrl: `https://payments.test/operatoros/${encodeURIComponent(input.invoiceId)}?ref=${encodeURIComponent(reference)}`,
    };
  }
}

class DisabledTradeFlowKitPaymentProvider implements TradeFlowKitPaymentProvider {
  readonly status = {
    kind: 'disabled',
    configured: false,
    reason: 'Customer payment processing is disabled until a reviewed centralized provider adapter is configured.',
  } as const;

  async createSession(): Promise<TradeFlowKitPaymentSession> {
    throw Object.assign(new Error(this.status.reason), { code: 'TRADEFLOWKIT_PAYMENT_PROVIDER_DISABLED' });
  }
}

export function getTradeFlowKitPaymentProvider(
  env: Record<string, string | undefined> = process.env,
): TradeFlowKitPaymentProvider {
  if (env.NODE_ENV === 'test' && env.TRADEFLOWKIT_PAYMENT_PROVIDER === 'test') {
    return new TestTradeFlowKitPaymentProvider();
  }
  return new DisabledTradeFlowKitPaymentProvider();
}
