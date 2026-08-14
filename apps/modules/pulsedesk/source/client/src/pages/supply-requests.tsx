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
import { PlusCircle, Package, Search } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/status-badge";
import { canManageTickets, canSubmitIssues } from "@/lib/permissions";
import { SUPPLY_STATUS_LABELS, type SupplyRequest, type Department } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

export default function SupplyRequestsPage() {
  const { toast } = useToast();
  const { membership } = useAuth();
  const role = membership?.role;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ requestType: "Medical Supplies", itemName: "", quantity: 1, urgency: "normal", departmentId: "", justification: "" });

  const { data: requests, isLoading } = useQuery<(SupplyRequest & { departmentName?: string; requestedByName?: string })[]>({ queryKey: ["/api/supply-requests"] });
  const { data: departments } = useQuery<Department[]>({ queryKey: ["/api/departments"] });

  const filtered = useMemo(() => {
    if (!requests) return [];
    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return r.itemName.toLowerCase().includes(s) || (r.departmentName || "").toLowerCase().includes(s) || (r.requestType || "").toLowerCase().includes(s);
      }
      return true;
    });
  }, [requests, search, statusFilter]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/supply-requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supply-requests"] });
      setOpen(false);
      setForm({ requestType: "Medical Supplies", itemName: "", quantity: 1, urgency: "normal", departmentId: "", justification: "" });
      toast({ title: "Supply request submitted" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiRequest("PATCH", `/api/supply-requests/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supply-requests"] });
      toast({ title: "Status updated" });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Supply Requests"
        description={`${filtered.length} request${filtered.length !== 1 ? "s" : ""}`}
        action={
          canSubmitIssues(role) ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-supply" size="sm"><PlusCircle className="h-4 w-4 mr-1.5" /> Request Supplies</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Supply Request</DialogTitle></DialogHeader>
                <div className="space-y-3 mt-4">
                  <div>
                    <Label>Supply Type</Label>
                    <Select value={form.requestType} onValueChange={(v) => setForm({ ...form, requestType: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Medical Supplies", "Office Supplies", "Cleaning Supplies", "Lab Supplies", "Other"].map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label htmlFor="supply-item-name">Item Name *</Label><Input id="supply-item-name" data-testid="input-item-name" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} placeholder="Item name" className="mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label htmlFor="supply-quantity">Quantity</Label><Input id="supply-quantity" type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })} className="mt-1" /></div>
                    <div>
                      <Label>Urgency</Label>
                      <Select value={form.urgency} onValueChange={(v) => setForm({ ...form, urgency: v })}>
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
                  <div>
                    <Label>Department</Label>
                    <Select value={form.departmentId} onValueChange={(v) => setForm({ ...form, departmentId: v })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {departments?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label htmlFor="supply-justification">Justification</Label><Textarea id="supply-justification" value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })} placeholder="Why is this needed?" rows={2} className="mt-1 resize-none" /></div>
                  <Button
                    data-testid="button-save-supply"
                    onClick={() => form.itemName.trim() && createMutation.mutate(form)}
                    disabled={!form.itemName.trim() || createMutation.isPending}
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
            <Input placeholder="Search supplies..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(SUPPLY_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><PulseLoader /></div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <Package className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-base font-medium mb-1">{requests && requests.length > 0 ? "No supply requests match your filters" : "No supply requests yet"}</p>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                {requests && requests.length > 0
                  ? "Clear the search or status filter to review active supply work."
                  : "Create supply requests for clinical, office, lab, and cleaning inventory so approvals stay visible."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {requests && requests.length > 0 ? (
                  <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); }} data-testid="button-clear-supply-filters">Clear filters</Button>
                ) : canSubmitIssues(role) ? (
                  <Button size="sm" onClick={() => setOpen(true)} data-testid="button-empty-add-supply">Request supplies</Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((req) => (
              <div key={req.id} className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 sm:flex-row sm:items-center" data-testid={`supply-${req.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">{req.requestType}</span>
                    <StatusBadge type="supply-status" value={req.status} size="xs" />
                    {req.urgency === "critical" && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-rose-200 bg-rose-50 text-rose-700">Urgent</span>
                    )}
                  </div>
                  <p className="text-sm font-medium truncate">{req.itemName} <span className="text-muted-foreground font-normal">(x{req.quantity})</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {req.departmentName || "No department"}{req.requestedByName && ` · ${req.requestedByName}`} · {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
                  </p>
                </div>
                {canManageTickets(role) && (
                  <Select value={req.status} onValueChange={(v) => updateMutation.mutate({ id: req.id, status: v })}>
                    <SelectTrigger className="w-[100px] sm:w-[120px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(SUPPLY_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
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
