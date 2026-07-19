import { getAiProvider, getProviderInfo, type AiCompletionRequest, type AiCompletionResponse } from './ai-provider.js';
import { resolveTelephonyConfig } from './telephony.js';
import { isOperatorOSTestEnvironment } from './shared-service-safety.js';

export type ProviderKind = 'email' | 'sms' | 'payments' | 'ai';
export type ProviderState = 'configured' | 'disabled' | 'test';

export interface ProviderStatus {
  kind: ProviderKind;
  name: string;
  state: ProviderState;
}

export class ProviderDisabledError extends Error {
  readonly code = 'PROVIDER_DISABLED';
  constructor(readonly providerKind: ProviderKind) {
    super(`${providerKind} provider is disabled`);
    this.name = 'ProviderDisabledError';
  }
}

export interface OutboundMessageInput {
  destination: string;
  subject?: string | null;
  body: string;
  idempotencyKey: string;
}

export interface OutboundMessageResult {
  providerMessageId: string;
}

export interface OutboundProviderAdapter {
  readonly status: ProviderStatus;
  send(input: OutboundMessageInput): Promise<OutboundMessageResult>;
}

export interface PaymentProviderAdapter {
  readonly status: ProviderStatus;
  verifyWebhook(rawBody: string | Buffer, signature: string): Promise<unknown>;
}

export interface SharedAiProviderAdapter {
  readonly status: ProviderStatus;
  complete(input: AiCompletionRequest): Promise<AiCompletionResponse>;
}

class DisabledOutboundAdapter implements OutboundProviderAdapter {
  readonly status: ProviderStatus;
  constructor(kind: 'email' | 'sms') {
    this.status = { kind, name: 'disabled', state: 'disabled' };
  }
  async send(): Promise<OutboundMessageResult> {
    throw new ProviderDisabledError(this.status.kind);
  }
}

class TestOutboundAdapter implements OutboundProviderAdapter {
  readonly status: ProviderStatus;
  constructor(kind: 'email' | 'sms') {
    this.status = { kind, name: 'deterministic-test', state: 'test' };
  }
  async send(input: OutboundMessageInput): Promise<OutboundMessageResult> {
    return { providerMessageId: `test:${this.status.kind}:${input.idempotencyKey}` };
  }
}

class ResendEmailAdapter implements OutboundProviderAdapter {
  readonly status: ProviderStatus = { kind: 'email', name: 'resend', state: 'configured' };
  async send(input: OutboundMessageInput): Promise<OutboundMessageResult> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM || process.env.INVITE_FROM_EMAIL;
    if (!apiKey || !from) throw new ProviderDisabledError('email');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        from,
        to: [input.destination],
        subject: input.subject || 'OperatorOS notification',
        text: input.body,
      }),
    });
    if (!response.ok) {
      const error = new Error('Email provider request failed') as Error & { code?: string };
      error.code = `EMAIL_PROVIDER_HTTP_${response.status}`;
      throw error;
    }
    const result = await response.json().catch(() => ({})) as { id?: string };
    if (!result.id) {
      throw Object.assign(new Error('Email provider response did not include a message id'), {
        code: 'EMAIL_PROVIDER_RESPONSE_INVALID',
      });
    }
    return { providerMessageId: result.id };
  }
}

class TwilioSmsAdapter implements OutboundProviderAdapter {
  readonly status: ProviderStatus = { kind: 'sms', name: 'twilio', state: 'configured' };
  constructor(private readonly config: Awaited<ReturnType<typeof resolveTelephonyConfig>> & {}) {}
  async send(input: OutboundMessageInput): Promise<OutboundMessageResult> {
    const body = new URLSearchParams({ To: input.destination, From: this.config.fromNumber, Body: input.body });
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      const error = new Error('SMS provider request failed') as Error & { code?: string };
      error.code = `SMS_PROVIDER_HTTP_${response.status}`;
      throw error;
    }
    const result = await response.json().catch(() => ({})) as { sid?: string };
    if (!result.sid) {
      throw Object.assign(new Error('SMS provider response did not include a message id'), {
        code: 'SMS_PROVIDER_RESPONSE_INVALID',
      });
    }
    return { providerMessageId: result.sid };
  }
}

export async function getOutboundProviderAdapter(channel: 'email' | 'sms'): Promise<OutboundProviderAdapter> {
  if (isOperatorOSTestEnvironment()) return new TestOutboundAdapter(channel);
  if (channel === 'email') {
    return process.env.RESEND_API_KEY && (process.env.EMAIL_FROM || process.env.INVITE_FROM_EMAIL)
      ? new ResendEmailAdapter()
      : new DisabledOutboundAdapter('email');
  }
  const telephony = await resolveTelephonyConfig();
  return telephony ? new TwilioSmsAdapter(telephony) : new DisabledOutboundAdapter('sms');
}

export function getPaymentProviderAdapter(): PaymentProviderAdapter {
  if (isOperatorOSTestEnvironment()) {
    return {
      status: { kind: 'payments', name: 'deterministic-test', state: 'test' },
      async verifyWebhook(rawBody, signature) {
        if (signature !== 'operatoros-test-signature') throw new Error('Invalid test signature');
        return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody);
      },
    };
  }
  const configured = Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    ['test', 'live'].includes(process.env.STRIPE_MODE || ''),
  );
  return {
    status: { kind: 'payments', name: configured ? 'stripe' : 'disabled', state: configured ? 'configured' : 'disabled' },
    async verifyWebhook(rawBody, signature) {
      if (!configured) throw new ProviderDisabledError('payments');
      const { verifyWebhookSignature } = await import('./billing-service.js');
      return verifyWebhookSignature(rawBody, signature);
    },
  };
}

export function getSharedAiProviderAdapter(): SharedAiProviderAdapter {
  const provider = getAiProvider();
  const info = getProviderInfo();
  return {
    status: {
      kind: 'ai',
      name: info.name,
      state: info.configured ? 'configured' : (info.name === 'test' ? 'test' : 'disabled'),
    },
    complete: input => provider.complete(input),
  };
}

export async function getSharedProviderStatuses(): Promise<ProviderStatus[]> {
  const [email, sms] = await Promise.all([
    getOutboundProviderAdapter('email'),
    getOutboundProviderAdapter('sms'),
  ]);
  return [email.status, sms.status, getPaymentProviderAdapter().status, getSharedAiProviderAdapter().status];
}
