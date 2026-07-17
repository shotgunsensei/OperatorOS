import { AppLayout } from "@/components/app-layout";
import { useTenant } from "@/lib/tenant-context";
import { useGetTenant, useUpdateTenant, useListMembers, getGetTenantQueryKey } from "@workspace/api-client-react";
import { useSubscription, useChangePlan, useCancelSubscription, useReactivateSubscription, useBillingProfile, useUpdateBillingProfile, useInvoices, useAddOns, usePurchaseAddOn, useUsageSummary } from "@/lib/api-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import {
  CreditCard, Users, Shield, Zap, ArrowUpRight,
  Mail, Plus, Check, Globe, Building2, Package,
  AlertTriangle, Download, Lock, TrendingUp, Crown
} from "lucide-react";
import { Link } from "wouter";

const planLabels: Record<string, { name: string; price: string; color: string }> = {
  free: { name: "Free", price: "$0 forever", color: "bg-slate-500/10 text-slate-600" },
  starter: { name: "Starter", price: "$19/mo", color: "bg-blue-500/10 text-blue-600" },
  growth: { name: "Growth", price: "$59/mo", color: "bg-green-500/10 text-green-600" },
  agency: { name: "Agency", price: "$149/mo", color: "bg-purple-500/10 text-purple-600" },
  enterprise: { name: "Enterprise", price: "Custom", color: "bg-amber-500/10 text-amber-600" },
};

export default function SettingsPage() {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const { data: tenant } = useGetTenant(tenantId!, { query: { enabled: !!tenantId } });
  const { data: members } = useListMembers(tenantId!, { query: { enabled: !!tenantId } });
  const { data: subscription } = useSubscription(tenantId);
  const { data: billingProfile } = useBillingProfile(tenantId);
  const { data: invoices } = useInvoices(tenantId);
  const { data: addOns } = useAddOns(tenantId);
  const { data: usage } = useUsageSummary(tenantId);
  const updateTenant = useUpdateTenant();
  const changePlan = useChangePlan(tenantId);
  const cancelSub = useCancelSubscription(tenantId);
  const reactivateSub = useReactivateSubscription(tenantId);
  const updateProfile = useUpdateBillingProfile(tenantId);
  const purchaseAddOn = usePurchaseAddOn(tenantId);

  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [showConfirm, setShowConfirm] = useState<string | null>(null);

  useEffect(() => { if (tenant) setName(tenant.name); }, [tenant]);
  useEffect(() => { if (billingProfile?.email) setBillingEmail(billingProfile.email); }, [billingProfile]);

  const handleSave = () => {
    if (!tenantId) return;
    updateTenant.mutate(
      { tenantId, data: { name } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) }) }
    );
  };

  const plan = subscription?.plan || tenant?.plan || "free";
  const planInfo = planLabels[plan] || planLabels.free;
  const limits = subscription?.limits;
  const usageData = usage?.usage;

  const usageMeters = [
    { label: "AI Credits", key: "aiCredits", icon: Zap, upgradeText: "Need more credits?" },
    { label: "Brands", key: "brands", icon: Globe, upgradeText: "Need more brands?" },
    { label: "Team Seats", key: "seats", icon: Users, upgradeText: "Need more seats?" },
    { label: "Storage", key: "storage", icon: Package, upgradeText: "Running low on storage?" },
    { label: "Exports", key: "exports", icon: Download, upgradeText: "Need more exports?" },
    { label: "Landing Pages", key: "publishedPages", icon: Globe, upgradeText: "Need more pages?" },
  ];

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your workspace, billing, team, and account</p>
        </div>

        <Tabs defaultValue="workspace">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="workspace" className="text-xs"><Building2 className="h-3.5 w-3.5 mr-1.5" /> Workspace</TabsTrigger>
            <TabsTrigger value="billing" className="text-xs"><CreditCard className="h-3.5 w-3.5 mr-1.5" /> Billing</TabsTrigger>
            <TabsTrigger value="usage" className="text-xs"><TrendingUp className="h-3.5 w-3.5 mr-1.5" /> Usage</TabsTrigger>
            <TabsTrigger value="addons" className="text-xs"><Package className="h-3.5 w-3.5 mr-1.5" /> Add-ons</TabsTrigger>
            <TabsTrigger value="team" className="text-xs"><Users className="h-3.5 w-3.5 mr-1.5" /> Team</TabsTrigger>
            <TabsTrigger value="security" className="text-xs"><Shield className="h-3.5 w-3.5 mr-1.5" /> Security</TabsTrigger>
          </TabsList>

          <TabsContent value="workspace" className="mt-6 space-y-6">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Workspace Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs">Workspace Name</Label>
                  <div className="flex gap-2 mt-1">
                    <Input value={name} onChange={e => setName(e.target.value)} />
                    <Button onClick={handleSave} disabled={updateTenant.isPending} className="rounded-full">Save</Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Workspace ID</Label>
                  <p className="text-sm text-muted-foreground mt-1 font-mono">{tenant?.slug}</p>
                </div>
                <div>
                  <Label className="text-xs">Industry</Label>
                  <p className="text-sm text-muted-foreground mt-1 capitalize">{tenant?.industry || "Not set"}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing" className="mt-6 space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Current Plan</CardTitle>
                  <Button variant="outline" size="sm" asChild className="rounded-full">
                    <Link href="/pricing"><ArrowUpRight className="h-3.5 w-3.5 mr-1" /> Compare Plans</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${planInfo.color}`}>
                    {plan === "enterprise" ? <Crown className="h-5 w-5" /> : planInfo.name[0]}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">{planInfo.name} Plan</div>
                    <div className="text-sm text-muted-foreground">
                      {planInfo.price}
                      {subscription?.billingCycle === "annual" ? " (annual billing)" : ""}
                      {subscription?.status === "cancelled" && " — Cancelling at period end"}
                    </div>
                  </div>
                  {subscription?.status === "cancelled" ? (
                    <Button size="sm" className="rounded-full" onClick={() => reactivateSub.mutate()}>Reactivate</Button>
                  ) : plan !== "free" ? (
                    <Button variant="ghost" size="sm" className="rounded-full text-red-500 text-xs" onClick={() => setShowConfirm("cancel")}>Cancel</Button>
                  ) : (
                    <Button size="sm" className="rounded-full" asChild>
                      <Link href="/pricing"><Crown className="h-3.5 w-3.5 mr-1" /> Upgrade</Link>
                    </Button>
                  )}
                </div>

                {subscription?.trialEndsAt && new Date(subscription.trialEndsAt) > new Date() && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800/50">
                    <p className="text-xs text-blue-700 dark:text-blue-400">
                      Trial active until {new Date(subscription.trialEndsAt).toLocaleDateString()}. You won't be charged until the trial ends.
                    </p>
                  </div>
                )}

                {subscription?.currentPeriodEnd && (
                  <div className="text-xs text-muted-foreground">
                    Billing period: {subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart).toLocaleDateString() : "—"} to {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Billing Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs">Billing Email</Label>
                  <div className="flex gap-2 mt-1">
                    <Input value={billingEmail} onChange={e => setBillingEmail(e.target.value)} placeholder="billing@company.com" />
                    <Button variant="outline" className="rounded-full" onClick={() => updateProfile.mutate({ email: billingEmail })}>Update</Button>
                  </div>
                </div>
                {billingProfile?.paymentMethodLast4 && (
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">{billingProfile.paymentMethodBrand} ending in {billingProfile.paymentMethodLast4}</div>
                      <div className="text-[10px] text-muted-foreground">Expires {billingProfile.paymentMethodExpiry}</div>
                    </div>
                    <Button variant="ghost" size="sm" className="ml-auto rounded-full text-xs">Update Card</Button>
                  </div>
                )}
                {billingProfile?.taxId && (
                  <div className="text-xs text-muted-foreground">Tax ID: {billingProfile.taxId}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Invoices</CardTitle></CardHeader>
              <CardContent>
                {(!invoices || invoices.length === 0) ? (
                  <div className="text-center py-6">
                    <CreditCard className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">{plan === "free" ? "Upgrade to a paid plan to see invoices here." : "No invoices generated yet."}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {invoices.map((inv: any) => (
                      <div key={inv.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div>
                          <div className="text-sm font-medium">{inv.description || `Invoice #${inv.id}`}</div>
                          <div className="text-[10px] text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString()}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">${(inv.amount / 100).toFixed(2)}</span>
                          <Badge variant={inv.status === "paid" ? "secondary" : "outline"} className="text-[10px] capitalize">{inv.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="usage" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {usageMeters.map(meter => {
                const data = usageData?.[meter.key as keyof typeof usageData];
                const used = (data as any)?.used || 0;
                const limit = (data as any)?.limit || 0;
                const pct = (data as any)?.percentage || 0;
                const isUnlimited = limit === -1 || limit >= 999999;
                const isNearLimit = pct > 80 && !isUnlimited;
                return (
                  <Card key={meter.key} className={isNearLimit ? "border-red-200 dark:border-red-800/50" : ""}>
                    <CardContent className="pt-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <meter.icon className={`h-4 w-4 ${isNearLimit ? "text-red-500" : "text-muted-foreground"}`} />
                          <span className="text-sm font-medium">{meter.label}</span>
                        </div>
                        {isNearLimit && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-yellow-500" : "bg-green-500"}`}
                          style={{ width: `${isUnlimited ? 5 : Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{used} used</span>
                        <span className="font-medium">{isUnlimited ? "Unlimited" : `${Math.max(0, limit - used)} remaining`}</span>
                      </div>
                      {isNearLimit && (
                        <Button variant="outline" size="sm" className="w-full rounded-full text-xs" asChild>
                          <Link href="/pricing">
                            <Crown className="h-3 w-3 mr-1" /> {meter.upgradeText}
                          </Link>
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="addons" className="mt-6 space-y-6">
            {(!addOns?.catalog || addOns.catalog.length === 0) ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="font-medium text-sm mb-1">No add-ons available</p>
                  <p className="text-xs text-muted-foreground">Add-ons like extra AI credits, additional storage, and premium features will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {addOns.catalog.map((addon: any) => {
                  const purchased = (addOns?.purchases || []).find((p: any) => p.addOnType === addon.type && p.status === "active");
                  return (
                    <Card key={addon.id} className="hover:shadow-md transition-all">
                      <CardContent className="pt-5 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-sm">{addon.name}</h3>
                            <p className="text-xs text-muted-foreground mt-1">{addon.description}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold">${(addon.price / 100).toFixed(0)}</div>
                            <div className="text-[10px] text-muted-foreground">{addon.recurring ? "/month" : "one-time"}</div>
                          </div>
                        </div>
                        {purchased ? (
                          <Badge variant="secondary" className="text-xs w-full justify-center py-1.5">
                            <Check className="h-3 w-3 mr-1" /> Active
                          </Badge>
                        ) : (
                          <Button
                            className="w-full rounded-full text-xs"
                            size="sm"
                            onClick={() => purchaseAddOn.mutate({ addOnId: addon.id })}
                            disabled={purchaseAddOn.isPending}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Purchase
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="team" className="mt-6 space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Team Members</CardTitle>
                  <Badge variant="secondary" className="text-xs">{members?.length || 0} / {limits?.seats || "1"} seats</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {!members || members.length === 0 ? (
                  <div className="text-center py-6">
                    <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Invite your team to start collaborating.</p>
                  </div>
                ) : (
                  members.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                          {(m.userName || m.userId || "?")[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{m.userName || m.userId}</p>
                          {m.userEmail && <p className="text-[11px] text-muted-foreground">{m.userEmail}</p>}
                        </div>
                      </div>
                      <Badge variant="outline" className="capitalize text-[10px]">{m.role}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Invite Member</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input placeholder="team@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="flex-1" />
                  <Button className="rounded-full" disabled={!inviteEmail}>
                    <Mail className="h-3.5 w-3.5 mr-1.5" /> Invite
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">They'll receive an email to join your workspace.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="mt-6 space-y-6">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Security</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { icon: Shield, label: "Tenant Isolation", desc: "All data is scoped to your workspace", status: "Enabled" },
                  { icon: Lock, label: "Encrypted Sessions", desc: "OIDC PKCE authentication with encrypted cookies", status: "Active" },
                  { icon: Globe, label: "Audit Logging", desc: "All actions logged for compliance and review", status: "Enabled" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <item.icon className="h-4 w-4 text-green-500" />
                      <div>
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="text-[10px] text-muted-foreground">{item.desc}</div>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] text-green-600">{item.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Data Management</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" size="sm" className="rounded-full text-xs">
                  <Download className="h-3 w-3 mr-1.5" /> Export All Data
                </Button>
                <p className="text-[11px] text-muted-foreground">Download a full export of your workspace data including brands, campaigns, copy, and analytics.</p>
                <div className="pt-3 border-t">
                  <Button variant="ghost" size="sm" className="rounded-full text-xs text-red-500 hover:text-red-600 hover:bg-red-50">
                    Delete Workspace
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-1">Permanently delete this workspace and all data. This cannot be undone.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {showConfirm === "cancel" && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowConfirm(null)}>
            <Card className="max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <CardContent className="pt-6 space-y-4">
                <div className="text-center">
                  <AlertTriangle className="h-10 w-10 text-yellow-500 mx-auto mb-3" />
                  <h2 className="font-bold text-lg">Cancel {planInfo.name} Plan?</h2>
                  <p className="text-sm text-muted-foreground mt-2">Your plan stays active until the end of your billing period. After that, you'll be downgraded to Free (1 brand, 50 credits/mo).</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 rounded-full" onClick={() => setShowConfirm(null)}>Keep Plan</Button>
                  <Button variant="destructive" className="flex-1 rounded-full" onClick={() => { cancelSub.mutate(); setShowConfirm(null); }}>Confirm Cancel</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
