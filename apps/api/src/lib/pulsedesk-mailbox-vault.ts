import { createHash } from 'node:crypto';
import { PulseDeskMailboxError, type PulseDeskMailboxProvider } from './pulsedesk-mailbox-adapter.js';

export interface MailboxSecretScope {
  tenantId: string; connectorId: string; provider: PulseDeskMailboxProvider;
  kind: 'pending' | 'credentials';
}
export interface PulseDeskMailboxVaultPort {
  store(input: { tenantId: string; moduleKey: 'pulsedesk'; purpose: string; reference: string; actorUserId: string }): Promise<{ id: string }>;
  resolve(input: { tenantId: string; moduleKey: 'pulsedesk'; purpose: string; id: string }): Promise<string | null>;
  revoke(input: { tenantId: string; moduleKey: 'pulsedesk'; purpose: string; id: string }): Promise<void>;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function purpose(scope: MailboxSecretScope) {
  if (!uuid.test(scope.tenantId) || !uuid.test(scope.connectorId) || !['google','microsoft'].includes(scope.provider) || !['pending','credentials'].includes(scope.kind)) {
    throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_SECRET_SCOPE_INVALID');
  }
  return `pulsedesk:mailbox:${scope.provider}:${scope.connectorId}:${scope.kind}`;
}
function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }
interface Manifest { version: 1; tenantId: string; connectorId: string; provider: string; kind: string; parts: string[]; digest: string }
function manifest(value: string | null, scope: MailboxSecretScope): Manifest {
  let result: unknown;
  try { result = JSON.parse(value ?? 'null'); } catch { throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_SECRET_INVALID'); }
  if (!result || typeof result !== 'object' || !('version' in result) || result.version !== 1
    || !('tenantId' in result) || result.tenantId !== scope.tenantId
    || !('connectorId' in result) || result.connectorId !== scope.connectorId
    || !('provider' in result) || result.provider !== scope.provider
    || !('kind' in result) || result.kind !== scope.kind
    || !('parts' in result) || !Array.isArray(result.parts) || result.parts.length < 1 || result.parts.length > 16
    || result.parts.some(id => typeof id !== 'string' || !uuid.test(id))
    || new Set(result.parts).size !== result.parts.length
    || !('digest' in result) || typeof result.digest !== 'string' || !/^[a-f0-9]{64}$/u.test(result.digest)) {
    throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_SECRET_INVALID');
  }
  return result as Manifest;
}

/** Uses the existing encrypted vault only. Each reference remains <=2000 chars;
 * large provider tokens are encrypted parts, never public_config/browser data.
 * Call inside the connector's transaction so partial parts cannot be orphaned.
 */
export async function storeMailboxSecret(vault: PulseDeskMailboxVaultPort, scope: MailboxSecretScope, actorUserId: string, payload: Record<string, unknown>): Promise<string> {
  const prefix = purpose(scope);
  if (!uuid.test(actorUserId)) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_SECRET_SCOPE_INVALID');
  const serialized = JSON.stringify(payload);
  if (!serialized || Buffer.byteLength(serialized) > 18_000) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_SECRET_TOO_LARGE');
  // The common vault trims references; base64 chunks preserve whitespace and
  // Unicode exactly while respecting that existing storage contract.
  const value = Buffer.from(serialized, 'utf8').toString('base64');
  const parts: string[] = [];
  for (let offset = 0; offset < value.length; offset += 1_500) {
    const row = await vault.store({ tenantId: scope.tenantId, moduleKey: 'pulsedesk', purpose: `${prefix}:part`, reference: value.slice(offset, offset + 1_500), actorUserId });
    if (!uuid.test(row.id)) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_SECRET_INVALID');
    parts.push(row.id);
  }
  const entry: Manifest = { version: 1, ...scope, parts, digest: digest(value) };
  const row = await vault.store({ tenantId: scope.tenantId, moduleKey: 'pulsedesk', purpose: `${prefix}:manifest`, reference: JSON.stringify(entry), actorUserId });
  if (!uuid.test(row.id)) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_SECRET_INVALID');
  return row.id;
}
export async function resolveMailboxSecret(vault: PulseDeskMailboxVaultPort, scope: MailboxSecretScope, id: string): Promise<Record<string, unknown>> {
  const prefix = purpose(scope);
  if (!uuid.test(id)) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_SECRET_INVALID');
  const entry = manifest(await vault.resolve({ tenantId: scope.tenantId, moduleKey: 'pulsedesk', purpose: `${prefix}:manifest`, id }), scope);
  let value = '';
  for (const partId of entry.parts) {
    const part = await vault.resolve({ tenantId: scope.tenantId, moduleKey: 'pulsedesk', purpose: `${prefix}:part`, id: partId });
    if (!part || part.length > 1_500) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_SECRET_INVALID');
    value += part;
  }
  if (value.length > 24_000 || digest(value) !== entry.digest) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_SECRET_INVALID');
  let result: unknown;
  try { result = JSON.parse(Buffer.from(value, 'base64').toString('utf8')); } catch { throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_SECRET_INVALID'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_SECRET_INVALID');
  return result as Record<string,unknown>;
}
export async function revokeMailboxSecret(vault: PulseDeskMailboxVaultPort, scope: MailboxSecretScope, id: string): Promise<void> {
  const prefix = purpose(scope);
  if (!uuid.test(id)) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_SECRET_INVALID');
  const entry = manifest(await vault.resolve({ tenantId: scope.tenantId, moduleKey: 'pulsedesk', purpose: `${prefix}:manifest`, id }), scope);
  for (const partId of entry.parts) await vault.revoke({ tenantId: scope.tenantId, moduleKey: 'pulsedesk', purpose: `${prefix}:part`, id: partId });
  await vault.revoke({ tenantId: scope.tenantId, moduleKey: 'pulsedesk', purpose: `${prefix}:manifest`, id });
}
