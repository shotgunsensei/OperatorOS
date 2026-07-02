import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PulseLoader } from "@/components/pulse-line";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Link, useSearch } from "wouter";
import { useState, useMemo, useEffect } from "react";
import { Search, PlusCircle, AlertTriangle, HeartPulse, Clock, UserX, ShieldAlert, Hourglass, Users, Inbox, UserCheck } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { canSubmitIssues } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_CATEGORY_LABELS,
  type Ticket,
} from "@shared/schema";
import { format, formatDistanceToNow } from "date-fns";

type SlaState = "on_track" | "due_soon" | "overdue" | "blocked";
type TriageView = "all" | "new_intake" | "patient_impacting" | "overdue" | "waiting_vendor" | "waiting_department" | "high_critical" | "unassigned" | "my_tickets";
type TicketWithNames = Ticket & {
  departmentName?: string;
  reportedByName?: string;
  assignedToName?: string;
  slaState?: SlaState;
  slaDueAt?: string | Date | null;
  slaReason?: string;
  vendorExpectedFollowUpAt?: string | Date | null;
};

const OPEN_STATUSES = new Set(["new", "triage", "assigned", "waiting_department", "waiting_vendor", "in_progress", "escalated"]);

function isOpenTicket(ticket: TicketWithNames) {
  return OPEN_STATUSES.has(ticket.status);
}

function ticketIsOverdue(ticket: TicketWithNames) {
  return isOpenTicket(ticket)
    && (ticket.slaState === "overdue" || (!!ticket.dueDate && new Date(ticket.dueDate) < new Date()));
}

const TRIAGE_VIEWS: Array<{ id: TriageView; label: string; icon: any }> = [
  { id: "new_intake", label: "New Intake", icon: Inbox },
  { id: "patient_impacting", label: "Patient-Impacting", icon: HeartPulse },
  { id: "overdue", label: "Overdue", icon: Clock },
  { id: "waiting_vendor", label: "Waiting Vendor", icon: Users },
  { id: "waiting_department", label: "Waiting Department", icon: Hourglass },
  { id: "high_critical", label: "High/Critical", icon: ShieldAlert },
  { id: "unassigned", label: "Unassigned", icon: UserX },
  { id: "my_tickets", label: "My Tickets", icon: UserCheck },
];

export default function TicketsPage() {
  const { membership, user } = useAuth();
  const role = membership?.role;
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const urlStatus = urlParams.get("status");
  const urlView = urlParams.get("view") as TriageView | null;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(urlStatus || "all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [triageView, setTriageView] = useState<TriageView>(urlView || "all");

  useEffect(() => {
    if (urlStatus) setStatusFilter(urlStatus);
    if (urlView) setTriageView(urlView);
  }, [urlStatus, urlView]);

  const { data: tickets, isLoading } = useQuery<TicketWithNames[]>({
    queryKey: ["/api/tickets"],
  });

  const filtered = useMemo(() => {
    if (!tickets) return [];
    return tickets
      .filter((t) => {
        if (triageView === "new_intake" && t.status !== "new") return false;
        if (triageView === "patient_impacting" && (!t.isPatientImpacting || !isOpenTicket(t))) return false;
        if (triageView === "overdue" && !ticketIsOverdue(t)) return false;
        if (triageView === "waiting_vendor" && t.status !== "waiting_vendor") return false;
        if (triageView === "waiting_department" && t.status !== "waiting_department") return false;
        if (triageView === "high_critical" && (!(t.priority === "critical" || t.priority === "high") || !isOpenTicket(t))) return false;
        if (triageView === "unassigned" && (!!t.assignedTo || !isOpenTicket(t))) return false;
        if (triageView === "my_tickets" && t.assignedTo !== user?.id) return false;
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
        if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
        if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
        if (search) {
          const s = search.toLowerCase();
          return (
            t.title.toLowerCase().includes(s) ||
            t.ticketNumber.toLowerCase().includes(s) ||
            (t.departmentName || "").toLowerCase().includes(s) ||
            (t.assignedToName || "").toLowerCase().includes(s) ||
            (t.location || "").toLowerCase().includes(s)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [tickets, search, statusFilter, priorityFilter, categoryFilter, triageView, user?.id]);

  const triageCounts = useMemo<Record<TriageView, number>>(() => {
    const base: Record<TriageView, number> = {
      all: tickets?.length ?? 0,
      new_intake: 0,
      patient_impacting: 0,
      overdue: 0,
      waiting_vendor: 0,
      waiting_department: 0,
      high_critical: 0,
      unassigned: 0,
      my_tickets: 0,
    };
    for (const ticket of tickets || []) {
      if (ticket.status === "new") base.new_intake++;
      if (ticket.isPatientImpacting && isOpenTicket(ticket)) base.patient_impacting++;
      if (ticketIsOverdue(ticket)) base.overdue++;
      if (ticket.status === "waiting_vendor") base.waiting_vendor++;
      if (ticket.status === "waiting_department") base.waiting_department++;
      if ((ticket.priority === "critical" || ticket.priority === "high") && isOpenTicket(ticket)) base.high_critical++;
      if (!ticket.assignedTo && isOpenTicket(ticket)) base.unassigned++;
      if (ticket.assignedTo === user?.id) base.my_tickets++;
    }
    return base;
  }, [tickets, user?.id]);

  const activeFilters = [triageView !== "all", statusFilter !== "all", priorityFilter !== "all", categoryFilter !== "all", search.length > 0].filter(Boolean).length;
  const activeViewLabel = TRIAGE_VIEWS.find((view) => view.id === triageView)?.label;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Ticket Queue"
        description={`${filtered.length} issue${filtered.length !== 1 ? "s" : ""}${activeFilters > 0 ? ` (filtered)` : ""}`}
        action={
          canSubmitIssues(role) ? (
            <Link href="/submit">
              <Button data-testid="button-new-ticket" size="sm">
                <PlusCircle className="h-4 w-4 mr-1.5" />
                Report Issue
              </Button>
            </Link>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2" data-testid="triage-board">
          {TRIAGE_VIEWS.map((view) => {
            const Icon = view.icon;
            const isActive = triageView === view.id;
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => setTriageView(isActive ? "all" : view.id)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${isActive ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted/40"}`}
                data-testid={`triage-filter-${view.id}`}
                aria-pressed={isActive}
              >
                <div className="flex items-center justify-between gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-semibold tabular-nums">{triageCounts[view.id]}</span>
                </div>
                <p className="text-[11px] font-medium mt-1 truncate">{view.label}</p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="input-search"
              placeholder="Search by title, ticket #, department, location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[150px]" data-testid="filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(TICKET_STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-full sm:w-[140px]" data-testid="filter-priority">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              {Object.entries(TICKET_PRIORITY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[170px]" data-testid="filter-category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(TICKET_CATEGORY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeFilters > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setTriageView("all"); setStatusFilter("all"); setPriorityFilter("all"); setCategoryFilter("all"); setSearch(""); }}
              className="text-xs text-muted-foreground"
              data-testid="button-clear-ticket-filters"
            >
              Clear filters
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <PulseLoader />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {activeViewLabel ? `${activeViewLabel} is clear` : "No tickets match your criteria"}
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                {activeViewLabel ? "This queue has no active work right now." : "Try adjusting your filters or search terms"}
              </p>
              {canSubmitIssues(role) && (
                <Link href="/submit">
                  <Button variant="outline" size="sm" data-testid="button-empty-submit">
                    <PlusCircle className="h-4 w-4 mr-1.5" />
                    Report an Issue
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((ticket) => {
              const isOverdue = ticketIsOverdue(ticket);
              return (
                <Link key={ticket.id} href={`/tickets/${ticket.id}`}>
                  <div
                    className={`flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 hover-elevate cursor-pointer sm:flex-row sm:items-center ${isOverdue ? "border-l-2 border-l-rose-400" : ""}`}
                    data-testid={`ticket-row-${ticket.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground">{ticket.ticketNumber}</span>
                        <StatusBadge type="ticket-priority" value={ticket.priority} size="xs" />
                        {ticket.isPatientImpacting && (
                          <span className="text-[10px] font-medium text-rose-700 flex items-center gap-0.5" title="Patient-impacting">
                            <HeartPulse className="h-3 w-3" />
                            Patient
                          </span>
                        )}
                        {isOverdue && (
                          <span className="text-[10px] font-medium text-rose-600 flex items-center gap-0.5" title="Overdue">
                            <AlertTriangle className="h-3 w-3" />
                            Overdue
                          </span>
                        )}
                        {ticket.slaState && (
                          <StatusBadge type="sla-state" value={ticket.slaState} size="xs" />
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">{ticket.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ticket.departmentName || "No department"}
                        {ticket.location && ` · ${ticket.location}`}
                        {ticket.assignedToName && ` · ${ticket.assignedToName}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0 sm:flex-col sm:items-end">
                      <StatusBadge type="ticket-status" value={ticket.status} size="xs" />
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
                      </span>
                      {ticket.slaDueAt && (
                        <span className="text-[10px] text-muted-foreground">
                          SLA {format(new Date(ticket.slaDueAt), "MMM d")}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
