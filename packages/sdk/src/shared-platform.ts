/**
 * Phase 22 shared-platform contracts.
 *
 * These types are intentionally transport-neutral. Child modules consume this
 * vocabulary instead of owning identity, billing, provider, storage, job, or
 * tenant authority locally.
 */

export type SharedProviderKind = 'email' | 'sms' | 'ai' | 'storage' | 'oauth' | 'webhook';
export type SharedProviderMode = 'disabled' | 'test' | 'live';
export type SharedReadinessState = 'ready' | 'degraded' | 'blocked';
export type SharedDeliveryState = 'pending' | 'processing' | 'retry' | 'delivered' | 'disabled' | 'dead_letter' | 'cancelled';
export type SharedJobState = 'pending' | 'processing' | 'retry' | 'completed' | 'dead_letter' | 'cancelled';
export type SharedAttachmentScanState = 'pending' | 'clean' | 'unavailable' | 'infected' | 'error';

export interface SharedAuthorityContext {
  tenantId: string;
  moduleId: string;
  moduleSlug: string;
  actorUserId: string;
  tenantRole: 'owner' | 'admin' | 'member' | 'viewer';
  moduleAccessLevel: 'none' | 'user' | 'manager' | 'viewer';
  correlationId: string;
}

export interface SharedProviderReadiness {
  providerKey: string;
  kind: SharedProviderKind;
  mode: SharedProviderMode;
  state: SharedReadinessState;
  liveCredentialsPresent: boolean;
  callbackReady: boolean;
  externalDelivery: boolean;
  reasonCode: string | null;
  checkedAt: string;
}

export interface SharedProviderConfiguration {
  id: string;
  tenantId: string;
  moduleId: string | null;
  providerKey: string;
  kind: SharedProviderKind;
  mode: SharedProviderMode;
  readiness: SharedProviderReadiness;
  hasSecretReference: boolean;
  secretFingerprint: string | null;
  publicConfig: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeterministicProviderResult<TPayload = Record<string, unknown>> {
  accepted: boolean;
  externalDelivery: false;
  adapter: 'deterministic-test';
  payload: TPayload;
  receiptId: string;
  state: 'recorded_not_delivered';
}

export interface SharedAttachmentContract {
  id: string;
  tenantId: string;
  moduleId: string;
  objectType: string;
  objectId: string;
  originalName: string;
  detectedMimeType: string;
  sizeBytes: number;
  sha256: string;
  scanState: SharedAttachmentScanState;
  retentionUntil: string | null;
  signedRetrievalAvailable: boolean;
}

export interface SharedNotificationRequest {
  channel: 'email' | 'sms' | 'in_app';
  templateKey?: string;
  destination?: string;
  recipientUserId?: string;
  variables: Record<string, string | number | boolean | null>;
  idempotencyKey: string;
}

export interface SharedWebhookRequest {
  endpointId: string;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

export interface SharedJobRequest {
  handlerKey: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  runAt?: string;
  maxAttempts?: number;
}

export interface SharedExportRequest {
  exportType: string;
  filters: Record<string, unknown>;
  idempotencyKey: string;
  format: 'json' | 'csv';
}

export interface SharedExportStatus {
  id: string;
  state: SharedJobState;
  exportType: string;
  format: 'json' | 'csv';
  attachmentId: string | null;
  downloadExpiresAt: string | null;
  errorCode: string | null;
}

export interface SharedApiTokenDescriptor {
  id: string;
  serviceIdentityId: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface SharedUsageEntry {
  operation: string;
  units: number;
  unitKind: string;
  occurredAt: string;
  provenance: Record<string, unknown>;
}

export interface SharedSearchResult {
  moduleId: string;
  moduleSlug: string;
  objectType: string;
  objectId: string;
  title: string;
  summary: string | null;
  deepLink: string;
}

export interface SharedFeatureFlag {
  key: string;
  enabled: boolean;
  value: Record<string, unknown>;
  source: 'tenant_admin' | 'platform' | 'plan' | 'provider_readiness';
  version: number;
}

export interface SharedLegacyReference {
  sourceSystem: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  moduleSlug: string;
  provenance: Record<string, unknown>;
}

export interface SharedPlatformServices {
  getProviderReadiness(context: SharedAuthorityContext): Promise<SharedProviderReadiness[]>;
  enqueueNotification(context: SharedAuthorityContext, request: SharedNotificationRequest): Promise<{ id: string; state: SharedDeliveryState }>;
  enqueueWebhook(context: SharedAuthorityContext, request: SharedWebhookRequest): Promise<{ id: string; state: SharedDeliveryState }>;
  enqueueJob(context: SharedAuthorityContext, request: SharedJobRequest): Promise<{ id: string; state: SharedJobState }>;
  requestExport(context: SharedAuthorityContext, request: SharedExportRequest): Promise<SharedExportStatus>;
  recordUsage(context: SharedAuthorityContext, entry: SharedUsageEntry): Promise<void>;
  search(context: SharedAuthorityContext, query: string): Promise<SharedSearchResult[]>;
  getFeatureFlags(context: SharedAuthorityContext): Promise<SharedFeatureFlag[]>;
  resolveLegacyReference(context: SharedAuthorityContext, reference: Omit<SharedLegacyReference, 'moduleSlug' | 'provenance'>): Promise<SharedLegacyReference | null>;
}
