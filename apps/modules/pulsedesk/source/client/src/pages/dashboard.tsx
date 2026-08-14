import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { PulseLoader } from "@/components/pulse-line";
import {
  Ticket,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Cpu,
  Wrench,
  Package,
  TrendingUp,
  Activity,
  ChevronRight,
  Users,
  Timer,
  ShieldAlert,
  HeartPulse,
  Hourglass,
  Bell,
  UserX,
  RefreshCw,
  Settings,
  BarChart3,
  ClipboardList,
  Shield,
  ArrowRight,
  Sparkles,
  SkipForward,
  CircleDot,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_CATEGORY_LABELS,
} from "@shared/schema";
import { canSubmitIssues, hasRole, isReadOnly, ROLE_LABELS } from "@/lib/permissions";

interface DashboardStats {
  totalTickets: number;
  openTickets: number;
  resolvedThisMonth: number;
  newThisMonth: number;
  statusCounts: Record<string, number>;
  priorityCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  departmentCounts: Record<string, number>;
  overdueCount: number;
  equipmentIncidents: number;
  facilityIncidents: number;
  pendingSupplyRequests: number;
  totalAssets: number;
  assetsUnderService: number;
  assetsOffline: number;
  criticalHighOpen: number;
  waitingDeptCount: number;
  waitingVendorCount: number;
  staleVendorWaitCount: number;
  escalatedCount: number;
  patientImpactingCount: number;
  recurringCount: number;
  unassignedCount: number;
  avgResolutionHours: number;
  avgTriageHours: number;
  slaCounts: Record<"on_track" | "due_soon" | "overdue" | "blocked", number>;
  agingBuckets: { under24h: number; "1to3days": number; "3to7days": number; over7days: number };
  openFacilityRequests: number;
  connectorHealth: ConnectorHealth;
  dailyBrief: DailyBrief;
  recentActivity: Array<{
    id: string;
    ticketNumber: string;
    title: string;
    status: string;
    priority: string;
    category: string;
    updatedAt: string;
    dueDate?: string | null;
    vendorExpectedFollowUpAt?: string | null;
    isPatientImpacting?: boolean;
    slaState?: "on_track" | "due_soon" | "overdue" | "blocked";
    assignedToName: string | null;
  }>;
  isEmpty: boolean;
}

interface BriefTicket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  updatedAt: string;
  dueDate?: string | null;
  vendorReference?: string | null;
  vendorExpectedFollowUpAt?: string | null;
  isPatientImpacting?: boolean;
  slaState?: "on_track" | "due_soon" | "overdue" | "blocked";
}

interface PendingSupplyBrief {
  id: string;
  itemName: string;
  urgency: string;
  quantity: number;
  createdAt: string;
}

interface ConnectorHealth {
  enabledEmailSettings: boolean;
  totalConnectors: number;
  activeConnectors: number;
  errorConnectors: number;
  disabledConnectors: number;
  pendingAuthConnectors: number;
  lastError: string | null;
}

interface DailyBrief {
  urgentTickets: BriefTicket[];
  overdueTickets: BriefTicket[];
  staleVendorWaits: BriefTicket[];
  pendingSupplyApprovals: PendingSupplyBrief[];
  connectorHealth: ConnectorHealth;
}

function KpiCard({ label, value, sub, icon: Icon, iconColor = "text-muted-foreground", href, alert }: {
  label: string; value: number | string; sub?: string;
  icon: any; iconColor?: string; href?: string; alert?: boolean;
}) {
  const hasValue = typeof value === "number" ? value > 0 : !!value;
  const inner = (
    <div className={`rounded-xl border p-4 ${href ? "hover-elevate cursor-pointer" : ""} ${alert ? "border-rose-200 bg-rose-50/60 dark:border-rose-800/40 dark:bg-rose-950/20" : "bg-card"}`}
      data-testid={`kpi-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[11px] font-medium tracking-wide uppercase ${alert ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground"}`}>{label}</span>
        <div className="relative">
          <Icon className={`h-4 w-4 ${alert ? "text-rose-500" : iconColor}`} />
          {alert && hasValue && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-500 pulse-dot-critical" />
          )}
        </div>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${alert ? "text-rose-700 dark:text-rose-400" : ""}`}>{value}</p>
      {sub && <p className={`text-[11px] mt-0.5 ${alert ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

interface OnboardingItemData {
  id: string;
  title: string;
  description: string;
  route: string;
  sortOrder: number;
  status: string;
  completionSource: string | null;
  completedAt: string | null;
  autoCompleteKey: string | null;
  systemComplete?: boolean;
}

const STEP_ICONS: Record<string, any> = {
  departments: ClipboardList,
  assets: Cpu,
  vendors: Users,
  members: Shield,
  tickets: Ticket,
};

function AdminOnboarding() {
  const { data: items = [], isLoading } = useQuery<OnboardingItemData[]>({
    queryKey: ["/api/onboarding"],
    staleTime: 0,
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/onboarding/${id}/complete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/onboarding/${id}/skip`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
    },
  });

  if (isLoading) return null;

  const activeItems = items.filter(i => i.status !== "skipped");
  const completedCount = activeItems.filter(i => i.status === "complete").length;
  const totalCount = activeItems.length;
  if (totalCount === 0 || completedCount === totalCount) return null;

  const progressPct = Math.round((completedCount / totalCount) * 100);

  return (
    <Card data-testid="admin-onboarding">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Getting Started
          <span className="ml-auto text-xs text-muted-foreground font-normal">{completedCount}/{totalCount} complete</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full h-1.5 rounded-full bg-muted mb-3 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Set up your facility in a few steps. Items auto-complete as you add data.
        </p>
        <div className="space-y-1.5">
          {items.filter(i => i.status !== "skipped").map((item) => {
            const Icon = STEP_ICONS[item.autoCompleteKey || ""] || CircleDot;
            const isDone = item.status === "complete";
            return (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border px-3 py-2.5 group" data-testid={`onboard-step-${item.id}`}>
                <Link href={item.route || "#"} className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-80 transition-opacity cursor-pointer">
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 shrink-0 border-muted-foreground/30" />
                    )}
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className={`text-sm block truncate ${isDone ? "text-muted-foreground line-through" : "font-medium"}`}>{item.title}</span>
                      {item.description && !isDone && (
                        <span className="text-[11px] text-muted-foreground block truncate">{item.description}</span>
                      )}
                    </div>
                  </div>
                </Link>
                {isDone && item.completionSource === "auto" && (
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded shrink-0">auto</span>
                )}
                {!isDone && (
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={(e) => { e.stopPropagation(); completeMutation.mutate(item.id); }}
                      disabled={completeMutation.isPending}
                      data-testid={`button-complete-${item.id}`}
                      aria-label={`Mark ${item.title} complete`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={(e) => { e.stopPropagation(); skipMutation.mutate(item.id); }}
                      disabled={skipMutation.isPending}
                      data-testid={`button-skip-${item.id}`}
                      aria-label={`Skip ${item.title}`}
                    >
                      <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                )}
                {!isDone && (
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RoleGuidance({ role }: { role: string | undefined }) {
  if (!role || role === "admin") return null;

  const guidance: Record<string, { title: string; description: string; actions: Array<{ label: string; href: string; icon: any }> }> = {
    technician: {
      title: "Your Workbench",
      description: "Issues assigned to you appear in the ticket queue. Use filters to focus on your department or priority level.",
      actions: [
        { label: "View Ticket Queue", href: "/tickets", icon: Ticket },
        { label: "Equipment Registry", href: "/assets", icon: Cpu },
      ],
    },
    staff: {
      title: "Report & Track",
      description: "Submit issues for your department and track their progress. You can also request supplies and facility work.",
      actions: [
        { label: "Report an Issue", href: "/submit", icon: Ticket },
        { label: "Request Supplies", href: "/supply-requests", icon: Package },
        { label: "Facility Request", href: "/facility-requests", icon: Wrench },
      ],
    },
    supervisor: {
      title: "Operations Overview",
      description: "Monitor team performance, manage escalations, and review analytics for your facility.",
      actions: [
        { label: "Ticket Queue", href: "/tickets", icon: Ticket },
        { label: "Analytics", href: "/analytics", icon: BarChart3 },
        { label: "Settings", href: "/settings", icon: Settings },
      ],
    },
    readonly: {
      title: "Executive View",
      description: "Review operational metrics and department performance across your facility.",
      actions: [
        { label: "View Analytics", href: "/analytics", icon: BarChart3 },
        { label: "Ticket Overview", href: "/tickets", icon: Ticket },
      ],
    },
  };

  const g = guidance[role];
  if (!g) return null;

  return (
    <Card data-testid="role-guidance" className="border-primary/20 bg-primary/[0.02]">
      <CardContent className="pt-4 pb-3">
        <p className="text-sm font-medium mb-0.5">{g.title}</p>
        <p className="text-xs text-muted-foreground mb-3">{g.description}</p>
        <div className="flex flex-wrap gap-2">
          {g.actions.map((a) => (
            <Link key={a.label} href={a.href}>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" data-testid={`guide-${a.label.toLowerCase().replace(/\s/g, "-")}`}>
                <a.icon className="h-3.5 w-3.5" />
                {a.label}
              </Button>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BriefTicketRow({ ticket }: { ticket: BriefTicket }) {
  return (
    <Link href={`/tickets/${ticket.id}`}>
      <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer" data-testid={`brief-ticket-${ticket.id}`}>
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">{ticket.ticketNumber}: {ticket.title}</p>
          <p className="text-[10px] text-muted-foreground">
            {TICKET_CATEGORY_LABELS[ticket.category] || ticket.category}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <StatusBadge type="ticket-priority" value={ticket.priority} size="xs" />
          {ticket.slaState && <StatusBadge type="sla-state" value={ticket.slaState} size="xs" />}
        </div>
      </div>
    </Link>
  );
}

function DailyBriefCard({ stats, canManageInbox }: { stats: DashboardStats; canManageInbox: boolean }) {
  const brief = stats.dailyBrief;
  const inboxNeedsAttention =
    brief.connectorHealth.errorConnectors > 0
    || brief.connectorHealth.pendingAuthConnectors > 0
    || !brief.connectorHealth.enabledEmailSettings;

  return (
    <Card data-testid="daily-brief">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          Daily Brief
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Link href="/tickets?view=high_critical">
            <div className="rounded-lg border p-2 hover-elevate cursor-pointer" data-testid="brief-urgent-count">
              <p className="text-lg font-bold tabular-nums">{brief.urgentTickets.length}</p>
              <p className="text-[11px] text-muted-foreground">Urgent</p>
            </div>
          </Link>
          <Link href="/tickets?view=overdue">
            <div className="rounded-lg border p-2 hover-elevate cursor-pointer" data-testid="brief-overdue-count">
              <p className="text-lg font-bold tabular-nums text-rose-700">{stats.overdueCount}</p>
              <p className="text-[11px] text-muted-foreground">Overdue</p>
            </div>
          </Link>
          <Link href="/tickets?view=waiting_vendor">
            <div className="rounded-lg border p-2 hover-elevate cursor-pointer" data-testid="brief-vendor-count">
              <p className="text-lg font-bold tabular-nums text-fuchsia-700">{stats.staleVendorWaitCount}</p>
              <p className="text-[11px] text-muted-foreground">Stale Vendor</p>
            </div>
          </Link>
          <Link href="/supply-requests">
            <div className="rounded-lg border p-2 hover-elevate cursor-pointer" data-testid="brief-supply-count">
              <p className="text-lg font-bold tabular-nums text-amber-700">{brief.pendingSupplyApprovals.length}</p>
              <p className="text-[11px] text-muted-foreground">Supply Review</p>
            </div>
          </Link>
          {canManageInbox ? (
            <Link href="/email-settings">
              <div className={`rounded-lg border p-2 hover-elevate cursor-pointer ${inboxNeedsAttention ? "border-amber-200 bg-amber-50/60 dark:bg-amber-950/20" : ""}`} data-testid="brief-inbox-health">
                <p className={`text-lg font-bold tabular-nums ${inboxNeedsAttention ? "text-amber-700" : "text-emerald-700"}`}>
                  {brief.connectorHealth.activeConnectors}
                </p>
                <p className="text-[11px] text-muted-foreground">Active Inboxes</p>
              </div>
            </Link>
          ) : (
            <div className={`rounded-lg border p-2 ${inboxNeedsAttention ? "border-amber-200 bg-amber-50/60 dark:bg-amber-950/20" : ""}`} data-testid="brief-inbox-health">
              <p className={`text-lg font-bold tabular-nums ${inboxNeedsAttention ? "text-amber-700" : "text-emerald-700"}`}>
                {brief.connectorHealth.activeConnectors}
              </p>
              <p className="text-[11px] text-muted-foreground">Active Inboxes</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-lg border p-2">
            <p className="text-xs font-medium mb-1">Urgent Tickets</p>
            {brief.urgentTickets.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No urgent tickets waiting.</p>
            ) : (
              brief.urgentTickets.slice(0, 3).map((ticket) => <BriefTicketRow key={ticket.id} ticket={ticket} />)
            )}
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-xs font-medium mb-1">Vendor Follow-Up</p>
            {brief.staleVendorWaits.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No stale vendor waits.</p>
            ) : (
              brief.staleVendorWaits.slice(0, 3).map((ticket) => <BriefTicketRow key={ticket.id} ticket={ticket} />)
            )}
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-xs font-medium mb-1">Pending Supply Review</p>
            {brief.pendingSupplyApprovals.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No supply approvals waiting.</p>
            ) : (
              brief.pendingSupplyApprovals.slice(0, 3).map((item) => (
                <Link key={item.id} href="/supply-requests">
                  <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer" data-testid={`brief-supply-${item.id}`}>
                    <span className="text-xs truncate">{item.itemName}</span>
                    <StatusBadge type="ticket-priority" value={item.urgency} size="xs" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { user, org, membership } = useAuth();
  const role = membership?.role;
  const firstName = user?.fullName?.split(" ")[0] || user?.username || "";

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard"],
    enabled: !!org,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Dashboard" description="Loading operational data..." />
        <div className="flex-1 flex items-center justify-center">
          <PulseLoader />
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`${getGreeting()}, ${firstName}`}
        description={org ? `${org.name} · ${ROLE_LABELS[role || ""] || role || "Member"}` : "Facility operations at a glance"}
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Intake" value={stats.statusCounts.new || 0} sub="awaiting triage" icon={Ticket} iconColor="text-primary" href="/tickets?status=new" />
          <KpiCard label="Open Issues" value={stats.openTickets} sub="active" icon={Activity} iconColor="text-accent" href="/tickets" />
          <KpiCard label="Overdue" value={stats.overdueCount} sub={stats.overdueCount > 0 ? "requires attention" : "all current"} icon={AlertTriangle} alert={stats.overdueCount > 0} href="/tickets?view=overdue" />
          <KpiCard label="Critical / High" value={stats.criticalHighOpen} sub="unresolved" icon={ShieldAlert} iconColor="text-amber-600" alert={stats.criticalHighOpen > 3} href="/tickets?view=high_critical" />
          <KpiCard label="Resolved" value={stats.resolvedThisMonth} sub="this month" icon={CheckCircle2} iconColor="text-emerald-600" />
        </div>

        {hasRole(role, "supervisor") && <DailyBriefCard stats={stats} canManageInbox={hasRole(role, "admin")} />}
        {role === "admin" && <AdminOnboarding />}
        {role !== "admin" && <RoleGuidance role={role} />}
        {(stats.waitingDeptCount > 0 || stats.waitingVendorCount > 0 || stats.escalatedCount > 0 || stats.patientImpactingCount > 0 || stats.unassignedCount > 0) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {stats.waitingDeptCount > 0 && (
              <KpiCard label="Dept. Pending" value={stats.waitingDeptCount} icon={Hourglass} iconColor="text-violet-600" href="/tickets?status=waiting_department" />
            )}
            {stats.waitingVendorCount > 0 && (
              <KpiCard label="Vendor Pending" value={stats.waitingVendorCount} icon={Users} iconColor="text-fuchsia-600" href="/tickets?status=waiting_vendor" />
            )}
            {stats.staleVendorWaitCount > 0 && (
              <KpiCard label="Vendor Stale" value={stats.staleVendorWaitCount} icon={Timer} iconColor="text-rose-600" alert href="/tickets?view=waiting_vendor" />
            )}
            {stats.escalatedCount > 0 && (
              <KpiCard label="Escalated" value={stats.escalatedCount} icon={Bell} iconColor="text-rose-600" href="/tickets?status=escalated" />
            )}
            {stats.patientImpactingCount > 0 && (
              <KpiCard label="Patient Impact" value={stats.patientImpactingCount} icon={HeartPulse} iconColor="text-rose-600" alert href="/tickets?view=patient_impacting" />
            )}
            {stats.unassignedCount > 0 && (
              <KpiCard label="Unassigned" value={stats.unassignedCount} icon={UserX} iconColor="text-amber-600" href="/tickets?view=unassigned" />
            )}
            {stats.recurringCount > 0 && (
              <KpiCard label="Recurring" value={stats.recurringCount} icon={RefreshCw} iconColor="text-violet-600" />
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  SLA Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(["on_track", "due_soon", "overdue", "blocked"] as const).map((state) => (
                    <Link key={state} href={state === "blocked" ? "/tickets?view=waiting_vendor" : state === "overdue" ? "/tickets?view=overdue" : "/tickets"}>
                      <div className="rounded-lg border p-3 text-center hover-elevate cursor-pointer" data-testid={`sla-count-${state}`}>
                        <p className="text-lg font-bold tabular-nums">{stats.slaCounts?.[state] ?? 0}</p>
                        <StatusBadge type="sla-state" value={state} size="xs" className="mt-1" />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Ticket className="h-4 w-4 text-muted-foreground" />
                  Status Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
                  {Object.entries(TICKET_STATUS_LABELS).map(([status, label]) => (
                    <Link key={status} href={`/tickets?status=${status}`}>
                      <div className="text-center rounded-lg border p-2 hover-elevate cursor-pointer" data-testid={`status-count-${status}`}>
                        <p className="text-lg font-bold tabular-nums">{stats.statusCounts[status] || 0}</p>
                        <StatusBadge type="ticket-status" value={status} size="xs" className="mt-1" />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    By Priority
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(TICKET_PRIORITY_LABELS).map(([priority, label]) => (
                      <div key={priority} className="text-center rounded-lg border p-3" data-testid={`priority-count-${priority}`}>
                        <p className="text-lg font-bold tabular-nums">{stats.priorityCounts[priority] || 0}</p>
                        <StatusBadge type="ticket-priority" value={priority} size="xs" className="mt-1" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Timer className="h-4 w-4 text-muted-foreground" />
                    Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-lg font-bold tabular-nums">{stats.avgTriageHours}h</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Avg. Triage Time</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-lg font-bold tabular-nums">{stats.avgResolutionHours}h</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Avg. Resolution</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Issue Aging
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-lg font-bold tabular-nums text-emerald-700">{stats.agingBuckets?.under24h ?? 0}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">&lt; 24 hours</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-lg font-bold tabular-nums text-sky-700">{stats.agingBuckets?.["1to3days"] ?? 0}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">1–3 days</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-lg font-bold tabular-nums text-amber-700">{stats.agingBuckets?.["3to7days"] ?? 0}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">3–7 days</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className={`text-lg font-bold tabular-nums ${(stats.agingBuckets?.over7days ?? 0) > 0 ? "text-rose-700" : ""}`}>{stats.agingBuckets?.over7days ?? 0}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">&gt; 7 days</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  By Category
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {Object.entries(stats.categoryCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, cnt]) => {
                      const maxVal = Math.max(...Object.values(stats.categoryCounts));
                      return (
                        <div key={cat} className="flex items-center justify-between gap-3">
                          <span className="text-sm truncate flex-1">{TICKET_CATEGORY_LABELS[cat] || cat}</span>
                          <div className="flex items-center gap-2 w-28">
                            <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min((cnt / maxVal) * 100, 100)}%` }} />
                            </div>
                            <span className="text-sm font-medium tabular-nums w-6 text-right">{cnt}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {!isReadOnly(role) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {canSubmitIssues(role) && (
                      <Link href="/submit">
                        <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 hover-elevate cursor-pointer" data-testid="qa-submit">
                          <Ticket className="h-4 w-4 text-primary" />
                          <span className="text-sm">Report Issue</span>
                        </div>
                      </Link>
                    )}
                    <Link href="/supply-requests">
                      <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 hover-elevate cursor-pointer" data-testid="qa-supply">
                        <Package className="h-4 w-4 text-amber-600" />
                        <span className="text-sm">Request Supplies</span>
                      </div>
                    </Link>
                    <Link href="/facility-requests">
                      <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 hover-elevate cursor-pointer" data-testid="qa-facility">
                        <Wrench className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm">Facilities Request</span>
                      </div>
                    </Link>
                    <Link href="/assets">
                      <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 hover-elevate cursor-pointer" data-testid="qa-assets">
                        <Cpu className="h-4 w-4 text-violet-600" />
                        <span className="text-sm">View Equipment</span>
                      </div>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Operational Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3 text-center" data-testid="summary-equipment">
                    <Cpu className="h-4 w-4 text-muted-foreground mx-auto" />
                    <p className="text-xl font-bold tabular-nums mt-1">{stats.equipmentIncidents}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Equipment Issues</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center" data-testid="summary-facility">
                    <Wrench className="h-4 w-4 text-muted-foreground mx-auto" />
                    <p className="text-xl font-bold tabular-nums mt-1">{stats.openFacilityRequests}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Facility Requests</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center" data-testid="summary-supplies">
                    <Package className="h-4 w-4 text-muted-foreground mx-auto" />
                    <p className="text-xl font-bold tabular-nums mt-1">{stats.pendingSupplyRequests}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Pending Supplies</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center" data-testid="summary-assets-service">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground mx-auto" />
                    <p className="text-xl font-bold tabular-nums mt-1">{stats.assetsUnderService + (stats.assetsOffline || 0)}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Assets Down/Service</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3">
                {stats.recentActivity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <Clock className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm font-medium text-muted-foreground">No recent activity</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">New activity will appear here as issues are created and updated</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {stats.recentActivity.slice(0, 6).map((item) => (
                      <Link key={item.id} href={`/tickets/${item.id}`}>
                        <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-muted/40 cursor-pointer" data-testid={`activity-${item.id}`}>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{item.ticketNumber}: {item.title}</p>
                            <p className="text-[10px] text-muted-foreground">{TICKET_CATEGORY_LABELS[item.category] || item.category}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {item.slaState && <StatusBadge type="sla-state" value={item.slaState} size="xs" />}
                            <StatusBadge type="ticket-status" value={item.status} size="xs" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {Object.keys(stats.departmentCounts).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    Issues by Department
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(stats.departmentCounts)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 8)
                      .map(([dept, cnt]) => (
                        <div key={dept} className="flex items-center justify-between gap-2">
                          <span className="text-sm truncate">{dept}</span>
                          <span className="text-sm font-medium tabular-nums">{cnt}</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
