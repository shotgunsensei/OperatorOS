import { createHash, randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { enqueueSharedJob, registerSharedJobHandler } from './shared-background-jobs.js';
import { isOperatorOSTestEnvironment } from './shared-service-safety.js';

type Executor = Pick<typeof db, 'execute'>;
export const ATTACHMENT_SCAN_JOB = 'shared.attachment.scan.v1';
const ABSOLUTE_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type AttachmentScanStatus = 'pending' | 'clean' | 'unavailable' | 'infected' | 'error';

export interface AttachmentScanner {
  readonly name: string;
  readonly configured: boolean;
  scan(input: { content: Buffer; detectedMimeType: string; sha256: string }): Promise<'clean' | 'infected' | 'unavailable'>;
}

const unavailableScanner: AttachmentScanner = {
  name: 'disabled',
  configured: false,
  async scan() { return 'unavailable'; },
};
let scanner: AttachmentScanner = unavailableScanner;

export function setAttachmentScannerForTests(next: AttachmentScanner | null): void {
  if (!isOperatorOSTestEnvironment()) throw new Error('Attachment scanner override is test-only');
  scanner = next ?? unavailableScanner;
}

export function getAttachmentServiceStatus() {
  return {
    storage: { adapter: 'postgres', configured: (process.env.ATTACHMENT_STORAGE_ADAPTER || 'postgres') === 'postgres' },
    scanner: { name: scanner.name, configured: scanner.configured },
    maxBytes: getMaxAttachmentBytes(),
  };
}

export function getMaxAttachmentBytes(): number {
  const raw = Number(process.env.ATTACHMENT_MAX_BYTES || 10 * 1024 * 1024);
  if (!Number.isSafeInteger(raw) || raw <= 0) return 10 * 1024 * 1024;
  return Math.min(ABSOLUTE_MAX_ATTACHMENT_BYTES, raw);
}

function safeFileName(value: string): string {
  const name = basename(value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 240);
  if (!name || name === '.' || name === '..') {
    throw Object.assign(new Error('Invalid attachment filename'), { code: 'INVALID_ATTACHMENT_FILENAME' });
  }
  return name;
}

function looksLikeUtf8Text(content: Buffer): boolean {
  if (content.includes(0)) return false;
  return !content.toString('utf8').includes('\uFFFD');
}

export function detectAttachmentMimeType(content: Buffer, declaredMimeType?: string | null): string {
  if (content.length >= 5 && content.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return 'image/jpeg';
  if (content.length >= 12 && content.subarray(0, 4).toString('ascii') === 'RIFF' && content.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (content.length >= 6 && ['GIF87a', 'GIF89a'].includes(content.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (content.length >= 4 && content.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return 'application/zip';
  const declared = declaredMimeType?.split(';')[0]?.trim().toLowerCase();
  if (declared === 'application/json' && looksLikeUtf8Text(content)) {
    try { JSON.parse(content.toString('utf8')); return 'application/json'; } catch { /* reject below */ }
  }
  if (['text/plain', 'text/csv'].includes(declared || '') && looksLikeUtf8Text(content)) return declared!;
  throw Object.assign(new Error('Attachment type is not supported or its signature is invalid'), { code: 'ATTACHMENT_SIGNATURE_INVALID' });
}

function assertDeclaredMimeMatches(declared: string | null | undefined, detected: string): void {
  if (!declared) return;
  const normalized = declared.split(';')[0]!.trim().toLowerCase();
  const aliases: Record<string, string[]> = {
    'image/jpeg': ['image/jpeg', 'image/jpg'],
    'text/csv': ['text/csv', 'application/csv', 'application/vnd.ms-excel'],
    'application/zip': ['application/zip', 'application/x-zip-compressed'],
  };
  if (normalized !== detected && !(aliases[detected] || []).includes(normalized)) {
    throw Object.assign(new Error('Declared MIME type does not match the file signature'), { code: 'ATTACHMENT_MIME_MISMATCH' });
  }
}

export interface AttachmentStorageAdapter {
  readonly name: 'postgres';
  put(input: { tenantId: string; attachmentId: string; content: Buffer }, executor?: Executor): Promise<void>;
  get(input: { tenantId: string; attachmentId: string }, executor?: Executor): Promise<Buffer | null>;
  purge(input: { tenantId: string; attachmentId: string }, executor?: Executor): Promise<void>;
}

export const postgresAttachmentStorage: AttachmentStorageAdapter = {
  name: 'postgres',
  async put(input, executor = db) {
    await executor.execute(sql`
      INSERT INTO shared_attachment_blobs (attachment_id, tenant_id, content, content_length)
      VALUES (${input.attachmentId}, ${input.tenantId}, ${input.content}, ${input.content.length})
    `);
  },
  async get(input, executor = db) {
    const result = await executor.execute(sql`
      SELECT content FROM shared_attachment_blobs
      WHERE tenant_id = ${input.tenantId} AND attachment_id = ${input.attachmentId}
      LIMIT 1
    `);
    const content = result.rows[0]?.content;
    return Buffer.isBuffer(content) ? content : (content ? Buffer.from(content as Uint8Array) : null);
  },
  async purge(input, executor = db) {
    await executor.execute(sql`
      DELETE FROM shared_attachment_blobs
      WHERE tenant_id = ${input.tenantId} AND attachment_id = ${input.attachmentId}
    `);
  },
};

export function getAttachmentStorageAdapter(): AttachmentStorageAdapter {
  const configured = process.env.ATTACHMENT_STORAGE_ADAPTER || 'postgres';
  if (configured !== 'postgres') {
    throw Object.assign(new Error('Configured attachment storage adapter is unsupported'), { code: 'ATTACHMENT_STORAGE_UNAVAILABLE' });
  }
  return postgresAttachmentStorage;
}

export async function createAttachment(input: {
  tenantId: string;
  moduleId: string;
  objectType: string;
  objectId: string;
  originalName: string;
  declaredMimeType?: string | null;
  content: Buffer;
  createdByUserId: string;
  retentionUntil?: Date | null;
  correlationId?: string | null;
  idempotencyKey?: string | null;
}, executor: Executor = db) {
  if (input.content.length === 0 || input.content.length > getMaxAttachmentBytes()) {
    throw Object.assign(new Error('Attachment size is outside the configured limit'), { code: 'ATTACHMENT_SIZE_INVALID' });
  }
  const originalName = safeFileName(input.originalName);
  const detectedMimeType = detectAttachmentMimeType(input.content, input.declaredMimeType);
  assertDeclaredMimeMatches(input.declaredMimeType, detectedMimeType);
  const sha256 = createHash('sha256').update(input.content).digest('hex');
  if (input.idempotencyKey) {
    const existing = await executor.execute(sql`
      SELECT * FROM shared_attachments
      WHERE tenant_id=${input.tenantId} AND module_id=${input.moduleId}
        AND object_type=${input.objectType} AND object_id=${input.objectId}
        AND client_mutation_id=${input.idempotencyKey}
      LIMIT 1
    `);
    if (existing.rows[0]) return existing.rows[0] as Record<string, unknown>;
  }
  const storage = getAttachmentStorageAdapter();
  const storageKey = `${input.tenantId}/${input.moduleId}/${new Date().toISOString().slice(0, 7)}/${randomBytes(24).toString('hex')}`;
  const result = await executor.execute(sql`
    INSERT INTO shared_attachments (
      tenant_id, module_id, object_type, object_id, original_name, storage_adapter,
      storage_key, size_bytes, declared_mime_type, detected_mime_type, sha256,
      retention_until, created_by_user_id, client_mutation_id
    ) VALUES (
      ${input.tenantId}, ${input.moduleId}, ${input.objectType}, ${input.objectId},
      ${originalName}, ${storage.name}, ${storageKey}, ${input.content.length},
      ${input.declaredMimeType ?? null}, ${detectedMimeType}, ${sha256},
      ${input.retentionUntil ?? null}, ${input.createdByUserId}, ${input.idempotencyKey ?? null}
    )
    RETURNING *
  `);
  const attachment = result.rows[0] as Record<string, unknown>;
  await storage.put({ tenantId: input.tenantId, attachmentId: String(attachment.id), content: input.content }, executor);
  await enqueueSharedJob({
    tenantId: input.tenantId,
    moduleId: input.moduleId,
    requestedByUserId: input.createdByUserId,
    handlerKey: ATTACHMENT_SCAN_JOB,
    payload: { attachmentId: attachment.id },
    idempotencyKey: `scan:${attachment.id}:${sha256}`,
    correlationId: input.correlationId,
  }, executor);
  return attachment;
}

export async function listAttachments(input: {
  tenantId: string;
  moduleId: string;
  objectType: string;
  objectId: string;
  includeDeleted?: boolean;
  limit?: number;
}, executor: Executor = db) {
  const limit = Math.max(1, Math.min(100, input.limit ?? 25));
  const result = await executor.execute(sql`
    SELECT id, object_type, object_id, original_name, size_bytes, declared_mime_type,
      detected_mime_type, sha256, scan_status, retention_until, version,
      created_at, updated_at, deleted_at
    FROM shared_attachments
    WHERE tenant_id = ${input.tenantId} AND module_id = ${input.moduleId}
      AND object_type = ${input.objectType} AND object_id = ${input.objectId}
      AND (${input.includeDeleted === true} OR deleted_at IS NULL)
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `);
  return result.rows;
}

export async function getAttachmentContent(input: {
  tenantId: string;
  moduleId: string;
  attachmentId: string;
  objectType?: string | null;
  objectId?: string | null;
}, executor: Executor = db) {
  const metadataResult = await executor.execute(sql`
    SELECT id, original_name, detected_mime_type, size_bytes, sha256, scan_status
    FROM shared_attachments
    WHERE tenant_id = ${input.tenantId} AND module_id = ${input.moduleId}
      AND id = ${input.attachmentId} AND deleted_at IS NULL
      AND (${input.objectType ?? null}::text IS NULL OR object_type = ${input.objectType ?? null})
      AND (${input.objectId ?? null}::text IS NULL OR object_id = ${input.objectId ?? null})
    LIMIT 1
  `);
  const metadata = metadataResult.rows[0] as Record<string, unknown> | undefined;
  if (!metadata) return null;
  if (metadata.scan_status === 'pending' || metadata.scan_status === 'error') {
    throw Object.assign(new Error('Attachment security scan is not complete'), { code: 'ATTACHMENT_SCAN_PENDING' });
  }
  if (metadata.scan_status === 'infected') {
    throw Object.assign(new Error('Attachment is quarantined'), { code: 'ATTACHMENT_QUARANTINED' });
  }
  const content = await getAttachmentStorageAdapter().get({ tenantId: input.tenantId, attachmentId: input.attachmentId }, executor);
  if (!content || createHash('sha256').update(content).digest('hex') !== metadata.sha256) {
    throw Object.assign(new Error('Attachment content integrity check failed'), { code: 'ATTACHMENT_INTEGRITY_FAILED' });
  }
  return { metadata, content };
}

export async function softDeleteAttachment(input: {
  tenantId: string;
  moduleId: string;
  attachmentId: string;
  deletedByUserId: string;
  version: number;
  objectType?: string | null;
  objectId?: string | null;
  retentionUntil?: Date | null;
}, executor: Executor = db) {
  const result = await executor.execute(sql`
    UPDATE shared_attachments
    SET deleted_at = NOW(), deleted_by_user_id = ${input.deletedByUserId},
      retention_until = COALESCE(${input.retentionUntil ?? null}, retention_until),
      version = version + 1, updated_at = NOW()
    WHERE id = ${input.attachmentId} AND tenant_id = ${input.tenantId}
      AND module_id = ${input.moduleId} AND version = ${input.version} AND deleted_at IS NULL
      AND (${input.objectType ?? null}::text IS NULL OR object_type = ${input.objectType ?? null})
      AND (${input.objectId ?? null}::text IS NULL OR object_id = ${input.objectId ?? null})
    RETURNING id, version, deleted_at, retention_until
  `);
  return result.rows[0] ?? null;
}

export async function purgeExpiredAttachmentBlobs(limit = 25): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return db.transaction(async tx => {
    const claimed = await tx.execute(sql`
      SELECT id, tenant_id
      FROM shared_attachments
      WHERE deleted_at IS NOT NULL AND retention_until IS NOT NULL
        AND retention_until <= NOW() AND blob_purged_at IS NULL
      ORDER BY retention_until, id
      FOR UPDATE SKIP LOCKED
      LIMIT ${boundedLimit}
    `);
    for (const row of claimed.rows) {
      const attachmentId = String(row.id);
      const tenantId = String(row.tenant_id);
      await postgresAttachmentStorage.purge({ tenantId, attachmentId }, tx);
      await tx.execute(sql`
        UPDATE shared_attachments
        SET blob_purged_at = NOW(), updated_at = NOW(), version = version + 1
        WHERE id = ${attachmentId} AND tenant_id = ${tenantId}
          AND deleted_at IS NOT NULL AND blob_purged_at IS NULL
      `);
    }
    return claimed.rows.length;
  });
}

async function scanAttachmentJob(context: {
  tenantId: string;
  moduleId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const attachmentId = String(context.payload.attachmentId || '');
  const metadataResult = await db.execute(sql`
    SELECT id, detected_mime_type, sha256, scan_status
    FROM shared_attachments
    WHERE id = ${attachmentId} AND tenant_id = ${context.tenantId}
      AND module_id = ${context.moduleId} AND deleted_at IS NULL
    LIMIT 1
  `);
  const metadata = metadataResult.rows[0] as Record<string, unknown> | undefined;
  if (!metadata || metadata.scan_status !== 'pending') return;
  const content = await getAttachmentStorageAdapter().get({ tenantId: context.tenantId, attachmentId });
  if (!content) throw Object.assign(new Error('Attachment blob is missing'), { code: 'ATTACHMENT_BLOB_MISSING' });
  const status = await scanner.scan({
    content,
    detectedMimeType: String(metadata.detected_mime_type),
    sha256: String(metadata.sha256),
  });
  await db.execute(sql`
    UPDATE shared_attachments
    SET scan_status = ${status}, updated_at = NOW(), version = version + 1
    WHERE id = ${attachmentId} AND tenant_id = ${context.tenantId}
      AND module_id = ${context.moduleId} AND scan_status = 'pending'
  `);
}

registerSharedJobHandler(ATTACHMENT_SCAN_JOB, scanAttachmentJob);
