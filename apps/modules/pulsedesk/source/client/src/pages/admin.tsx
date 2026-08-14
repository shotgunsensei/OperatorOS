import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileSearch,
  Inbox,
  KeyRound,
  LogIn,
  Play,
  Power,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  Trash2,
  UserCog,
  Users,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { PulseLoader } from "@/components/pulse-line";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EntitlementSummary {
  id: string;
  enabled: boolean;
  accessLevel: string;
  moduleRole: string;
  tenantRole: string | null;
  subscriptionStatus: string | null;
  computedAt: string;
  receivedAt: string;
  revokedAt: string | null;
}

interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  plan: string;
  memberCount: number;
  authMode: string;
  ssoStatus: string;
  recentActivityAt: string | null;
  counts: { tickets: number; departments: number; assets: number; members: number };
  entitlement: EntitlementSummary | null;
  connectorHealth: {
    total: number;
    active: number;
    error: number;
    disabled: number;
    pendingAuth: number;
    lastError: string | null;
  };
}

interface AdminMember {
  id: string;
  orgId: string;
  userId: string;
  role: string;
  username: string;
  fullName: string;
  email: string | null;
  isSuperAdmin: boolean;
}

interface UserMembership {
  orgId: string;
  role: string;
  orgName: string;
  orgSlug: string;
  orgPlan: string;
}

interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  isSuperAdmin: boolean;
  isConfiguredMasterAdmin: boolean;
  createdAt: string | null;
  memberships: UserMembership[];
}

interface EntitlementRow {
  id: string;
  operatorOsUserId: string;
  operatorOsTenantId: string;
  localUserId: string | null;
  localOrgId: string | null;
  moduleSlug: string;
  enabled: boolean;
  accessLevel: string;
  moduleRole: string;
  tenantRole: string | null;
  tenantRoleAlias: string | null;
  subscriptionStatus: string | null;
  features: Record<string, unknown>;
  computedAt: string;
  receivedAt: string;
  revokedAt: string | null;
  userEmail: string | null;
  userFullName: string | null;
  orgName: string | null;
  orgSlug: string | null;
}

interface AdminConnector {
  id: string;
  orgId: string;
  provider: string;
  label: string;
  status: string;
  emailAddress: string | null;
  lastPolledAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  emailsProcessed: number;
  enabled: boolean;
  orgName: string;
  pollerRunning: boolean;
}

interface FailedEmail {
  id: string;
  orgId: string | null;
  fromEmail: string;
  subject: string | null;
  provider: string | null;
  receivedAt: string;
  errorMessage: string | null;
}

interface AuditRow {
  id: string;
  orgId: string | null;
  userId: string | null;
  eventType: string;
  ipAddress: string | null;
  userAgent: string | null;
  details: any;
  success: boolean;
  createdAt: string;
  orgName: string | null;
  orgSlug: string | null;
  actorUsername: string | null;
  actorFullName: string | null;
}

const ROLE_OPTIONS = ["owner", "admin", "supervisor", "staff", "technician", "readonly"];
const AUTH_MODE_OPTIONS = ["local", "m365", "hybrid"];
const AUDIT_PAGE_SIZE = 50;

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-500"}`} />;
}

function entitlementState(entitlement: EntitlementSummary | EntitlementRow | null | undefined) {
  if (!entitlement) return { label: "Missing", className: "border-slate-300 text-slate-600", ok: false };
  if (!entitlement.enabled || entitlement.revokedAt) return { label: "Revoked", className: "border-rose-300 text-rose-700", ok: false };
  return { label: "Enabled", className: "border-emerald-300 text-emerald-700", ok: true };
}

function invalidateAdminQueries() {
  queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs"] });
  queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
  queryClient.invalidateQueries({ queryKey: ["/api/admin/connectors"] });
  queryClient.invalidateQueries({ queryKey: ["/api/admin/imap/status"] });
  queryClient.invalidateQueries({ queryKey: ["/api/admin/email/failed"] });
  queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/admin/entitlements") });
  queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/admin/audit") });
}

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("tenants");
  const [tenantSearch, setTenantSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [entitlementStateFilter, setEntitlementStateFilter] = useState("all");
  const [entitlementOrgFilter, setEntitlementOrgFilter] = useState("all");
  const [connectorSearch, setConnectorSearch] = useState("");
  const [auditEventType, setAuditEventType] = useState("all");
  const [auditOffset, setAuditOffset] = useState(0);
  const [expandedAuditRow, setExpandedAuditRow] = useState<string | null>(null);
  const [orgForm, setOrgForm] = useState({ name: "", slug: "", phone: "", email: "", address: "", authMode: "local" });

  const enabled = !!user?.isSuperAdmin;
  const orgsQuery = useQuery<AdminOrg[]>({ queryKey: ["/api/admin/orgs"], enabled });
  const usersQuery = useQuery<AdminUser[]>({ queryKey: ["/api/admin/users"], enabled });
  const masterAdminsQuery = useQuery<{ emails: string[] }>({ queryKey: ["/api/admin/master-admins"], enabled });
  const membersQuery = useQuery<AdminMember[]>({
    queryKey: [`/api/admin/orgs/${selectedOrgId}/members`],
    enabled: enabled && !!selectedOrgId,
  });
  const connectorsQuery = useQuery<AdminConnector[]>({
    queryKey: ["/api/admin/connectors"],
    enabled,
    refetchInterval: 15000,
  });
  const imapQuery = useQuery<{
    pollers: Array<{ orgId: string; running: boolean; lastPollAt: string | null; lastError: string | null; consecutiveFailures: number; disabled: boolean; orgName: string; imapEmailsProcessed?: number }>;
    dbOnlyEnabled: Array<{ orgId: string; running: boolean; lastPollAt: string | null; lastError: string | null; consecutiveFailures: number; disabled: boolean; orgName: string; imapEmailsProcessed?: number }>;
  }>({ queryKey: ["/api/admin/imap/status"], enabled, refetchInterval: 15000 });
  const failedEmailsQuery = useQuery<FailedEmail[]>({ queryKey: ["/api/admin/email/failed"], enabled, refetchInterval: 30000 });

  const entitlementQueryKey = `/api/admin/entitlements?state=${entitlementStateFilter}${entitlementOrgFilter !== "all" ? `&orgId=${entitlementOrgFilter}` : ""}`;
  const entitlementsQuery = useQuery<EntitlementRow[]>({ queryKey: [entitlementQueryKey], enabled });

  const auditQueryParams = new URLSearchParams({
    limit: String(AUDIT_PAGE_SIZE),
    offset: String(auditOffset),
  });
  if (auditEventType !== "all") auditQueryParams.set("eventTypes", auditEventType);
  const auditQueryKey = `/api/admin/audit?${auditQueryParams.toString()}`;
  const auditQuery = useQuery<{
    rows: AuditRow[];
    total: number;
    availableEventTypes: string[];
  }>({ queryKey: [auditQueryKey], enabled });

  const orgs = orgsQuery.data || [];
  const selectedOrg = orgs.find((org) => org.id === selectedOrgId) || orgs[0] || null;

  useEffect(() => {
    if (!selectedOrgId && orgs[0]) setSelectedOrgId(orgs[0].id);
  }, [orgs, selectedOrgId]);

  useEffect(() => {
    if (!selectedOrg) return;
    setOrgForm({
      name: selectedOrg.name || "",
      slug: selectedOrg.slug || "",
      phone: selectedOrg.phone || "",
      email: selectedOrg.email || "",
      address: selectedOrg.address || "",
      authMode: selectedOrg.authMode || "local",
    });
  }, [selectedOrg?.id]);

  const filteredOrgs = useMemo(() => {
    const q = tenantSearch.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((org) =>
      [org.name, org.slug, org.email || "", org.ssoStatus].some((value) => value.toLowerCase().includes(q))
    );
  }, [orgs, tenantSearch]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const rows = usersQuery.data || [];
    if (!q) return rows;
    return rows.filter((row) =>
      [row.username, row.fullName, row.email || ""].some((value) => value.toLowerCase().includes(q))
    );
  }, [usersQuery.data, userSearch]);

  const filteredConnectors = useMemo(() => {
    const q = connectorSearch.trim().toLowerCase();
    const rows = connectorsQuery.data || [];
    if (!q) return rows;
    return rows.filter((row) =>
      [row.orgName, row.provider, row.label, row.emailAddress || "", row.status].some((value) => value.toLowerCase().includes(q))
    );
  }, [connectorsQuery.data, connectorSearch]);

  const updateOrgMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/orgs/${selectedOrgId}`, orgForm);
      return res.json();
    },
    onSuccess: () => {
      invalidateAdminQueries();
      toast({ title: "Tenant updated" });
    },
    onError: (err: Error) => toast({ title: "Tenant update failed", description: err.message, variant: "destructive" }),
  });

  const switchOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const res = await apiRequest("POST", `/api/admin/orgs/${orgId}/switch`);
      return res.json();
    },
    onSuccess: (data: { org: AdminOrg }) => {
      invalidateAdminQueries();
      toast({ title: "Support context changed", description: data.org?.name || "Tenant selected" });
    },
    onError: (err: Error) => toast({ title: "Switch failed", description: err.message, variant: "destructive" }),
  });

  const deleteOrgMutation = useMutation({
    mutationFn: (orgId: string) => apiRequest("DELETE", `/api/admin/orgs/${orgId}`),
    onSuccess: () => {
      invalidateAdminQueries();
      toast({ title: "Tenant deleted" });
    },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const createInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/orgs/${selectedOrgId}/invites`, { role: inviteRole });
      return res.json();
    },
    onSuccess: (invite: { code: string; role: string }) => {
      toast({ title: "Invite created", description: `${invite.code} (${invite.role})` });
      invalidateAdminQueries();
    },
    onError: (err: Error) => toast({ title: "Invite failed", description: err.message, variant: "destructive" }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ orgId, userId, role }: { orgId: string; userId: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/orgs/${orgId}/members/${userId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      invalidateAdminQueries();
      toast({ title: "Role updated" });
    },
    onError: (err: Error) => toast({ title: "Role update failed", description: err.message, variant: "destructive" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ orgId, userId }: { orgId: string; userId: string }) => apiRequest("DELETE", `/api/admin/orgs/${orgId}/members/${userId}`),
    onSuccess: () => {
      invalidateAdminQueries();
      toast({ title: "Membership removed" });
    },
    onError: (err: Error) => toast({ title: "Remove failed", description: err.message, variant: "destructive" }),
  });

  const toggleSuperAdminMutation = useMutation({
    mutationFn: async ({ userId, isSuperAdmin }: { userId: string; isSuperAdmin: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/superadmin`, { isSuperAdmin });
      return res.json();
    },
    onSuccess: () => {
      invalidateAdminQueries();
      toast({ title: "Super admin status updated" });
    },
    onError: (err: Error) => toast({ title: "Super admin update blocked", description: err.message, variant: "destructive" }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => apiRequest("DELETE", `/api/admin/users/${userId}`),
    onSuccess: () => {
      invalidateAdminQueries();
      toast({ title: "User deleted" });
    },
    onError: (err: Error) => toast({ title: "User delete failed", description: err.message, variant: "destructive" }),
  });

  const connectorActionMutation = useMutation({
    mutationFn: ({ connectorId, action }: { connectorId: string; action: "force-poll" | "disable" | "enable" }) =>
      apiRequest("POST", `/api/admin/connectors/${connectorId}/${action}`),
    onSuccess: () => {
      invalidateAdminQueries();
      toast({ title: "Connector action completed" });
    },
    onError: (err: Error) => toast({ title: "Connector action failed", description: err.message, variant: "destructive" }),
  });

  const imapActionMutation = useMutation({
    mutationFn: ({ orgId, action }: { orgId: string; action: "reset" | "force-poll" | "disable" }) =>
      apiRequest("POST", `/api/admin/imap/${action}/${orgId}`),
    onSuccess: () => {
      invalidateAdminQueries();
      toast({ title: "IMAP action completed" });
    },
    onError: (err: Error) => toast({ title: "IMAP action failed", description: err.message, variant: "destructive" }),
  });

  const replayEmailMutation = useMutation({
    mutationFn: (eventId: string) => apiRequest("POST", `/api/admin/email/replay/${eventId}`),
    onSuccess: () => {
      invalidateAdminQueries();
      toast({ title: "Email replayed" });
    },
    onError: (err: Error) => toast({ title: "Replay failed", description: err.message, variant: "destructive" }),
  });

  const regenerateAliasMutation = useMutation({
    mutationFn: (orgId: string) => apiRequest("POST", `/api/admin/email/regenerate-alias/${orgId}`),
    onSuccess: () => {
      invalidateAdminQueries();
      toast({ title: "Forwarding alias regenerated" });
    },
    onError: (err: Error) => toast({ title: "Alias action failed", description: err.message, variant: "destructive" }),
  });

  if (!enabled) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Master Admin" description="Access restricted" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Super admin access required</p>
            <Button variant="outline" className="mt-3" onClick={() => setLocation("/")}>Go to Dashboard</Button>
          </div>
        </div>
      </div>
    );
  }

  const activeEntitlements = orgs.filter((org) => entitlementState(org.entitlement).ok).length;
  const connectorIssues = orgs.reduce((sum, org) => sum + org.connectorHealth.error + org.connectorHealth.disabled, 0);
  const failedEmailCount = failedEmailsQuery.data?.length || 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Master Admin" description="Global tenant operations, OperatorOS entitlements, and system health" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Tenants</p>
              <p className="text-2xl font-semibold">{orgs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Enabled Entitlements</p>
              <p className="text-2xl font-semibold">{activeEntitlements}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Connector Issues</p>
              <p className="text-2xl font-semibold">{connectorIssues}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Failed Inbound</p>
              <p className="text-2xl font-semibold">{failedEmailCount}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="tenants" className="gap-1.5"><Building2 className="h-3.5 w-3.5" />Tenants</TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" />Users</TabsTrigger>
            <TabsTrigger value="entitlements" className="gap-1.5"><KeyRound className="h-3.5 w-3.5" />Entitlements</TabsTrigger>
            <TabsTrigger value="inboxes" className="gap-1.5"><Inbox className="h-3.5 w-3.5" />Inboxes</TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5"><FileSearch className="h-3.5 w-3.5" />Audit</TabsTrigger>
            <TabsTrigger value="health" className="gap-1.5"><Activity className="h-3.5 w-3.5" />System Health</TabsTrigger>
          </TabsList>

          <TabsContent value="tenants" className="mt-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(360px,480px)_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" />Tenants</CardTitle>
                  <CardDescription>Search by tenant, slug, email, or SSO mode.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                    <Input aria-label="Search tenants" className="pl-8" placeholder="Search tenants" value={tenantSearch} onChange={(event) => setTenantSearch(event.target.value)} />
                  </div>
                  {orgsQuery.isLoading ? <PulseLoader /> : (
                    <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
                      {filteredOrgs.length === 0 ? (
                        <div className="rounded-md border border-dashed p-6 text-center">
                          <Building2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                          <p className="text-sm font-medium">No tenants found</p>
                          <p className="text-xs text-muted-foreground mt-1">Adjust the search to find a tenant, slug, email, or SSO status.</p>
                        </div>
                      ) : filteredOrgs.map((org) => {
                        const state = entitlementState(org.entitlement);
                        return (
                          <button
                            key={org.id}
                            className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/40 ${selectedOrgId === org.id ? "border-primary bg-muted/30" : ""}`}
                            onClick={() => setSelectedOrgId(org.id)}
                            data-testid={`admin-tenant-${org.id}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{org.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{org.slug} · {org.memberCount} members · {org.counts.tickets} tickets</p>
                              </div>
                              <Badge variant="outline" className={`text-[10px] ${state.className}`}><StatusDot ok={state.ok} /> <span className="ml-1">{state.label}</span></Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              <Badge variant="secondary" className="text-[10px]">{org.ssoStatus}</Badge>
                              <Badge variant="secondary" className="text-[10px]">{org.connectorHealth.active}/{org.connectorHealth.total} inboxes active</Badge>
                              {org.connectorHealth.error > 0 && <Badge variant="destructive" className="text-[10px]">{org.connectorHealth.error} inbox errors</Badge>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm flex items-center gap-2"><Settings className="h-4 w-4" />Tenant Profile</CardTitle>
                        <CardDescription>{selectedOrg ? `Editing ${selectedOrg.name}` : "Select a tenant"}</CardDescription>
                      </div>
                      {selectedOrg && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => switchOrgMutation.mutate(selectedOrg.id)} disabled={switchOrgMutation.isPending}>
                            <LogIn className="h-3.5 w-3.5" />Support Context
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-rose-600 hover:text-rose-700"
                            disabled={deleteOrgMutation.isPending}
                            onClick={() => {
                              if (confirm(`Delete tenant ${selectedOrg.name}? This removes tenant data and cannot be undone.`)) deleteOrgMutation.mutate(selectedOrg.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!selectedOrg ? <p className="text-sm text-muted-foreground">No tenant selected.</p> : (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input aria-label="Tenant name" value={orgForm.name} onChange={(event) => setOrgForm({ ...orgForm, name: event.target.value })} placeholder="Tenant name" />
                          <Input aria-label="Tenant slug" value={orgForm.slug} onChange={(event) => setOrgForm({ ...orgForm, slug: event.target.value })} placeholder="Slug" />
                          <Input aria-label="Operations email" value={orgForm.email} onChange={(event) => setOrgForm({ ...orgForm, email: event.target.value })} placeholder="Operations email" />
                          <Input aria-label="Tenant phone" value={orgForm.phone} onChange={(event) => setOrgForm({ ...orgForm, phone: event.target.value })} placeholder="Phone" />
                          <Input aria-label="Tenant address" className="md:col-span-2" value={orgForm.address} onChange={(event) => setOrgForm({ ...orgForm, address: event.target.value })} placeholder="Address" />
                          <Select value={orgForm.authMode} onValueChange={(authMode) => setOrgForm({ ...orgForm, authMode })}>
                            <SelectTrigger aria-label="Tenant authentication mode"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {AUTH_MODE_OPTIONS.map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" onClick={() => updateOrgMutation.mutate()} disabled={updateOrgMutation.isPending} data-testid="button-save-admin-tenant">Save Tenant Settings</Button>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />Tenant Members</CardTitle>
                    <CardDescription>Manage tenant roles and invite codes without impersonating regular users.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedOrg && (
                      <div className="flex flex-wrap gap-2">
                        <Select value={inviteRole} onValueChange={setInviteRole}>
                          <SelectTrigger className="w-40" aria-label="Invite role"><SelectValue /></SelectTrigger>
                          <SelectContent>{ROLE_OPTIONS.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" disabled={createInviteMutation.isPending} onClick={() => createInviteMutation.mutate()}>Create Invite</Button>
                      </div>
                    )}
                    {membersQuery.isLoading ? <PulseLoader /> : (
                      <div className="space-y-2">
                        {(membersQuery.data || []).length === 0 ? (
                          <div className="rounded-md border border-dashed p-6 text-center">
                            <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                            <p className="text-sm font-medium">No members in this tenant</p>
                            <p className="text-xs text-muted-foreground mt-1">Create an invite to add the first tenant member.</p>
                          </div>
                        ) : (membersQuery.data || []).map((member) => (
                          <div key={member.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{member.fullName || member.username}</p>
                              <p className="text-xs text-muted-foreground truncate">{member.email || member.username}</p>
                            </div>
                            <Select
                              value={member.role}
                              disabled={member.email ? masterAdminsQuery.data?.emails.includes(member.email.toLowerCase()) : false}
                              onValueChange={(role) => updateRoleMutation.mutate({ orgId: member.orgId, userId: member.userId, role })}
                            >
                              <SelectTrigger className="w-36 h-8 text-xs" aria-label={`Role for ${member.fullName || member.username}`}><SelectValue /></SelectTrigger>
                              <SelectContent>{ROLE_OPTIONS.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs text-rose-600 hover:text-rose-700"
                              disabled={removeMemberMutation.isPending || !!(member.email && masterAdminsQuery.data?.emails.includes(member.email.toLowerCase()))}
                              onClick={() => {
                                if (confirm(`Remove ${member.fullName || member.username} from this tenant?`)) removeMemberMutation.mutate({ orgId: member.orgId, userId: member.userId });
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><UserCog className="h-4 w-4" />Users</CardTitle>
                <CardDescription>Manage global super-admin access and tenant roles across PulseDesk.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative max-w-lg">
                  <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                  <Input aria-label="Search users" className="pl-8" placeholder="Search users by name, username, or email" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} />
                </div>
                {usersQuery.isLoading ? <PulseLoader /> : (
                  <div className="space-y-3">
                    {filteredUsers.length === 0 ? (
                      <div className="rounded-md border border-dashed p-6 text-center">
                        <UserCog className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                        <p className="text-sm font-medium">No users found</p>
                        <p className="text-xs text-muted-foreground mt-1">Search by name, username, or email to find a PulseDesk user.</p>
                      </div>
                    ) : filteredUsers.map((row) => (
                      <div key={row.id} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium">{row.fullName || row.username}</p>
                              {row.isSuperAdmin && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">Super Admin</Badge>}
                              {row.isConfiguredMasterAdmin && <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">Configured Master</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">{row.email || row.username} · {row.memberships.length} tenant memberships</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={toggleSuperAdminMutation.isPending || row.isConfiguredMasterAdmin || row.id === user?.id}
                              onClick={() => {
                                const action = row.isSuperAdmin ? "revoke" : "grant";
                                if (confirm(`${action === "grant" ? "Grant" : "Revoke"} super admin for ${row.email || row.username}?`)) {
                                  toggleSuperAdminMutation.mutate({ userId: row.id, isSuperAdmin: !row.isSuperAdmin });
                                }
                              }}
                            >
                              {row.isSuperAdmin ? "Revoke Super Admin" : "Grant Super Admin"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-rose-600 hover:text-rose-700"
                              disabled={deleteUserMutation.isPending || row.isConfiguredMasterAdmin || row.id === user?.id}
                              onClick={() => {
                                if (confirm(`Delete user ${row.email || row.username}?`)) deleteUserMutation.mutate(row.id);
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                        {row.memberships.length > 0 && (
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {row.memberships.map((membership) => (
                              <div key={`${row.id}-${membership.orgId}`} className="rounded-md bg-muted/30 p-2 text-xs flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate">{membership.orgName}</span>
                                <Select
                                  value={membership.role}
                                  disabled={row.isConfiguredMasterAdmin}
                                  onValueChange={(role) => updateRoleMutation.mutate({ orgId: membership.orgId, userId: row.id, role })}
                                >
                                  <SelectTrigger className="w-32 h-8 text-xs" aria-label={`Role for ${membership.orgName}`}><SelectValue /></SelectTrigger>
                                  <SelectContent>{ROLE_OPTIONS.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entitlements" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><KeyRound className="h-4 w-4" />OperatorOS Entitlements</CardTitle>
                <CardDescription>Cached entitlement snapshots by tenant and user.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Select value={entitlementStateFilter} onValueChange={setEntitlementStateFilter}>
                    <SelectTrigger className="w-full sm:w-40" aria-label="Filter entitlement state"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All states</SelectItem>
                      <SelectItem value="enabled">Enabled</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={entitlementOrgFilter} onValueChange={setEntitlementOrgFilter}>
                    <SelectTrigger className="w-full sm:w-72" aria-label="Filter entitlement tenant"><SelectValue placeholder="Tenant" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tenants</SelectItem>
                      {orgs.map((org) => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {entitlementsQuery.isLoading ? <PulseLoader /> : (
                  <div className="border rounded-md overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr className="text-left">
                          <th className="px-2 py-2 font-medium">Tenant</th>
                          <th className="px-2 py-2 font-medium">User</th>
                          <th className="px-2 py-2 font-medium">State</th>
                          <th className="px-2 py-2 font-medium">Module Role</th>
                          <th className="px-2 py-2 font-medium">Tenant Role</th>
                          <th className="px-2 py-2 font-medium">Access Status</th>
                          <th className="px-2 py-2 font-medium">Computed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(entitlementsQuery.data || []).length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                              No entitlement snapshots match these filters.
                            </td>
                          </tr>
                        ) : (entitlementsQuery.data || []).map((row) => {
                          const state = entitlementState(row);
                          return (
                            <tr key={row.id} className="border-t">
                              <td className="px-2 py-2">{row.orgName || row.operatorOsTenantId}</td>
                              <td className="px-2 py-2">{row.userEmail || row.operatorOsUserId}</td>
                              <td className="px-2 py-2"><Badge variant="outline" className={`text-[10px] ${state.className}`}>{state.label}</Badge></td>
                              <td className="px-2 py-2">{row.moduleRole}</td>
                              <td className="px-2 py-2">{row.tenantRole || row.tenantRoleAlias || "-"}</td>
                              <td className="px-2 py-2">{row.subscriptionStatus || "-"}</td>
                              <td className="px-2 py-2 whitespace-nowrap">{formatDate(row.computedAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inboxes" className="mt-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4" />Connectors</CardTitle>
                  <CardDescription>Force poll, disable, or enable tenant inbox connectors.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input aria-label="Search inbox connectors" placeholder="Search tenant, provider, email, or status" value={connectorSearch} onChange={(event) => setConnectorSearch(event.target.value)} />
                  {connectorsQuery.isLoading ? <PulseLoader /> : (
                    <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
                      {filteredConnectors.length === 0 ? (
                        <div className="rounded-md border border-dashed p-6 text-center">
                          <Server className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                          <p className="text-sm font-medium">No connectors found</p>
                          <p className="text-xs text-muted-foreground mt-1">Connected Inboxes will appear here after tenants configure Google, Microsoft, forwarding, or IMAP.</p>
                        </div>
                      ) : filteredConnectors.map((connector) => (
                        <div key={connector.id} className="rounded-md border p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <StatusDot ok={connector.enabled && connector.status === "active"} />
                                <p className="text-sm font-medium truncate">{connector.orgName}</p>
                                <Badge variant="secondary" className="text-[10px]">{connector.provider}</Badge>
                                <Badge variant="outline" className="text-[10px]">{connector.status}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{connector.emailAddress || connector.label || connector.id}</p>
                              {connector.lastError && <p className="text-xs text-rose-600 mt-1 truncate">{connector.lastError}</p>}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={connectorActionMutation.isPending || connector.status === "pending_auth"} onClick={() => connectorActionMutation.mutate({ connectorId: connector.id, action: "force-poll" })}><Play className="h-3 w-3" />Poll</Button>
                              {connector.enabled ? (
                                <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-rose-600 hover:text-rose-700" disabled={connectorActionMutation.isPending} onClick={() => connectorActionMutation.mutate({ connectorId: connector.id, action: "disable" })}><Power className="h-3 w-3" />Disable</Button>
                              ) : (
                                <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-emerald-600 hover:text-emerald-700" disabled={connectorActionMutation.isPending} onClick={() => connectorActionMutation.mutate({ connectorId: connector.id, action: "enable" })}><Power className="h-3 w-3" />Enable</Button>
                              )}
                              {connector.provider === "forwarding" && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => regenerateAliasMutation.mutate(connector.orgId)}>Regen Alias</Button>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2"><Inbox className="h-4 w-4" />Inbound Failures & IMAP</CardTitle>
                  <CardDescription>Replay failed inbound messages and manage legacy IMAP pollers.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Failed inbound emails</p>
                    {failedEmailsQuery.isLoading ? <PulseLoader /> : (failedEmailsQuery.data || []).length === 0 ? (
                      <div className="rounded-md border border-dashed p-4 text-center">
                        <p className="text-sm font-medium">No failed inbound messages</p>
                        <p className="text-xs text-muted-foreground mt-1">Replay controls will appear here when inbound parsing needs intervention.</p>
                      </div>
                    ) : (failedEmailsQuery.data || []).map((event) => (
                      <div key={event.id} className="rounded-md border p-3 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{event.subject || "(no subject)"}</p>
                          <p className="text-xs text-muted-foreground truncate">{event.fromEmail} · {event.provider || "unknown"} · {formatDate(event.receivedAt)}</p>
                          {event.errorMessage && <p className="text-xs text-rose-600 mt-1 truncate">{event.errorMessage}</p>}
                        </div>
                        <Button size="sm" variant="outline" disabled={replayEmailMutation.isPending} onClick={() => replayEmailMutation.mutate(event.id)}><RefreshCw className="h-3.5 w-3.5 mr-1" />Replay</Button>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Legacy IMAP pollers</p>
                    {[...(imapQuery.data?.pollers || []), ...(imapQuery.data?.dbOnlyEnabled || [])].length === 0 ? (
                      <div className="rounded-md border border-dashed p-4 text-center">
                        <p className="text-sm font-medium">No legacy IMAP pollers</p>
                        <p className="text-xs text-muted-foreground mt-1">Google, Microsoft, and forwarding connectors are preferred for new tenants.</p>
                      </div>
                    ) : [...(imapQuery.data?.pollers || []), ...(imapQuery.data?.dbOnlyEnabled || [])].map((poller) => (
                      <div key={poller.orgId} className="rounded-md border p-3 flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{poller.orgName}</p>
                          <p className="text-xs text-muted-foreground">Last poll: {formatDate(poller.lastPollAt)} · failures: {poller.consecutiveFailures}</p>
                          {poller.lastError && <p className="text-xs text-rose-600 truncate">{poller.lastError}</p>}
                        </div>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => imapActionMutation.mutate({ orgId: poller.orgId, action: "force-poll" })}>Poll</Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => imapActionMutation.mutate({ orgId: poller.orgId, action: "reset" })}>Reset</Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs text-rose-600 hover:text-rose-700" onClick={() => imapActionMutation.mutate({ orgId: poller.orgId, action: "disable" })}>Disable</Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2"><FileSearch className="h-4 w-4" />Audit</CardTitle>
                    <CardDescription>Cross-tenant audit trail for master-admin actions.</CardDescription>
                  </div>
                  <Badge variant="secondary">{auditQuery.data?.total || 0} events</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={auditEventType} onValueChange={(value) => { setAuditEventType(value); setAuditOffset(0); }}>
                  <SelectTrigger className="w-full sm:w-80" aria-label="Filter audit events"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All admin events</SelectItem>
                    {(auditQuery.data?.availableEventTypes || []).map((eventType) => (
                      <SelectItem key={eventType} value={eventType}>{eventType}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {auditQuery.isLoading ? <PulseLoader /> : (
                  <div className="border rounded-md overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr className="text-left">
                          <th className="px-2 py-2 font-medium">When</th>
                          <th className="px-2 py-2 font-medium">Event</th>
                          <th className="px-2 py-2 font-medium">Actor</th>
                          <th className="px-2 py-2 font-medium">Tenant</th>
                          <th className="px-2 py-2 font-medium">Result</th>
                          <th className="px-2 py-2 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(auditQuery.data?.rows || []).length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                              No audit events match this filter.
                            </td>
                          </tr>
                        ) : (auditQuery.data?.rows || []).map((row) => {
                          const open = expandedAuditRow === row.id;
                          return (
                            <Fragment key={row.id}>
                              <tr className="border-t">
                                <td className="px-2 py-2 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                                <td className="px-2 py-2"><code>{row.eventType}</code></td>
                                <td className="px-2 py-2">{row.details?.actorEmail || row.actorUsername || row.actorFullName || "-"}</td>
                                <td className="px-2 py-2">{row.orgName || row.orgSlug || row.orgId || "-"}</td>
                                <td className="px-2 py-2">{row.success ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}</td>
                                <td className="px-2 py-2"><Button variant="ghost" size="sm" onClick={() => setExpandedAuditRow(open ? null : row.id)} aria-expanded={open}>Details</Button></td>
                              </tr>
                              {open && (
                                <tr className="border-t bg-muted/20">
                                  <td colSpan={6} className="p-3">
                                    <pre className="rounded-md border bg-background p-2 whitespace-pre-wrap break-all">{JSON.stringify(row.details || {}, null, 2)}</pre>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {auditQuery.data && auditQuery.data.total > AUDIT_PAGE_SIZE && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Showing {auditOffset + 1}-{Math.min(auditOffset + AUDIT_PAGE_SIZE, auditQuery.data.total)} of {auditQuery.data.total}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={auditOffset === 0} onClick={() => setAuditOffset(Math.max(0, auditOffset - AUDIT_PAGE_SIZE))}>Previous</Button>
                      <Button size="sm" variant="outline" disabled={auditOffset + AUDIT_PAGE_SIZE >= auditQuery.data.total} onClick={() => setAuditOffset(auditOffset + AUDIT_PAGE_SIZE)}>Next</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="health" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" />Master Admin Identities</CardTitle>
                  <CardDescription>Configured through PULSEDESK_MASTER_ADMIN_EMAIL with John retained as the default.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(masterAdminsQuery.data?.emails || []).map((email) => (
                    <div key={email} className="rounded-md border p-3 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm">{email}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Attention Queue</CardTitle>
                  <CardDescription>Tenants with revoked entitlements, inbox issues, or inbound failures.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {orgs.filter((org) => !entitlementState(org.entitlement).ok || org.connectorHealth.error > 0 || org.connectorHealth.disabled > 0).length === 0 && failedEmailCount === 0 ? (
                    <p className="text-sm text-muted-foreground">No current control-plane issues.</p>
                  ) : (
                    <>
                      {orgs.filter((org) => !entitlementState(org.entitlement).ok || org.connectorHealth.error > 0 || org.connectorHealth.disabled > 0).map((org) => (
                        <button key={org.id} className="w-full rounded-md border p-3 text-left hover:bg-muted/40" onClick={() => { setSelectedOrgId(org.id); setActiveTab("tenants"); }}>
                          <p className="text-sm font-medium">{org.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Entitlement: {entitlementState(org.entitlement).label} · inbox errors: {org.connectorHealth.error} · disabled: {org.connectorHealth.disabled}
                          </p>
                        </button>
                      ))}
                      {failedEmailCount > 0 && (
                        <button className="w-full rounded-md border p-3 text-left hover:bg-muted/40" onClick={() => setActiveTab("inboxes")}>
                          <p className="text-sm font-medium">Failed inbound email queue</p>
                          <p className="text-xs text-muted-foreground">{failedEmailCount} message(s) need review or replay.</p>
                        </button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
