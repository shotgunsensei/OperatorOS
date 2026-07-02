import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PulseLoader } from "@/components/pulse-line";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { PlusCircle, Wrench, Search, MapPin } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/status-badge";
import { canManageTickets, canSubmitIssues } from "@/lib/permissions";
import { FACILITY_STATUS_LABELS, FACILITY_TYPE_LABELS, type FacilityRequest } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

export default function FacilityRequestsPage() {
  const { toast } = useToast();
  const { membership } = useAuth();
  const role = membership?.role;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ requestType: "other", title: "", description: "", location: "", building: "", floor: "", priority: "normal" });

  const { data: requests, isLoading } = useQuery<(FacilityRequest & { assignedToName?: string })[]>({ queryKey: ["/api/facility-requests"] });

  const filtered = useMemo(() => {
    if (!requests) return [];
    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return r.title.toLowerCase().includes(s) || (r.location || "").toLowerCase().includes(s);
      }
      return true;
    });
  }, [requests, search, statusFilter]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/facility-requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/facility-requests"] });
      setOpen(false);
      setForm({ requestType: "other", title: "", description: "", location: "", building: "", floor: "", priority: "normal" });
      toast({ title: "Facility request submitted" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiRequest("PATCH", `/api/facility-requests/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/facility-requests"] });
      toast({ title: "Status updated" });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Facilities Requests"
        description={`${filtered.length} request${filtered.length !== 1 ? "s" : ""} — HVAC, plumbing, electrical, and general maintenance`}
        action={
          canSubmitIssues(role) ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-facility" size="sm"><PlusCircle className="h-4 w-4 mr-1.5" /> New Request</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Facility Request</DialogTitle></DialogHeader>
                <div className="space-y-3 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Type</Label>
                      <Select value={form.requestType} onValueChange={(v) => setForm({ ...form, requestType: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(FACILITY_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Priority</Label>
                      <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Standard</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label htmlFor="facility-title">Title *</Label><Input id="facility-title" data-testid="input-facility-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Brief description of the issue" className="mt-1" /></div>
                  <div><Label htmlFor="facility-description">Description</Label><Textarea id="facility-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Provide additional details..." rows={3} className="mt-1 resize-none" /></div>
                  <div><Label htmlFor="facility-location">Location</Label><Input id="facility-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Building A, Floor 2, Room 204" className="mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label htmlFor="facility-building">Building</Label><Input id="facility-building" value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} placeholder="A" className="mt-1" /></div>
                    <div><Label htmlFor="facility-floor">Floor</Label><Input id="facility-floor" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="2" className="mt-1" /></div>
                  </div>
                  <Button
                    data-testid="button-save-facility"
                    onClick={() => form.title.trim() && createMutation.mutate(form)}
                    disabled={!form.title.trim() || createMutation.isPending}
                    className="w-full"
                  >{createMutation.isPending ? "Submitting..." : "Submit Request"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search facility requests..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(FACILITY_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><PulseLoader /></div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <Wrench className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-base font-medium mb-1">{requests && requests.length > 0 ? "No facility requests match your filters" : "No facility requests yet"}</p>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                {requests && requests.length > 0
                  ? "Clear the search or status filter to review active facility work."
                  : "Capture maintenance, HVAC, plumbing, electrical, and room-readiness work before it gets lost in hallway conversations."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {requests && requests.length > 0 ? (
                  <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); }} data-testid="button-clear-facility-filters">Clear filters</Button>
                ) : canSubmitIssues(role) ? (
                  <Button size="sm" onClick={() => setOpen(true)} data-testid="button-empty-add-facility">Create facility request</Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((req) => (
              <div key={req.id} className={`flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 sm:flex-row sm:items-center ${req.priority === "critical" ? "border-l-2 border-l-rose-400" : ""}`} data-testid={`facility-${req.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">{FACILITY_TYPE_LABELS[req.requestType]}</span>
                    <StatusBadge type="facility-priority" value={req.priority} size="xs" />
                    <StatusBadge type="facility-status" value={req.status} size="xs" />
                  </div>
                  <p className="text-sm font-medium truncate">{req.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    {req.location && <><MapPin className="h-3 w-3 inline" /> {req.location}</>}
                    {!req.location && "No location"}
                    {req.assignedToName && ` · ${req.assignedToName}`}
                    {" · "}{formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
                  </p>
                </div>
                {canManageTickets(role) && (
                  <Select value={req.status} onValueChange={(v) => updateMutation.mutate({ id: req.id, status: v })}>
                    <SelectTrigger className="w-[100px] sm:w-[130px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FACILITY_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
