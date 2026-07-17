import { AppLayout } from "@/components/app-layout";
import {
  useAdminOverview, useAdminTenants, useAdminFeatureFlags, useUpdateFeatureFlag,
  useAdminIntegrationsHealth, useAdminTenantDetail, useAdminChangePlan, useAdminDeleteTenant,
  useAdminUpdateTenant, useAdminUpdateCredits
} from "@/lib/api-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  LayoutDashboard, Users, CreditCard, Shield, BarChart3,
  Zap, AlertTriangle, CheckCircle2, TrendingUp, Building2,
  Flag, Plug, ArrowUpRight, Search, Pencil, Trash2, ChevronRight,
  ArrowLeft, Crown, RotateCcw, X
} from "lucide-react";

const PLAN_OPTIONS = [
  { value: "free", label: "Free", price: "$0" },
  { value: "starter", label: "Starter", price: "$19/mo" },
  { value: "growth", label: "Growth", price: "$59/mo" },
  { value: "agency", label: "Agency", price: "$149/mo" },
  { value: "enterprise", label: "Enterprise", price: "$399/mo" },
];

function TenantDetailPanel({ tenantId, onBack }: { tenantId: number; onBack: () => void }) {
  const { data: tenant, isLoading } = useAdminTenantDetail(tenantId);
  const changePlan = useAdminChangePlan();
  const deleteTenant = useAdminDeleteTenant();
  const updateTenant = useAdminUpdateTenant();
  const updateCredits = useAdminUpdateCredits();
  const { toast } = useToast();

  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [billingCycle, setBillingCycle] = useState<string>("monthly");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingCredits, setEditingCredits] = useState(false);
  const [creditLimit, setCreditLimit] = useState("");
  const [creditUsed, setCreditUsed] = useState("");

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading tenant details...</div>;
  if (!tenant) return <div className="text-center py-12 text-muted-foreground">Tenant not found</div>;

  const handleChangePlan = () => {
    if (!selectedPlan) return;
    changePlan.mutate({ tenantId, plan: selectedPlan, billingCycle }, {
      onSuccess: () => {
        toast({ title: "Plan updated", description: `Changed to ${selectedPlan} (${billingCycle})` });
        setSelectedPlan("");
      },
      onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    deleteTenant.mutate(tenantId, {
      onSuccess: () => {
        toast({ title: "Tenant deleted", description: `"${tenant.name}" has been removed` });
        onBack();
      },
      onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  const handleRename = () => {
    if (!newName.trim()) return;
    updateTenant.mutate({ tenantId, name: newName.trim() }, {
      onSuccess: () => {
        toast({ title: "Tenant renamed" });
        setEditingName(false);
        setNewName("");
      },
    });
  };

  const handleUpdateCredits = () => {
    const updates: any = {};
    if (creditLimit) updates.aiCreditsLimit = parseInt(creditLimit);
    if (creditUsed) updates.aiCreditsUsed = parseInt(creditUsed);
    if (Object.keys(updates).length === 0) return;
    updateCredits.mutate({ tenantId, ...updates }, {
      onSuccess: () => {
        toast({ title: "Credits updated" });
        setEditingCredits(false);
        setCreditLimit("");
        setCreditUsed("");
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{tenant.name}</h2>
            <Badge variant="outline" className="text-[10px] capitalize">{tenant.plan}</Badge>
            <Badge variant={tenant.billingStatus === "active" ? "secondary" : "destructive"} className="text-[10px] capitalize">{tenant.billingStatus}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">ID: {tenant.id} &middot; Slug: {tenant.slug} &middot; Created {new Date(tenant.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="text-2xl font-bold">{tenant.stats?.brands || 0}</div>
            <div className="text-xs text-muted-foreground">Brands</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-2xl font-bold">{tenant.stats?.campaigns || 0}</div>
            <div className="text-xs text-muted-foreground">Campaigns</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-2xl font-bold">{tenant.aiCreditsUsed} / {tenant.aiCreditsLimit}</div>
            <div className="text-xs text-muted-foreground">AI Credits Used</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Crown className="h-4 w-4 text-purple-500" /> Change Subscription Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Current Plan</Label>
              <div className="text-sm font-medium capitalize">{tenant.plan} — {PLAN_OPTIONS.find(p => p.value === tenant.plan)?.price || "$0"}</div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">New Plan</Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger><SelectValue placeholder="Select plan..." /></SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map(p => (
                    <SelectItem key={p.value} value={p.value} disabled={p.value === tenant.plan}>
                      {p.label} ({p.price}){p.value === tenant.plan ? " — current" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Billing Cycle</Label>
              <Select value={billingCycle} onValueChange={setBillingCycle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="w-full rounded-full"
              disabled={!selectedPlan || selectedPlan === tenant.plan || changePlan.isPending}
              onClick={handleChangePlan}
            >
              {changePlan.isPending ? "Updating..." : "Apply Plan Change"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Pencil className="h-4 w-4 text-blue-500" /> Manage Tenant
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editingName ? (
              <div className="space-y-2">
                <Label className="text-xs">Rename Tenant</Label>
                <div className="flex gap-2">
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder={tenant.name} />
                  <Button size="sm" onClick={handleRename} disabled={!newName.trim()}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}><X className="h-4 w-4" /></Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full rounded-full" onClick={() => { setEditingName(true); setNewName(tenant.name); }}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Rename Tenant
              </Button>
            )}

            {editingCredits ? (
              <div className="space-y-2">
                <Label className="text-xs">Adjust AI Credits</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Credits Used</Label>
                    <Input type="number" value={creditUsed} onChange={e => setCreditUsed(e.target.value)} placeholder={String(tenant.aiCreditsUsed)} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Credits Limit</Label>
                    <Input type="number" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} placeholder={String(tenant.aiCreditsLimit)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={handleUpdateCredits}>Update Credits</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingCredits(false)}><X className="h-4 w-4" /></Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full rounded-full" onClick={() => setEditingCredits(true)}>
                <Zap className="h-3.5 w-3.5 mr-1.5" /> Adjust AI Credits
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-full"
              onClick={() => updateTenant.mutate({ tenantId, billingStatus: tenant.billingStatus === "active" ? "suspended" : "active" }, {
                onSuccess: () => toast({ title: `Tenant ${tenant.billingStatus === "active" ? "suspended" : "reactivated"}` }),
              })}
            >
              {tenant.billingStatus === "active" ? (
                <><AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Suspend Tenant</>
              ) : (
                <><RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reactivate Tenant</>
              )}
            </Button>

            {showDeleteConfirm ? (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg space-y-2">
                <p className="text-xs text-red-700 dark:text-red-400 font-medium">This will permanently delete "{tenant.name}" and all its data. This cannot be undone.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleteTenant.isPending}>
                    {deleteTenant.isPending ? "Deleting..." : "Yes, Delete Permanently"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button variant="destructive" size="sm" className="w-full rounded-full" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Tenant
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {tenant.members && tenant.members.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Members ({tenant.members.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tenant.members.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                      {(m.firstName?.[0] || m.email?.[0] || "?").toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{m.firstName} {m.lastName}</div>
                      <div className="text-[10px] text-muted-foreground">{m.email}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize">{m.role}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { data: overview } = useAdminOverview();
  const { data: tenants } = useAdminTenants();
  const { data: flags } = useAdminFeatureFlags();
  const { data: intHealth } = useAdminIntegrationsHealth();
  const updateFlag = useUpdateFeatureFlag();
  const [tenantSearch, setTenantSearch] = useState("");
  const [newFlagKey, setNewFlagKey] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);

  const filteredTenants = (tenants || []).filter((t: any) =>
    !tenantSearch || t.name.toLowerCase().includes(tenantSearch.toLowerCase()) || t.slug.toLowerCase().includes(tenantSearch.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin Console</h1>
            <p className="text-muted-foreground text-sm">Revenue operations and platform management</p>
          </div>
          <Badge variant="secondary" className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <Shield className="h-3 w-3 mr-1" /> Super Admin
          </Badge>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="overview" className="text-xs"><LayoutDashboard className="h-3.5 w-3.5 mr-1.5" /> Overview</TabsTrigger>
            <TabsTrigger value="tenants" className="text-xs"><Building2 className="h-3.5 w-3.5 mr-1.5" /> Tenants</TabsTrigger>
            <TabsTrigger value="flags" className="text-xs"><Flag className="h-3.5 w-3.5 mr-1.5" /> Feature Flags</TabsTrigger>
            <TabsTrigger value="integrations" className="text-xs"><Plug className="h-3.5 w-3.5 mr-1.5" /> Integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Tenants", value: overview?.totalTenants || 0, icon: Building2, color: "text-blue-500" },
                { label: "Total Users", value: overview?.totalUsers || 0, icon: Users, color: "text-green-500" },
                { label: "Paid Tenants", value: overview?.metrics?.paidTenants || 0, icon: CreditCard, color: "text-purple-500" },
                { label: "AI Credits Used", value: overview?.totalAiCreditsUsed || 0, icon: Zap, color: "text-yellow-500" },
              ].map(metric => (
                <Card key={metric.label}>
                  <CardContent className="pt-5">
                    <div className="flex items-center justify-between mb-2">
                      <metric.icon className={`h-5 w-5 ${metric.color}`} />
                      <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                    </div>
                    <div className="text-2xl font-bold">{metric.value.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{metric.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Plan Distribution</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(overview?.planDistribution || []).map((p: any) => (
                    <div key={p.plan} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
                      <Badge variant="outline" className="text-[10px] capitalize">{p.plan}</Badge>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${overview?.totalTenants ? (p.count / overview.totalTenants) * 100 : 0}%` }} />
                        </div>
                        <span className="text-sm font-medium w-8 text-right">{p.count}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Key Metrics</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { label: "Active tenants", value: overview?.metrics?.activeTenants || 0, color: "text-green-500" },
                    { label: "On trial", value: overview?.metrics?.trialTenants || 0, color: "text-blue-500" },
                    { label: "Onboarded", value: overview?.metrics?.onboardedTenants || 0, color: "text-purple-500" },
                    { label: "Paid plans", value: overview?.metrics?.paidTenants || 0, color: "text-yellow-500" },
                  ].map(m => (
                    <div key={m.label} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
                      <span className="text-sm">{m.label}</span>
                      <span className={`text-sm font-bold ${m.color}`}>{m.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {overview?.recentTenants && overview.recentTenants.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Recent Tenants</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {overview.recentTenants.slice(0, 5).map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedTenantId(t.id)}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{t.name[0]}</div>
                          <div>
                            <div className="text-sm font-medium">{t.name}</div>
                            <div className="text-[10px] text-muted-foreground">{t.slug}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] capitalize">{t.plan}</Badge>
                          {t.onboardingCompleted ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                          )}
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="tenants" className="mt-6 space-y-4">
            {selectedTenantId ? (
              <TenantDetailPanel tenantId={selectedTenantId} onBack={() => setSelectedTenantId(null)} />
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search tenants by name or slug..." value={tenantSearch} onChange={e => setTenantSearch(e.target.value)} className="pl-9" />
                </div>
                <Card>
                  <CardContent className="pt-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="pb-2 font-medium text-muted-foreground">Tenant</th>
                            <th className="pb-2 font-medium text-muted-foreground">Plan</th>
                            <th className="pb-2 font-medium text-muted-foreground">Status</th>
                            <th className="pb-2 font-medium text-muted-foreground">AI Credits</th>
                            <th className="pb-2 font-medium text-muted-foreground">Activation</th>
                            <th className="pb-2 font-medium text-muted-foreground">Created</th>
                            <th className="pb-2 font-medium text-muted-foreground"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTenants.map((t: any) => (
                            <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedTenantId(t.id)}>
                              <td className="py-3">
                                <div className="font-medium">{t.name}</div>
                                <div className="text-[10px] text-muted-foreground">{t.slug}</div>
                              </td>
                              <td className="py-3"><Badge variant="outline" className="text-[10px] capitalize">{t.plan}</Badge></td>
                              <td className="py-3">
                                <Badge variant={t.billingStatus === "active" ? "secondary" : "destructive"} className="text-[10px] capitalize">
                                  {t.billingStatus}
                                </Badge>
                              </td>
                              <td className="py-3 text-xs">{t.aiCreditsUsed} / {t.aiCreditsLimit}</td>
                              <td className="py-3">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-primary rounded-full" style={{ width: `${t.activationScore}%` }} />
                                  </div>
                                  <span className="text-[10px]">{t.activationScore}%</span>
                                </div>
                              </td>
                              <td className="py-3 text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</td>
                              <td className="py-3"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                            </tr>
                          ))}
                          {filteredTenants.length === 0 && (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">
                                {tenantSearch ? "No tenants match your search" : "No tenants yet"}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="flags" className="mt-6 space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Feature Flags</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(flags || []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No feature flags configured yet.</p>
                )}
                {(flags || []).map((f: any) => (
                  <div key={f.key} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div>
                      <div className="text-sm font-medium">{f.name}</div>
                      <div className="text-[10px] text-muted-foreground">{f.key} — {f.description}</div>
                    </div>
                    <Button
                      variant={f.isEnabled ? "default" : "outline"}
                      size="sm"
                      className="rounded-full text-xs"
                      onClick={() => updateFlag.mutate({ key: f.key, isEnabled: !f.isEnabled })}
                    >
                      {f.isEnabled ? "Enabled" : "Disabled"}
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <Input
                    placeholder="New flag key (e.g. beta_ai_v2)"
                    value={newFlagKey}
                    onChange={e => setNewFlagKey(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    className="rounded-full"
                    disabled={!newFlagKey}
                    onClick={() => {
                      updateFlag.mutate({ key: newFlagKey, name: newFlagKey.replace(/_/g, " "), isEnabled: false });
                      setNewFlagKey("");
                    }}
                  >
                    Add Flag
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="mt-6 space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Integration Health</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(intHealth || []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No integration data yet.</p>
                )}
                {(intHealth || []).map((i: any) => (
                  <div key={i.provider} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Plug className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium capitalize">{i.provider.replace(/_/g, " ")}</div>
                        <div className="text-[10px] text-muted-foreground">{i.total} total connections</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="secondary" className="text-[10px] text-green-600">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> {i.connected}
                      </Badge>
                      {i.errored > 0 && (
                        <Badge variant="destructive" className="text-[10px]">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> {i.errored}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
