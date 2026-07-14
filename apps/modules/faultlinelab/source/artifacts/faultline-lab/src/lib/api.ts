const API_BASE = '/api';

async function apiFetch(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetches the current user from the local session cookie. Returns `null`
 * when no session is present (HTTP 401). Used by the SPA to detect
 * OperatorOS-cookie sign-in when Clerk is unavailable or the user has not
 * gone through the Clerk widget.
 */
export interface MeUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  authSource: 'operatoros' | 'clerk' | 'unknown';
  localRole: 'admin' | 'standard' | 'read-only' | 'deny' | null;
  operator: {
    planSlug: string | null;
    organizationId: string | null;
    tenantId: string | null;
    role: string | null;
    moduleRole: string | null;
    tenantRole: string | null;
    accessLevel: 'pro' | 'standard' | 'read-only' | 'denied' | null;
    moduleEnabled: boolean;
    subscriptionStatus: string | null;
    features: string[];
    lastLaunchAt: string | null;
    lastEntitlementSyncAt: string | null;
  } | null;
}

export type MeResult =
  | { kind: 'session'; user: MeUser }
  | { kind: 'none' }
  | { kind: 'denied'; reason: string };

export async function fetchMe(): Promise<MeResult> {
  const res = await fetch(`${API_BASE}/me`, { credentials: 'include' });
  if (res.status === 401) return { kind: 'none' };
  if (res.status === 403) {
    let reason = 'access_denied';
    try {
      const body = (await res.json()) as { reason?: string };
      if (body?.reason) reason = body.reason;
    } catch {
      /* ignore */
    }
    return { kind: 'denied', reason };
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const body = (await res.json()) as { user: MeUser };
  return { kind: 'session', user: body.user };
}

export async function logoutSsoSession(): Promise<void> {
  await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' });
}

export type LinkedIdentities = {
  primaryUserId: string;
  clerk: { linked: boolean; clerkId: string | null };
  operatoros: {
    linked: boolean;
    operatorIdentityId: string | null;
    planSlug: string | null;
    organizationId: string | null;
    role: string | null;
  };
};

export async function fetchLinkedIdentities(): Promise<LinkedIdentities> {
  return apiFetch('/account/identities');
}

export async function linkClerkAccount(): Promise<{
  success: boolean;
  alreadyLinked: boolean;
  identities: LinkedIdentities;
}> {
  return apiFetch('/account/link', { method: 'POST', body: JSON.stringify({}) });
}

export async function unlinkAccountIdentity(
  identity: 'clerk' | 'operatoros'
): Promise<{ success: boolean; identities: LinkedIdentities }> {
  return apiFetch('/account/unlink', {
    method: 'POST',
    body: JSON.stringify({ identity }),
  });
}

export async function fetchEmailPreferences(): Promise<{
  renewalEmailsEnabled: boolean;
}> {
  return apiFetch('/account/email-preferences');
}

export async function updateEmailPreferences(patch: {
  renewalEmailsEnabled: boolean;
}): Promise<{ renewalEmailsEnabled: boolean }> {
  return apiFetch('/account/email-preferences', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export async function fetchProfile() {
  return apiFetch('/profile');
}

export async function saveProfileToCloud(data: {
  profile: unknown;
  settings: unknown;
  caseStates: unknown;
}) {
  return apiFetch('/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function fetchEntitlements() {
  return apiFetch('/entitlements');
}

export async function startStripeCheckout(
  catalogProductId: string,
  interval?: 'month' | 'year'
): Promise<{ url: string | null }> {
  return apiFetch('/stripe/checkout-by-catalog', {
    method: 'POST',
    body: JSON.stringify({ catalogProductId, interval }),
  });
}

export async function fetchSubscription(): Promise<{
  subscription: {
    id: string;
    status: string;
    current_period_end: number | string | null;
    cancel_at_period_end?: boolean | null;
  } | null;
}> {
  return apiFetch('/stripe/subscription');
}

export async function createBillingPortalSession(): Promise<{ url: string }> {
  return apiFetch('/stripe/portal-session', { method: 'POST' });
}

export type BillingHistoryEntry = {
  kind: 'invoice' | 'purchase';
  id: string;
  productId: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  createdAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  number: string | null;
};

export async function fetchBillingHistory(): Promise<{ history: BillingHistoryEntry[] }> {
  return apiFetch('/stripe/invoices');
}

export async function adminFetchUsers() {
  return apiFetch('/admin/users');
}

export async function adminFetchUserEntitlements(userId: string) {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/entitlements`);
}

export async function adminGrantEntitlement(
  userId: string,
  productId: string,
  source: string = 'admin-grant'
) {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/entitlements`, {
    method: 'POST',
    body: JSON.stringify({ productId, source }),
  });
}

export async function fetchCatalogOverrides() {
  return apiFetch('/catalog/overrides');
}

export function getCatalogOverridesStreamUrl(): string {
  return `${API_BASE}/catalog/overrides/stream`;
}

export async function adminFetchCatalogOverrides() {
  return apiFetch('/admin/catalog/overrides');
}

export type CatalogOverridePayload = {
  status?: 'available' | 'coming-soon' | 'disabled';
  featured?: boolean;
  shortDescription?: string;
  longDescription?: string;
  tags?: string[];
};

export type AdminSaveCatalogOverrideResponse = {
  success: boolean;
  updatedAt: string;
  updatedByUserId: string | null;
};

export async function adminSaveCatalogOverride(
  productId: string,
  overrides: CatalogOverridePayload
): Promise<AdminSaveCatalogOverrideResponse> {
  return apiFetch(`/admin/catalog/overrides/${encodeURIComponent(productId)}`, {
    method: 'PUT',
    body: JSON.stringify(overrides),
  }) as Promise<AdminSaveCatalogOverrideResponse>;
}

export async function adminRevertCatalogOverride(productId: string) {
  return apiFetch(`/admin/catalog/overrides/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  });
}

export type CatalogOverrideHistoryEntry = {
  id: string;
  productId: string;
  action: 'create' | 'update' | 'rollback' | 'revert' | string;
  overrides: CatalogOverridePayload | null;
  previousOverrides: CatalogOverridePayload | null;
  changedAt: string | null;
  changedByUserId: string | null;
  editor: { id: string; displayName: string | null; email: string | null } | null;
};

export async function adminFetchCatalogOverrideHistory(
  productId: string
): Promise<{ history: CatalogOverrideHistoryEntry[] }> {
  return apiFetch(
    `/admin/catalog/overrides/${encodeURIComponent(productId)}/history`
  );
}

export async function adminRollbackCatalogOverride(
  productId: string,
  historyId: string
): Promise<{
  success: boolean;
  restored: CatalogOverridePayload | null;
  updatedAt?: string;
  updatedByUserId?: string | null;
}> {
  return apiFetch(
    `/admin/catalog/overrides/${encodeURIComponent(productId)}/rollback/${encodeURIComponent(historyId)}`,
    { method: 'POST' }
  );
}

export type CaseDraftEditor = {
  id: string;
  displayName: string | null;
  email: string | null;
};

export type CaseDraftRecord = {
  id: string;
  draft: unknown;
  updatedAt: string | null;
  updatedByUserId: string | null;
  editor: CaseDraftEditor | null;
};

export async function adminFetchCaseDrafts(): Promise<{ drafts: CaseDraftRecord[] }> {
  return apiFetch('/admin/case-drafts');
}

export async function adminSaveCaseDraft(
  draftId: string,
  draft: unknown
): Promise<{ success: boolean; updatedAt: string; updatedByUserId: string | null }> {
  return apiFetch(`/admin/case-drafts/${encodeURIComponent(draftId)}`, {
    method: 'PUT',
    body: JSON.stringify({ draft }),
  });
}

export async function adminDeleteCaseDraft(draftId: string): Promise<{ success: boolean }> {
  return apiFetch(`/admin/case-drafts/${encodeURIComponent(draftId)}`, {
    method: 'DELETE',
  });
}

export async function adminRevokeEntitlement(userId: string, entitlementId: string) {
  return apiFetch(
    `/admin/users/${encodeURIComponent(userId)}/entitlements/${encodeURIComponent(entitlementId)}`,
    { method: 'DELETE' }
  );
}

export async function adminUpdateUserRole(
  userId: string,
  patch: { isAdmin?: boolean; isSuperAdmin?: boolean }
): Promise<{ success: boolean }> {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function adminDeleteUser(userId: string): Promise<{ success: boolean }> {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export type CrossPromoRecentRow = {
  id: string;
  placementId: string;
  targetProduct: string;
  targetUrl: string;
  route: string | null;
  userTier: 'anonymous' | 'free' | 'pro';
  createdAt: string | null;
};
export type CrossPromoDashboard = {
  totals: { total7d: number; total30d: number };
  topPlacements7d: Array<{ placementId: string; clicks: number }>;
  topPlacements30d: Array<{ placementId: string; clicks: number }>;
  topTargets7d: Array<{ targetProduct: string; clicks: number }>;
  topTargets30d: Array<{ targetProduct: string; clicks: number }>;
  recent: CrossPromoRecentRow[];
};

export async function adminFetchCrossPromoClicks(): Promise<CrossPromoDashboard> {
  return apiFetch('/admin/cross-promo/clicks');
}

export type CrossPromoExportWindow = '7d' | '30d' | '90d';

export async function adminDownloadCrossPromoClicksCsv(
  window: CrossPromoExportWindow,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(
    `${API_BASE}/admin/cross-promo/clicks.csv?window=${encodeURIComponent(window)}`,
    { credentials: 'include' },
  );
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // not JSON, keep default message
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? `cross-promo-clicks-${window}.csv`;
  return { blob, filename };
}

export type CrossPromoClickEvent = {
  placementId: string;
  targetProduct: string;
  targetUrl: string;
  route?: string;
  userTier: 'anonymous' | 'free' | 'pro';
};

/**
 * Fire-and-forget cross-promo click telemetry. Never throws and never blocks
 * navigation — the caller should not await this in a way that delays the
 * user. Uses `fetch` with `keepalive: true` so the request survives a
 * page-unload / target=_blank handoff.
 */
export function recordCrossPromoClick(event: CrossPromoClickEvent): void {
  try {
    void fetch(`${API_BASE}/cross-promo/click`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }).catch(() => {});
  } catch {
    // swallow — telemetry must never block navigation
  }
}
