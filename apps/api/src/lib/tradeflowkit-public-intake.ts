import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  parseTradeFlowKitLeadCreate,
  type TradeFlowKitLeadCreateInput,
  TradeFlowKitLeadValidationError,
} from './tradeflowkit-leads.js';

export const TRADEFLOWKIT_PUBLIC_ADAPTER_KEYS = ['generic-json', 'n8n'] as const;
export type TradeFlowKitPublicAdapterKey = (typeof TRADEFLOWKIT_PUBLIC_ADAPTER_KEYS)[number];

export class TradeFlowKitPublicIntakeError extends Error {
  constructor(
    readonly code: string,
    readonly field?: string,
  ) {
    super(code);
    this.name = 'TradeFlowKitPublicIntakeError';
  }
}

export function hashTradeFlowKitPublicToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function publicIntakeMasterSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const secret = env.TRADEFLOWKIT_PUBLIC_INTAKE_HMAC_SECRET?.trim();
  return secret && Buffer.byteLength(secret, 'utf8') >= 32 ? secret : null;
}

export function deriveTradeFlowKitAdapterSecret(input: {
  masterSecret: string;
  tenantId: string;
  captureFormId: string;
  adapterKey: TradeFlowKitPublicAdapterKey;
}): string {
  return createHmac('sha256', input.masterSecret)
    .update(`tradeflowkit-intake:v1:${input.tenantId}:${input.captureFormId}:${input.adapterKey}`, 'utf8')
    .digest('base64url');
}

export function verifyTradeFlowKitAdapterSignature(input: {
  rawBody: Buffer;
  signature: string | undefined;
  secret: string;
}): boolean {
  const supplied = input.signature?.startsWith('sha256=')
    ? input.signature.slice('sha256='.length)
    : input.signature;
  if (!supplied || !/^[0-9a-f]{64}$/i.test(supplied)) return false;
  const expected = createHmac('sha256', input.secret).update(input.rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(supplied, 'hex'));
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TradeFlowKitPublicIntakeError('BODY_INVALID');
  }
  return value as Record<string, unknown>;
}

export type TradeFlowKitPublicLeadPayload = {
  lead: TradeFlowKitLeadCreateInput;
  consentVersion: string;
  honeypotTriggered: boolean;
};

export function parseTradeFlowKitPublicLeadPayload(input: unknown): TradeFlowKitPublicLeadPayload {
  const body = objectValue(input);
  const publicFields = new Set(['privacyConsent', 'consentVersion', 'website']);
  const leadBody = Object.fromEntries(Object.entries(body).filter(([key]) => !publicFields.has(key)));
  const unexpectedPublicField = Object.keys(body).find(key =>
    !publicFields.has(key) && ![
      'name', 'phone', 'email', 'serviceType', 'description', 'urgency',
      'estimatedValueCents', 'nextFollowUpAt', 'consentToSms',
    ].includes(key),
  );
  if (unexpectedPublicField) throw new TradeFlowKitPublicIntakeError('FIELD_NOT_ALLOWED', unexpectedPublicField);
  if (body.privacyConsent !== true) throw new TradeFlowKitPublicIntakeError('PRIVACY_CONSENT_REQUIRED', 'privacyConsent');
  if (typeof body.consentVersion !== 'string' || !/^[A-Za-z0-9._:-]{1,40}$/.test(body.consentVersion)) {
    throw new TradeFlowKitPublicIntakeError('CONSENT_VERSION_INVALID', 'consentVersion');
  }
  if (body.website !== undefined && typeof body.website !== 'string') {
    throw new TradeFlowKitPublicIntakeError('FIELD_INVALID', 'website');
  }
  try {
    return {
      lead: parseTradeFlowKitLeadCreate(leadBody),
      consentVersion: body.consentVersion,
      honeypotTriggered: typeof body.website === 'string' && body.website.trim().length > 0,
    };
  } catch (error) {
    if (error instanceof TradeFlowKitLeadValidationError) {
      throw new TradeFlowKitPublicIntakeError(error.code, error.field);
    }
    throw error;
  }
}

export function validateTradeFlowKitPrivacyUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TradeFlowKitPublicIntakeError('PRIVACY_URL_INVALID', 'privacyNoticeUrl');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    throw new TradeFlowKitPublicIntakeError('PRIVACY_URL_INVALID', 'privacyNoticeUrl');
  }
  const normalized = parsed.toString();
  if (normalized.length > 500) throw new TradeFlowKitPublicIntakeError('PRIVACY_URL_INVALID', 'privacyNoticeUrl');
  return normalized;
}
