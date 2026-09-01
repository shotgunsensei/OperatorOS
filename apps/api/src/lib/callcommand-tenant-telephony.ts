import twilio from 'twilio';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { normalizeE164 } from './callcommand.js';
import { resolveEncryptedSecretReference } from './shared-secret-vault.js';
import { verifyTwilioSignature } from './telephony.js';

type Row = Record<string, any>;

const ACCOUNT_SID = /^AC[0-9a-fA-F]{32}$/;
const AUTH_TOKEN = /^[A-Za-z0-9]{20,256}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

interface StoredTwilioCredential {
  provider: 'twilio';
  providerAccountId: string;
  authToken: string;
}

function parseCredential(value: string, expectedAccountSid: string): StoredTwilioCredential | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredTwilioCredential>;
    if (parsed.provider !== 'twilio'
      || !ACCOUNT_SID.test(String(parsed.providerAccountId ?? ''))
      || parsed.providerAccountId !== expectedAccountSid
      || !AUTH_TOKEN.test(String(parsed.authToken ?? ''))) return null;
    return parsed as StoredTwilioCredential;
  } catch {
    return null;
  }
}

async function tenantSigningAuthority(input: {
  params: Record<string, string>;
  callId?: string | null;
}): Promise<Row | null> {
  let to: string | null = null;
  try {
    if (input.params.To) to = normalizeE164(input.params.To, 'To');
  } catch {
    return null;
  }

  const callId = input.callId && UUID.test(input.callId) ? input.callId : null;
  const providerCallSid = /^CA[A-Za-z0-9]{20,62}$/.test(input.params.CallSid ?? '')
    ? input.params.CallSid
    : null;
  const result = await db.execute(sql`
    SELECT c.tenant_id,c.id AS channel_id,a.provider_account_sid,a.secret_reference_id
    FROM callcommand_channels c
    JOIN callcommand_telephony_accounts a
      ON a.tenant_id=c.tenant_id AND a.id=c.telephony_account_id
      AND a.provider='twilio' AND a.archived_at IS NULL
    LEFT JOIN callcommand_calls cc
      ON cc.tenant_id=c.tenant_id AND cc.channel_id=c.id
      AND (
        (${callId}::text IS NOT NULL AND cc.id=${callId})
        OR (${providerCallSid}::text IS NOT NULL AND cc.provider='twilio' AND cc.provider_call_sid=${providerCallSid})
      )
    WHERE c.deleted_at IS NULL
      AND (
        (${to}::text IS NOT NULL AND c.phone_e164=${to})
        OR ((${callId}::text IS NOT NULL OR ${providerCallSid}::text IS NOT NULL) AND cc.id IS NOT NULL)
      )
    ORDER BY CASE WHEN ${to}::text IS NOT NULL AND c.phone_e164=${to} THEN 0 ELSE 1 END
    LIMIT 1
  `);
  return (result.rows[0] as Row | undefined) ?? null;
}

/**
 * Validates Twilio webhooks with the exact tenant subaccount Auth Token when a
 * commercial number is mapped to one. Legacy channels continue to use the
 * existing platform-level verifier. No signing credential is returned to a
 * route or browser.
 */
export async function verifyCallCommandTwilioSignature(input: {
  url: string;
  params: Record<string, string>;
  signature?: string;
  callId?: string | null;
}): Promise<boolean> {
  if (!input.signature) return false;
  const authority = await tenantSigningAuthority({ params: input.params, callId: input.callId });
  if (!authority) return verifyTwilioSignature(input.url, input.params, input.signature);
  const accountSid = String(authority.provider_account_sid ?? '');
  const secretId = String(authority.secret_reference_id ?? '');
  if (!ACCOUNT_SID.test(accountSid) || !UUID.test(secretId)) return false;
  const stored = await resolveEncryptedSecretReference({
    tenantId: String(authority.tenant_id),
    id: secretId,
  });
  if (!stored) return false;
  const credential = parseCredential(stored, accountSid);
  return credential
    ? twilio.validateRequest(credential.authToken, input.signature, input.url, input.params)
    : false;
}
