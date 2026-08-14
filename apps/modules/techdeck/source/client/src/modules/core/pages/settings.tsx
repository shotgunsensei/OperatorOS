import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CreditCard,
  Puzzle,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { TenantWithMember } from "@/lib/types";
import type { DashboardStats } from "@/lib/types";
import type { ModuleDefinition } from "@shared/modules/types";

interface EntitlementsResponse {
  snapshot: {
    accessLevel?: string;
    subscriptionStatus?: string;
    enabled?: boolean;
    features?: string[];
    limits?: Record<string, number>;
  } | null;
  lastSyncAt?: string | null;
}

function formatSnapshotValue(value: string | number | undefined | null) {
  return value === undefined || value === null || value === "" ? "Not synced" : String(value);
}

export default function SettingsPage() {
  const { data: tenantInfo, isLoading: tenantLoading } = useQuery<TenantWithMember>({
    queryKey: ["/api/tenant"],
  });
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard"],
  });
  const { data: modules, isLoading: modulesLoading } = useQuery<ModuleDefinition[]>({
    queryKey: ["/api/modules"],
  });
  const { data: entitlements, isLoading: entitlementsLoading } = useQuery<EntitlementsResponse>({
    queryKey: ["/api/me/entitlements"],
  });

  if (tenantLoading || statsLoading || modulesLoading || entitlementsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const tenant = tenantInfo?.tenant;
  const snapshot = entitlements?.snapshot;
  const limits = snapshot?.limits || {};

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-settings-title">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Review your organization settings, OperatorOS entitlements, and installed modules.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Organization</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Name</p>
              <p className="text-sm mt-0.5" data-testid="text-org-name">
                {tenant?.name}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Slug</p>
              <p className="text-sm mt-0.5 font-mono">{tenant?.slug}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Your Role</p>
            <Badge variant="secondary" className="mt-1">
              {tenantInfo?.role}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">OperatorOS Entitlements</CardTitle>
            </div>
            <Badge variant="secondary" data-testid="text-plan-name">
              {formatSnapshotValue(snapshot?.accessLevel)}
            </Badge>
          </div>
          <CardDescription>
            Plan, billing state, feature access, and limits are synced from OperatorOS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Subscription Status</p>
              <p className="mt-0.5">{formatSnapshotValue(snapshot?.subscriptionStatus)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Tech Deck Access</p>
              <p className="mt-0.5">{snapshot?.enabled === false ? "Disabled" : snapshot ? "Enabled" : "Not synced"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Users Limit</p>
              <p className="mt-0.5">{formatSnapshotValue(limits.usersMax)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Storage Limit</p>
              <p className="mt-0.5">{limits.storageGb === undefined ? "Not synced" : `${limits.storageGb} GB`}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Reports / Month</p>
              <p className="mt-0.5">{formatSnapshotValue(limits.reportsPerMonth)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Last Sync</p>
              <p className="mt-0.5">{entitlements?.lastSyncAt ? new Date(entitlements.lastSyncAt).toLocaleString() : "Not synced"}</p>
            </div>
          </div>

          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            <p className="text-xs text-muted-foreground font-medium mb-2">Current Workspace Usage</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
              <span>{stats?.totalClients || 0} clients</span>
              <span>{stats?.totalEvidence || 0} evidence items</span>
              <span>{stats?.totalAssets || 0} assets</span>
              <span>{stats?.openTickets || 0} open tickets</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Puzzle className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Modules</CardTitle>
          </div>
          <CardDescription>
            Installed modules and their status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {modules?.map((mod) => (
              <div
                key={mod.id}
                className="flex items-start justify-between gap-4 p-3 rounded-md border"
                data-testid={`module-card-${mod.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" data-testid={`module-name-${mod.id}`}>
                      {mod.name}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      v{mod.version}
                    </Badge>
                    {mod.category === "core" && (
                      <Badge variant="outline" className="text-xs">
                        Core
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {mod.description}
                  </p>
                  {mod.operatorOsFeatureKey && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      OperatorOS feature: {mod.operatorOsFeatureKey}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {mod.enabled ? (
                    <Badge
                      variant="default"
                      data-testid={`module-status-${mod.id}`}
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Active
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      data-testid={`module-status-${mod.id}`}
                    >
                      Inactive
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
