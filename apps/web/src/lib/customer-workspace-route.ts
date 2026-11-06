/** Qualified record selections only. Names, search text and contact data never
 * become navigation state or authorize a request. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CUSTOMER_WORKSPACE_PARAMS = ['cwTenant', 'cwCustomer', 'cwSite', 'cwContact', 'cwJob'] as const;

export interface CustomerWorkspaceSelection {
  organizationId: string | null;
  siteId: string | null;
  contactId: string | null;
  jobId: string | null;
}
export const EMPTY_CUSTOMER_SELECTION: CustomerWorkspaceSelection = {
  organizationId: null, siteId: null, contactId: null, jobId: null,
};
export function isWorkspaceId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
export function readCustomerWorkspaceSelection(search: string, tenantId: string): {
  selection: CustomerWorkspaceSelection; invalid: boolean;
} {
  const params = new URLSearchParams(search);
  const hasSelection = CUSTOMER_WORKSPACE_PARAMS.some(key => params.has(key));
  const read = (key: string) => params.get(key)?.toLowerCase() || null;
  if (!hasSelection) return { selection: EMPTY_CUSTOMER_SELECTION, invalid: false };
  if (CUSTOMER_WORKSPACE_PARAMS.some(key => params.getAll(key).length > 1)
    || read('cwTenant') !== tenantId.toLowerCase()
    || !isWorkspaceId(read('cwCustomer'))
    || ['cwSite', 'cwContact', 'cwJob'].some(key => params.has(key) && !isWorkspaceId(read(key)))) {
    return { selection: EMPTY_CUSTOMER_SELECTION, invalid: true };
  }
  return { selection: { organizationId: read('cwCustomer'), siteId: read('cwSite'), contactId: read('cwContact'), jobId: read('cwJob') }, invalid: false };
}
export function customerWorkspaceHref(tenantId: string, selection: CustomerWorkspaceSelection): string {
  const params = new URLSearchParams({ page: 'customer-workspace' });
  if (isWorkspaceId(tenantId) && isWorkspaceId(selection.organizationId)) {
    params.set('cwTenant', tenantId.toLowerCase());
    params.set('cwCustomer', selection.organizationId.toLowerCase());
    for (const [key, value] of [['cwSite', selection.siteId], ['cwContact', selection.contactId], ['cwJob', selection.jobId]] as const) {
      if (isWorkspaceId(value)) params.set(key, value.toLowerCase());
    }
  }
  return `/app?${params}`;
}

/** Only the existing SnapProof job/report result routes, with a native UUID. */
export function customerWorkspaceResultLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^\/modules\/snapproofos\/(jobs|reports)\/([^/?#]+)$/.exec(value);
  return match && isWorkspaceId(match[2]) ? value : null;
}
