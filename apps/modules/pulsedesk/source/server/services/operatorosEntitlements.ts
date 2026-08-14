import crypto from "crypto";
import type { Request, Response } from "express";
import type { OperatorOsEntitlementSnapshot } from "@shared/schema";
import { storage, type UpsertOperatorOsEntitlementSnapshotInput } from "../storage";

const DEFAULT_MODULE_SLUG = "pulsedesk";
const STALE_AFTER_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

type JsonRecord = Record<string, unknown>;

export interface CacheSnapshotOptions {
  localUserId?: string | null;
  localOrgId?: string | null;
  fallbackOperatorOsUserId?: string | null;
  fallbackOperatorOsTenantId?: string | null;
  fallbackComputedAt?: Date | null;
  moduleSlug?: string;
}

export interface CacheSnapshotResult {
  snapshot: OperatorOsEntitlementSnapshot | null;
  staleIgnored: boolean;
  reason?: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function normalizeSlug(slug: string | undefined | null): string {
  return (slug || DEFAULT_MODULE_SLUG).trim().toLowerCase();
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function getOperatorOsModuleSlug(): string {
  return normalizeSlug(process.env.OPERATOROS_SSO_AUDIENCE || DEFAULT_MODULE_SLUG);
}

export function getPublicAppBaseUrl(): string | null {
  const configured =
    process.env.PULSEDESK_PUBLIC_URL
    || process.env.APP_BASE_URL
    || process.env.PUBLIC_BASE_URL
    || process.env.PULSEDESK_URL;
  if (configured?.trim()) return normalizeBaseUrl(configured);

  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains?.trim()) {
    return `https://${replitDomains.split(",")[0].trim()}`.replace(/\/+$/, "");
  }

  return null;
}

function getSnapshotSource(raw: unknown): JsonRecord | null {
  const top = asRecord(raw);
  if (!top) return null;
  return asRecord(top.entitlement) ?? asRecord(top.snapshot) ?? top;
}

function getNestedRecord(source: JsonRecord, key: string): JsonRecord | null {
  return asRecord(source[key]);
}

function getModules(source: JsonRecord): JsonRecord[] {
  const modules = source.modules;
  if (!Array.isArray(modules)) return [];
  return modules.filter(isRecord);
}

function findTargetModule(source: JsonRecord, moduleSlug: string): JsonRecord | null {
  const modules = getModules(source);
  if (modules.length === 0) return null;

  const receiverSlug = normalizeSlug(readString(source.receiver_slug));
  const targetSlug = normalizeSlug(moduleSlug);

  return modules.find((entry) => {
    const slug = normalizeSlug(readString(entry.slug));
    return slug === receiverSlug || slug === targetSlug;
  }) ?? null;
}

function readFeatureMap(moduleEntry: JsonRecord | null, source: JsonRecord): Record<string, unknown> {
  const moduleFeatures = asRecord(moduleEntry?.features);
  if (moduleFeatures) return moduleFeatures;
  const flatFeatures = asRecord(source.target_module_features);
  return flatFeatures ?? {};
}

function readOperatorOsUserId(source: JsonRecord, fallback?: string | null): string | null {
  const user = getNestedRecord(source, "user");
  return readString(user?.id)
    ?? readString(source.user_id)
    ?? readString(source.sub)
    ?? fallback
    ?? null;
}

function readOperatorOsTenantId(source: JsonRecord, fallback?: string | null): string | null {
  const tenant = getNestedRecord(source, "tenant");
  return readString(tenant?.id)
    ?? readString(source.operatoros_tenant_id)
    ?? readString(source.tenant_id)
    ?? readString(source.organization_id)
    ?? fallback
    ?? null;
}

function buildSnapshotInput(raw: unknown, options: CacheSnapshotOptions): UpsertOperatorOsEntitlementSnapshotInput | null {
  const source = getSnapshotSource(raw);
  if (!source) return null;

  const moduleSlug = getOperatorOsModuleSlug();
  const targetModule = findTargetModule(source, options.moduleSlug ?? moduleSlug);
  const modules = getModules(source);
  const tenant = getNestedRecord(source, "tenant");
  const subscription = getNestedRecord(source, "subscription");

  const operatorOsUserId = readOperatorOsUserId(source, options.fallbackOperatorOsUserId);
  const operatorOsTenantId = readOperatorOsTenantId(source, options.fallbackOperatorOsTenantId);
  if (!operatorOsUserId || !operatorOsTenantId) return null;

  const flatEnabled = readBoolean(source.target_module_enabled);
  const targetEnabled = targetModule
    ? readBoolean(targetModule.enabled) !== false
    : modules.length > 0
      ? false
      : flatEnabled !== false;

  const computedAt =
    readDate(source.computedAt)
    ?? readDate(source.computed_at)
    ?? options.fallbackComputedAt
    ?? new Date();

  return {
    operatorOsUserId,
    operatorOsTenantId,
    localUserId: options.localUserId ?? null,
    localOrgId: options.localOrgId ?? null,
    moduleSlug: normalizeSlug(readString(targetModule?.slug) ?? options.moduleSlug ?? moduleSlug),
    enabled: targetEnabled,
    accessLevel: readString(targetModule?.accessLevel) ?? readString(source.target_module_access_level) ?? "none",
    moduleRole: readString(targetModule?.moduleRole) ?? readString(source.target_module_role) ?? "none",
    tenantRole: readString(tenant?.role) ?? readString(source.tenant_role) ?? null,
    tenantRoleAlias: readString(tenant?.roleAlias) ?? readString(source.tenant_role_alias) ?? null,
    subscriptionStatus: readString(subscription?.status) ?? readString(source.subscription_status) ?? null,
    features: readFeatureMap(targetModule, source),
    rawSnapshot: source,
    computedAt,
    revokedAt: targetEnabled ? null : new Date(),
  };
}

export async function cacheOperatorOsEntitlementSnapshot(
  raw: unknown,
  options: CacheSnapshotOptions = {}
): Promise<CacheSnapshotResult> {
  const input = buildSnapshotInput(raw, options);
  if (!input) {
    return { snapshot: null, staleIgnored: false, reason: "invalid_snapshot" };
  }

  let localUserId = input.localUserId ?? null;
  let localOrgId = input.localOrgId ?? null;

  if (!localUserId) {
    const user = await storage.getUserByOperatorOsId(input.operatorOsUserId);
    localUserId = user?.id ?? null;
  }
  if (!localOrgId) {
    const org = await storage.getOrgByOperatorOsId(input.operatorOsTenantId);
    localOrgId = org?.id ?? null;
  }

  const result = await storage.upsertOperatorOsEntitlementSnapshot({
    ...input,
    localUserId,
    localOrgId,
  });

  return { ...result };
}

export function verifyOperatorOsSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const secret = process.env.MODULE_SSO_SECRET;
  if (!secret || !signatureHeader) return false;

  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signatureHeader.trim(), "utf8");
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function logEntitlementEvent(params: {
  eventType: string;
  snapshot?: OperatorOsEntitlementSnapshot | null;
  success: boolean;
  details?: Record<string, unknown>;
  req?: Request;
}) {
  try {
    await storage.createAuthAuditLog({
      orgId: params.snapshot?.localOrgId ?? null,
      userId: params.snapshot?.localUserId ?? null,
      eventType: params.eventType,
      authSource: "operatoros",
      tenantResolved: params.snapshot?.operatorOsTenantId ?? null,
      ipAddress: params.req?.ip ?? null,
      userAgent: params.req?.headers["user-agent"] ?? null,
      details: params.details ?? null,
      success: params.success,
    });
  } catch (err: any) {
    console.error("[operatoros-entitlements] audit log write failed:", err?.message);
  }
}

export async function handleOperatorOsEntitlementWebhook(req: Request, res: Response) {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === "string" ? req.body : "");
  const signature = firstHeader(req.headers["x-operatoros-signature"] as string | string[] | undefined);

  if (!verifyOperatorOsSignature(rawBody, signature)) {
    void logEntitlementEvent({
      req,
      eventType: "operatoros_entitlement_webhook_signature_failed",
      success: false,
      details: { reason: "invalid_signature" },
    });
    return res.status(401).json({ code: "invalid_signature" });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ code: "invalid_json" });
  }

  const result = await cacheOperatorOsEntitlementSnapshot(parsed, {
    moduleSlug: getOperatorOsModuleSlug(),
  });

  if (!result.snapshot) {
    void logEntitlementEvent({
      req,
      eventType: "operatoros_entitlement_webhook_invalid_snapshot",
      success: false,
      details: { reason: result.reason ?? "invalid_snapshot" },
    });
    return res.status(400).json({ code: "invalid_snapshot" });
  }

  void logEntitlementEvent({
    req,
    snapshot: result.snapshot,
    eventType: result.staleIgnored
      ? "operatoros_entitlement_webhook_stale_ignored"
      : result.snapshot.enabled
        ? "operatoros_entitlement_webhook_updated"
        : "operatoros_entitlement_webhook_revoked",
    success: true,
    details: {
      snapshotId: result.snapshot.id,
      moduleSlug: result.snapshot.moduleSlug,
      enabled: result.snapshot.enabled,
      staleIgnored: result.staleIgnored,
      computedAt: result.snapshot.computedAt,
    },
  });

  return res.json({
    ok: true,
    snapshotId: result.snapshot.id,
    enabled: result.snapshot.enabled,
    staleIgnored: result.staleIgnored,
  });
}

function resolveIntrospectionUrl(): string | null {
  if (process.env.OPERATOROS_ENTITLEMENTS_INTROSPECT_URL?.trim()) {
    return normalizeBaseUrl(process.env.OPERATOROS_ENTITLEMENTS_INTROSPECT_URL);
  }
  if (process.env.OPERATOROS_INTROSPECTION_URL?.trim()) {
    return normalizeBaseUrl(process.env.OPERATOROS_INTROSPECTION_URL);
  }
  const baseUrl = process.env.OPERATOROS_BASE_URL;
  if (!baseUrl?.trim()) return null;
  return `${normalizeBaseUrl(baseUrl)}/v1/sso/entitlements/introspect`;
}

export async function introspectOperatorOsEntitlement(
  operatorOsUserId: string,
  operatorOsTenantId: string,
  options: CacheSnapshotOptions = {}
): Promise<CacheSnapshotResult> {
  const serviceToken = process.env.OPERATOROS_SERVICE_TOKEN;
  const introspectionUrl = resolveIntrospectionUrl();
  if (!serviceToken || !introspectionUrl) {
    return { snapshot: null, staleIgnored: false, reason: "introspection_not_configured" };
  }

  const url = new URL(introspectionUrl);
  url.searchParams.set("user_id", operatorOsUserId);
  url.searchParams.set("tenant_id", operatorOsTenantId);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });

    if (!response.ok) {
      return {
        snapshot: null,
        staleIgnored: false,
        reason: `introspection_failed_${response.status}`,
      };
    }

    const snapshot = await response.json();
    return cacheOperatorOsEntitlementSnapshot(snapshot, {
      ...options,
      fallbackOperatorOsUserId: operatorOsUserId,
      fallbackOperatorOsTenantId: operatorOsTenantId,
      moduleSlug: options.moduleSlug ?? getOperatorOsModuleSlug(),
    });
  } catch {
    return { snapshot: null, staleIgnored: false, reason: "introspection_unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

export function isSnapshotActive(snapshot: OperatorOsEntitlementSnapshot | null | undefined): snapshot is OperatorOsEntitlementSnapshot {
  return !!snapshot && snapshot.enabled === true && !snapshot.revokedAt;
}

export function isSnapshotStale(snapshot: OperatorOsEntitlementSnapshot): boolean {
  return Date.now() - new Date(snapshot.computedAt).getTime() > STALE_AFTER_MS;
}

function featureAliases(feature: string): string[] {
  const aliases: Record<string, string[]> = {
    emailToTicket: ["emailToTicket", "email_to_ticket", "email-to-ticket"],
    entraEnabled: ["entraEnabled", "entra_enabled", "m365", "m365_sso", "m365Sso", "entra_sso"],
    maxTickets: ["maxTickets", "max_tickets", "ticket_limit", "tickets"],
    maxMembers: ["maxMembers", "max_members", "seat_limit", "seats"],
  };
  return aliases[feature] ?? [feature];
}

function featureValue(snapshot: OperatorOsEntitlementSnapshot, feature: string): unknown {
  const features = asRecord(snapshot.features) ?? {};
  for (const key of featureAliases(feature)) {
    if (Object.prototype.hasOwnProperty.call(features, key)) {
      return features[key];
    }
  }
  return undefined;
}

export function snapshotAllowsFeature(snapshot: OperatorOsEntitlementSnapshot | null | undefined, feature: string): boolean {
  if (!isSnapshotActive(snapshot)) return false;
  const value = featureValue(snapshot, feature);
  if (value === undefined) return true;
  return value === true;
}

export function snapshotNumericLimit(snapshot: OperatorOsEntitlementSnapshot | null | undefined, feature: string): number | null {
  if (!isSnapshotActive(snapshot)) return null;
  const value = featureValue(snapshot, feature);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function getCurrentEntitlementSnapshotForRequest(
  req: Request,
  options: { refreshIfStale?: boolean; refreshIfMissing?: boolean; moduleSlug?: string } = {}
): Promise<OperatorOsEntitlementSnapshot | null> {
  const moduleSlug = normalizeSlug(options.moduleSlug ?? req.session.operatorOsModuleSlug ?? getOperatorOsModuleSlug());

  let snapshot: OperatorOsEntitlementSnapshot | undefined;
  if (req.session.operatorOsEntitlementSnapshotId) {
    snapshot = await storage.getOperatorOsEntitlementSnapshotById(req.session.operatorOsEntitlementSnapshotId);
  }

  if (!snapshot && req.session.userId && req.session.orgId) {
    snapshot = await storage.getCurrentOperatorOsEntitlementSnapshot(req.session.userId, req.session.orgId, moduleSlug);
  }

  const canRefresh =
    req.session.operatorOsUserId
    && req.session.operatorOsTenantId
    && (options.refreshIfMissing || (options.refreshIfStale && snapshot && isSnapshotStale(snapshot)));

  if ((!snapshot || (snapshot && isSnapshotStale(snapshot))) && canRefresh) {
    const refreshed = await introspectOperatorOsEntitlement(
      req.session.operatorOsUserId!,
      req.session.operatorOsTenantId!,
      {
        localUserId: req.session.userId ?? null,
        localOrgId: req.session.orgId ?? null,
        moduleSlug,
      }
    );
    if (refreshed.snapshot) snapshot = refreshed.snapshot;
  }

  if (snapshot) {
    req.session.operatorOsEntitlementSnapshotId = snapshot.id;
    req.session.operatorOsUserId = snapshot.operatorOsUserId;
    req.session.operatorOsTenantId = snapshot.operatorOsTenantId;
    req.session.operatorOsModuleSlug = snapshot.moduleSlug;
  }

  return snapshot ?? null;
}

export async function isOperatorOsFeatureEnabledForOrg(orgId: string, feature: string): Promise<boolean> {
  const snapshot = await storage.getLatestOperatorOsEntitlementSnapshotForOrg(orgId, getOperatorOsModuleSlug());
  return snapshotAllowsFeature(snapshot, feature);
}

export async function getOperatorOsNumericLimitForOrg(orgId: string, feature: string): Promise<number | null> {
  const snapshot = await storage.getLatestOperatorOsEntitlementSnapshotForOrg(orgId, getOperatorOsModuleSlug());
  return snapshotNumericLimit(snapshot, feature);
}

export async function registerOperatorOsEntitlementWebhook(log: (message: string, source?: string) => void = console.log) {
  const serviceToken = process.env.OPERATOROS_SERVICE_TOKEN;
  const baseUrl = process.env.OPERATOROS_BASE_URL;
  const publicBaseUrl = getPublicAppBaseUrl();

  if (!serviceToken || !baseUrl || !publicBaseUrl) {
    log("OperatorOS entitlement webhook registration skipped: missing OPERATOROS_SERVICE_TOKEN, OPERATOROS_BASE_URL, or public app base URL", "operatoros");
    return;
  }

  const syncUrl = process.env.OPERATOROS_ENTITLEMENT_SYNC_URL?.trim()
    || `${normalizeBaseUrl(baseUrl)}/v1/sso/entitlements/sync`;
  const webhookUrl = `${publicBaseUrl}/webhooks/operatoros/entitlements`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(syncUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        module_slug: getOperatorOsModuleSlug(),
        webhook_url: webhookUrl,
      }),
      signal: ctrl.signal,
    });

    if (!response.ok) {
      log(`OperatorOS entitlement webhook registration failed with HTTP ${response.status}`, "operatoros");
      return;
    }

    log(`OperatorOS entitlement webhook registered: ${webhookUrl}`, "operatoros");
  } catch (err: any) {
    log(`OperatorOS entitlement webhook registration skipped: ${err?.message ?? "unavailable"}`, "operatoros");
  } finally {
    clearTimeout(timer);
  }
}
