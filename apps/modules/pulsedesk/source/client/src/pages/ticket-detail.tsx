import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import {
  ArrowLeft, Clock, User, MapPin, Building2, AlertTriangle,
  HeartPulse, RefreshCw, ExternalLink, Cpu, FileText,
  MessageSquare, ChevronUp, Printer, CalendarClock,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/status-badge";
import { PulseLoader } from "@/components/pulse-line";
import { canManageTickets, canAssignTickets, canAddNotes, isReadOnly, canEscalate } from "@/lib/permissions";
import { format, formatDistanceToNow } from "date-fns";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_CATEGORY_LABELS,
  type Ticket,
  type TicketEvent,
  type Membership,
} from "@shared/schema";

type TicketWithNames = Ticket & {
  departmentName?: string;
  reportedByName?: string;
  assignedToName?: string;
  slaState?: "on_track" | "due_soon" | "overdue" | "blocked";
  slaDueAt?: string | Date | null;
  slaReason?: string;
};

function dateInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : format(date, "yyyy-MM-dd");
}

function DetailRow({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <div className="text-sm mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function TimelineEvent({ event }: { event: TicketEvent }) {
  const isNote = event.type === "note";
  const isStatus = event.type === "status_change";

  return (
    <div className="flex gap-3 items-start" data-testid={`event-${event.id}`}>
      <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${isNote ? "bg-accent" : isStatus ? "bg-primary" : "bg-muted-foreground"}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${isNote ? "bg-muted/50 rounded-lg p-2.5 border" : ""}`}>
          {event.content || event.type}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          {format(new Date(event.createdAt), "MMM d, yyyy 'at' h:mm a")}
        </p>
      </div>
    </div>
  );
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { membership } = useAuth();
  const role = membership?.role;
  const [noteContent, setNoteContent] = useState("");
  const [showResolution, setShowResolution] = useState(false);
  const [rootCause, setRootCause] = useState("");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [vendorReference, setVendorReference] = useState("");
  const [vendorContactedAt, setVendorContactedAt] = useState("");
  const [vendorExpectedFollowUpAt, setVendorExpectedFollowUpAt] = useState("");

  const { data: ticket, isLoading } = useQuery<TicketWithNames>({
    queryKey: ["/api/tickets", id],
  });

  const { data: events } = useQuery<TicketEvent[]>({
    queryKey: ["/api/tickets", id, "events"],
    enabled: !!id,
  });

  const { data: members } = useQuery<(Membership & { fullName?: string; username?: string })[]>({
    queryKey: ["/api/members"],
  });

  useEffect(() => {
    if (!ticket) return;
    setVendorReference(ticket.vendorReference || "");
    setVendorContactedAt(dateInputValue(ticket.vendorContactedAt));
    setVendorExpectedFollowUpAt(dateInputValue(ticket.vendorExpectedFollowUpAt));
  }, [ticket]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Ticket>) =>
      apiRequest("PATCH", `/api/tickets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", id, "events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Ticket updated" });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/tickets/${id}/notes`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", id, "events"] });
      setNoteContent("");
      toast({ title: "Note added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/tickets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      setLocation("/tickets");
      toast({ title: "Ticket deleted" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Ticket Details" description="Loading..." />
        <div className="flex-1 flex items-center justify-center">
          <PulseLoader />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Ticket Not Found" description="" />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <Link href="/tickets"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Queue</Button></Link>
        </div>
      </div>
    );
  }

  const isOverdue = ticket.dueDate && new Date(ticket.dueDate) < new Date() && !["resolved", "closed"].includes(ticket.status);
  const age = formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: false });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={ticket.ticketNumber}
        description={ticket.title}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print-ticket">
              <Printer className="h-4 w-4 mr-1.5" /> Print
            </Button>
            <Link href="/tickets">
              <Button variant="outline" size="sm" data-testid="button-back">
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Queue
              </Button>
            </Link>
          </div>
        }
      />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge type="ticket-status" value={ticket.status} size="md" />
          <StatusBadge type="ticket-priority" value={ticket.priority} size="md" />
          <span className="text-xs text-muted-foreground px-2 py-1 rounded-full border bg-card">
            {TICKET_CATEGORY_LABELS[ticket.category] || ticket.category}
          </span>
          {ticket.isPatientImpacting && (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-rose-200 bg-rose-50 text-rose-700 flex items-center gap-1">
              <HeartPulse className="h-3 w-3" /> Patient Impacting
            </span>
          )}
          {ticket.isRecurring && (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700 flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Recurring
            </span>
          )}
          {isOverdue && (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-rose-200 bg-rose-50 text-rose-700 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Overdue
            </span>
          )}
          {ticket.slaState && (
            <StatusBadge type="sla-state" value={ticket.slaState} size="md" />
          )}
          <span className="text-[11px] text-muted-foreground ml-auto">Open {age}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Issue Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{ticket.description || "No description provided."}</p>
              </CardContent>
            </Card>

            {(ticket.rootCause || ticket.resolutionSummary) && (
              <Card className="border-emerald-200 bg-emerald-50/30 dark:border-emerald-800/40 dark:bg-emerald-950/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-emerald-800 dark:text-emerald-400">Resolution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ticket.rootCause && (
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Root Cause</p>
                      <p className="text-sm mt-0.5">{ticket.rootCause}</p>
                    </div>
                  )}
                  {ticket.resolutionSummary && (
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Resolution Summary</p>
                      <p className="text-sm mt-0.5">{ticket.resolutionSummary}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Timeline & Notes
                  {events && events.length > 0 && (
                    <span className="text-[11px] text-muted-foreground font-normal ml-auto">{events.length} entries</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!events || events.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No activity recorded yet</p>
                ) : (
                  <div className="space-y-4">
                    {events.map((event) => (
                      <TimelineEvent key={event.id} event={event} />
                    ))}
                  </div>
                )}

                {canAddNotes(role) && (
                  <div className="mt-4 space-y-2 border-t pt-4">
                    <Textarea
                      data-testid="input-note"
                      placeholder="Add an internal note..."
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      rows={2}
                      className="resize-none"
                    />
                    <Button
                      data-testid="button-add-note"
                      size="sm"
                      onClick={() => noteContent.trim() && addNoteMutation.mutate(noteContent.trim())}
                      disabled={!noteContent.trim() || addNoteMutation.isPending}
                    >
                      {addNoteMutation.isPending ? "Adding..." : "Add Note"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {canManageTickets(role) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Status</Label>
                    <Select
                      value={ticket.status}
                      onValueChange={(val) => updateMutation.mutate({ status: val as any })}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TICKET_STATUS_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Priority</Label>
                    <Select
                      value={ticket.priority}
                      onValueChange={(val) => updateMutation.mutate({ priority: val as any })}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TICKET_PRIORITY_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {canAssignTickets(role) && members && (
                    <div>
                      <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Assign To</Label>
                      <Select
                        value={ticket.assignedTo || "unassigned"}
                        onValueChange={(val) => updateMutation.mutate({ assignedTo: val === "unassigned" ? null : val } as any)}
                      >
                        <SelectTrigger className="mt-1" data-testid="select-assigned">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {members.filter(m => m.role === "technician" || m.role === "admin" || m.role === "supervisor").map((m) => (
                            <SelectItem key={m.userId} value={m.userId}>
                              {m.fullName || m.username || m.userId}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {canEscalate(role) && ticket.status !== "escalated" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-rose-200 text-rose-700 hover:bg-rose-50"
                      data-testid="button-escalate"
                      onClick={() => updateMutation.mutate({ status: "escalated" as any })}
                    >
                      <ChevronUp className="h-3.5 w-3.5 mr-1.5" /> Escalate
                    </Button>
                  )}

                  <div className="space-y-2 border-t pt-3">
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Vendor Follow-Up</Label>
                    <Input
                      value={vendorReference}
                      onChange={(e) => setVendorReference(e.target.value)}
                      placeholder="Vendor name, work order, or reference"
                      data-testid="input-ticket-vendor-reference"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px]">Contacted</Label>
                        <Input
                          type="date"
                          value={vendorContactedAt}
                          onChange={(e) => setVendorContactedAt(e.target.value)}
                          data-testid="input-vendor-contacted-at"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">Expected Follow-Up</Label>
                        <Input
                          type="date"
                          value={vendorExpectedFollowUpAt}
                          onChange={(e) => setVendorExpectedFollowUpAt(e.target.value)}
                          data-testid="input-vendor-follow-up-at"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateMutation.mutate({
                          vendorReference: vendorReference.trim(),
                          vendorContactedAt: vendorContactedAt || null,
                          vendorExpectedFollowUpAt: vendorExpectedFollowUpAt || null,
                        } as any)}
                        disabled={updateMutation.isPending}
                        data-testid="button-save-vendor-follow-up"
                      >
                        Save Vendor
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateMutation.mutate({
                          status: "waiting_vendor" as any,
                          vendorReference: vendorReference.trim(),
                          vendorContactedAt: vendorContactedAt || format(new Date(), "yyyy-MM-dd"),
                          vendorExpectedFollowUpAt: vendorExpectedFollowUpAt || null,
                        } as any)}
                        disabled={updateMutation.isPending}
                        data-testid="button-waiting-vendor"
                      >
                        Waiting Vendor
                      </Button>
                    </div>
                  </div>

                  {canManageTickets(role) && !ticket.rootCause && !ticket.resolutionSummary && (
                    <>
                      {!showResolution ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setShowResolution(true)}
                        >
                          Add Resolution
                        </Button>
                      ) : (
                        <div className="space-y-2 border-t pt-3">
                          <div>
                            <Label className="text-[11px]">Root Cause</Label>
                            <Input value={rootCause} onChange={e => setRootCause(e.target.value)} className="mt-1" />
                          </div>
                          <div>
                            <Label className="text-[11px]">Resolution Summary</Label>
                            <Textarea value={resolutionSummary} onChange={e => setResolutionSummary(e.target.value)} rows={2} className="mt-1 resize-none" />
                          </div>
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              updateMutation.mutate({ rootCause: rootCause || undefined, resolutionSummary: resolutionSummary || undefined, status: "resolved" as any });
                              setShowResolution(false);
                            }}
                          >
                            Resolve Ticket
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Details</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                <DetailRow icon={Building2} label="Department">
                  {ticket.departmentName || "Unassigned"}
                </DetailRow>
                <DetailRow icon={MapPin} label="Location">
                  <p>{ticket.location || "Not specified"}</p>
                  {(ticket.building || ticket.floor || ticket.room) && (
                    <p className="text-xs text-muted-foreground">
                      {[ticket.building && `Bldg ${ticket.building}`, ticket.floor && `Floor ${ticket.floor}`, ticket.room && `Room ${ticket.room}`].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </DetailRow>
                <DetailRow icon={User} label="Reported By">
                  {ticket.reportedByName || "Unknown"}
                </DetailRow>
                <DetailRow icon={User} label="Assigned To">
                  {ticket.assignedToName || "Unassigned"}
                </DetailRow>
                {ticket.dueDate && (
                  <DetailRow icon={Clock} label="Due Date">
                    <p className={isOverdue ? "text-rose-700 font-medium" : ""}>
                      {format(new Date(ticket.dueDate), "MMM d, yyyy")}
                      {isOverdue && " (overdue)"}
                    </p>
                  </DetailRow>
                )}
                {ticket.vendorReference && (
                  <DetailRow icon={ExternalLink} label="Vendor Reference">
                    {ticket.vendorReference}
                  </DetailRow>
                )}
                {ticket.vendorContactedAt && (
                  <DetailRow icon={CalendarClock} label="Vendor Contacted">
                    {format(new Date(ticket.vendorContactedAt), "MMM d, yyyy")}
                  </DetailRow>
                )}
                {ticket.vendorExpectedFollowUpAt && (
                  <DetailRow icon={Clock} label="Expected Follow-Up">
                    <span className={new Date(ticket.vendorExpectedFollowUpAt) < new Date() && ticket.status === "waiting_vendor" ? "text-rose-700 font-medium" : ""}>
                      {format(new Date(ticket.vendorExpectedFollowUpAt), "MMM d, yyyy")}
                    </span>
                  </DetailRow>
                )}
                {ticket.assetId && (
                  <DetailRow icon={Cpu} label="Related Asset">
                    <Link href={`/assets`}>
                      <span className="text-primary underline underline-offset-2 cursor-pointer">View Asset</span>
                    </Link>
                  </DetailRow>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Timestamps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Created</span>
                  <span>{format(new Date(ticket.createdAt), "MMM d, yyyy h:mm a")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Updated</span>
                  <span>{format(new Date(ticket.updatedAt), "MMM d, yyyy h:mm a")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Age</span>
                  <span>{age}</span>
                </div>
              </CardContent>
            </Card>

            {canManageTickets(role) && (
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                data-testid="button-delete-ticket"
                onClick={() => {
                  if (confirm("Delete this ticket permanently? This action cannot be undone.")) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                Delete Ticket
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
