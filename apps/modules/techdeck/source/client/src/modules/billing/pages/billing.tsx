import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, FileText, HardDrive, Webhook, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface EntitlementSnapshot {
  schemaVersion: number;
  planSlug: string;
  subscriptionStatus: string;
  accessLevel: string;
  features: string[];
  limits: {
    usersMax?: number;
    storageGb?: number;
    reportsPerMonth?: number;
    webhooksMax?: number;
    intakeSpacesMax?: number;
  };
  organizationId?: string;
  enabled: boolean;
  syncedAt: string;
  moduleRole?: string;
  tenantRole?: string;
}

interface EntitlementsResponse {
  snapshot: EntitlementSnapshot | null;
  operatorosBillingUrl: string;
  lastSyncAt: string | null;
  managedBy: "operatoros";
}

interface SubscriptionResponse {
  usage: {
    reportsGenerated: number;
    webhookDeliveries: number;
    evidenceBytesStored: number;
  } | null;
}

function buildOperatorOsBillingUrl(base: string | undefined): string {
  const root =
    base ||
    (import.meta.env.VITE_OPERATOROS_BILLING_URL as string | undefined) ||
    (import.meta.env.VITE_OPERATOROS_BASE_URL as string | undefined) ||
    "/billing";
  const sep = root.includes("?") ? "&" : "?";
  return `${root}${sep}return_to=techdeck`;
}
function UsageBar({ label, icon: Icon, current, max, unit = "" }: {
  label: string; icon: LucideIcon; current?: number; max: number; unit?: string;
}) {
  const hasCurrent = typeof current === "number";
  const pct = hasCurrent && max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const isWarn = pct >= 80;
  const isOver = pct >= 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="w-3.5 h-3.5" />
          {label}
        </span>
        <span className={isOver ? "text-destructive font-medium" : isWarn ? "text-amber-600 font-medium" : "text-muted-foreground"}>
          {hasCurrent ? `${current}${unit} / ${max}${unit}` : `Limit: ${max}${unit}`}
        </span>
      </div>
      {hasCurrent && max > 0 && <Progress value={pct} className="h-1.5" />}
    </div>
  );
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  trialing: { label: "Trial", variant: "secondary" },
  past_due: { label: "Past Due", variant: "destructive" },
  unpaid: { label: "Unpaid", variant: "destructive" },
  canceled: { label: "Canceled", variant: "destructive" },
  none: { label: "Inactive", variant: "outline" },
};

/**
 * Task #12 read-only billing page. All plan changes happen in OperatorOS;
 * here we only display the current entitlement snapshot and provide a deep
 * link back to OperatorOS billing.
 */
export default function BillingPage() {
  const { data, isLoading } = useQuery<EntitlementsResponse>({
    queryKey: ["/api/me/entitlements"],
  });

  const { data: subData } = useQuery<SubscriptionResponse>({
    queryKey: ["/api/billing/subscription"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const snap = data?.snapshot;
  const usage = subData?.usage;
  const operatorosUrl = buildOperatorOsBillingUrl(data?.operatorosBillingUrl);
  const roleLabel = snap?.moduleRole || snap?.tenantRole || "—";
  const status = STATUS_BADGE[snap?.subscriptionStatus || "none"] || STATUS_BADGE.none;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-billing-title">Billing & Subscription</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your plan is managed by OperatorOS. All subscription changes happen in your OperatorOS account.
        </p>
      </div>

      <Card className="command-surface" data-testid="card-current-plan">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              Current Plan: <span data-testid="text-plan-name">{snap?.accessLevel || "—"}</span>
              <Badge variant={status.variant} data-testid="badge-plan-status">{status.label}</Badge>
              <Badge variant="outline" data-testid="badge-role">Role: {roleLabel}</Badge>
            </CardTitle>
            {data?.lastSyncAt && (
              <span className="text-xs text-muted-foreground" data-testid="text-last-sync">
                Last synced {new Date(data.lastSyncAt).toLocaleString()}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {snap && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UsageBar
                label="Users"
                icon={Users}
                max={snap.limits.usersMax || 0}
              />
              <UsageBar
                label="Storage"
                icon={HardDrive}
                current={Math.round((usage?.evidenceBytesStored || 0) / (1024 * 1024 * 1024))}
                max={snap.limits.storageGb || 0}
                unit="GB"
              />
              <UsageBar
                label="Reports"
                icon={FileText}
                current={usage?.reportsGenerated || 0}
                max={snap.limits.reportsPerMonth || 0}
                unit="/mo"
              />
              <UsageBar
                label="Webhooks"
                icon={Webhook}
                current={usage?.webhookDeliveries || 0}
                max={snap.limits.webhooksMax || 0}
              />
            </div>
          )}

          <div className="pt-2 border-t">
            <Button asChild className="w-full sm:w-auto" data-testid="button-manage-billing">
              <a href={operatorosUrl} rel="noopener noreferrer">
                Manage Billing in OperatorOS
                <ExternalLink className="w-3.5 h-3.5 ml-2" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {snap?.features && snap.features.length > 0 && (
        <Card className="command-surface" data-testid="card-features">
          <CardHeader>
            <CardTitle className="text-base">Included Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {snap.features.map((f) => (
                <Badge key={f} variant="secondary" data-testid={`badge-feature-${f}`}>{f}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
