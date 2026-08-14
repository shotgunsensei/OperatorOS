import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Users,
  Server,
  FileText,
  MapPin,
  ArrowRight,
  AlertTriangle,
  Search,
  Upload,
  Clock,
  TicketIcon,
  CalendarDays,
  Receipt,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { useState } from "react";
import type { DashboardStats, TenantWithMember, EvidenceWithRelations } from "@/lib/types";
import type { Client } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

interface EntitlementsResponse {
  snapshot: {
    accessLevel?: string;
    planSlug?: string;
    subscriptionStatus?: string;
    enabled?: boolean;
    syncedAt?: string;
  } | null;
  managedBy?: "operatoros";
  lastSyncAt?: string | null;
}

function StatCard({
  title,
  value,
  max,
  icon: Icon,
  href,
  tone = "default",
  helper,
}: {
  title: string;
  value: number | string;
  max?: number;
  icon: any;
  href: string;
  tone?: "default" | "risk" | "success";
  helper?: string;
}) {
  const numericValue = typeof value === "number" ? value : 0;
  const nearLimit = max !== undefined && numericValue >= max * 0.8;
  const atLimit = max !== undefined && numericValue >= max;
  const toneClass =
    tone === "risk"
      ? "text-amber-500 bg-amber-500/10"
      : tone === "success"
        ? "text-emerald-500 bg-emerald-500/10"
        : "text-primary bg-primary/10";

  return (
    <Link href={href}>
      <Card className="metric-card hover-elevate cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium">{title}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
              {helper && <p className="text-xs text-muted-foreground mt-1">{helper}</p>}
              {max !== undefined && (
                <div className="flex items-center gap-1 mt-1">
                  {atLimit ? (
                    <Badge variant="destructive" className="text-xs">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Limit reached
                    </Badge>
                  ) : nearLimit ? (
                    <Badge variant="secondary" className="text-xs">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {max - numericValue} remaining
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">of {max}</span>
                  )}
                </div>
              )}
            </div>
            <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${toneClass}`}>
              <Icon className="w-4 h-4" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-32 rounded-md" />
        ))}
      </div>
      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <Skeleton className="h-72 rounded-md" />
        <Skeleton className="h-72 rounded-md" />
      </div>
    </div>
  );
}

function OperatorStatusCard({ data }: { data?: EntitlementsResponse }) {
  const snapshot = data?.snapshot;
  const status = snapshot?.subscriptionStatus || "unsynced";
  const enabled = snapshot?.enabled !== false;
  const blocking = ["past_due", "unpaid", "canceled", "unsynced"].includes(status) || !enabled;
  const label = snapshot?.accessLevel || snapshot?.planSlug || "OperatorOS";

  return (
    <Card className="metric-card">
      <CardContent className="p-4 h-full">
        <div className="flex h-full flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground font-medium">
                OperatorOS Entitlement Status
              </p>
              <p className="text-xl font-bold mt-1 capitalize" data-testid="text-operatoros-status">
                {status.replace("_", " ")}
              </p>
            </div>
            <div className={`w-9 h-9 rounded-md flex items-center justify-center ${blocking ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"}`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <Badge variant={blocking ? "outline" : "secondary"} className="status-chip">
              {label}
            </Badge>
            <p className="text-xs text-muted-foreground">
              Access, plans, and module availability are managed by OperatorOS.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ClientPortalDashboard() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: myClients, isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const evidenceUrl = `/api/evidence${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ""}`;
  const { data: evidence, isLoading: evidenceLoading } = useQuery<EvidenceWithRelations[]>({
    queryKey: [evidenceUrl],
  });

  const isLoading = clientsLoading || evidenceLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-md" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">
          Client Portal
        </h1>
        <p className="text-sm text-muted-foreground">
          Your assigned clients and evidence.
        </p>
      </div>

      {myClients && myClients.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {myClients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="hover-elevate cursor-pointer" data-testid={`card-client-${client.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Client</p>
                      <p className="text-lg font-bold mt-1 truncate">{client.name}</p>
                      {client.company && (
                        <p className="text-xs text-muted-foreground mt-0.5">{client.company}</p>
                      )}
                    </div>
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (searchQuery.trim()) {
              window.location.href = `/evidence?q=${encodeURIComponent(searchQuery)}`;
            }
          }}
        >
          <Input
            type="search"
            placeholder="Search your evidence..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-evidence"
          />
        </form>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-base font-semibold">Recent Evidence</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/evidence">
              View all
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!evidence?.length ? (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No evidence available</p>
              <p className="text-xs mt-1">Evidence shared with you will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {evidence.slice(0, 10).map((item) => (
                <Link key={item.id} href={`/evidence/${item.id}`}>
                  <div
                    className="flex items-center justify-between gap-4 p-3 rounded-md hover-elevate cursor-pointer"
                    data-testid={`evidence-item-${item.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {item.clientName && <span>{item.clientName}</span>}
                          <span>{formatFileSize(item.fileSize)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {item.createdAt
                        ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })
                        : "Just now"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: tenantInfo, isLoading: tenantLoading } = useQuery<TenantWithMember>({
    queryKey: ["/api/tenant"],
    queryFn: async () => {
      const res = await fetch("/api/tenant", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const role = tenantInfo?.role;
  const isClient = role === "CLIENT";
  const roleResolved = !!tenantInfo;

  const { data: stats, isLoading, error, refetch } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard"],
    enabled: roleResolved && !isClient,
  });

  const { data: entitlements } = useQuery<EntitlementsResponse>({
    queryKey: ["/api/me/entitlements"],
    enabled: roleResolved && !isClient,
    staleTime: 60_000,
  });

  if (tenantLoading || !roleResolved) {
    return <DashboardSkeleton />;
  }

  if (isClient) {
    return <ClientPortalDashboard />;
  }

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="command-surface max-w-2xl">
          <CardContent className="p-8">
            <EmptyState
              icon={AlertTriangle}
              title="Dashboard data did not load"
              description="The workspace shell is available, but the dashboard summary API returned an error. Retry, or check the server logs for /api/dashboard."
              action={{
                label: "Retry",
                onClick: () => {
                  void refetch();
                },
                variant: "outline",
                testId: "button-dashboard-retry",
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="subtle-grid-bg min-h-full p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Badge variant="outline" className="mb-2 status-chip">
            Command Center
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-dashboard-title">
            Tech Deck Operations
          </h1>
          <p className="text-sm text-muted-foreground">
            Live MSP workspace view for tickets, evidence, clients, and OperatorOS-managed access.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild data-testid="button-view-tickets">
            <Link href="/tickets">
              <TicketIcon className="w-4 h-4 mr-1" />
              View Tickets
            </Link>
          </Button>
          <Button asChild data-testid="button-upload-evidence">
            <Link href="/evidence/upload">
              <Upload className="w-4 h-4 mr-1" />
              Upload Evidence
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <StatCard
          title="Open Tickets"
          value={stats?.openTickets || 0}
          icon={TicketIcon}
          href="/tickets"
          helper="Active queue"
        />
        <StatCard
          title="SLA Risk"
          value={stats?.overdueTickets || 0}
          icon={AlertTriangle}
          href="/tickets"
          tone={(stats?.overdueTickets || 0) > 0 ? "risk" : "success"}
          helper={(stats?.overdueTickets || 0) > 0 ? "Overdue tickets" : "No overdue tickets"}
        />
        <StatCard
          title="Evidence Items"
          value={stats?.totalEvidence || 0}
          max={stats?.maxEvidence}
          icon={FileText}
          href="/evidence"
          helper="Chain-of-custody records"
        />
        <StatCard
          title="Active Clients"
          value={stats?.totalClients || 0}
          max={stats?.maxClients}
          icon={Users}
          href="/clients"
          helper="Tenant-scoped accounts"
        />
        <StatCard
          title="Recent Activity"
          value={stats?.recentEvidence?.length || 0}
          icon={Clock}
          href="/evidence"
          helper="Latest evidence uploads"
        />
        <OperatorStatusCard data={entitlements} />
      </div>

      {(stats?.overdueTickets || 0) > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  {stats!.overdueTickets} overdue ticket{stats!.overdueTickets > 1 ? "s" : ""} need attention
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">SLA resolution deadline has passed</p>
              </div>
              <Button variant="outline" size="sm" asChild className="ml-auto flex-shrink-0">
                <Link href="/tickets">View Tickets</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Upcoming Appointments"
          value={stats?.upcomingAppointments || 0}
          icon={CalendarDays}
          href="/calendar"
        />
        <StatCard
          title="Sites"
          value={stats?.totalSites || 0}
          icon={MapPin}
          href="/sites"
        />
        <StatCard
          title="Assets"
          value={stats?.totalAssets || 0}
          icon={Server}
          href="/assets"
        />
        <Card className="metric-card hover-elevate cursor-pointer" onClick={() => window.location.href = "/invoices"}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Unpaid Invoices</p>
                <p className="text-2xl font-bold mt-1">${((stats?.unpaidInvoiceCents || 0) / 100).toFixed(2)}</p>
              </div>
              <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Receipt className="w-4 h-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="metric-card hover-elevate cursor-pointer" onClick={() => window.location.href = "/time"}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Unbilled Time</p>
                <p className="text-2xl font-bold mt-1">{Math.floor((stats?.unbilledMinutes || 0) / 60)}h {(stats?.unbilledMinutes || 0) % 60}m</p>
              </div>
              <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-3xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (searchQuery.trim()) {
              window.location.href = `/evidence?q=${encodeURIComponent(searchQuery)}`;
            }
          }}
        >
          <Input
            type="search"
            placeholder="Search evidence by title, notes, tags, or client name..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-evidence"
          />
        </form>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
      <Card className="command-surface">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/evidence">
              View all
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!stats?.recentEvidence?.length ? (
            <EmptyState
              icon={FileText}
              title="No evidence uploaded yet"
              description="Start a chain-of-custody trail by uploading screenshots, logs, PDFs, or diagnostics for a client."
              action={{
                label: "Upload Evidence",
                href: "/evidence/upload",
                variant: "outline",
                testId: "button-empty-upload-evidence",
              }}
            />
          ) : (
            <div className="space-y-2">
              {stats.recentEvidence.map((item) => (
                <Link key={item.id} href={`/evidence/${item.id}`}>
                  <div
                    className="flex items-center justify-between gap-4 p-3 rounded-md hover-elevate cursor-pointer"
                    data-testid={`evidence-item-${item.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {item.clientName && <span>{item.clientName}</span>}
                          <span>{formatFileSize(item.fileSize)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {item.createdAt
                        ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })
                        : "Just now"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="command-surface">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Next Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild variant="outline" className="w-full justify-start" data-testid="button-next-itops">
            <Link href="/itops">
              <Terminal className="w-4 h-4 mr-1" />
              Open IT Ops Console
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-start" data-testid="button-next-secure-intake">
            <Link href="/secure-intake">
              <Upload className="w-4 h-4 mr-1" />
              Review Secure Intake
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-start" data-testid="button-next-operatoros">
            <Link href="/billing">
              <ShieldCheck className="w-4 h-4 mr-1" />
              Check OperatorOS Snapshot
            </Link>
          </Button>
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            Tech Deck enforces the synced OperatorOS snapshot locally. Billing and module changes stay in OperatorOS.
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
