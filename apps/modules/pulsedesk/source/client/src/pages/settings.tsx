import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Trash2, UserCog, Clock, Building2, Shield, Bell, KeyRound, Plus, CheckCircle2, XCircle, AlertTriangle, Globe, RefreshCw, Users } from "lucide-react";
const MicrosoftIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
  </svg>
);
import { ROLE_LABELS, canManageSettings } from "@/lib/permissions";
import { RelatedProducts } from "@/components/related-products";

interface MemberWithUser {
  userId: string;
  orgId: string;
  role: string;
  user: { id: string; fullName: string; username: string; email?: string } | null;
}

interface InviteCode {
  id: string;
  code: string;
  role: string;
}

interface AuthConfig {
  authMode: string;
  entraTenantId: string | null;
  entraTenantDomain: string | null;
  entraClientId: string | null;
  hasClientSecret: boolean;
  entraRedirectUri: string | null;
  entraPostLogoutRedirectUri: string | null;
  entraAllowedDomains: string[];
  entraJitProvisioningEnabled: boolean;
  entraRequireAdminConsent: boolean;
  entraLastTestStatus: string | null;
  entraLastTestedAt: string | null;
  graphEnabled: boolean;
  graphScopes: string[];
  graphSyncInterval: number | null;
}

interface RoleMapping {
  id: string;
  orgId: string;
  entraGroupId: string;
  displayLabel: string | null;
  pulsedeskRole: string;
  createdAt: string;
}

interface AuditLogEntry {
  id: string;
  eventType: string;
  authSource: string | null;
  ipAddress: string | null;
  details: any;
  success: boolean;
  createdAt: string;
}

const AUTH_MODE_OPTIONS = [
  { value: "local", label: "Local Only", description: "Username/password authentication only" },
  { value: "hybrid", label: "Hybrid (M365 + Local)", description: "Microsoft 365 with local admin fallback" },
  { value: "m365", label: "Microsoft 365 Only", description: "All users must sign in via Microsoft 365" },
];

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 ${className || ""}`} onClick={handleCopy} data-testid="button-copy">
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

const PULSEDESK_ROLES = [
  { value: "readonly", label: "Read Only" },
  { value: "staff", label: "Staff" },
  { value: "technician", label: "Technician" },
  { value: "supervisor", label: "Supervisor" },
  { value: "admin", label: "Admin" },
];

const OPERATOROS_ACCOUNT_URL = "https://app.operatoros.net/app/account";
const OPERATOROS_SSO_URL = "https://app.operatoros.net/app/platform/sso";

export default function SettingsPage() {
  const { user, org, membership, refreshAuth } = useAuth();
  const { toast } = useToast();
  const isAdmin = canManageSettings(membership?.role);

  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || "",
    phone: user?.phone || "",
    email: user?.email || "",
  });
  const [orgForm, setOrgForm] = useState({
    name: org?.name || "",
    phone: org?.phone || "",
    email: org?.email || "",
    address: org?.address || "",
  });

  const { data: members } = useQuery<MemberWithUser[]>({ queryKey: ["/api/memberships"] });
  const { data: inviteCodes } = useQuery<InviteCode[]>({
    queryKey: ["/api/invite-codes"],
    enabled: isAdmin,
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", "/api/auth/profile", data),
    onSuccess: () => { refreshAuth(); toast({ title: "Profile updated" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateOrgMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/orgs/${org?.id}`, data),
    onSuccess: () => { refreshAuth(); toast({ title: "Organization updated" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createInviteMutation = useMutation({
    mutationFn: (role: string) => apiRequest("POST", "/api/invite-codes", { role }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/invite-codes"] }); toast({ title: "Invite code created" }); },
    onError: (err: Error) => toast({ title: "Failed to create invite code", description: err.message, variant: "destructive" }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiRequest("PATCH", `/api/memberships/${userId}/role`, { role }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/memberships"] }); queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] }); queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] }); toast({ title: "Role updated" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => apiRequest("DELETE", `/api/memberships/${userId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/memberships"] }); queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] }); queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] }); toast({ title: "Member removed" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleProfileSave = () => {
    if (!profileForm.fullName.trim()) {
      toast({ title: "Full name is required", variant: "destructive" });
      return;
    }
    updateProfileMutation.mutate(profileForm);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Settings" description="Manage your profile, organization, and team" />
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <Tabs defaultValue="profile">
            <TabsList className={`w-full grid ${isAdmin ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-2"}`}>
              <TabsTrigger value="profile" data-testid="tab-profile">Profile</TabsTrigger>
              {isAdmin && <TabsTrigger value="organization" data-testid="tab-organization">Organization</TabsTrigger>}
              {isAdmin && <TabsTrigger value="team" data-testid="tab-team">Team</TabsTrigger>}
              {isAdmin && <TabsTrigger value="access" data-testid="tab-access">Access</TabsTrigger>}
              {isAdmin && <TabsTrigger value="authentication" data-testid="tab-authentication">Auth</TabsTrigger>}
              <TabsTrigger value="preferences" data-testid="tab-preferences">Preferences</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Personal Information</CardTitle>
                  <CardDescription>Update your account details visible to your team</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="profile-name">Full Name *</Label>
                    <Input id="profile-name" data-testid="input-profile-name" value={profileForm.fullName} onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="profile-phone">Phone</Label>
                    <Input id="profile-phone" data-testid="input-profile-phone" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} className="mt-1" placeholder="Extension or direct line" />
                  </div>
                  <div>
                    <Label htmlFor="profile-email">Email</Label>
                    <Input id="profile-email" data-testid="input-profile-email" type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} className="mt-1" placeholder="your.name@facility.org" />
                  </div>
                  <Button data-testid="button-save-profile" onClick={handleProfileSave} disabled={updateProfileMutation.isPending}>
                    {updateProfileMutation.isPending ? "Saving..." : "Save Profile"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Security
                  </CardTitle>
                  <CardDescription>Keep your account secure</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4" data-testid="operatoros-managed-profile-security">
                  <div className="rounded-lg border bg-muted/40 p-4">
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">OperatorOS-managed account security</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Passwords, session recovery, and shared login settings are managed by OperatorOS. PulseDesk keeps module workflow settings only.
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button asChild variant="outline" data-testid="button-open-operatoros-account">
                    <a href={OPERATOROS_ACCOUNT_URL}>Open OperatorOS Account Settings</a>
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {isAdmin && (
              <TabsContent value="organization" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Facility Information
                    </CardTitle>
                    <CardDescription>Organization details visible across PulseDesk</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="org-name">Organization Name *</Label>
                      <Input id="org-name" data-testid="input-org-name" value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} className="mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Main Phone</Label>
                        <Input value={orgForm.phone} onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })} className="mt-1" placeholder="(555) 000-0000" />
                      </div>
                      <div>
                        <Label>Contact Email</Label>
                        <Input value={orgForm.email} onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })} className="mt-1" placeholder="ops@facility.org" />
                      </div>
                    </div>
                    <div>
                      <Label>Address</Label>
                      <Input value={orgForm.address} onChange={(e) => setOrgForm({ ...orgForm, address: e.target.value })} className="mt-1" placeholder="123 Medical Center Drive" />
                    </div>
                    <Button data-testid="button-save-org" onClick={() => updateOrgMutation.mutate(orgForm)} disabled={updateOrgMutation.isPending}>
                      {updateOrgMutation.isPending ? "Saving..." : "Save Organization"}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Operational Settings
                    </CardTitle>
                    <CardDescription>Configure operational parameters for your facility</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Timezone</Label>
                        <Select defaultValue="america_new_york">
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="america_new_york">Eastern (ET)</SelectItem>
                            <SelectItem value="america_chicago">Central (CT)</SelectItem>
                            <SelectItem value="america_denver">Mountain (MT)</SelectItem>
                            <SelectItem value="america_los_angeles">Pacific (PT)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Business Hours</Label>
                        <Select defaultValue="24_7">
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="24_7">24/7 Operations</SelectItem>
                            <SelectItem value="standard">Standard (8AM - 6PM)</SelectItem>
                            <SelectItem value="extended">Extended (6AM - 10PM)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/50 border p-3">
                      <p className="text-xs text-muted-foreground">
                        SLA and escalation rule configuration coming in a future update.
                        Contact your PulseDesk administrator for custom operational parameters.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {isAdmin && (
              <TabsContent value="team" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center gap-2"><UserCog className="h-4 w-4" /> Team Members</CardTitle>
                    <CardDescription>Manage roles and access for your team ({members?.length || 0} members)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!members || members.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center">
                        <Users className="h-8 w-8 text-muted-foreground/30 mb-2" />
                        <p className="text-sm font-medium text-muted-foreground">No team members yet</p>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">Generate invite codes below to add your team</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {members.map((m) => (
                          <div key={m.userId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 rounded-lg border p-3" data-testid={`member-${m.userId}`}>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{m.user?.fullName || m.user?.username || "Unknown"}</p>
                              <p className="text-xs text-muted-foreground truncate">@{m.user?.username}{m.user?.email ? ` · ${m.user.email}` : ""}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {m.userId !== user?.id ? (
                                <>
                                  <Select value={m.role} onValueChange={(role) => updateRoleMutation.mutate({ userId: m.userId, role })}>
                                    <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(ROLE_LABELS).map(([r, label]) => (
                                        <SelectItem key={r} value={r}>{label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { if (confirm("Remove this member from the organization?")) removeMemberMutation.mutate(m.userId); }} data-testid={`button-remove-${m.userId}`}>
                                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs font-medium px-2 py-1 rounded bg-primary/10 text-primary">{ROLE_LABELS[m.role] || m.role} (you)</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Invite Codes</CardTitle>
                    <CardDescription>Share codes with new team members to join your organization</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" onClick={() => createInviteMutation.mutate("staff")} disabled={createInviteMutation.isPending} data-testid="button-create-invite">
                        Staff Invite
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => createInviteMutation.mutate("technician")}>
                        Technician Invite
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => createInviteMutation.mutate("supervisor")}>
                        Supervisor Invite
                      </Button>
                    </div>
                    {inviteCodes && inviteCodes.length > 0 && (
                      <div className="space-y-2">
                        {inviteCodes.map((ic) => (
                          <div key={ic.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                            <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{ic.code}</code>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-muted-foreground font-medium">{ROLE_LABELS[ic.role] || ic.role}</span>
                              <CopyButton text={ic.code} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {isAdmin && (
              <TabsContent value="access" className="space-y-4 mt-4">
                <OperatorOsAccessSettings />
              </TabsContent>
            )}

            {isAdmin && (
              <TabsContent value="authentication" className="space-y-4 mt-4">
                <OperatorOsAuthenticationSettings />
              </TabsContent>
            )}

            <TabsContent value="preferences" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Notification Preferences
                  </CardTitle>
                  <CardDescription>Configure how you receive updates about operations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="text-sm font-medium">In-app notifications</p>
                        <p className="text-xs text-muted-foreground">Receive notifications for ticket updates, assignments, and escalations</p>
                      </div>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Email notifications</p>
                        <p className="text-xs text-muted-foreground/70">Email delivery coming in a future update</p>
                      </div>
                      <Clock className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Account Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Username</span>
                    <span className="font-mono text-xs">@{user?.username}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Role</span>
                    <span className="text-xs font-medium">{ROLE_LABELS[membership?.role || ""] || membership?.role}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Organization</span>
                    <span className="text-xs">{org?.name}</span>
                  </div>
                </CardContent>
              </Card>

              <RelatedProducts />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function OperatorOsAccessSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Shield className="h-4 w-4" />
          OperatorOS Access
        </CardTitle>
        <CardDescription>PulseDesk access is managed by OperatorOS entitlements</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-sm font-medium">Launch, seats, and module access live in OperatorOS.</p>
          <p className="text-xs text-muted-foreground mt-1">
            PulseDesk validates your active OperatorOS module entitlement before protected app requests.
            Seat changes, payment flows, and module assignment are handled by your OperatorOS admin.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Module</p>
            <p className="text-sm font-semibold mt-1">pulsedesk</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Access Source</p>
            <p className="text-sm font-semibold mt-1">OperatorOS SSO</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OperatorOsAuthenticationSettings() {
  return (
    <div className="space-y-4" data-testid="operatoros-managed-auth-settings">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            OperatorOS SSO
          </CardTitle>
          <CardDescription>PulseDesk consumes shared OperatorOS identity, tenant, role, and entitlement context.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Authentication is centralized</p>
                <p className="text-xs text-muted-foreground mt-1">
                  PulseDesk no longer configures local password, registration, or Microsoft 365 login modes. Manage users, SSO, tenants, and module access in OperatorOS.
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Session</p>
              <p className="text-sm font-medium mt-1">OperatorOS SSO</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Tenant access</p>
              <p className="text-sm font-medium mt-1">OperatorOS entitlement</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Billing</p>
              <p className="text-sm font-medium mt-1">OperatorOS billing</p>
            </div>
          </div>
          <Button asChild data-testid="button-open-operatoros-sso">
            <a href={OPERATOROS_SSO_URL}>Open OperatorOS SSO Settings</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// Retained only as imported-source audit context. The active settings tab uses
// OperatorOsAuthenticationSettings so PulseDesk does not own auth configuration.
function AuthenticationSettings() {
  const { toast } = useToast();
  const [newMapping, setNewMapping] = useState({ entraGroupId: "", pulsedeskRole: "staff", displayLabel: "" });
  const [clientSecretField, setClientSecretField] = useState("");
  const [showAuditLog, setShowAuditLog] = useState(false);

  const { data: authConfig, isLoading: configLoading } = useQuery<AuthConfig>({
    queryKey: ["/api/auth/config"],
  });

  const { data: members } = useQuery<MemberWithUser[]>({
    queryKey: ["/api/memberships"],
  });

  const { data: roleMappings, isLoading: mappingsLoading } = useQuery<RoleMapping[]>({
    queryKey: ["/api/auth/role-mappings"],
  });

  const { data: auditLog } = useQuery<AuditLogEntry[]>({
    queryKey: ["/api/auth/audit-log"],
    enabled: showAuditLog,
  });

  const [configForm, setConfigForm] = useState<Partial<AuthConfig>>({});

  const form = authConfig ? { ...authConfig, ...configForm } : null;

  const updateConfigMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/auth/config", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/config"] });
      setConfigForm({});
      setClientSecretField("");
      toast({ title: "Authentication configuration saved" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const testConfigMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/config/test"),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/config"] });
      if (data.success) {
        toast({ title: "Connection test passed", description: "Microsoft Entra ID configuration is valid." });
      } else {
        toast({ title: "Connection test failed", description: data.issues?.join("; ") || "Check configuration", variant: "destructive" });
      }
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createMappingMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/auth/role-mappings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/role-mappings"] });
      setNewMapping({ entraGroupId: "", pulsedeskRole: "staff", displayLabel: "" });
      toast({ title: "Role mapping added" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMappingMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/auth/role-mappings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/role-mappings"] });
      toast({ title: "Role mapping removed" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSaveConfig = () => {
    if (!form) return;
    const payload: any = {
      authMode: form.authMode,
      entraTenantId: form.entraTenantId || "",
      entraTenantDomain: form.entraTenantDomain || "",
      entraClientId: form.entraClientId || "",
      entraRedirectUri: form.entraRedirectUri || "",
      entraPostLogoutRedirectUri: form.entraPostLogoutRedirectUri || "",
      entraAllowedDomains: form.entraAllowedDomains || [],
      entraJitProvisioningEnabled: form.entraJitProvisioningEnabled,
      entraRequireAdminConsent: form.entraRequireAdminConsent,
    };
    if (clientSecretField) {
      payload.entraClientSecret = clientSecretField;
    }
    updateConfigMutation.mutate(payload);
  };

  const updateField = (field: string, value: any) => {
    setConfigForm((prev) => ({ ...prev, [field]: value }));
  };

  if (configLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Loading authentication settings...</p>
        </CardContent>
      </Card>
    );
  }

  const showEntraConfig = form && form.authMode !== "local";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Authentication Mode
          </CardTitle>
          <CardDescription>Configure how users sign in to your organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              OperatorOS entitlements control whether Microsoft Entra SSO is available for this tenant.
              If the entitlement explicitly disables the feature, PulseDesk will reject the saved configuration server-side.
            </p>
          </div>
          <div className="space-y-2">
            {AUTH_MODE_OPTIONS.map((opt) => {
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer ${
                    form?.authMode === opt.value ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                  data-testid={`radio-auth-mode-${opt.value}`}
                >
                  <input
                    type="radio"
                    name="authMode"
                    value={opt.value}
                    checked={form?.authMode === opt.value}
                    onChange={() => updateField("authMode", opt.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {showEntraConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MicrosoftIcon className="h-4 w-4" />
              Microsoft Entra ID Configuration
            </CardTitle>
            <CardDescription>
              Connect to your Azure AD / Entra ID tenant for single sign-on
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="entra-tenant-id">Tenant ID *</Label>
                <Input
                  id="entra-tenant-id"
                  data-testid="input-entra-tenant-id"
                  value={form?.entraTenantId || ""}
                  onChange={(e) => updateField("entraTenantId", e.target.value)}
                  className="mt-1 font-mono text-xs"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div>
                <Label htmlFor="entra-tenant-domain">
                  Tenant Domain
                  <span className="text-[10px] text-muted-foreground font-normal ml-1">(optional)</span>
                </Label>
                <Input
                  id="entra-tenant-domain"
                  data-testid="input-entra-tenant-domain"
                  value={form?.entraTenantDomain || ""}
                  onChange={(e) => updateField("entraTenantDomain", e.target.value)}
                  className="mt-1 text-xs"
                  placeholder="yourorg.onmicrosoft.com"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Your primary domain ending in .onmicrosoft.com, found in Entra ID &gt; Overview
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="entra-client-id">Application (Client) ID *</Label>
              <Input
                id="entra-client-id"
                data-testid="input-entra-client-id"
                value={form?.entraClientId || ""}
                onChange={(e) => updateField("entraClientId", e.target.value)}
                className="mt-1 font-mono text-xs"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </div>

            <div>
              <Label htmlFor="entra-client-secret">
                Client Secret *
                {authConfig?.hasClientSecret && !clientSecretField && (
                  <span className="ml-2 text-[11px] text-green-600 font-normal">(configured)</span>
                )}
              </Label>
              <Input
                id="entra-client-secret"
                data-testid="input-entra-client-secret"
                type="password"
                value={clientSecretField}
                onChange={(e) => setClientSecretField(e.target.value)}
                className="mt-1 font-mono text-xs"
                placeholder={authConfig?.hasClientSecret ? "Enter new secret to update" : "Paste client secret value"}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Encrypted at rest using AES-256-GCM. Never transmitted in plaintext.
              </p>
            </div>

            <div>
              <Label htmlFor="entra-redirect-uri">Redirect URI *</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="entra-redirect-uri"
                  data-testid="input-entra-redirect-uri"
                  value={form?.entraRedirectUri || ""}
                  onChange={(e) => updateField("entraRedirectUri", e.target.value)}
                  className="text-xs"
                  placeholder={`${window.location.origin}/api/auth/m365/callback`}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-[11px] h-9"
                  onClick={() => updateField("entraRedirectUri", `${window.location.origin}/api/auth/m365/callback`)}
                  data-testid="button-autofill-redirect-uri"
                >
                  Auto-fill
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Must match the redirect URI configured in your Azure App Registration. Click "Auto-fill" to use this site's URL.
              </p>
            </div>

            <div>
              <Label htmlFor="entra-post-logout-uri">Post-Logout Redirect URI</Label>
              <Input
                id="entra-post-logout-uri"
                data-testid="input-entra-post-logout-uri"
                value={form?.entraPostLogoutRedirectUri || ""}
                onChange={(e) => updateField("entraPostLogoutRedirectUri", e.target.value)}
                className="mt-1 text-xs"
                placeholder="https://your-domain.com/auth"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Where users are redirected after signing out of Microsoft 365
              </p>
            </div>

            <div>
              <Label htmlFor="entra-allowed-domains">Allowed Email Domains</Label>
              <Input
                id="entra-allowed-domains"
                data-testid="input-entra-allowed-domains"
                value={(form?.entraAllowedDomains || []).join(", ")}
                onChange={(e) => updateField("entraAllowedDomains", e.target.value.split(",").map((d: string) => d.trim()).filter(Boolean))}
                className="mt-1 text-xs"
                placeholder="yourorg.com, subsidiary.com"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Comma-separated list of allowed email domains. Leave empty to allow all domains in the tenant.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Just-in-Time Provisioning</p>
                <p className="text-xs text-muted-foreground">When enabled, a PulseDesk account is automatically created the first time someone signs in with Microsoft 365 — no manual setup needed</p>
              </div>
              <Switch
                checked={form?.entraJitProvisioningEnabled ?? true}
                onCheckedChange={(val) => updateField("entraJitProvisioningEnabled", val)}
                data-testid="switch-jit-provisioning"
              />
            </div>

            {form?.authMode === "m365" && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">M365-only mode</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Local password login will be completely disabled. Ensure at least one admin account is accessible via M365 before enabling.
                  </p>
                </div>
              </div>
            )}

            {form?.authMode === "hybrid" && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Local Fallback Administrators</p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  In hybrid mode, only users with <strong>Admin</strong> or <strong>Owner</strong> roles can sign in with local passwords.
                  All other users must use Microsoft 365. Manage roles in the Team tab.
                </p>
                {members && (
                  <div className="space-y-1 mt-2">
                    {members
                      .filter((m: MemberWithUser) => ["admin", "owner"].includes(m.role))
                      .map((m: MemberWithUser) => (
                        <div key={m.userId} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5" data-testid={`local-fallback-admin-${m.userId}`}>
                          <div className="flex items-center gap-2">
                            <Shield className="h-3 w-3 text-muted-foreground" />
                            <span>{m.user?.fullName || m.user?.username || m.userId}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.role}</span>
                        </div>
                      ))
                    }
                    {members.filter((m: MemberWithUser) => ["admin", "owner"].includes(m.role)).length === 0 && (
                      <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-2 flex items-start gap-2">
                        <AlertTriangle className="h-3 w-3 text-red-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-red-700 dark:text-red-300">
                          No admin or owner accounts found. At least one admin must exist for local fallback access.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              {authConfig?.entraLastTestStatus && (
                <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
                  authConfig.entraLastTestStatus === "passed"
                    ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                    : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                }`}>
                  {authConfig.entraLastTestStatus === "passed" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  Last test: {authConfig.entraLastTestStatus}
                  {authConfig.entraLastTestedAt && (
                    <span className="text-[10px] opacity-70 ml-1">
                      {new Date(authConfig.entraLastTestedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSaveConfig}
                disabled={updateConfigMutation.isPending}
                data-testid="button-save-auth-config"
              >
                {updateConfigMutation.isPending ? "Saving..." : "Save Configuration"}
              </Button>
              <Button
                variant="outline"
                onClick={() => testConfigMutation.mutate()}
                disabled={testConfigMutation.isPending}
                data-testid="button-test-auth-config"
              >
                {testConfigMutation.isPending ? (
                  <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Testing...</>
                ) : (
                  "Test Connection"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showEntraConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Group-to-Role Mappings
            </CardTitle>
            <CardDescription>
              Map Entra ID security groups (by Object ID) to PulseDesk roles. When multiple groups match, the highest-level role wins.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mappingsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading mappings...</p>
            ) : roleMappings && roleMappings.length > 0 ? (
              <div className="space-y-2">
                {roleMappings.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border p-3" data-testid={`mapping-${m.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono truncate" title={m.entraGroupId}>{m.entraGroupId}</p>
                      {m.displayLabel && (
                        <p className="text-[11px] text-muted-foreground">{m.displayLabel}</p>
                      )}
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary shrink-0">
                      {ROLE_LABELS[m.pulsedeskRole] || m.pulsedeskRole}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={() => {
                        if (confirm(`Remove this role mapping${m.displayLabel ? ` (${m.displayLabel})` : ""}?`)) {
                          deleteMappingMutation.mutate(m.id);
                        }
                      }}
                      disabled={deleteMappingMutation.isPending}
                      data-testid={`button-delete-mapping-${m.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-muted/50 border p-4 text-center">
                <p className="text-sm text-muted-foreground">No role mappings configured</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Users without group matches will default to the Staff role
                </p>
              </div>
            )}

            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Plus className="h-3 w-3" /> Add Role Mapping
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px]">Entra Group Object ID *</Label>
                  <Input
                    value={newMapping.entraGroupId}
                    onChange={(e) => setNewMapping({ ...newMapping, entraGroupId: e.target.value })}
                    className="mt-1 font-mono text-xs"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    data-testid="input-mapping-group-id"
                  />
                </div>
                <div>
                  <Label className="text-[11px] flex items-center gap-1">
                    Display Label
                    <span className="text-[9px] text-muted-foreground font-normal" title="A human-readable name for this group mapping, shown in this list for reference">(optional — for your reference)</span>
                  </Label>
                  <Input
                    value={newMapping.displayLabel}
                    onChange={(e) => setNewMapping({ ...newMapping, displayLabel: e.target.value })}
                    className="mt-1 text-xs"
                    placeholder="e.g. IT Supervisors"
                    data-testid="input-mapping-label"
                  />
                </div>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label className="text-[11px]">PulseDesk Role *</Label>
                  <Select value={newMapping.pulsedeskRole} onValueChange={(val) => setNewMapping({ ...newMapping, pulsedeskRole: val })}>
                    <SelectTrigger className="mt-1 h-9 text-xs" data-testid="select-mapping-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PULSEDESK_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  onClick={() => createMappingMutation.mutate(newMapping)}
                  disabled={!newMapping.entraGroupId.trim() || createMappingMutation.isPending}
                  data-testid="button-add-mapping"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showEntraConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Microsoft Graph Integration
            </CardTitle>
            <CardDescription>Sync organizational data from Microsoft 365</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted/50 border p-4 text-center">
              <Globe className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">Graph Sync</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Automatic directory sync, org chart import, and department mapping will be available in a future update.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Authentication Audit Log
              </CardTitle>
              <CardDescription>Recent login and configuration events</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAuditLog(true);
                queryClient.invalidateQueries({ queryKey: ["/api/auth/audit-log"] });
              }}
              data-testid="button-load-audit-log"
            >
              {showAuditLog ? "Refresh" : "Load Log"}
            </Button>
          </div>
        </CardHeader>
        {showAuditLog && (
          <CardContent>
            {!auditLog ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
            ) : auditLog.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Clock className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">No authentication events recorded yet</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">Login attempts and configuration changes will appear here</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-auto">
                {auditLog.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex items-start gap-2 rounded border p-2 text-xs ${
                      entry.success ? "" : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
                    }`}
                    data-testid={`audit-entry-${entry.id}`}
                  >
                    {entry.success ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{entry.eventType.replace(/_/g, " ")}</span>
                        {entry.authSource && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {entry.authSource}
                          </span>
                        )}
                      </div>
                      {entry.ipAddress && (
                        <span className="text-muted-foreground">{entry.ipAddress}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </>
  );
}
