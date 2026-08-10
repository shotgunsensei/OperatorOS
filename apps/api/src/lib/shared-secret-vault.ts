import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { isOperatorOSTestEnvironment } from './shared-service-safety.js';

type Executor = Pick<typeof db, 'execute'>;

const TEST_ONLY_KEY = createHash('sha256').update('operatoros-phase22-deterministic-test-key').digest();

function encryptionKey(): { key: Buffer; version: string; live: boolean } {
  const encoded = process.env.SHARED_SECRET_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    if (isOperatorOSTestEnvironment()) return { key: TEST_ONLY_KEY, version: 'test-only-v1', live: false };
    throw Object.assign(new Error('Shared secret encryption is not configured'), { code: 'SHARED_SECRET_ENCRYPTION_UNAVAILABLE' });
  }
  const key = /^[0-9a-f]{64}$/i.test(encoded) ? Buffer.from(encoded, 'hex') : Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw Object.assign(new Error('SHARED_SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes'), { code: 'SHARED_SECRET_ENCRYPTION_INVALID' });
  }
  return { key, version: process.env.SHARED_SECRET_ENCRYPTION_KEY_VERSION?.trim() || 'v1', live: true };
}

export function getSharedSecretVaultReadiness() {
  try {
    const key = encryptionKey();
    return { configured: key.live, mode: key.live ? 'live' : 'test', keyVersion: key.version } as const;
  } catch (error) {
    return {
      configured: false,
      mode: 'disabled' as const,
      keyVersion: null,
      reasonCode: error && typeof error === 'object' && 'code' in error ? String((error as any).code) : 'SHARED_SECRET_ENCRYPTION_INVALID',
    };
  }
}

function encryptedReference(reference: string) {
  const { key, version } = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(reference, 'utf8'), cipher.final()]);
  return {
    ciphertext,
    iv,
    authTag: cipher.getAuthTag(),
    keyVersion: version,
    fingerprint: createHash('sha256').update(reference).digest('hex'),
  };
}

export async function storeEncryptedSecretReference(input: {
  tenantId: string;
  moduleId?: string | null;
  purpose: string;
  reference: string;
  actorUserId: string;
  rotatedFromId?: string | null;
}, executor: Executor = db) {
  const purpose = input.purpose.trim();
  const reference = input.reference.trim();
  if (!purpose || purpose.length > 120 || !reference || reference.length > 2_000) {
    throw Object.assign(new Error('Secret reference and bounded purpose are required'), { code: 'SECRET_REFERENCE_INVALID' });
  }
  const encrypted = encryptedReference(reference);
  const result = await executor.execute(sql`
    INSERT INTO shared_secret_references (
      tenant_id, module_id, purpose, ciphertext, iv, auth_tag, key_version,
      fingerprint, created_by_user_id, rotated_from_id
    ) VALUES (
      ${input.tenantId}, ${input.moduleId ?? null}, ${purpose}, ${encrypted.ciphertext},
      ${encrypted.iv}, ${encrypted.authTag}, ${encrypted.keyVersion}, ${encrypted.fingerprint},
      ${input.actorUserId}, ${input.rotatedFromId ?? null}
    ) RETURNING id, tenant_id, module_id, purpose, fingerprint, key_version, created_at, revoked_at
  `);
  if (input.rotatedFromId) {
    await executor.execute(sql`
      UPDATE shared_secret_references SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE tenant_id = ${input.tenantId} AND id = ${input.rotatedFromId}
    `);
  }
  return result.rows[0];
}

/** Server-only resolution. No route may return this value to a browser. */
export async function resolveEncryptedSecretReference(input: {
  tenantId: string;
  id: string;
  moduleId?: string | null;
}, executor: Executor = db): Promise<string | null> {
  const result = await executor.execute(sql`
    SELECT ciphertext, iv, auth_tag, key_version FROM shared_secret_references
    WHERE tenant_id = ${input.tenantId} AND id = ${input.id}
      AND revoked_at IS NULL
      AND (${input.moduleId ?? null}::text IS NULL OR module_id = ${input.moduleId ?? null} OR module_id IS NULL)
    LIMIT 1
  `);
  const row = result.rows[0] as any;
  if (!row) return null;
  const configured = encryptionKey();
  if (String(row.key_version) !== configured.version) {
    throw Object.assign(new Error('Secret reference uses an unavailable encryption key version'), { code: 'SECRET_KEY_VERSION_UNAVAILABLE' });
  }
  const decipher = createDecipheriv('aes-256-gcm', configured.key, Buffer.from(row.iv));
  decipher.setAuthTag(Buffer.from(row.auth_tag));
  return Buffer.concat([decipher.update(Buffer.from(row.ciphertext)), decipher.final()]).toString('utf8');
}
