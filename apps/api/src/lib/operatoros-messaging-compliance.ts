import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { requireSessionSecret } from './session-secret.js';

type Executor = Pick<typeof db, 'execute'>;

export const OPERATOROS_SMS_PROGRAM = 'operatoros-service-sms';
export const OPERATOROS_SMS_PROGRAM_NAME = 'OperatorOS Service SMS';
export const OPERATOROS_SMS_SOURCE_URL = 'https://operatoros.net/sms-consent';
export const OPERATOROS_SMS_DISCLOSURE_VERSION = 'operatoros-service-sms-2026-08-10-v1';
export const OPERATOROS_PRIVACY_VERSION = '2026-08-10';
export const OPERATOROS_TERMS_VERSION = '2026-08-10';
export const OPERATOROS_SMS_DISCLOSURE_LANGUAGE = 'en-US';
export const OPERATOROS_SMS_DISCLOSURE = 'I agree to receive recurring SMS messages from OperatorOS regarding account notifications, scheduled calls, service updates, support, and other communications I request. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.';

export const OPERATOROS_SMS_STOP_KEYWORDS: ReadonlySet<string> = new Set([
  'STOP', 'UNSUBSCRIBE', 'END', 'QUIT', 'STOPALL', 'REVOKE', 'OPTOUT', 'CANCEL',
]);

export type MessagingKeywordType = 'STOP' | 'HELP' | 'START' | null;

export class OperatorOsMessagingInputError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export function normalizeOperatorOsSmsPhone(value: unknown): string {
  if (typeof value !== 'string') {
    throw new OperatorOsMessagingInputError('Enter a valid US mobile phone number.', 'SMS_PHONE_INVALID', 'phoneNumber');
  }
  const trimmed = value.normalize('NFKC').trim();
  if (!trimmed || trimmed.length > 40 || /[A-Za-z]/.test(trimmed)) {
    throw new OperatorOsMessagingInputError('Enter a valid US mobile phone number.', 'SMS_PHONE_INVALID', 'phoneNumber');
  }
  const digits = trimmed.replace(/[^0-9]/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10 || national[0] === '0' || national[0] === '1' || national[3] === '0' || national[3] === '1') {
    throw new OperatorOsMessagingInputError('Enter a valid US mobile phone number.', 'SMS_PHONE_INVALID', 'phoneNumber');
  }
  return `+1${national}`;
}

function normalizeProviderEvidencePhone(value: string): string {
  const normalized = value.normalize('NFKC').trim();
  if (/^\+[1-9][0-9]{7,14}$/.test(normalized)) return normalized;
  return normalizeOperatorOsSmsPhone(normalized);
}

function evidenceDigest(scope: string, value: string): string {
  return createHmac('sha256', requireSessionSecret()).update(`${scope}:${value}`, 'utf8').digest('hex');
}

export function operatorOsSmsPhoneFingerprint(phoneE164: string): string {
  return evidenceDigest('operatoros-sms-phone-v1', phoneE164);
}

export function operatorOsSmsClientHash(address: string): string {
  return evidenceDigest('operatoros-sms-client-v1', address || 'unknown');
}

export function summarizeMessagingUserAgent(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 500) : null;
}

export function classifyOperatorOsMessagingKeyword(body: unknown, optOutType?: unknown): MessagingKeywordType {
  const providerType = typeof optOutType === 'string' ? optOutType.trim().toUpperCase() : '';
  if (providerType === 'STOP' || providerType === 'HELP' || providerType === 'START') return providerType;
  if (typeof body !== 'string') return null;
  const keyword = body.normalize('NFKC').trim().toUpperCase();
  if (OPERATOROS_SMS_STOP_KEYWORDS.has(keyword)) return 'STOP';
  if (keyword === 'HELP') return 'HELP';
  if (keyword === 'START' || keyword === 'UNSTOP') return 'START';
  return null;
}

async function consumeConsentRateLimit(clientHash: string, executor: Executor = db): Promise<boolean> {
  await executor.execute(sql`DELETE FROM operatoros_sms_consent_rate_limits WHERE expires_at < NOW()`);
  const result = await executor.execute(sql`
    INSERT INTO operatoros_sms_consent_rate_limits (bucket_hash, window_start, request_count, expires_at)
    VALUES (
      ${clientHash},
      to_timestamp(floor(extract(epoch FROM NOW()) / 3600) * 3600),
      1,
      NOW() + interval '2 hours'
    )
    ON CONFLICT (bucket_hash, window_start)
    DO UPDATE SET request_count = operatoros_sms_consent_rate_limits.request_count + 1
    RETURNING request_count
  `);
  return Number(result.rows[0]?.request_count ?? 11) <= 10;
}

export async function recordOperatorOsSmsWebConsent(input: {
  phoneNumber: unknown;
  smsConsent: unknown;
  website?: unknown;
  clientAddress: string;
  userAgent?: unknown;
}) {
  if (input.website !== undefined && input.website !== '') {
    throw new OperatorOsMessagingInputError('Submission was not accepted.', 'SMS_CONSENT_REJECTED');
  }
  if (input.smsConsent !== true) {
    throw new OperatorOsMessagingInputError('Select the SMS consent checkbox to opt in.', 'SMS_CONSENT_REQUIRED', 'smsConsent');
  }
  const phoneE164 = normalizeOperatorOsSmsPhone(input.phoneNumber);
  const phoneFingerprint = operatorOsSmsPhoneFingerprint(phoneE164);
  const clientIpHash = operatorOsSmsClientHash(input.clientAddress);
  const userAgentSummary = summarizeMessagingUserAgent(input.userAgent);
  if (!await consumeConsentRateLimit(clientIpHash)) {
    throw new OperatorOsMessagingInputError('Too many consent attempts. Please try again later.', 'SMS_CONSENT_RATE_LIMITED');
  }

  return db.transaction(async tx => {
    const locked = await tx.execute(sql`
      SELECT id,status,disclosure_version FROM operatoros_sms_consent_records
      WHERE program=${OPERATOROS_SMS_PROGRAM} AND phone_e164=${phoneE164}
      FOR UPDATE
    `);
    const existing = locked.rows[0] as Record<string, unknown> | undefined;
    if (existing?.status === 'opted_in' && existing.disclosure_version === OPERATOROS_SMS_DISCLOSURE_VERSION) {
      return { id: String(existing.id), duplicate: true, status: 'opted_in' as const };
    }
    const eventType = existing?.status === 'revoked' ? 'opt_back_in' : 'opt_in';
    const record = await tx.execute(sql`
      INSERT INTO operatoros_sms_consent_records (
        phone_e164,phone_fingerprint,status,program,consent_category,consented_at,source_url,
        disclosure_version,disclosure_language,disclosure_text,privacy_policy_version,terms_version,
        opt_in_mechanism,client_ip_hash,user_agent_summary,revoked_at,revocation_mechanism,last_keyword
      ) VALUES (
        ${phoneE164},${phoneFingerprint},'opted_in',${OPERATOROS_SMS_PROGRAM},'service',NOW(),
        ${OPERATOROS_SMS_SOURCE_URL},${OPERATOROS_SMS_DISCLOSURE_VERSION},${OPERATOROS_SMS_DISCLOSURE_LANGUAGE},
        ${OPERATOROS_SMS_DISCLOSURE},${OPERATOROS_PRIVACY_VERSION},${OPERATOROS_TERMS_VERSION},
        'public_web_form',${clientIpHash},${userAgentSummary},NULL,NULL,NULL
      )
      ON CONFLICT (program,phone_e164) DO UPDATE SET
        phone_fingerprint=EXCLUDED.phone_fingerprint,status='opted_in',consented_at=NOW(),
        source_url=EXCLUDED.source_url,disclosure_version=EXCLUDED.disclosure_version,
        disclosure_language=EXCLUDED.disclosure_language,disclosure_text=EXCLUDED.disclosure_text,
        privacy_policy_version=EXCLUDED.privacy_policy_version,terms_version=EXCLUDED.terms_version,
        opt_in_mechanism=EXCLUDED.opt_in_mechanism,client_ip_hash=EXCLUDED.client_ip_hash,
        user_agent_summary=EXCLUDED.user_agent_summary,revoked_at=NULL,revocation_mechanism=NULL,
        last_keyword=NULL,version=operatoros_sms_consent_records.version+1,updated_at=NOW()
      RETURNING id
    `);
    const id = String(record.rows[0].id);
    await tx.execute(sql`
      INSERT INTO operatoros_sms_consent_events (
        consent_record_id,event_type,phone_fingerprint,program,consent_category,source_url,mechanism,
        disclosure_version,disclosure_language,disclosure_text,privacy_policy_version,terms_version,
        client_ip_hash,user_agent_summary
      ) VALUES (
        ${id},${eventType},${phoneFingerprint},${OPERATOROS_SMS_PROGRAM},'service',${OPERATOROS_SMS_SOURCE_URL},
        'public_web_form',${OPERATOROS_SMS_DISCLOSURE_VERSION},${OPERATOROS_SMS_DISCLOSURE_LANGUAGE},
        ${OPERATOROS_SMS_DISCLOSURE},${OPERATOROS_PRIVACY_VERSION},${OPERATOROS_TERMS_VERSION},
        ${clientIpHash},${userAgentSummary}
      )
    `);
    return { id, duplicate: false, status: 'opted_in' as const };
  });
}

export async function recordOperatorOsMessagingKeyword(input: {
  phoneNumber: string;
  body?: unknown;
  optOutType?: unknown;
  providerEventId?: string | null;
  sourceUrl: string;
  provider?: string;
  clientAddress?: string;
  userAgent?: unknown;
}) {
  const keywordType = classifyOperatorOsMessagingKeyword(input.body, input.optOutType);
  if (!keywordType) return { handled: false as const, type: null };
  const phoneE164 = normalizeProviderEvidencePhone(input.phoneNumber);
  const phoneFingerprint = operatorOsSmsPhoneFingerprint(phoneE164);
  const clientIpHash = input.clientAddress ? operatorOsSmsClientHash(input.clientAddress) : null;
  const userAgentSummary = summarizeMessagingUserAgent(input.userAgent);
  const provider = (input.provider || 'twilio').slice(0, 40);
  const providerEventId = input.providerEventId?.slice(0, 120) || null;
  const rawKeyword = typeof input.body === 'string' ? input.body.normalize('NFKC').trim().toUpperCase().slice(0, 24) : keywordType;

  return db.transaction(async tx => {
    if (providerEventId) {
      const duplicate = await tx.execute(sql`
        SELECT event_type FROM operatoros_sms_consent_events
        WHERE provider=${provider} AND provider_event_id=${providerEventId} LIMIT 1
      `);
      if (duplicate.rows[0]) return { handled: true as const, type: keywordType, duplicate: true, changed: false };
    }
    const locked = await tx.execute(sql`
      SELECT id,status,consented_at FROM operatoros_sms_consent_records
      WHERE program=${OPERATOROS_SMS_PROGRAM} AND phone_e164=${phoneE164} FOR UPDATE
    `);
    let record = locked.rows[0] as Record<string, unknown> | undefined;
    let changed = false;
    let eventType: 'revoked' | 'help' | 'opt_back_in' = 'help';
    if (keywordType === 'STOP') {
      eventType = 'revoked';
      const result = await tx.execute(sql`
        INSERT INTO operatoros_sms_consent_records (
          phone_e164,phone_fingerprint,status,program,consent_category,revoked_at,revocation_mechanism,last_keyword
        ) VALUES (${phoneE164},${phoneFingerprint},'revoked',${OPERATOROS_SMS_PROGRAM},'service',NOW(),'twilio_keyword',${rawKeyword})
        ON CONFLICT (program,phone_e164) DO UPDATE SET
          status='revoked',revoked_at=COALESCE(operatoros_sms_consent_records.revoked_at,NOW()),
          revocation_mechanism='twilio_keyword',last_keyword=${rawKeyword},
          version=operatoros_sms_consent_records.version+1,updated_at=NOW()
        RETURNING id
      `);
      record = result.rows[0] as Record<string, unknown>;
      changed = !locked.rows[0] || locked.rows[0].status !== 'revoked';
    } else if (keywordType === 'START') {
      if (!record || record.status !== 'revoked' || !record.consented_at) {
        return { handled: true as const, type: keywordType, duplicate: false, changed: false };
      }
      eventType = 'opt_back_in';
      await tx.execute(sql`
        UPDATE operatoros_sms_consent_records SET status='opted_in',consented_at=NOW(),
          opt_in_mechanism='twilio_start_keyword',revoked_at=NULL,revocation_mechanism=NULL,
          last_keyword=${rawKeyword},version=version+1,updated_at=NOW() WHERE id=${String(record.id)}
      `);
      changed = true;
    }
    await tx.execute(sql`
      INSERT INTO operatoros_sms_consent_events (
        consent_record_id,event_type,phone_fingerprint,program,consent_category,source_url,mechanism,
        keyword,client_ip_hash,user_agent_summary,provider,provider_event_id
      ) VALUES (
        ${record ? String(record.id) : null},${eventType},${phoneFingerprint},${OPERATOROS_SMS_PROGRAM},'service',
        ${input.sourceUrl.slice(0, 500)},'twilio_keyword',${rawKeyword},${clientIpHash},${userAgentSummary},
        ${provider},${providerEventId}
      ) ON CONFLICT DO NOTHING
    `);
    return { handled: true as const, type: keywordType, duplicate: false, changed };
  });
}

export async function isOperatorOsSmsRevoked(destination: string, executor: Executor = db): Promise<boolean> {
  let phoneE164: string;
  try { phoneE164 = normalizeProviderEvidencePhone(destination); } catch { return false; }
  const result = await executor.execute(sql`
    SELECT 1 FROM operatoros_sms_consent_records
    WHERE program=${OPERATOROS_SMS_PROGRAM} AND phone_e164=${phoneE164} AND status='revoked' LIMIT 1
  `);
  return Boolean(result.rows[0]);
}
