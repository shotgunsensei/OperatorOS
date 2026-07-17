import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function useSubscription(tenantId: number | null) {
  return useQuery({
    queryKey: ["subscription", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/subscription`),
    enabled: !!tenantId,
  });
}

export function useChangePlan(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { plan: string; billingCycle?: string }) =>
      apiFetch(`/tenants/${tenantId}/subscription/change`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription", tenantId] });
      qc.invalidateQueries({ queryKey: ["usage-summary", tenantId] });
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
  });
}

export function useCancelSubscription(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/tenants/${tenantId}/subscription/cancel`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription", tenantId] }),
  });
}

export function useReactivateSubscription(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/tenants/${tenantId}/subscription/reactivate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription", tenantId] }),
  });
}

export function useBillingProfile(tenantId: number | null) {
  return useQuery({
    queryKey: ["billing-profile", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/billing-profile`),
    enabled: !!tenantId,
  });
}

export function useUpdateBillingProfile(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiFetch(`/tenants/${tenantId}/billing-profile`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing-profile", tenantId] }),
  });
}

export function useInvoices(tenantId: number | null) {
  return useQuery({
    queryKey: ["invoices", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/invoices`),
    enabled: !!tenantId,
  });
}

export function useAddOns(tenantId: number | null) {
  return useQuery({
    queryKey: ["add-ons", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/add-ons`),
    enabled: !!tenantId,
  });
}

export function usePurchaseAddOn(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { addOnId: string }) =>
      apiFetch(`/tenants/${tenantId}/add-ons/purchase`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["add-ons", tenantId] });
      qc.invalidateQueries({ queryKey: ["usage-summary", tenantId] });
      qc.invalidateQueries({ queryKey: ["credit-packs", tenantId] });
    },
  });
}

export function useCreditPacks(tenantId: number | null) {
  return useQuery({
    queryKey: ["credit-packs", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/credit-packs`),
    enabled: !!tenantId,
  });
}

export function useUsageSummary(tenantId: number | null) {
  return useQuery({
    queryKey: ["usage-summary", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/usage-summary`),
    enabled: !!tenantId,
  });
}

export function useIntegrations(tenantId: number | null) {
  return useQuery({
    queryKey: ["integrations", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/integrations`),
    enabled: !!tenantId,
  });
}

export function useConnectIntegration(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) =>
      apiFetch(`/tenants/${tenantId}/integrations/${provider}/connect`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", tenantId] }),
  });
}

export function useDisconnectIntegration(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) =>
      apiFetch(`/tenants/${tenantId}/integrations/${provider}/disconnect`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", tenantId] }),
  });
}

export function useSyncIntegration(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) =>
      apiFetch(`/tenants/${tenantId}/integrations/${provider}/sync`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", tenantId] }),
  });
}

export function useTemplates(tenantId: number | null) {
  return useQuery({
    queryKey: ["templates", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/templates`),
    enabled: !!tenantId,
  });
}

export function useGlobalTemplates() {
  return useQuery({
    queryKey: ["global-templates"],
    queryFn: () => apiFetch(`/templates`),
  });
}

export function useCreateTemplate(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiFetch(`/tenants/${tenantId}/templates`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", tenantId] }),
  });
}

export function useUseTemplate(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: number) =>
      apiFetch(`/tenants/${tenantId}/templates/${templateId}/use`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", tenantId] }),
  });
}

export function useAdminOverview() {
  return useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => apiFetch(`/admin/overview`),
  });
}

export function useAdminTenants() {
  return useQuery({
    queryKey: ["admin-tenants"],
    queryFn: () => apiFetch(`/admin/tenants`),
  });
}

export function useAdminFeatureFlags() {
  return useQuery({
    queryKey: ["admin-feature-flags"],
    queryFn: () => apiFetch(`/admin/feature-flags`),
  });
}

export function useUpdateFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { key: string; isEnabled?: boolean; targetPlans?: string[]; name?: string; description?: string }) =>
      apiFetch(`/admin/feature-flags/${data.key}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-feature-flags"] }),
  });
}

export function useAdminIntegrationsHealth() {
  return useQuery({
    queryKey: ["admin-integrations-health"],
    queryFn: () => apiFetch(`/admin/integrations-health`),
  });
}

export function useAdminTenantDetail(tenantId: number | null) {
  return useQuery({
    queryKey: ["admin-tenant-detail", tenantId],
    queryFn: () => apiFetch(`/admin/tenants/${tenantId}`),
    enabled: !!tenantId,
  });
}

export function useAdminUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, ...data }: { tenantId: number; name?: string; slug?: string; billingStatus?: string }) =>
      apiFetch(`/admin/tenants/${tenantId}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      qc.invalidateQueries({ queryKey: ["admin-tenant-detail", vars.tenantId] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });
}

export function useAdminChangePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, plan, billingCycle }: { tenantId: number; plan: string; billingCycle?: string }) =>
      apiFetch(`/admin/tenants/${tenantId}/plan`, { method: "PUT", body: JSON.stringify({ plan, billingCycle }) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      qc.invalidateQueries({ queryKey: ["admin-tenant-detail", vars.tenantId] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });
}

export function useAdminDeleteTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: number) =>
      apiFetch(`/admin/tenants/${tenantId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });
}

export function useAdminUpdateCredits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, aiCreditsUsed, aiCreditsLimit }: { tenantId: number; aiCreditsUsed?: number; aiCreditsLimit?: number }) =>
      apiFetch(`/admin/tenants/${tenantId}/credits`, { method: "PUT", body: JSON.stringify({ aiCreditsUsed, aiCreditsLimit }) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      qc.invalidateQueries({ queryKey: ["admin-tenant-detail", vars.tenantId] });
    },
  });
}

export function useReports(tenantId: number | null) {
  return useQuery({
    queryKey: ["reports", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/reports`),
    enabled: !!tenantId,
  });
}

export function useCreateReport(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiFetch(`/tenants/${tenantId}/reports`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports", tenantId] }),
  });
}

export function useGenerateReport(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId: number) =>
      apiFetch(`/tenants/${tenantId}/reports/${reportId}/generate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports", tenantId] }),
  });
}

export function useExports(tenantId: number | null) {
  return useQuery({
    queryKey: ["exports", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/exports`),
    enabled: !!tenantId,
  });
}

export function useCreateExport(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiFetch(`/tenants/${tenantId}/exports`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exports", tenantId] }),
  });
}

export function useNotifications(tenantId: number | null) {
  return useQuery({
    queryKey: ["notifications", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/notifications`),
    enabled: !!tenantId,
  });
}

export function useMarkNotificationRead(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/tenants/${tenantId}/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", tenantId] }),
  });
}

export function useMarkAllNotificationsRead(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/tenants/${tenantId}/notifications/read-all`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", tenantId] }),
  });
}

export function useRecommendations(tenantId: number | null) {
  return useQuery({
    queryKey: ["recommendations", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/recommendations`),
    enabled: !!tenantId,
  });
}

export function useDismissRecommendation(tenantId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/tenants/${tenantId}/recommendations/${id}/dismiss`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recommendations", tenantId] }),
  });
}

export function useLeadSubmissions(tenantId: number | null) {
  return useQuery({
    queryKey: ["lead-submissions", tenantId],
    queryFn: () => apiFetch(`/tenants/${tenantId}/lead-submissions`),
    enabled: !!tenantId,
  });
}
