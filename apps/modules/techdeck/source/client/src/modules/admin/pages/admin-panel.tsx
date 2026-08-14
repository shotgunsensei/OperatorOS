import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Building2,
  Users,
  ShieldCheck,
  ShieldOff,
  Trash2,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

interface TenantSub {
  id: string;
  tenantId: string;
  planCode: string;
  status: string;
  pausedAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface OperatorOsStatus {
  operatorosTenantId: string | null;
  operatorosPlan: string | null;
  subscriptionStatus: string | null;
  accessLevel: string | null;
  enabledFeatures: string[];
  lastEntitlementSyncAt: string | null;
  localRole: string | null;
  revoked: boolean;
}

interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  memberCount: number;
  createdAt: string;
  subscription: TenantSub | null;
  legacySubscription?: TenantSub | null;
  operatoros?: OperatorOsStatus;
  operatorosUrl?: string;
}

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  isSystemAdmin: boolean;
  createdAt: string;
}

const BLOCKING_STATUSES = new Set(["past_due", "unpaid", "canceled"]);

function configuredOperatorOsUrl(apiUrl?: string): string | undefined {
  return (
    (import.meta.env.VITE_OPERATOROS_ADMIN_URL as string | undefined) ||
    (import.meta.env.VITE_OPERATOROS_BILLING_URL as string | undefined) ||
    (import.meta.env.VITE_OPERATOROS_BASE_URL as string | undefined) ||
    apiUrl
  );
}

function formatValue(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : "Not synced";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not synced";
  return new Date(value).toLocaleString();
}

function SubscriptionStatusBadge({ status, revoked }: { status: string | null | undefined; revoked: boolean }) {
  if (revoked) {
    return (
      <Badge variant="destructive" data-testid="badge-revoked">
        Revoked
      </Badge>
    );
  }
  if (status && BLOCKING_STATUSES.has(status)) {
    return (
      <Badge variant="destructive" data-testid="badge-blocking-status">
        {status.replace("_", " ")}
      </Badge>
    );
  }
  if (status === "active") return <Badge data-testid="badge-active">Active</Badge>;
  if (status === "trialing") return <Badge variant="secondary" data-testid="badge-trialing">Trialing</Badge>;
  return <Badge variant="outline" data-testid="badge-status">{formatValue(status)}</Badge>;
}

function SnapshotField({ label, value, testId }: { label: string; value: ReactNode; testId: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium" data-testid={testId}>{value}</div>
    </div>
  );
}

function TenantCard({
  tenant,
  operatorosUrl,
  onDelete,
  deleting,
}: {
  tenant: AdminTenant;
  operatorosUrl?: string;
  onDelete: () => void;
  deleting: boolean;
}) {
  const os = tenant.operatoros;
  const features = os?.enabledFeatures || [];
  const legacy = tenant.legacySubscription || tenant.subscription;

  return (
    <Card data-testid={`card-tenant-${tenant.id}`}>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium" data-testid={`text-tenant-name-${tenant.id}`}>
                {tenant.name}
              </h3>
              <SubscriptionStatusBadge status={os?.subscriptionStatus} revoked={os?.revoked === true} />
              <Badge variant="outline">OperatorOS managed</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {tenant.slug} - {tenant.memberCount} member(s) - Created {new Date(tenant.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              asChild={!!operatorosUrl}
              disabled={!operatorosUrl}
              data-testid={`button-manage-operatoros-${tenant.id}`}
            >
              {operatorosUrl ? (
                <a href={operatorosUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Manage in OperatorOS
                </a>
              ) : (
                <span>
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Manage in OperatorOS
                </span>
              )}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="destructive"
                  data-testid={`button-delete-tenant-${tenant.id}`}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Tenant</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete "{tenant.name}" and all associated Tech Deck data.
                    This action cannot be undone and does not change OperatorOS billing or entitlements.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    disabled={deleting}
                    className="bg-destructive text-destructive-foreground"
                    data-testid="button-confirm-delete"
                  >
                    Delete Tenant
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SnapshotField label="OperatorOS Tenant ID" value={formatValue(os?.operatorosTenantId)} testId={`text-os-tenant-${tenant.id}`} />
          <SnapshotField label="OperatorOS Plan" value={formatValue(os?.operatorosPlan)} testId={`text-os-plan-${tenant.id}`} />
          <SnapshotField label="Subscription Status" value={formatValue(os?.subscriptionStatus)} testId={`text-os-status-${tenant.id}`} />
          <SnapshotField label="Tech Deck Access Level" value={formatValue(os?.accessLevel)} testId={`text-os-access-${tenant.id}`} />
          <SnapshotField label="Last Entitlement Sync" value={formatDate(os?.lastEntitlementSyncAt)} testId={`text-os-sync-${tenant.id}`} />
          <SnapshotField label="Local Role" value={formatValue(os?.localRole)} testId={`text-local-role-${tenant.id}`} />
          <SnapshotField
            label="Revoked"
            value={os?.revoked ? "Yes" : "No"}
            testId={`text-revoked-${tenant.id}`}
          />
          <SnapshotField
            label="Legacy Billing Row"
            value={legacy ? `${legacy.planCode} / ${legacy.status}` : "None"}
            testId={`text-legacy-sub-${tenant.id}`}
          />
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase text-muted-foreground">Enabled Features</div>
          {features.length > 0 ? (
            <div className="flex flex-wrap gap-2" data-testid={`list-features-${tenant.id}`}>
              {features.map((feature) => (
                <Badge key={feature} variant="secondary">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {feature}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="w-4 h-4" />
              No OperatorOS entitlement snapshot has been synced for this tenant.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminPanelPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"tenants" | "users">("tenants");

  const { data: tenantsData, isLoading: tenantsLoading } = useQuery<{ tenants: AdminTenant[]; operatorosUrl?: string }>({
    queryKey: ["/api/admin/tenants"],
  });

  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["/api/admin/users"],
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isSystemAdmin }: { userId: string; isSystemAdmin: boolean }) => {
      await apiRequest("POST", `/api/admin/users/${userId}/system-admin`, { isSystemAdmin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteTenantMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      await apiRequest("DELETE", `/api/admin/tenants/${tenantId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Tenant deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const tenants = tenantsData?.tenants || [];
  const users = usersData?.users || [];
  const operatorosUrl = configuredOperatorOsUrl(tenantsData?.operatorosUrl);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-admin-title">System Administration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review tenants, users, and OperatorOS-managed entitlement state.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant={activeTab === "tenants" ? "default" : "outline"}
          onClick={() => setActiveTab("tenants")}
          data-testid="button-tab-tenants"
        >
          <Building2 className="w-4 h-4 mr-2" />
          Tenants ({tenants.length})
        </Button>
        <Button
          variant={activeTab === "users" ? "default" : "outline"}
          onClick={() => setActiveTab("users")}
          data-testid="button-tab-users"
        >
          <Users className="w-4 h-4 mr-2" />
          Users ({users.length})
        </Button>
      </div>

      {activeTab === "tenants" && (
        <div className="space-y-3">
          {tenantsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
            </div>
          ) : tenants.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No tenants found
              </CardContent>
            </Card>
          ) : (
            tenants.map((tenant) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                operatorosUrl={configuredOperatorOsUrl(tenant.operatorosUrl) || operatorosUrl}
                deleting={deleteTenantMutation.isPending}
                onDelete={() => deleteTenantMutation.mutate(tenant.id)}
              />
            ))
          )}
        </div>
      )}

      {activeTab === "users" && (
        <div className="space-y-3">
          {usersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : users.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No users found
              </CardContent>
            </Card>
          ) : (
            users.map((user) => (
              <Card key={user.id} data-testid={`card-user-${user.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={user.profileImageUrl || undefined} />
                        <AvatarFallback className="text-xs">
                          {(user.firstName?.[0] || "") + (user.lastName?.[0] || "")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium" data-testid={`text-user-name-${user.id}`}>
                            {user.firstName} {user.lastName}
                          </span>
                          {user.isSystemAdmin && (
                            <Badge variant="default" data-testid={`badge-sysadmin-${user.id}`}>
                              System Admin
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {user.email}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={user.isSystemAdmin ? "destructive" : "outline"}
                      onClick={() =>
                        toggleAdminMutation.mutate({
                          userId: user.id,
                          isSystemAdmin: !user.isSystemAdmin,
                        })
                      }
                      disabled={toggleAdminMutation.isPending}
                      data-testid={`button-toggle-admin-${user.id}`}
                    >
                      {user.isSystemAdmin ? (
                        <>
                          <ShieldOff className="w-3 h-3 mr-1" />
                          Remove Admin
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3 h-3 mr-1" />
                          Make Admin
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
