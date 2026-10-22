import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { basename, isAbsolute, normalize, relative, sep } from 'node:path';

export type ToolArtifactSlug = 'officeexit' | 'vendortrust365';
export interface ApprovedToolArtifact {
  approvedRoot: string;
  filePath: string;
  expectedSha256: string;
  expectedBytes: number;
  version: string;
  /** Approved acceptance-record reference; not a package signature or a receipt this reader verifies. */
  archiveValidationReceiptSha256: string;
}
export type ToolArtifactDeliveryConfiguration = Readonly<Partial<Record<ToolArtifactSlug, ApprovedToolArtifact>>> | null | undefined;
export interface AcceptedToolArtifact { filename: string; content: Buffer; sha256: string; version: string }
export const TOOL_ARTIFACT_MAX_BYTES = 256 * 1024 * 1024;
const MAX_ACTIVE_READS = 2;
type ErrorCode = 'TOOL_ARTIFACT_NOT_CONFIGURED' | 'TOOL_ARTIFACT_CONFIGURATION_INVALID'
  | 'TOOL_ARTIFACT_VALIDATION_FAILED' | 'TOOL_ARTIFACT_UNAVAILABLE' | 'TOOL_ARTIFACT_BUSY' | 'TOOL_ARTIFACT_LIMIT_EXCEEDED';
export class ToolArtifactDeliveryError extends Error {
  readonly statusCode = 503;
  constructor(readonly code: ErrorCode) {
    super('The approved private download is unavailable.');
    this.name = 'ToolArtifactDeliveryError';
  }
}
function reject(code: ErrorCode): never { throw new ToolArtifactDeliveryError(code); }
const hex = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function fixedPath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && !value.includes('\0') && isAbsolute(value)
    && normalize(value) === value && !value.startsWith('\\\\') && !value.startsWith('//')
    && (process.platform !== 'win32' || /^[A-Za-z]:\\/.test(value));
}
function within(root: string, candidate: string): boolean {
  const part = relative(root, candidate);
  return part !== '' && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part);
}
function configurationFor(configuration: ToolArtifactDeliveryConfiguration, slug: ToolArtifactSlug): Readonly<ApprovedToolArtifact> {
  if (slug !== 'officeexit' && slug !== 'vendortrust365') reject('TOOL_ARTIFACT_CONFIGURATION_INVALID');
  if (!configuration || !Object.hasOwn(configuration, slug)) reject('TOOL_ARTIFACT_NOT_CONFIGURED');
  const value = configuration[slug];
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('TOOL_ARTIFACT_CONFIGURATION_INVALID');
  const fields = ['approvedRoot', 'filePath', 'expectedSha256', 'expectedBytes', 'version', 'archiveValidationReceiptSha256'];
  if (Object.keys(value).length !== fields.length || !Object.keys(value).every(key => fields.includes(key))) {
    reject('TOOL_ARTIFACT_CONFIGURATION_INVALID');
  }
  // Snapshot the server configuration before any await; browser input never selects a path.
  const snapshot = Object.freeze({ ...value });
  if (!fixedPath(snapshot.approvedRoot) || !fixedPath(snapshot.filePath) || !within(snapshot.approvedRoot, snapshot.filePath)
    || !/^[a-z0-9][a-z0-9._-]{0,159}\.zip$/i.test(basename(snapshot.filePath))
    || !hex(snapshot.expectedSha256) || !hex(snapshot.archiveValidationReceiptSha256)
    || typeof snapshot.version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(snapshot.version)
    || !Number.isSafeInteger(snapshot.expectedBytes) || snapshot.expectedBytes <= 0) reject('TOOL_ARTIFACT_CONFIGURATION_INVALID');
  if (snapshot.expectedBytes > TOOL_ARTIFACT_MAX_BYTES) reject('TOOL_ARTIFACT_LIMIT_EXCEEDED');
  return snapshot;
}

async function inspectPath(configuration: Readonly<ApprovedToolArtifact>): Promise<BigIntStats> {
  const root = await lstat(configuration.approvedRoot, { bigint: true });
  if (!root.isDirectory() || root.isSymbolicLink()) reject('TOOL_ARTIFACT_VALIDATION_FAILED');
  let candidate = configuration.approvedRoot;
  const parts = relative(configuration.approvedRoot, configuration.filePath).split(sep);
  let file: BigIntStats | undefined;
  for (let index = 0; index < parts.length; index++) {
    candidate += (candidate.endsWith(sep) ? '' : sep) + parts[index];
    const stat = await lstat(candidate, { bigint: true });
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) {
      reject('TOOL_ARTIFACT_VALIDATION_FAILED');
    }
    file = stat;
  }
  const [actualRoot, actualFile] = await Promise.all([realpath(configuration.approvedRoot), realpath(configuration.filePath)]);
  if (!within(actualRoot, actualFile) || !file?.isFile()) reject('TOOL_ARTIFACT_VALIDATION_FAILED');
  return file;
}
function sameFile(first: BigIntStats, second: BigIntStats): boolean {
  return second.isFile() && first.dev === second.dev && first.ino === second.ino
    && first.size === second.size && first.mtimeNs === second.mtimeNs && first.ctimeNs === second.ctimeNs;
}
async function readPinned(configuration: Readonly<ApprovedToolArtifact>, slug: ToolArtifactSlug): Promise<AcceptedToolArtifact> {
  const expectedSize = BigInt(configuration.expectedBytes);
  const initial = await inspectPath(configuration);
  if (initial.size !== expectedSize) reject('TOOL_ARTIFACT_VALIDATION_FAILED');
  const handle = await open(configuration.filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameFile(initial, opened)) reject('TOOL_ARTIFACT_VALIDATION_FAILED');
    const afterOpen = await inspectPath(configuration);
    if (!sameFile(opened, afterOpen)) reject('TOOL_ARTIFACT_VALIDATION_FAILED');
    // Exactly one bounded Buffer; no accumulating chunks or concat copies.
    const content = Buffer.alloc(configuration.expectedBytes);
    let offset = 0;
    while (offset < content.length) {
      const { bytesRead } = await handle.read(content, offset, Math.min(64 * 1024, content.length - offset), offset);
      if (!bytesRead) reject('TOOL_ARTIFACT_VALIDATION_FAILED');
      offset += bytesRead;
    }
    // Reuse its first byte for the EOF probe. A nonempty probe always rejects.
    const extra = await handle.read(content, 0, 1, content.length);
    if (extra.bytesRead !== 0 || !sameFile(opened, await handle.stat({ bigint: true }))
      || !sameFile(opened, await inspectPath(configuration))) reject('TOOL_ARTIFACT_VALIDATION_FAILED');
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== configuration.expectedSha256) reject('TOOL_ARTIFACT_VALIDATION_FAILED');
    return { filename: `${slug}-${configuration.version}.zip`, content, sha256, version: configuration.version };
  } finally { await handle.close(); }
}

let activeReads = 0;
const inFlight = new Map<string, Promise<AcceptedToolArtifact>>();
/** Server-only approved configuration, no discovery, archive execution/extraction, or provider requests. */
export async function readAcceptedToolArtifact(configuration: ToolArtifactDeliveryConfiguration, slug: ToolArtifactSlug): Promise<AcceptedToolArtifact> {
  try {
    const approved = configurationFor(configuration, slug);
    const key = JSON.stringify([slug, approved.approvedRoot, approved.filePath, approved.expectedSha256,
      approved.expectedBytes, approved.version, approved.archiveValidationReceiptSha256]);
    const existing = inFlight.get(key);
    if (existing) return await existing;
    if (activeReads >= MAX_ACTIVE_READS) reject('TOOL_ARTIFACT_BUSY');
    activeReads++;
    const operation = readPinned(approved, slug).finally(() => { activeReads--; inFlight.delete(key); });
    inFlight.set(key, operation);
    return await operation;
  } catch (error) {
    if (error instanceof ToolArtifactDeliveryError) throw error;
    // Do not attach the filesystem/provider error or its private path as a cause.
    return reject('TOOL_ARTIFACT_UNAVAILABLE');
  }
}
